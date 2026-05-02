import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { Property } from "@shared/schema";

declare module "express-serve-static-core" {
  interface Request {
    property?: Property;
  }
}

declare module "express-session" {
  interface SessionData {
    userType?: "super_admin" | "property_user";
    userId?: string;
    propertyId?: string;
    // Legacy fields kept for backward compat during transition
    adminId?: string;
    isAdmin?: boolean;
  }
}

/**
 * Resolves the active property for a request.
 * Priority:
 *   1. ?property=slug  query param (dev)
 *   2. X-Property-Slug  header (dev / API clients)
 *   3. Subdomain of host (production: sandals.islandporttransfers.com -> "sandals")
 *   4. Default property (fallback)
 */
export async function resolveProperty(req: Request): Promise<Property | undefined> {
  const fromQuery = typeof req.query.property === "string" ? req.query.property : undefined;
  const fromHeader = req.header("x-property-slug") || undefined;

  let slug = fromQuery || fromHeader;

  if (!slug) {
    const host = req.hostname || "";
    // Strip port if present
    const hostname = host.split(":")[0];
    const parts = hostname.split(".");
    // Look for *.islandporttransfers.com style subdomains (3+ parts), excluding common reserved
    const RESERVED = new Set(["www", "api", "admin", "app", "marketing"]);
    if (parts.length >= 3) {
      const candidate = parts[0].toLowerCase();
      if (!RESERVED.has(candidate)) {
        slug = candidate;
      }
    }
  }

  if (slug) {
    const found = await storage.getPropertyBySlug(slug);
    if (found && found.status === "active") return found;
  }

  return await storage.getDefaultProperty();
}

/**
 * Attaches req.property based on subdomain / query param. Always succeeds
 * (falls back to default property). Use on PUBLIC endpoints.
 */
export async function attachProperty(req: Request, res: Response, next: NextFunction) {
  try {
    const property = await resolveProperty(req);
    if (!property) {
      return res.status(503).json({ error: "No property configured" });
    }
    req.property = property;
    next();
  } catch (err) {
    console.error("attachProperty error:", err);
    res.status(500).json({ error: "Property resolution failed" });
  }
}

/**
 * Requires a logged-in PROPERTY USER. Sets req.property from session.propertyId.
 */
export async function requirePropertyUser(req: Request, res: Response, next: NextFunction) {
  const session = req.session;
  if (session.userType !== "property_user" || !session.propertyId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const property = await storage.getProperty(session.propertyId);
  if (!property || property.status !== "active") {
    return res.status(403).json({ error: "Property unavailable" });
  }
  req.property = property;
  next();
}

/**
 * Requires a logged-in SUPER ADMIN.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session.userType !== "super_admin" || !req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
