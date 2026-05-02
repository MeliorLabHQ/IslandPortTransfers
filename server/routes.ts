import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertDriverSchema,
  insertHotelSchema,
  insertZoneSchema,
  insertZoneRouteSchema,
  insertRateSchema,
  insertPricingRuleSchema,
  insertSettingSchema,
  insertPropertySchema,
} from "@shared/schema";
import bcrypt from "bcrypt";
import { z } from "zod";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { getUncachableStripeClient, getCurrentStripeEnvironment } from "./stripeClient";
import { emailService } from "./emailService";
import { attachProperty, requirePropertyUser, requireSuperAdmin } from "./tenantMiddleware";
import { seedPropertyDefaults } from "./propertyDefaults";

function generateReferenceNumber(): string {
  const prefix = "BK";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

  const PgSession = connectPgSimple(session);
  app.use(session({
    store: new PgSession({ conString: process.env.DATABASE_URL, tableName: "session", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "lax" : undefined,
    },
  }));

  // ============================================================
  // SUPER ADMIN AUTH (platform owners)
  // ============================================================
  app.post("/api/super-admin/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password required" });
      const sa = await storage.getSuperAdminByEmail(email);
      if (!sa) return res.status(401).json({ error: "Invalid credentials" });
      const ok = await bcrypt.compare(password, sa.password);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });
      req.session.userType = "super_admin";
      req.session.userId = sa.id;
      req.session.propertyId = undefined;
      // legacy fields cleared
      req.session.adminId = undefined;
      req.session.isAdmin = false;
      res.json({ success: true, user: { id: sa.id, email: sa.email, name: sa.name } });
    } catch (e) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/super-admin/logout", (req: Request, res: Response) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/super-admin/me", async (req: Request, res: Response) => {
    if (req.session.userType !== "super_admin" || !req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const sa = await storage.getSuperAdmin(req.session.userId);
    if (!sa) return res.status(404).json({ error: "Not found" });
    res.json({ id: sa.id, email: sa.email, name: sa.name });
  });

  // Super admin: properties CRUD
  app.get("/api/super-admin/properties", requireSuperAdmin, async (_req, res) => {
    const all = await storage.getAllProperties();
    res.json(all);
  });

  app.post("/api/super-admin/properties", requireSuperAdmin, async (req, res) => {
    try {
      const data = insertPropertySchema.parse(req.body);
      const existing = await storage.getPropertyBySlug(data.slug);
      if (existing) return res.status(400).json({ error: "Slug already exists" });
      const property = await storage.createProperty({ ...data, isDefault: false });
      // Seed default settings + email templates for the new property
      await seedPropertyDefaults(property.id);
      res.json(property);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: err.errors });
      console.error(err);
      res.status(400).json({ error: "Failed to create property" });
    }
  });

  app.patch("/api/super-admin/properties/:id", requireSuperAdmin, async (req, res) => {
    const property = await storage.updateProperty(req.params.id, req.body);
    if (!property) return res.status(404).json({ error: "Not found" });
    res.json(property);
  });

  app.delete("/api/super-admin/properties/:id", requireSuperAdmin, async (req, res) => {
    const ok = await storage.deleteProperty(req.params.id);
    if (!ok) return res.status(400).json({ error: "Cannot delete (default property or not found)" });
    res.json({ success: true });
  });

  // Approve a pending signup -> activates property + emails owner
  app.post("/api/super-admin/properties/:id/approve", requireSuperAdmin, async (req, res) => {
    const existing = await storage.getProperty(req.params.id);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (existing.status !== "pending") {
      return res.status(400).json({ error: "Only pending properties can be approved" });
    }
    const property = await storage.updateProperty(req.params.id, { status: "active" });
    if (!property) return res.status(404).json({ error: "Not found" });
    // Notify the property owner that they can log in
    try {
      const owners = await storage.getAllAdminUsers(property.id);
      const owner = owners.find((u) => u.role === "owner") || owners[0];
      if (owner) {
        await emailService.sendRawEmail({
          propertyId: property.id,
          to: owner.email,
          subject: `${property.name} is approved — log in to get started`,
          html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color:${property.primaryColor}">Welcome to Island Port Transfers</h1>
            <p>Hi ${owner.username},</p>
            <p>Your property <strong>${property.name}</strong> has been approved and is now live on the platform.</p>
            <p>You can log in at <a href="${req.protocol}://${req.get("host")}/admin/login">your admin dashboard</a> using the username and password you registered with.</p>
            <p>Your branded booking page: <a href="${req.protocol}://${req.get("host")}/?property=${property.slug}">${property.slug}</a></p>
          </div>`,
        });
      }
    } catch (err) {
      console.error("Approval email failed:", err);
    }
    res.json(property);
  });

  // Reject (delete) a pending signup
  app.post("/api/super-admin/properties/:id/reject", requireSuperAdmin, async (req, res) => {
    const property = await storage.getProperty(req.params.id);
    if (!property) return res.status(404).json({ error: "Not found" });
    if (property.status !== "pending") return res.status(400).json({ error: "Only pending properties can be rejected" });
    const ok = await storage.deleteProperty(req.params.id);
    if (!ok) return res.status(400).json({ error: "Cannot reject" });
    res.json({ success: true });
  });

  // ============================================================
  // PUBLIC SIGN-UP — creates pending property + owner user
  // ============================================================
  const signupSchema = z.object({
    propertyName: z.string().min(2).max(100),
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase letters, numbers, and dashes").min(3).max(50),
    contactEmail: z.string().email(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1e40af"),
    ownerUsername: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, "Username may contain letters, numbers, dashes, underscores"),
    ownerEmail: z.string().email(),
    ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
  });

  const RESERVED_SLUGS = new Set([
    "admin", "super-admin", "api", "www", "app", "mail", "marketing",
    "signup", "login", "logout", "booking", "bookings", "settings",
  ]);

  app.post("/api/signup", async (req: Request, res: Response) => {
    try {
      const data = signupSchema.parse(req.body);
      if (RESERVED_SLUGS.has(data.slug)) {
        return res.status(400).json({ error: "That slug is reserved. Please pick another." });
      }
      // Uniqueness checks
      const slugTaken = await storage.getPropertyBySlug(data.slug);
      if (slugTaken) return res.status(400).json({ error: "That URL slug is already taken" });
      const usernameTaken = await storage.getAdminUserByUsername(data.ownerUsername);
      if (usernameTaken) return res.status(400).json({ error: "That username is already taken" });

      // Hash password BEFORE provisioning (so a hashing failure can't leave orphans)
      const hashed = await bcrypt.hash(data.ownerPassword, 10);

      // Provision atomically: if anything fails (incl. unique-violation race), all rolled back
      let property;
      try {
        property = await storage.createPropertyWithOwner({
          property: {
            slug: data.slug,
            name: data.propertyName,
            email: data.contactEmail,
            primaryColor: data.primaryColor,
            status: "pending",
            plan: "starter",
            isDefault: false,
          },
          owner: {
            username: data.ownerUsername,
            email: data.ownerEmail,
            password: hashed,
            role: "owner",
          },
        });
      } catch (err: any) {
        // Postgres unique violation
        if (err?.code === "23505") {
          const detail = String(err?.detail || "").toLowerCase();
          if (detail.includes("slug")) return res.status(409).json({ error: "That URL slug is already taken" });
          if (detail.includes("username")) return res.status(409).json({ error: "That username is already taken" });
          return res.status(409).json({ error: "A conflicting account already exists" });
        }
        throw err;
      }

      // Seed defaults outside the transaction (best-effort: super-admin can re-seed if it fails)
      try {
        await seedPropertyDefaults(property.id);
      } catch (err) {
        console.error(`Default seed failed for property ${property.id}; can be re-seeded manually:`, err);
      }

      // Notify all super-admins (best effort)
      try {
        const supers = await storage.getAllSuperAdmins?.();
        if (supers && supers.length) {
          for (const sa of supers) {
            await emailService.sendRawEmail({
              propertyId: property.id,
              to: sa.email,
              subject: `New property signup pending: ${property.name}`,
              html: `<div style="font-family: Arial, sans-serif;">
                <h2>New property signup</h2>
                <p><strong>${property.name}</strong> (slug: <code>${property.slug}</code>) is awaiting your approval.</p>
                <p>Contact: ${property.email}</p>
                <p>Owner: ${data.ownerUsername} &lt;${data.ownerEmail}&gt;</p>
                <p><a href="${req.protocol}://${req.get("host")}/super-admin">Review in dashboard</a></p>
              </div>`,
            });
          }
        }
      } catch (err) {
        console.error("Super-admin notification failed:", err);
      }

      res.json({ success: true, property: { id: property.id, name: property.name, slug: property.slug, status: property.status } });
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: err.errors });
      console.error("Signup failed:", err);
      res.status(500).json({ error: "Sign-up failed. Please try again." });
    }
  });

  // Public slug availability check
  app.get("/api/signup/slug-available", async (req: Request, res: Response) => {
    const slug = String(req.query.slug || "").toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 3) {
      return res.json({ available: false, reason: "invalid" });
    }
    if (RESERVED_SLUGS.has(slug)) return res.json({ available: false, reason: "reserved" });
    const existing = await storage.getPropertyBySlug(slug);
    res.json({ available: !existing });
  });

  // ============================================================
  // PROPERTY USER AUTH (existing /api/admin/* preserved)
  // ============================================================
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: "Username and password required" });
      const admin = await storage.getAdminUserByUsername(username);
      if (!admin) return res.status(401).json({ error: "Invalid credentials" });
      const valid = await bcrypt.compare(password, admin.password);
      if (!valid) return res.status(401).json({ error: "Invalid credentials" });
      if (!admin.propertyId) return res.status(403).json({ error: "User not assigned to a property" });
      req.session.userType = "property_user";
      req.session.userId = admin.id;
      req.session.propertyId = admin.propertyId;
      // legacy fields preserved for any old code paths
      req.session.adminId = admin.id;
      req.session.isAdmin = true;
      res.json({ success: true, admin: { id: admin.id, username: admin.username, email: admin.email, role: admin.role, propertyId: admin.propertyId } });
    } catch (e) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  app.get("/api/admin/me", requirePropertyUser, async (req, res) => {
    const admin = await storage.getAdminUser(req.session.userId!);
    if (!admin) return res.status(404).json({ error: "Not found" });
    res.json({
      id: admin.id, username: admin.username, email: admin.email, role: admin.role,
      property: { id: req.property!.id, name: req.property!.name, slug: req.property!.slug, logoUrl: req.property!.logoUrl, primaryColor: req.property!.primaryColor },
    });
  });

  // ============================================================
  // PUBLIC PROPERTY ENDPOINT (booking page branding)
  // ============================================================
  app.get("/api/property", attachProperty, async (req, res) => {
    const p = req.property!;
    res.json({ id: p.id, slug: p.slug, name: p.name, logoUrl: p.logoUrl, primaryColor: p.primaryColor, email: p.email });
  });

  // ============================================================
  // PROPERTY-SCOPED ADMIN ENDPOINTS
  // All use requirePropertyUser which sets req.property
  // ============================================================
  const pid = (req: Request) => req.property!.id;

  // Property settings (logo, color, name, email)
  app.get("/api/admin/property", requirePropertyUser, (req, res) => {
    res.json(req.property);
  });
  app.patch("/api/admin/property", requirePropertyUser, async (req, res) => {
    const allowed = (({ name, email, logoUrl, primaryColor }) => ({ name, email, logoUrl, primaryColor }))(req.body);
    const updated = await storage.updateProperty(pid(req), allowed);
    res.json(updated);
  });

  // Admin Users (per property)
  app.get("/api/admin/users", requirePropertyUser, async (req, res) => {
    const users = await storage.getAllAdminUsers(pid(req));
    res.json(users.map(({ password, ...u }) => u));
  });

  app.post("/api/admin/users", requirePropertyUser, async (req, res) => {
    try {
      const { username, password, email, role } = req.body;
      if (!username || !password || !email) return res.status(400).json({ error: "Username, password, and email required" });
      const existing = await storage.getAdminUserByUsername(username);
      if (existing) return res.status(400).json({ error: "Username already exists" });
      const hashed = await bcrypt.hash(password, 10);
      const user = await storage.createAdminUser({ username, password: hashed, email, role: role || "staff", propertyId: pid(req) });
      const { password: _, ...sanitized } = user;
      res.json(sanitized);
    } catch {
      res.status(400).json({ error: "Invalid user data" });
    }
  });

  app.patch("/api/admin/users/:id", requirePropertyUser, async (req, res) => {
    try {
      const { username, password, email, role } = req.body;
      const updateData: any = {};
      if (username) {
        const existing = await storage.getAdminUserByUsername(username);
        if (existing && existing.id !== req.params.id) return res.status(400).json({ error: "Username already exists" });
        updateData.username = username;
      }
      if (email) updateData.email = email;
      if (role) updateData.role = role;
      if (password) updateData.password = await bcrypt.hash(password, 10);
      const user = await storage.updateAdminUser(req.params.id, pid(req), updateData);
      if (!user) return res.status(404).json({ error: "User not found" });
      const { password: _, ...sanitized } = user;
      res.json(sanitized);
    } catch {
      res.status(400).json({ error: "Invalid user data" });
    }
  });

  app.delete("/api/admin/users/:id", requirePropertyUser, async (req, res) => {
    if (req.params.id === req.session.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    const ok = await storage.deleteAdminUser(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "User not found" });
    res.json({ success: true });
  });

  // Drivers
  app.get("/api/admin/drivers", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllDrivers(pid(req)));
  });
  app.get("/api/admin/drivers/:id", requirePropertyUser, async (req, res) => {
    const d = await storage.getDriver(req.params.id, pid(req));
    if (!d) return res.status(404).json({ error: "Driver not found" });
    res.json(d);
  });
  app.post("/api/admin/drivers", requirePropertyUser, async (req, res) => {
    try {
      const data = insertDriverSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.createDriver(data));
    } catch { res.status(400).json({ error: "Invalid driver data" }); }
  });
  app.patch("/api/admin/drivers/:id", requirePropertyUser, async (req, res) => {
    const d = await storage.updateDriver(req.params.id, pid(req), req.body);
    if (!d) return res.status(404).json({ error: "Driver not found" });
    res.json(d);
  });
  app.delete("/api/admin/drivers/:id", requirePropertyUser, async (req, res) => {
    const ok = await storage.deleteDriver(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "Driver not found" });
    res.json({ success: true });
  });

  // Hotels (admin)
  app.get("/api/admin/hotels", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllHotels(pid(req)));
  });
  app.get("/api/admin/hotels/:id", requirePropertyUser, async (req, res) => {
    const h = await storage.getHotel(req.params.id, pid(req));
    if (!h) return res.status(404).json({ error: "Hotel not found" });
    res.json(h);
  });
  app.post("/api/admin/hotels", requirePropertyUser, async (req, res) => {
    try {
      const data = insertHotelSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.createHotel(data));
    } catch { res.status(400).json({ error: "Invalid hotel data" }); }
  });
  app.patch("/api/admin/hotels/:id", requirePropertyUser, async (req, res) => {
    const h = await storage.updateHotel(req.params.id, pid(req), req.body);
    if (!h) return res.status(404).json({ error: "Hotel not found" });
    res.json(h);
  });
  app.delete("/api/admin/hotels/:id", requirePropertyUser, async (req, res) => {
    const ok = await storage.deleteHotel(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "Hotel not found" });
    res.json({ success: true });
  });

  // Hotels (public) — uses tenant resolution from subdomain/query
  app.get("/api/hotels", attachProperty, async (req, res) => {
    res.json(await storage.getActiveHotels(req.property!.id));
  });

  // Port-Hotel Rates
  app.get("/api/admin/hotels/:id/port-rates", requirePropertyUser, async (req, res) => {
    const ports = await storage.getActivePorts();
    const rates = await storage.getPortHotelRates(req.params.id, pid(req));
    const portsWithRates = ports.map((port) => {
      const rate = rates.find((r) => r.portId === port.id);
      return { ...port, price: rate?.price || null };
    });
    res.json(portsWithRates);
  });
  app.post("/api/admin/hotels/:id/port-rates", requirePropertyUser, async (req, res) => {
    try {
      const { rates } = req.body;
      if (!Array.isArray(rates)) return res.status(400).json({ error: "Rates must be an array" });
      const results = [];
      for (const rate of rates) {
        if (rate.price !== null && rate.price !== undefined && rate.price !== "") {
          results.push(await storage.upsertPortHotelRate({
            propertyId: pid(req), portId: rate.portId, hotelId: req.params.id, price: rate.price, isActive: true,
          }));
        }
      }
      res.json({ success: true, rates: results });
    } catch { res.status(400).json({ error: "Invalid rate data" }); }
  });

  // Ports (public, GLOBAL)
  app.get("/api/ports", async (_req, res) => res.json(await storage.getActivePorts()));

  // Public port-hotel rate lookup
  app.get("/api/port-hotel-rate", attachProperty, async (req, res) => {
    const { portId, hotelId } = req.query;
    if (!portId || !hotelId || typeof portId !== "string" || typeof hotelId !== "string") {
      return res.status(400).json({ error: "portId and hotelId required" });
    }
    const rate = await storage.getPortHotelRate(portId, hotelId, req.property!.id);
    res.json({ price: rate?.price || null });
  });

  // Zones
  app.get("/api/admin/zones", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllZones(pid(req)));
  });
  app.get("/api/admin/zones/:id", requirePropertyUser, async (req, res) => {
    const z = await storage.getZone(req.params.id, pid(req));
    if (!z) return res.status(404).json({ error: "Zone not found" });
    res.json(z);
  });
  app.post("/api/admin/zones", requirePropertyUser, async (req, res) => {
    try {
      const data = insertZoneSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.createZone(data));
    } catch { res.status(400).json({ error: "Invalid zone data" }); }
  });
  app.patch("/api/admin/zones/:id", requirePropertyUser, async (req, res) => {
    const z = await storage.updateZone(req.params.id, pid(req), req.body);
    if (!z) return res.status(404).json({ error: "Zone not found" });
    res.json(z);
  });
  app.delete("/api/admin/zones/:id", requirePropertyUser, async (req, res) => {
    const ok = await storage.deleteZone(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "Zone not found" });
    res.json({ success: true });
  });

  app.get("/api/zones", attachProperty, async (req, res) => {
    res.json(await storage.getActiveZones(req.property!.id));
  });

  app.post("/api/admin/zones/seed", requirePropertyUser, async (req, res) => {
    const stLuciaZones = [
      "Gros Islet", "Babonneau", "Castries North", "Castries East", "Castries Central",
      "Castries South", "Anse-La-Raye/Canaries", "Soufriere", "Choiseul", "Laborie",
      "Vieux-Fort South", "Vieux-Fort North", "Micoud South", "Micoud North",
      "Dennery South", "Dennery North", "Castries South East",
    ];
    let created = 0, skipped = 0;
    for (const name of stLuciaZones) {
      const existing = await storage.getZoneByName(name, pid(req));
      if (existing) { skipped++; continue; }
      await storage.createZone({ name, isActive: true, propertyId: pid(req) });
      created++;
    }
    res.json({ success: true, created, skipped, message: `Created ${created} zones, skipped ${skipped}` });
  });

  // Zone Routes
  app.get("/api/admin/zone-routes", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllZoneRoutes(pid(req)));
  });
  app.get("/api/admin/zone-routes/:id", requirePropertyUser, async (req, res) => {
    const r = await storage.getZoneRouteById(req.params.id, pid(req));
    if (!r) return res.status(404).json({ error: "Zone route not found" });
    res.json(r);
  });
  app.post("/api/admin/zone-routes", requirePropertyUser, async (req, res) => {
    try {
      const data = insertZoneRouteSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.upsertZoneRoute(data));
    } catch { res.status(400).json({ error: "Invalid zone route data" }); }
  });
  app.patch("/api/admin/zone-routes/:id", requirePropertyUser, async (req, res) => {
    const r = await storage.updateZoneRoute(req.params.id, pid(req), req.body);
    if (!r) return res.status(404).json({ error: "Zone route not found" });
    res.json(r);
  });
  app.delete("/api/admin/zone-routes/:id", requirePropertyUser, async (req, res) => {
    const ok = await storage.deleteZoneRoute(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "Zone route not found" });
    res.json({ success: true });
  });

  // Rates
  app.get("/api/admin/rates", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllRates(pid(req)));
  });
  app.get("/api/admin/rates/zone/:zoneId", requirePropertyUser, async (req, res) => {
    res.json(await storage.getRatesByZone(req.params.zoneId, pid(req)));
  });
  app.post("/api/admin/rates", requirePropertyUser, async (req, res) => {
    try {
      const data = insertRateSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.createRate(data));
    } catch { res.status(400).json({ error: "Invalid rate data" }); }
  });
  app.patch("/api/admin/rates/:id", requirePropertyUser, async (req, res) => {
    const r = await storage.updateRate(req.params.id, pid(req), req.body);
    if (!r) return res.status(404).json({ error: "Rate not found" });
    res.json(r);
  });
  app.delete("/api/admin/rates/:id", requirePropertyUser, async (req, res) => {
    const ok = await storage.deleteRate(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "Rate not found" });
    res.json({ success: true });
  });

  // Pricing Rules
  app.get("/api/admin/pricing-rules", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllPricingRules(pid(req)));
  });
  app.post("/api/admin/pricing-rules", requirePropertyUser, async (req, res) => {
    try {
      const data = insertPricingRuleSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.createPricingRule(data));
    } catch { res.status(400).json({ error: "Invalid pricing rule data" }); }
  });
  app.patch("/api/admin/pricing-rules/:id", requirePropertyUser, async (req, res) => {
    const r = await storage.updatePricingRule(req.params.id, pid(req), req.body);
    if (!r) return res.status(404).json({ error: "Pricing rule not found" });
    res.json(r);
  });
  app.delete("/api/admin/pricing-rules/:id", requirePropertyUser, async (req, res) => {
    const ok = await storage.deletePricingRule(req.params.id, pid(req));
    if (!ok) return res.status(404).json({ error: "Pricing rule not found" });
    res.json({ success: true });
  });

  // Bookings (admin)
  app.get("/api/admin/bookings", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllBookings(pid(req), { status: req.query.status as string, search: req.query.search as string }));
  });
  app.get("/api/admin/bookings/:id", requirePropertyUser, async (req, res) => {
    const b = await storage.getBooking(req.params.id, pid(req));
    if (!b) return res.status(404).json({ error: "Booking not found" });
    res.json(b);
  });
  app.patch("/api/admin/bookings/:id/status", requirePropertyUser, async (req, res) => {
    const existing = await storage.getBooking(req.params.id, pid(req));
    if (!existing) return res.status(404).json({ error: "Booking not found" });
    const updated = await storage.updateBookingStatus(req.params.id, req.body.status);
    res.json(updated);
  });

  app.post("/api/admin/bookings/:id/assign-driver", requirePropertyUser, async (req, res) => {
    try {
      const { driverId } = req.body;
      if (!driverId) return res.status(400).json({ error: "Driver ID required" });
      const existing = await storage.getBooking(req.params.id, pid(req));
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      const driver = await storage.getDriver(driverId, pid(req));
      if (!driver) return res.status(404).json({ error: "Driver not found" });
      const booking = await storage.assignDriver(req.params.id, driverId);
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      if (driver.email) {
        try {
          const dt = booking.pickupDate ? new Date(booking.pickupDate) : null;
          const time = dt ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) : "";
          await emailService.sendDriverAssignment(
            { driverEmail: driver.email, driverName: driver.name },
            {
              propertyId: pid(req),
              referenceNumber: booking.referenceNumber, customerName: booking.customerName, customerPhone: booking.customerPhone,
              pickupDate: dt ? dt.toLocaleDateString() : "", pickupTime: time,
              pickupLocation: booking.pickupLocation, dropoffLocation: booking.dropoffLocation,
              partySize: booking.partySize, flightNumber: booking.flightNumber, vehicleClass: booking.vehicleClass,
              driverFee: booking.driverFee || "0",
            },
          );
        } catch (e) { console.error("driver email fail:", e); }
      }
      try {
        await emailService.sendDriverAssignmentToCustomer({
          propertyId: pid(req),
          customerEmail: booking.customerEmail, customerName: booking.customerName,
          referenceNumber: booking.referenceNumber, driverName: driver.name,
          pickupDate: booking.pickupDate ? new Date(booking.pickupDate).toLocaleDateString() : "",
          pickupLocation: booking.pickupLocation, dropoffLocation: booking.dropoffLocation,
        });
      } catch (e) { console.error("customer email fail:", e); }

      res.json({ booking, driver, message: "Driver assigned. Notifications sent." });
    } catch { res.status(400).json({ error: "Failed to assign driver" }); }
  });

  app.patch("/api/admin/bookings/:id/pricing", requirePropertyUser, async (req, res) => {
    try {
      const { bookingFee, driverFee, balanceDueToDriver } = req.body;
      const existing = await storage.getBooking(req.params.id, pid(req));
      if (!existing) return res.status(404).json({ error: "Booking not found" });
      const isFirstPricingSet = !existing.pricingSet;
      const taxSetting = await storage.getSetting("tax_percentage", pid(req));
      const taxPercentage = parseFloat(taxSetting?.value || "0");
      const subtotal = (parseFloat(bookingFee) || 0) + (parseFloat(driverFee) || 0);
      const taxAmount = subtotal * (taxPercentage / 100);
      const totalAmount = (subtotal + taxAmount).toFixed(2);

      const booking = await storage.updateBookingPricing(req.params.id, {
        bookingFee, driverFee, totalAmount,
        balanceDueToDriver: balanceDueToDriver || driverFee, pricingSet: true,
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });

      if (isFirstPricingSet && booking.bookingType === "destination") {
        try {
          await emailService.sendQuoteNotification({
            propertyId: pid(req),
            customerEmail: booking.customerEmail, customerName: booking.customerName,
            referenceNumber: booking.referenceNumber,
            bookingFee: bookingFee || "0", driverFee: driverFee || "0", totalAmount: totalAmount || "0",
          });
        } catch (e) { console.error("quote email fail:", e); }
      }
      res.json(booking);
    } catch (err) {
      console.error("pricing update fail:", err);
      res.status(400).json({ error: "Failed to update pricing" });
    }
  });

  app.post("/api/admin/bookings/:id/send-payment-link", requirePropertyUser, async (req, res) => {
    try {
      const booking = await storage.getBooking(req.params.id, pid(req));
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (!booking.pricingSet) return res.status(400).json({ error: "Pricing must be set before sending payment link" });
      const force = req.body.force === true;
      if (booking.paymentLinkSent && !force) {
        return res.status(400).json({ error: "Payment link already sent. Set force=true to send again.", paymentLinkSentAt: booking.paymentLinkSentAt });
      }
      const totalAmountCents = Math.round(parseFloat(booking.totalAmount || "0") * 100);
      const stripe = await getUncachableStripeClient();
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Airport Transfer - ${booking.referenceNumber}`,
              description: `Transfer from ${booking.pickupLocation} to ${booking.dropoffLocation}`,
            },
            unit_amount: totalAmountCents,
          },
          quantity: 1,
        }],
        metadata: { bookingId: booking.id, referenceNumber: booking.referenceNumber, propertyId: pid(req) },
      });

      try {
        await emailService.sendPaymentLink({
          propertyId: pid(req),
          customerEmail: booking.customerEmail, customerName: booking.customerName,
          referenceNumber: booking.referenceNumber, totalAmount: booking.totalAmount || "0",
          paymentLink: paymentLink.url,
        });
      } catch (e) { console.error("payment link email fail:", e); }

      const updated = await storage.markPaymentLinkSent(req.params.id);
      res.json({ booking: updated, paymentLink: paymentLink.url, message: `Payment link sent to ${booking.customerEmail}. Total: $${booking.totalAmount}` });
    } catch (err) {
      console.error("send-payment-link error:", err);
      res.status(400).json({ error: "Failed to send payment link" });
    }
  });

  // Public booking creation (destination + hotel-without-checkout)
  app.post("/api/bookings", attachProperty, async (req, res) => {
    try {
      const propertyId = req.property!.id;
      const pickupDate = req.body.pickupDate ? new Date(req.body.pickupDate) : undefined;
      const isDestination = req.body.bookingType === "destination";

      let bookingFee: string | null = null;
      let driverFee: string | null = null;
      let totalAmount: string | null = null;
      let balanceDueToDriver: string | null = null;
      let pricingSet = false;

      if (!isDestination && req.body.arrivalPortId && req.body.hotelId) {
        const phr = await storage.getPortHotelRate(req.body.arrivalPortId, req.body.hotelId, propertyId);
        const basePrice = phr ? parseFloat(phr.price) : 30;
        const surchargeAmt = parseFloat((await storage.getSetting("large_party_surcharge_amount", propertyId))?.value || "20");
        const minSize = parseInt((await storage.getSetting("large_party_min_size", propertyId))?.value || "4");
        const taxPct = parseInt((await storage.getSetting("tax_percentage", propertyId))?.value || "0");
        const ps = req.body.partySize || 1;
        const sur = ps >= minSize ? surchargeAmt : 0;
        const sub = basePrice + sur;
        const tax = (sub * taxPct) / 100;
        const total = sub + tax;
        bookingFee = total.toFixed(2);
        driverFee = basePrice.toFixed(2);
        totalAmount = total.toFixed(2);
        balanceDueToDriver = basePrice.toFixed(2);
        pricingSet = true;
      } else if (!isDestination) {
        bookingFee = "30.00"; driverFee = "30.00"; totalAmount = "30.00"; balanceDueToDriver = "30.00"; pricingSet = true;
      }

      const booking = await storage.createBooking({
        ...req.body,
        propertyId,
        pickupDate: pickupDate as any,
        referenceNumber: generateReferenceNumber(),
        status: "new",
        bookingFee, driverFee, totalAmount, balanceDueToDriver, pricingSet,
      });

      if (isDestination) {
        try {
          await emailService.sendBookingConfirmation({
            propertyId,
            customerEmail: booking.customerEmail, customerName: booking.customerName,
            referenceNumber: booking.referenceNumber, bookingType: booking.bookingType,
            pickupDate: booking.pickupDate ? new Date(booking.pickupDate).toLocaleDateString() : "",
            pickupTime: req.body.pickupTime || "",
            pickupLocation: booking.pickupLocation, dropoffLocation: booking.dropoffLocation,
            passengers: booking.partySize, totalAmount: booking.totalAmount || undefined,
          });
        } catch (e) { console.error("booking email fail:", e); }
      }
      res.json(booking);
    } catch (err) {
      console.error("Booking creation error:", err);
      res.status(400).json({ error: "Invalid booking data" });
    }
  });

  // Settings (admin)
  app.get("/api/admin/settings", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllSettings(pid(req)));
  });
  app.post("/api/admin/settings", requirePropertyUser, async (req, res) => {
    try {
      const data = insertSettingSchema.parse({ ...req.body, propertyId: pid(req) });
      res.json(await storage.upsertSetting(data));
    } catch { res.status(400).json({ error: "Invalid setting data" }); }
  });

  // Email Templates (admin)
  app.get("/api/admin/email-templates", requirePropertyUser, async (req, res) => {
    res.json(await storage.getAllEmailTemplates(pid(req)));
  });
  app.get("/api/admin/email-templates/:id", requirePropertyUser, async (req, res) => {
    const t = await storage.getEmailTemplate(req.params.id, pid(req));
    if (!t) return res.status(404).json({ error: "Email template not found" });
    res.json(t);
  });
  app.put("/api/admin/email-templates/:id", requirePropertyUser, async (req, res) => {
    try {
      const updateSchema = z.object({ subject: z.string().min(1).optional(), body: z.string().min(1).optional(), isActive: z.boolean().optional() });
      const data = updateSchema.parse(req.body);
      const t = await storage.updateEmailTemplate(req.params.id, pid(req), data);
      if (!t) return res.status(404).json({ error: "Email template not found" });
      res.json(t);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid template data", details: err.errors });
      res.status(400).json({ error: "Failed to update template" });
    }
  });

  app.post("/api/admin/email-templates/:id/send-test", requirePropertyUser, async (req, res) => {
    try {
      const { testEmail } = z.object({ testEmail: z.string().email() }).parse(req.body);
      const template = await storage.getEmailTemplate(req.params.id, pid(req));
      if (!template) return res.status(404).json({ error: "Email template not found" });
      const sample: Record<string, string> = {
        customerName: "John Smith", referenceNumber: "TEST-123456",
        pickupDate: "March 15, 2026", pickupTime: "2:30 PM",
        pickupLocation: "Hewanorra International Airport (UVF)", dropoffLocation: "Sandals Grande St. Lucian",
        passengers: "4", tripPrice: "$80.00", taxAmount: "$5.00", totalAmount: "$85.00",
        bookingFee: "$30.00", driverFee: "$55.00",
        paymentLink: "https://example.com/pay/test-link", driverName: "Marcus Joseph",
        customerPhone: "+1 (555) 123-4567", partySize: "4", flightNumber: "AA 1234", vehicleClass: "SUV",
      };
      let subject = template.subject, body = template.body;
      for (const [k, v] of Object.entries(sample)) {
        const r = new RegExp(`\\{\\{${k}\\}\\}`, "g");
        subject = subject.replace(r, v); body = body.replace(r, v);
      }
      const { getUncachableResendClient } = await import("./resendClient");
      const { client, fromEmail } = await getUncachableResendClient();
      const { data, error } = await client.emails.send({ from: fromEmail, to: testEmail, subject: `[TEST] ${subject}`, html: body });
      if (error) { console.error(error); return res.status(500).json({ error: "Failed to send test email" }); }
      res.json({ success: true, messageId: data?.id });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: "Invalid email", details: err.errors });
      console.error(err);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  app.get("/api/admin/email-templates/:id/preview", requirePropertyUser, async (req, res) => {
    const template = await storage.getEmailTemplate(req.params.id, pid(req));
    if (!template) return res.status(404).json({ error: "Email template not found" });
    const sample: Record<string, string> = {
      customerName: "John Smith", referenceNumber: "TEST-123456",
      pickupDate: "March 15, 2026", pickupTime: "2:30 PM",
      pickupLocation: "Hewanorra International Airport (UVF)", dropoffLocation: "Sandals Grande St. Lucian",
      passengers: "4", tripPrice: "$80.00", taxAmount: "$5.00", totalAmount: "$85.00",
      bookingFee: "$30.00", driverFee: "$55.00",
      paymentLink: "https://example.com/pay/test-link", driverName: "Marcus Joseph",
      customerPhone: "+1 (555) 123-4567", partySize: "4", flightNumber: "AA 1234", vehicleClass: "SUV",
    };
    let subject = template.subject, body = template.body;
    for (const [k, v] of Object.entries(sample)) {
      const r = new RegExp(`\\{\\{${k}\\}\\}`, "g");
      subject = subject.replace(r, v); body = body.replace(r, v);
    }
    const plainText = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "\n").replace(/\n\s*\n/g, "\n\n")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
    res.json({ subject, htmlBody: body, plainText });
  });

  // Public settings endpoints
  app.get("/api/settings/large-party-surcharge", attachProperty, async (req, res) => {
    const propertyId = req.property!.id;
    const amount = await storage.getSetting("large_party_surcharge_amount", propertyId);
    const min = await storage.getSetting("large_party_min_size", propertyId);
    res.json({ amount: amount?.value || "20", minPartySize: min?.value || "4" });
  });

  app.get("/api/settings/tax", attachProperty, async (req, res) => {
    const tax = await storage.getSetting("tax_percentage", req.property!.id);
    res.json({ percentage: tax?.value || "0" });
  });

  app.get("/api/settings/stripe-environment", async (_req, res) => {
    const env = await getCurrentStripeEnvironment();
    res.json({ environment: env });
  });

  app.post("/api/admin/settings/stripe-environment", requirePropertyUser, async (req, res) => {
    const { environment } = req.body;
    if (environment !== "sandbox" && environment !== "live") return res.status(400).json({ message: "Environment must be 'sandbox' or 'live'" });
    await storage.upsertSetting({
      propertyId: pid(req), key: "stripe_environment", value: environment,
      description: "Stripe environment: sandbox or live",
    });
    res.json({ environment });
  });

  // Public booking lookup endpoints
  app.get("/api/booking-confirmation/:sessionId", async (req, res) => {
    try {
      const booking = await storage.getBookingByStripeSessionId(req.params.sessionId);
      if (!booking) return res.status(404).json({ error: "Booking not found. It may still be processing." });
      res.json({
        referenceNumber: booking.referenceNumber, customerName: booking.customerName, customerEmail: booking.customerEmail,
        pickupLocation: booking.pickupLocation, dropoffLocation: booking.dropoffLocation,
        pickupDate: booking.pickupDate, partySize: booking.partySize, vehicleClass: booking.vehicleClass,
        flightNumber: booking.flightNumber, totalAmount: booking.totalAmount, bookingType: booking.bookingType,
      });
    } catch { res.status(500).json({ error: "Failed to fetch booking" }); }
  });

  app.get("/api/booking-by-reference/:referenceNumber", async (req, res) => {
    try {
      const booking = await storage.getBookingByReference(req.params.referenceNumber);
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      res.json({
        referenceNumber: booking.referenceNumber, customerName: booking.customerName, customerEmail: booking.customerEmail,
        pickupLocation: booking.pickupLocation, dropoffLocation: booking.dropoffLocation,
        pickupDate: booking.pickupDate, partySize: booking.partySize, vehicleClass: booking.vehicleClass,
        flightNumber: booking.flightNumber, totalAmount: booking.totalAmount, bookingType: booking.bookingType,
      });
    } catch { res.status(500).json({ error: "Failed to fetch booking" }); }
  });

  // Hotel checkout (Stripe)
  app.post("/api/hotel-checkout", attachProperty, async (req, res) => {
    try {
      const propertyId = req.property!.id;
      const { hotelId, portId, customerName, customerEmail, customerPhone, pickupDate, pickupTime, partySize, vehicleClass, flightNumber } = req.body;
      if (!hotelId || !portId || !customerName || !customerEmail || !pickupDate || !pickupTime || !partySize || !vehicleClass) {
        return res.status(400).json({ error: "Missing required booking details" });
      }
      const partySizeNum = parseInt(partySize);
      if (isNaN(partySizeNum) || partySizeNum < 1) return res.status(400).json({ error: "Invalid party size" });

      const hotel = await storage.getHotel(hotelId, propertyId);
      const allPorts = await storage.getActivePorts();
      const port = allPorts.find((p) => p.id === portId);
      if (!hotel) return res.status(400).json({ error: "Invalid hotel" });
      if (!port) return res.status(400).json({ error: "Invalid port" });

      const phr = await storage.getPortHotelRate(portId, hotelId, propertyId);
      if (!phr?.price) return res.status(400).json({ error: "No rate available for this hotel/port" });
      const basePrice = parseFloat(phr.price);

      const surchargeAmt = parseFloat((await storage.getSetting("large_party_surcharge_amount", propertyId))?.value || "20");
      const minSize = parseInt((await storage.getSetting("large_party_min_size", propertyId))?.value || "4");
      const taxPct = parseFloat((await storage.getSetting("tax_percentage", propertyId))?.value || "0");
      const surcharge = partySizeNum >= minSize ? surchargeAmt : 0;
      const subtotal = basePrice + surcharge;
      const taxAmount = subtotal * (taxPct / 100);
      const total = subtotal + taxAmount;
      const totalAmountCents = Math.round(total * 100);

      const stripe = await getUncachableStripeClient();
      const origin = req.headers.origin || `https://${req.headers.host}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: {
              name: `Airport Transfer - ${port.name} to ${hotel.name}`,
              description: `${partySizeNum} passenger(s), ${vehicleClass} vehicle`,
            },
            unit_amount: totalAmountCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?booking=cancelled`,
        customer_email: customerEmail,
        metadata: {
          propertyId,
          bookingType: "hotel",
          hotelId, hotelName: hotel.name, portId, portName: port.name,
          customerName, customerEmail, customerPhone: customerPhone || "",
          pickupDate, pickupTime, partySize: String(partySizeNum), vehicleClass,
          flightNumber: flightNumber || "",
          totalAmount: total.toFixed(2), basePrice: basePrice.toFixed(2),
          surcharge: surcharge.toFixed(2), taxAmount: taxAmount.toFixed(2),
        },
      });
      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("Hotel checkout error:", err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
