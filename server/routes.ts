import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertDriverSchema,
  insertHotelSchema,
  insertZoneSchema,
  insertZoneRouteSchema,
  insertRateSchema,
  insertPricingRuleSchema,
  insertBookingSchema,
  insertSettingSchema,
  insertEmailTemplateSchema,
} from "@shared/schema";
import bcrypt from "bcrypt";
import { z } from "zod";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { getUncachableStripeClient, getCurrentStripeEnvironment } from "./stripeClient";
import { emailService } from "./emailService";

// Helper to generate unique reference numbers
function generateReferenceNumber(): string {
  const prefix = "BK";
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for production (Replit apps are behind a proxy)
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
  
  // Configure session middleware
  const PgSession = connectPgSimple(session);
  
  app.use(session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : undefined,
    }
  }));

  // Admin authentication
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }
      
      const admin = await storage.getAdminUserByUsername(username);
      
      if (!admin) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const validPassword = await bcrypt.compare(password, admin.password);
      
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Store admin session
      (req.session as any).adminId = admin.id;
      (req.session as any).isAdmin = true;
      
      res.json({ 
        success: true, 
        admin: { 
          id: admin.id, 
          username: admin.username,
          email: admin.email 
        } 
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/admin/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/admin/me", async (req: Request, res: Response) => {
    const adminId = (req.session as any).adminId;
    
    if (!adminId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    const admin = await storage.getAdminUser(adminId);
    
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }
    
    res.json({ 
      id: admin.id, 
      username: admin.username,
      email: admin.email 
    });
  });

  // Middleware to check admin authentication
  const requireAdmin = (req: Request, res: Response, next: any) => {
    if (!(req.session as any).isAdmin) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  // Admin Users API
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    const users = await storage.getAllAdminUsers();
    // Don't expose password hashes
    const sanitizedUsers = users.map(({ password, ...user }) => user);
    res.json(sanitizedUsers);
  });

  app.post("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { username, password, email } = req.body;
      
      if (!username || !password || !email) {
        return res.status(400).json({ error: "Username, password, and email are required" });
      }
      
      // Check if username already exists
      const existing = await storage.getAdminUserByUsername(username);
      if (existing) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = await storage.createAdminUser({
        username,
        password: hashedPassword,
        email,
      });
      
      // Don't expose password hash
      const { password: _, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error) {
      res.status(400).json({ error: "Invalid user data" });
    }
  });

  app.patch("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { username, password, email } = req.body;
      const updateData: { username?: string; password?: string; email?: string } = {};
      
      if (username) {
        // Check if username is taken by another user
        const existing = await storage.getAdminUserByUsername(username);
        if (existing && existing.id !== req.params.id) {
          return res.status(400).json({ error: "Username already exists" });
        }
        updateData.username = username;
      }
      
      if (email) {
        updateData.email = email;
      }
      
      if (password) {
        updateData.password = await bcrypt.hash(password, 10);
      }
      
      const user = await storage.updateAdminUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Don't expose password hash
      const { password: _, ...sanitizedUser } = user;
      res.json(sanitizedUser);
    } catch (error) {
      res.status(400).json({ error: "Invalid user data" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    // Prevent deleting yourself
    const currentAdminId = (req.session as any).adminId;
    if (req.params.id === currentAdminId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }
    
    const success = await storage.deleteAdminUser(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ success: true });
  });

  // Drivers API
  app.get("/api/admin/drivers", requireAdmin, async (req: Request, res: Response) => {
    const drivers = await storage.getAllDrivers();
    res.json(drivers);
  });

  app.get("/api/admin/drivers/:id", requireAdmin, async (req: Request, res: Response) => {
    const driver = await storage.getDriver(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }
    res.json(driver);
  });

  app.post("/api/admin/drivers", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertDriverSchema.parse(req.body);
      const driver = await storage.createDriver(data);
      res.json(driver);
    } catch (error) {
      res.status(400).json({ error: "Invalid driver data" });
    }
  });

  app.patch("/api/admin/drivers/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const driver = await storage.updateDriver(req.params.id, req.body);
      if (!driver) {
        return res.status(404).json({ error: "Driver not found" });
      }
      res.json(driver);
    } catch (error) {
      res.status(400).json({ error: "Invalid driver data" });
    }
  });

  app.delete("/api/admin/drivers/:id", requireAdmin, async (req: Request, res: Response) => {
    const success = await storage.deleteDriver(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Driver not found" });
    }
    res.json({ success: true });
  });

  // Hotels API (Admin)
  app.get("/api/admin/hotels", requireAdmin, async (req: Request, res: Response) => {
    const hotels = await storage.getAllHotels();
    res.json(hotels);
  });

  app.get("/api/admin/hotels/:id", requireAdmin, async (req: Request, res: Response) => {
    const hotel = await storage.getHotel(req.params.id);
    if (!hotel) {
      return res.status(404).json({ error: "Hotel not found" });
    }
    res.json(hotel);
  });

  app.post("/api/admin/hotels", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertHotelSchema.parse(req.body);
      const hotel = await storage.createHotel(data);
      res.json(hotel);
    } catch (error) {
      res.status(400).json({ error: "Invalid hotel data" });
    }
  });

  app.patch("/api/admin/hotels/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const hotel = await storage.updateHotel(req.params.id, req.body);
      if (!hotel) {
        return res.status(404).json({ error: "Hotel not found" });
      }
      res.json(hotel);
    } catch (error) {
      res.status(400).json({ error: "Invalid hotel data" });
    }
  });

  app.delete("/api/admin/hotels/:id", requireAdmin, async (req: Request, res: Response) => {
    const success = await storage.deleteHotel(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Hotel not found" });
    }
    res.json({ success: true });
  });

  // Public Hotels API (for booking form)
  app.get("/api/hotels", async (req: Request, res: Response) => {
    const hotels = await storage.getActiveHotels();
    res.json(hotels);
  });

  // Port-Hotel Rates API (admin)
  app.get("/api/admin/hotels/:id/port-rates", requireAdmin, async (req: Request, res: Response) => {
    const ports = await storage.getActivePorts();
    const rates = await storage.getPortHotelRates(req.params.id);
    
    const portsWithRates = ports.map(port => {
      const rate = rates.find(r => r.portId === port.id);
      return {
        ...port,
        price: rate?.price || null,
      };
    });
    
    res.json(portsWithRates);
  });

  app.post("/api/admin/hotels/:id/port-rates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { rates } = req.body;
      
      if (!Array.isArray(rates)) {
        return res.status(400).json({ error: "Rates must be an array" });
      }
      
      const results = [];
      for (const rate of rates) {
        if (rate.price !== null && rate.price !== undefined && rate.price !== "") {
          const result = await storage.upsertPortHotelRate({
            portId: rate.portId,
            hotelId: req.params.id,
            price: rate.price,
            isActive: true,
          });
          results.push(result);
        }
      }
      
      res.json({ success: true, rates: results });
    } catch (error) {
      res.status(400).json({ error: "Invalid rate data" });
    }
  });

  // Ports API (public - for booking form)
  app.get("/api/ports", async (req: Request, res: Response) => {
    const ports = await storage.getActivePorts();
    res.json(ports);
  });

  // Public port-hotel rate lookup (for booking form pricing display)
  app.get("/api/port-hotel-rate", async (req: Request, res: Response) => {
    const { portId, hotelId } = req.query;
    
    if (!portId || !hotelId || typeof portId !== 'string' || typeof hotelId !== 'string') {
      return res.status(400).json({ error: "portId and hotelId are required" });
    }
    
    const rate = await storage.getPortHotelRate(portId, hotelId);
    res.json({ price: rate?.price || null });
  });

  // Zones API
  app.get("/api/admin/zones", requireAdmin, async (req: Request, res: Response) => {
    const zones = await storage.getAllZones();
    res.json(zones);
  });

  app.get("/api/admin/zones/:id", requireAdmin, async (req: Request, res: Response) => {
    const zone = await storage.getZone(req.params.id);
    if (!zone) {
      return res.status(404).json({ error: "Zone not found" });
    }
    res.json(zone);
  });

  app.post("/api/admin/zones", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertZoneSchema.parse(req.body);
      const zone = await storage.createZone(data);
      res.json(zone);
    } catch (error) {
      res.status(400).json({ error: "Invalid zone data" });
    }
  });

  app.patch("/api/admin/zones/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const zone = await storage.updateZone(req.params.id, req.body);
      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }
      res.json(zone);
    } catch (error) {
      res.status(400).json({ error: "Invalid zone data" });
    }
  });

  app.delete("/api/admin/zones/:id", requireAdmin, async (req: Request, res: Response) => {
    const success = await storage.deleteZone(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Zone not found" });
    }
    res.json({ success: true });
  });

  // Public Zones API (for booking form and hotel assignment)
  app.get("/api/zones", async (req: Request, res: Response) => {
    const zones = await storage.getActiveZones();
    res.json(zones);
  });

  // Seed St. Lucia zones
  app.post("/api/admin/zones/seed", requireAdmin, async (req: Request, res: Response) => {
    const stLuciaZones = [
      "Gros Islet",
      "Babonneau",
      "Castries North",
      "Castries East",
      "Castries Central",
      "Castries South",
      "Anse-La-Raye/Canaries",
      "Soufriere",
      "Choiseul",
      "Laborie",
      "Vieux-Fort South",
      "Vieux-Fort North",
      "Micoud South",
      "Micoud North",
      "Dennery South",
      "Dennery North",
      "Castries South East",
    ];

    const createdZones = [];
    const skippedZones = [];

    for (const zoneName of stLuciaZones) {
      const existing = await storage.getZoneByName(zoneName);
      if (existing) {
        skippedZones.push(zoneName);
        continue;
      }
      const zone = await storage.createZone({ name: zoneName, isActive: true });
      createdZones.push(zone);
    }

    res.json({ 
      success: true, 
      created: createdZones.length, 
      skipped: skippedZones.length,
      message: `Created ${createdZones.length} zones, skipped ${skippedZones.length} existing zones` 
    });
  });

  // Zone Routes API (zone-to-zone pricing)
  app.get("/api/admin/zone-routes", requireAdmin, async (req: Request, res: Response) => {
    const routes = await storage.getAllZoneRoutes();
    res.json(routes);
  });

  app.get("/api/admin/zone-routes/:id", requireAdmin, async (req: Request, res: Response) => {
    const route = await storage.getZoneRouteById(req.params.id);
    if (!route) {
      return res.status(404).json({ error: "Zone route not found" });
    }
    res.json(route);
  });

  app.post("/api/admin/zone-routes", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertZoneRouteSchema.parse(req.body);
      const route = await storage.upsertZoneRoute(data);
      res.json(route);
    } catch (error) {
      res.status(400).json({ error: "Invalid zone route data" });
    }
  });

  app.patch("/api/admin/zone-routes/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const route = await storage.updateZoneRoute(req.params.id, req.body);
      if (!route) {
        return res.status(404).json({ error: "Zone route not found" });
      }
      res.json(route);
    } catch (error) {
      res.status(400).json({ error: "Invalid zone route data" });
    }
  });

  app.delete("/api/admin/zone-routes/:id", requireAdmin, async (req: Request, res: Response) => {
    const success = await storage.deleteZoneRoute(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Zone route not found" });
    }
    res.json({ success: true });
  });

  // Rates API
  app.get("/api/admin/rates", requireAdmin, async (req: Request, res: Response) => {
    const rates = await storage.getAllRates();
    res.json(rates);
  });

  app.get("/api/admin/rates/zone/:zoneId", requireAdmin, async (req: Request, res: Response) => {
    const rates = await storage.getRatesByZone(req.params.zoneId);
    res.json(rates);
  });

  app.post("/api/admin/rates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertRateSchema.parse(req.body);
      const rate = await storage.createRate(data);
      res.json(rate);
    } catch (error) {
      res.status(400).json({ error: "Invalid rate data" });
    }
  });

  app.patch("/api/admin/rates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rate = await storage.updateRate(req.params.id, req.body);
      if (!rate) {
        return res.status(404).json({ error: "Rate not found" });
      }
      res.json(rate);
    } catch (error) {
      res.status(400).json({ error: "Invalid rate data" });
    }
  });

  app.delete("/api/admin/rates/:id", requireAdmin, async (req: Request, res: Response) => {
    const success = await storage.deleteRate(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Rate not found" });
    }
    res.json({ success: true });
  });

  // Pricing Rules API
  app.get("/api/admin/pricing-rules", requireAdmin, async (req: Request, res: Response) => {
    const rules = await storage.getAllPricingRules();
    res.json(rules);
  });

  app.post("/api/admin/pricing-rules", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertPricingRuleSchema.parse(req.body);
      const rule = await storage.createPricingRule(data);
      res.json(rule);
    } catch (error) {
      res.status(400).json({ error: "Invalid pricing rule data" });
    }
  });

  app.patch("/api/admin/pricing-rules/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rule = await storage.updatePricingRule(req.params.id, req.body);
      if (!rule) {
        return res.status(404).json({ error: "Pricing rule not found" });
      }
      res.json(rule);
    } catch (error) {
      res.status(400).json({ error: "Invalid pricing rule data" });
    }
  });

  app.delete("/api/admin/pricing-rules/:id", requireAdmin, async (req: Request, res: Response) => {
    const success = await storage.deletePricingRule(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Pricing rule not found" });
    }
    res.json({ success: true });
  });

  // Bookings API
  app.get("/api/admin/bookings", requireAdmin, async (req: Request, res: Response) => {
    const { status, search } = req.query;
    const bookings = await storage.getAllBookings({
      status: status as string,
      search: search as string,
    });
    res.json(bookings);
  });

  app.get("/api/admin/bookings/:id", requireAdmin, async (req: Request, res: Response) => {
    const booking = await storage.getBooking(req.params.id);
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    res.json(booking);
  });

  app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const booking = await storage.updateBookingStatus(req.params.id, status);
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      res.json(booking);
    } catch (error) {
      res.status(400).json({ error: "Invalid status" });
    }
  });

  app.post("/api/admin/bookings/:id/assign-driver", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { driverId } = req.body;
      
      if (!driverId) {
        return res.status(400).json({ error: "Driver ID required" });
      }
      
      const booking = await storage.assignDriver(req.params.id, driverId);
      
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      const driver = await storage.getDriver(driverId);
      
      // Send email notification to the driver
      if (driver && driver.email) {
        try {
          const pickupDateTime = booking.pickupDate ? new Date(booking.pickupDate) : null;
          const pickupTimeStr = pickupDateTime ? pickupDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
          
          await emailService.sendDriverAssignment(
            {
              driverEmail: driver.email,
              driverName: driver.name,
            },
            {
              referenceNumber: booking.referenceNumber,
              customerName: booking.customerName,
              customerPhone: booking.customerPhone,
              pickupDate: pickupDateTime ? pickupDateTime.toLocaleDateString() : '',
              pickupTime: pickupTimeStr,
              pickupLocation: booking.pickupLocation,
              dropoffLocation: booking.dropoffLocation,
              partySize: booking.partySize,
              flightNumber: booking.flightNumber,
              vehicleClass: booking.vehicleClass,
              driverFee: booking.driverFee || "0",
            }
          );
        } catch (emailError) {
          console.error("Failed to send driver assignment email:", emailError);
        }
      }
      
      // Send email notification to the customer
      if (driver) {
        try {
          await emailService.sendDriverAssignmentToCustomer({
            customerEmail: booking.customerEmail,
            customerName: booking.customerName,
            referenceNumber: booking.referenceNumber,
            driverName: driver.name,
            pickupDate: booking.pickupDate ? new Date(booking.pickupDate).toLocaleDateString() : '',
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
          });
        } catch (emailError) {
          console.error("Failed to send driver assignment notification to customer:", emailError);
        }
      }
      
      res.json({ 
        booking, 
        driver,
        message: "Driver assigned successfully. Email notifications sent to driver and customer." 
      });
    } catch (error) {
      res.status(400).json({ error: "Failed to assign driver" });
    }
  });

  // Update booking pricing (admin only)
  app.patch("/api/admin/bookings/:id/pricing", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { bookingFee, driverFee, balanceDueToDriver } = req.body;
      
      // Get booking before update to check if this is first time setting pricing
      const existingBooking = await storage.getBooking(req.params.id);
      if (!existingBooking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const isFirstPricingSet = !existingBooking.pricingSet;
      
      // Calculate total with tax on server side
      const taxPercentageSetting = await storage.getSetting("tax_percentage");
      const taxPercentage = parseFloat(taxPercentageSetting?.value || "0");
      const subtotal = (parseFloat(bookingFee) || 0) + (parseFloat(driverFee) || 0);
      const taxAmount = subtotal * (taxPercentage / 100);
      const totalAmount = (subtotal + taxAmount).toFixed(2);
      
      const booking = await storage.updateBookingPricing(req.params.id, {
        bookingFee,
        driverFee,
        totalAmount,
        balanceDueToDriver: balanceDueToDriver || driverFee,
        pricingSet: true,
      });
      
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Only send quote notification email when pricing is first set (idempotency)
      if (isFirstPricingSet && booking.bookingType === "destination") {
        try {
          await emailService.sendQuoteNotification({
            customerEmail: booking.customerEmail,
            customerName: booking.customerName,
            referenceNumber: booking.referenceNumber,
            bookingFee: bookingFee || "0",
            driverFee: driverFee || "0",
            totalAmount: totalAmount || "0",
          });
        } catch (emailError) {
          console.error("Failed to send quote notification email:", emailError);
        }
      }
      
      res.json(booking);
    } catch (error) {
      console.error("Error updating booking pricing:", error);
      res.status(400).json({ error: "Failed to update pricing" });
    }
  });

  // Send payment link to customer (admin only)
  app.post("/api/admin/bookings/:id/send-payment-link", requireAdmin, async (req: Request, res: Response) => {
    try {
      const booking = await storage.getBooking(req.params.id);
      
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      if (!booking.pricingSet) {
        return res.status(400).json({ error: "Pricing must be set before sending payment link" });
      }

      // Check if payment link already sent (prevent duplicates unless force=true)
      const force = req.body.force === true;
      if (booking.paymentLinkSent && !force) {
        return res.status(400).json({ 
          error: "Payment link already sent. Set force=true to send again.",
          paymentLinkSentAt: booking.paymentLinkSentAt
        });
      }

      const totalAmountCents = Math.round(parseFloat(booking.totalAmount || "0") * 100);
      
      const stripe = await getUncachableStripeClient();
      
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Airport Transfer - ${booking.referenceNumber}`,
                description: `Transfer from ${booking.pickupLocation} to ${booking.dropoffLocation}`,
              },
              unit_amount: totalAmountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          bookingId: booking.id,
          referenceNumber: booking.referenceNumber,
        },
      });

      try {
        await emailService.sendPaymentLink({
          customerEmail: booking.customerEmail,
          customerName: booking.customerName,
          referenceNumber: booking.referenceNumber,
          totalAmount: booking.totalAmount || "0",
          paymentLink: paymentLink.url,
        });
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
      }
      
      const updatedBooking = await storage.markPaymentLinkSent(req.params.id);
      
      res.json({ 
        booking: updatedBooking,
        paymentLink: paymentLink.url,
        message: `Payment link sent to ${booking.customerEmail}. Total amount: $${booking.totalAmount}` 
      });
    } catch (error) {
      console.error("Error sending payment link:", error);
      res.status(400).json({ error: "Failed to send payment link" });
    }
  });

  // Public booking creation endpoint (for customer form)
  app.post("/api/bookings", async (req: Request, res: Response) => {
    try {
      // Convert pickupDate string to Date object
      const pickupDate = req.body.pickupDate ? new Date(req.body.pickupDate) : undefined;
      const isDestinationBooking = req.body.bookingType === "destination";
      
      // Calculate pricing for hotel bookings
      let bookingFee: string | null = null;
      let driverFee: string | null = null;
      let totalAmount: string | null = null;
      let balanceDueToDriver: string | null = null;
      let pricingSet = false;
      
      if (!isDestinationBooking && req.body.arrivalPortId && req.body.hotelId) {
        // Get port-hotel rate
        const portHotelRate = await storage.getPortHotelRate(req.body.arrivalPortId, req.body.hotelId);
        const basePrice = portHotelRate ? parseFloat(portHotelRate.price) : 30;
        
        // Check for large party surcharge
        const surchargeAmountSetting = await storage.getSetting("large_party_surcharge_amount");
        const minPartySizeSetting = await storage.getSetting("large_party_min_size");
        const surchargeAmount = surchargeAmountSetting ? parseFloat(surchargeAmountSetting.value) : 20;
        const minPartySize = minPartySizeSetting ? parseInt(minPartySizeSetting.value) : 4;
        
        // Get tax percentage
        const taxPercentageSetting = await storage.getSetting("tax_percentage");
        const taxPercentage = taxPercentageSetting ? parseInt(taxPercentageSetting.value) : 0;
        
        const partySize = req.body.partySize || 1;
        const surcharge = partySize >= minPartySize ? surchargeAmount : 0;
        
        // Calculate tax on the base price + surcharge
        const subtotal = basePrice + surcharge;
        const taxAmount = (subtotal * taxPercentage) / 100;
        const total = subtotal + taxAmount;
        
        bookingFee = total.toFixed(2);
        driverFee = basePrice.toFixed(2);
        totalAmount = total.toFixed(2);
        balanceDueToDriver = basePrice.toFixed(2);
        pricingSet = true;
      } else if (!isDestinationBooking) {
        // Fallback for hotel bookings without port (shouldn't happen but for safety)
        bookingFee = "30.00";
        driverFee = "30.00";
        totalAmount = "30.00";
        balanceDueToDriver = "30.00";
        pricingSet = true;
      }
      // For destination bookings, leave pricing null (pending quote from admin)
      
      const bookingData = {
        ...req.body,
        pickupDate,
        referenceNumber: generateReferenceNumber(),
        status: "new",
        bookingFee,
        driverFee,
        totalAmount,
        balanceDueToDriver,
        pricingSet,
      };
      
      const data = insertBookingSchema.parse(bookingData);
      const booking = await storage.createBooking(data);

      // For destination bookings, send confirmation email immediately
      // For hotel bookings, the confirmation email is sent after Stripe payment via webhook
      if (isDestinationBooking) {
        try {
          await emailService.sendBookingConfirmation({
            customerEmail: booking.customerEmail,
            customerName: booking.customerName,
            referenceNumber: booking.referenceNumber,
            bookingType: booking.bookingType,
            pickupDate: booking.pickupDate ? new Date(booking.pickupDate).toLocaleDateString() : '',
            pickupTime: req.body.pickupTime || '',
            pickupLocation: booking.pickupLocation,
            dropoffLocation: booking.dropoffLocation,
            passengers: booking.partySize,
            totalAmount: booking.totalAmount || undefined,
          });
        } catch (emailError) {
          console.error("Failed to send booking confirmation email:", emailError);
        }
      }

      res.json(booking);
    } catch (error) {
      console.error("Booking creation error:", error);
      res.status(400).json({ error: "Invalid booking data" });
    }
  });

  // Settings API (admin)
  app.get("/api/admin/settings", requireAdmin, async (req: Request, res: Response) => {
    const settings = await storage.getAllSettings();
    res.json(settings);
  });

  app.post("/api/admin/settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertSettingSchema.parse(req.body);
      const setting = await storage.upsertSetting(data);
      res.json(setting);
    } catch (error) {
      res.status(400).json({ error: "Invalid setting data" });
    }
  });

  // Email Templates API
  app.get("/api/admin/email-templates", requireAdmin, async (req: Request, res: Response) => {
    const templates = await storage.getAllEmailTemplates();
    res.json(templates);
  });

  app.get("/api/admin/email-templates/:id", requireAdmin, async (req: Request, res: Response) => {
    const template = await storage.getEmailTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Email template not found" });
    }
    res.json(template);
  });

  app.put("/api/admin/email-templates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const updateSchema = z.object({
        subject: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
      });
      
      const validatedData = updateSchema.parse(req.body);
      const template = await storage.updateEmailTemplate(req.params.id, validatedData);
      if (!template) {
        return res.status(404).json({ error: "Email template not found" });
      }
      res.json(template);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid template data", details: error.errors });
      }
      res.status(400).json({ error: "Failed to update template" });
    }
  });

  // Send test email endpoint
  app.post("/api/admin/email-templates/:id/send-test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const testEmailSchema = z.object({
        testEmail: z.string().email(),
      });
      
      const { testEmail } = testEmailSchema.parse(req.body);
      const template = await storage.getEmailTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Email template not found" });
      }

      // Sample data for preview
      const sampleVariables: Record<string, string> = {
        customerName: "John Smith",
        referenceNumber: "TEST-123456",
        pickupDate: "March 15, 2026",
        pickupTime: "2:30 PM",
        pickupLocation: "Hewanorra International Airport (UVF)",
        dropoffLocation: "Sandals Grande St. Lucian",
        passengers: "4",
        tripPrice: "$80.00",
        taxAmount: "$5.00",
        totalAmount: "$85.00",
        bookingFee: "$30.00",
        driverFee: "$55.00",
        paymentLink: "https://example.com/pay/test-link",
        driverName: "Marcus Joseph",
        customerPhone: "+1 (555) 123-4567",
        partySize: "4",
        flightNumber: "AA 1234",
        vehicleClass: "SUV",
      };

      // Replace variables in subject and body
      let subject = template.subject;
      let body = template.body;
      
      for (const [key, value] of Object.entries(sampleVariables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      // Send test email using Resend
      const { getUncachableResendClient } = await import('./resendClient');
      const { client, fromEmail } = await getUncachableResendClient();
      
      const { data, error } = await client.emails.send({
        from: fromEmail,
        to: testEmail,
        subject: `[TEST] ${subject}`,
        html: body,
      });

      if (error) {
        console.error('Failed to send test email:', error);
        return res.status(500).json({ error: "Failed to send test email" });
      }

      res.json({ success: true, messageId: data?.id });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid email address", details: error.errors });
      }
      console.error('Error sending test email:', error);
      res.status(500).json({ error: "Failed to send test email" });
    }
  });

  // Get email template preview with sample data
  app.get("/api/admin/email-templates/:id/preview", requireAdmin, async (req: Request, res: Response) => {
    try {
      const template = await storage.getEmailTemplate(req.params.id);
      
      if (!template) {
        return res.status(404).json({ error: "Email template not found" });
      }

      // Sample data for preview
      const sampleVariables: Record<string, string> = {
        customerName: "John Smith",
        referenceNumber: "TEST-123456",
        pickupDate: "March 15, 2026",
        pickupTime: "2:30 PM",
        pickupLocation: "Hewanorra International Airport (UVF)",
        dropoffLocation: "Sandals Grande St. Lucian",
        passengers: "4",
        tripPrice: "$80.00",
        taxAmount: "$5.00",
        totalAmount: "$85.00",
        bookingFee: "$30.00",
        driverFee: "$55.00",
        paymentLink: "https://example.com/pay/test-link",
        driverName: "Marcus Joseph",
        customerPhone: "+1 (555) 123-4567",
        partySize: "4",
        flightNumber: "AA 1234",
        vehicleClass: "SUV",
      };

      // Replace variables in subject and body
      let subject = template.subject;
      let body = template.body;
      
      for (const [key, value] of Object.entries(sampleVariables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      }

      // Strip HTML tags for plain text preview
      const plainText = body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/\n\s*\n/g, '\n\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();

      res.json({
        subject,
        htmlBody: body,
        plainText,
      });
    } catch (error) {
      console.error('Error generating preview:', error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // Public settings endpoint for pricing calculations
  app.get("/api/settings/large-party-surcharge", async (req: Request, res: Response) => {
    const surchargeAmount = await storage.getSetting("large_party_surcharge_amount");
    const minPartySize = await storage.getSetting("large_party_min_size");
    
    res.json({
      amount: surchargeAmount?.value || "20",
      minPartySize: minPartySize?.value || "4",
    });
  });

  // Public settings endpoint for tax
  app.get("/api/settings/tax", async (req: Request, res: Response) => {
    const taxPercentage = await storage.getSetting("tax_percentage");
    
    res.json({
      percentage: taxPercentage?.value || "0",
    });
  });

  // Public endpoint for Stripe environment (sandbox vs live)
  app.get("/api/settings/stripe-environment", async (req: Request, res: Response) => {
    const env = await getCurrentStripeEnvironment();
    res.json({ environment: env });
  });

  // Admin endpoint to update Stripe environment
  app.post("/api/admin/settings/stripe-environment", requireAdmin, async (req: Request, res: Response) => {
    const { environment } = req.body;
    if (environment !== "sandbox" && environment !== "live") {
      return res.status(400).json({ message: "Environment must be 'sandbox' or 'live'" });
    }
    await storage.upsertSetting({
      key: "stripe_environment",
      value: environment,
      description: "Stripe environment: sandbox for testing, live for real payments",
    });
    res.json({ environment });
  });

  // Public endpoint to get booking by Stripe session ID (for confirmation page)
  app.get("/api/booking-confirmation/:sessionId", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      
      // Try to find booking by session ID
      const booking = await storage.getBookingByStripeSessionId(sessionId);
      
      if (!booking) {
        // Booking might not be created yet (webhook hasn't processed)
        return res.status(404).json({ error: "Booking not found. It may still be processing." });
      }
      
      // Return only the fields needed for the confirmation page
      res.json({
        referenceNumber: booking.referenceNumber,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
        pickupDate: booking.pickupDate,
        partySize: booking.partySize,
        vehicleClass: booking.vehicleClass,
        flightNumber: booking.flightNumber,
        totalAmount: booking.totalAmount,
        bookingType: booking.bookingType,
      });
    } catch (error) {
      console.error("Error fetching booking confirmation:", error);
      res.status(500).json({ error: "Failed to fetch booking" });
    }
  });

  // Public endpoint to get booking by reference number (for destination booking confirmation)
  app.get("/api/booking-by-reference/:referenceNumber", async (req: Request, res: Response) => {
    try {
      const { referenceNumber } = req.params;
      
      if (!referenceNumber) {
        return res.status(400).json({ error: "Reference number required" });
      }
      
      const booking = await storage.getBookingByReference(referenceNumber);
      
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      
      // Return only the fields needed for the confirmation page
      res.json({
        referenceNumber: booking.referenceNumber,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        pickupLocation: booking.pickupLocation,
        dropoffLocation: booking.dropoffLocation,
        pickupDate: booking.pickupDate,
        partySize: booking.partySize,
        vehicleClass: booking.vehicleClass,
        flightNumber: booking.flightNumber,
        totalAmount: booking.totalAmount,
        bookingType: booking.bookingType,
      });
    } catch (error) {
      console.error("Error fetching booking by reference:", error);
      res.status(500).json({ error: "Failed to fetch booking" });
    }
  });

  // Hotel checkout - create Stripe checkout session (public endpoint)
  // SECURITY: Price is computed server-side using stored rates to prevent tampering
  app.post("/api/hotel-checkout", async (req: Request, res: Response) => {
    try {
      const {
        hotelId,
        portId,
        customerName,
        customerEmail,
        customerPhone,
        pickupDate,
        pickupTime,
        partySize,
        vehicleClass,
        flightNumber,
      } = req.body;

      // Validate required fields
      if (!hotelId || !portId || !customerName || !customerEmail || !pickupDate || !pickupTime || !partySize || !vehicleClass) {
        return res.status(400).json({ error: "Missing required booking details" });
      }
      
      // Validate partySize is a positive integer
      const partySizeNum = parseInt(partySize);
      if (isNaN(partySizeNum) || partySizeNum < 1) {
        return res.status(400).json({ error: "Invalid party size" });
      }

      // Get hotel and port from database (validates they exist)
      const hotel = await storage.getHotel(hotelId);
      const allPorts = await storage.getActivePorts();
      const port = allPorts.find(p => p.id === portId);
      
      if (!hotel) {
        return res.status(400).json({ error: "Invalid hotel" });
      }
      if (!port) {
        return res.status(400).json({ error: "Invalid port" });
      }

      // SERVER-SIDE PRICE CALCULATION - Never trust client-provided prices
      const portHotelRate = await storage.getPortHotelRate(portId, hotelId);
      if (!portHotelRate || !portHotelRate.price) {
        return res.status(400).json({ error: "No rate available for this hotel and port combination" });
      }
      
      const basePrice = parseFloat(portHotelRate.price);
      
      // Get surcharge settings from database
      const surchargeAmountSetting = await storage.getSetting("large_party_surcharge_amount");
      const minPartySizeSetting = await storage.getSetting("large_party_min_size");
      const surchargeAmount = parseFloat(surchargeAmountSetting?.value || "20");
      const minPartySize = parseInt(minPartySizeSetting?.value || "4");
      
      // Apply surcharge if party size meets threshold
      const surcharge = partySizeNum >= minPartySize ? surchargeAmount : 0;
      
      // Get tax settings from database
      const taxPercentageSetting = await storage.getSetting("tax_percentage");
      const taxPercentage = parseFloat(taxPercentageSetting?.value || "0");
      
      // Calculate subtotal and tax
      const subtotal = basePrice + surcharge;
      const taxAmount = subtotal * (taxPercentage / 100);
      const totalAmount = subtotal + taxAmount;
      
      const totalAmountCents = Math.round(totalAmount * 100);
      
      const stripe = await getUncachableStripeClient();
      
      // Get the origin for success/cancel URLs
      const origin = req.headers.origin || `https://${req.headers.host}`;
      
      // Create Stripe checkout session with server-computed price
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Airport Transfer - ${port.name} to ${hotel.name}`,
                description: `${partySizeNum} passenger(s), ${vehicleClass} vehicle`,
              },
              unit_amount: totalAmountCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${origin}/booking/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?booking=cancelled`,
        customer_email: customerEmail,
        metadata: {
          bookingType: 'hotel',
          hotelId,
          hotelName: hotel.name,
          portId,
          portName: port.name,
          customerName,
          customerEmail,
          customerPhone: customerPhone || '',
          pickupDate,
          pickupTime,
          partySize: String(partySizeNum),
          vehicleClass,
          flightNumber: flightNumber || '',
          totalAmount: totalAmount.toFixed(2),
          basePrice: basePrice.toFixed(2),
          surcharge: surcharge.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
        },
      });

      res.json({ checkoutUrl: session.url });
    } catch (error) {
      console.error("Hotel checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // Initialize default settings if not exist
  const initDefaultSettings = async () => {
    const surchargeAmount = await storage.getSetting("large_party_surcharge_amount");
    if (!surchargeAmount) {
      await storage.upsertSetting({
        key: "large_party_surcharge_amount",
        value: "20",
        description: "Additional fee charged when party size is equal to or exceeds the minimum threshold",
      });
    }
    
    const minSize = await storage.getSetting("large_party_min_size");
    if (!minSize) {
      await storage.upsertSetting({
        key: "large_party_min_size",
        value: "4",
        description: "Minimum number of travelers to trigger the large party surcharge",
      });
    }
    
    const taxPercentage = await storage.getSetting("tax_percentage");
    if (!taxPercentage) {
      await storage.upsertSetting({
        key: "tax_percentage",
        value: "0",
        description: "Tax percentage applied to all bookings",
      });
    }

    const stripeEnv = await storage.getSetting("stripe_environment");
    if (!stripeEnv) {
      await storage.upsertSetting({
        key: "stripe_environment",
        value: "sandbox",
        description: "Stripe environment: sandbox for testing, live for real payments",
      });
    }
  };
  
  initDefaultSettings().catch(console.error);

  // Initialize default email templates or update availableVariables for existing ones
  const initDefaultEmailTemplates = async () => {
    const existingTemplates = await storage.getAllEmailTemplates();
    const existingByKey = new Map(existingTemplates.map(t => [t.templateKey, t]));

    const defaultTemplates = [
      {
        templateKey: "booking_confirmation",
        name: "Booking Confirmation",
        subject: "Booking Confirmation - {{referenceNumber}}",
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #1a1a2e;">Booking Confirmation</h1>
  <p>Dear {{customerName}},</p>
  <p>Thank you for booking with AirTransfer! Here are your booking details:</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Reference Number:</strong> {{referenceNumber}}</p>
    <p><strong>Pickup Date:</strong> {{pickupDate}}</p>
    <p><strong>Pickup Time:</strong> {{pickupTime}}</p>
    <p><strong>Pickup Location:</strong> {{pickupLocation}}</p>
    <p><strong>Dropoff Location:</strong> {{dropoffLocation}}</p>
    <p><strong>Passengers:</strong> {{passengers}}</p>
    <p><strong>Trip Price:</strong> {{tripPrice}}</p>
    <p><strong>Tax:</strong> {{taxAmount}}</p>
    <p><strong>Total:</strong> {{totalAmount}}</p>
  </div>
  
  <p>If you have any questions, please don't hesitate to contact us.</p>
  <p>Best regards,<br>The AirTransfer Team</p>
</div>`,
        triggerDescription: "Sent when a customer completes a booking",
        recipientType: "customer",
        availableVariables: ["customerName", "referenceNumber", "pickupDate", "pickupTime", "pickupLocation", "dropoffLocation", "passengers", "tripPrice", "taxAmount", "totalAmount"],
      },
      {
        templateKey: "quote_notification",
        name: "Quote Ready",
        subject: "Your Quote is Ready - Booking {{referenceNumber}}",
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #1a1a2e;">Your Quote is Ready</h1>
  <p>Dear {{customerName}},</p>
  <p>Great news! We've prepared a quote for your airport transfer:</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Reference Number:</strong> {{referenceNumber}}</p>
    <p><strong>Booking Fee:</strong> \${{bookingFee}}</p>
    <p><strong>Driver Fee:</strong> \${{driverFee}}</p>
    <p style="font-size: 18px; color: #1a1a2e;"><strong>Total Amount:</strong> \${{totalAmount}}</p>
  </div>
  
  <p>A payment link will be sent to you shortly to complete your booking.</p>
  
  <p>Best regards,<br>The AirTransfer Team</p>
</div>`,
        triggerDescription: "Sent when admin sets pricing for destination bookings",
        recipientType: "customer",
        availableVariables: ["customerName", "referenceNumber", "bookingFee", "driverFee", "totalAmount"],
      },
      {
        templateKey: "payment_link",
        name: "Payment Link",
        subject: "Payment Required - Booking {{referenceNumber}}",
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #1a1a2e;">Payment Required</h1>
  <p>Dear {{customerName}},</p>
  <p>Your booking quote is ready! Please complete your payment to confirm your transfer.</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Reference Number:</strong> {{referenceNumber}}</p>
    <p><strong>Total Amount:</strong> \${{totalAmount}}</p>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="{{paymentLink}}" style="background: #4f46e5; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
      Pay Now
    </a>
  </div>
  
  <p style="color: #666; font-size: 14px;">This payment link will expire in 24 hours.</p>
  
  <p>Best regards,<br>The AirTransfer Team</p>
</div>`,
        triggerDescription: "Sent when admin generates payment link for destination bookings",
        recipientType: "customer",
        availableVariables: ["customerName", "referenceNumber", "totalAmount", "paymentLink"],
      },
      {
        templateKey: "payment_confirmation",
        name: "Payment Confirmation",
        subject: "Payment Confirmed - Booking {{referenceNumber}}",
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #22c55e;">Payment Confirmed!</h1>
  <p>Dear {{customerName}},</p>
  <p>Thank you! Your payment has been successfully processed for your airport transfer.</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Reference Number:</strong> {{referenceNumber}}</p>
    <p><strong>Pickup Date:</strong> {{pickupDate}}</p>
    <p><strong>Pickup Time:</strong> {{pickupTime}}</p>
    <p><strong>Pickup Location:</strong> {{pickupLocation}}</p>
    <p><strong>Dropoff Location:</strong> {{dropoffLocation}}</p>
    <p><strong>Amount Paid:</strong> \${{totalAmount}}</p>
  </div>
  
  <p>Your driver details will be sent to you closer to your pickup date.</p>
  
  <p>If you have any questions, please don't hesitate to contact us.</p>
  <p>Best regards,<br>The AirTransfer Team</p>
</div>`,
        triggerDescription: "Sent when customer completes payment via Stripe",
        recipientType: "customer",
        availableVariables: ["customerName", "referenceNumber", "pickupDate", "pickupTime", "pickupLocation", "dropoffLocation", "totalAmount"],
      },
      {
        templateKey: "driver_assignment",
        name: "Driver Assignment",
        subject: "New Trip Assignment - {{referenceNumber}}",
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #1a1a2e;">New Trip Assignment</h1>
  <p>Dear {{driverName}},</p>
  <p>You have been assigned a new transfer. Please review the details below:</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0;">Trip Details</h3>
    <p><strong>Reference Number:</strong> {{referenceNumber}}</p>
    <p><strong>Pickup Date:</strong> {{pickupDate}}</p>
    <p><strong>Pickup Time:</strong> {{pickupTime}}</p>
    <p><strong>Pickup Location:</strong> {{pickupLocation}}</p>
    <p><strong>Dropoff Location:</strong> {{dropoffLocation}}</p>
    <p><strong>Flight Number:</strong> {{flightNumber}}</p>
    <p><strong>Vehicle Class:</strong> {{vehicleClass}}</p>
    <p><strong>Party Size:</strong> {{partySize}} passenger(s)</p>
  </div>
  
  <div style="background: #e0f2fe; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <h3 style="margin-top: 0;">Customer Information</h3>
    <p><strong>Name:</strong> {{customerName}}</p>
    <p><strong>Phone:</strong> {{customerPhone}}</p>
  </div>
  
  <div style="background: #dcfce7; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="font-size: 18px; margin: 0;"><strong>Your Fee:</strong> \${{driverFee}}</p>
  </div>
  
  <p>Please confirm your availability and contact the customer if needed.</p>
  <p>Best regards,<br>The AirTransfer Team</p>
</div>`,
        triggerDescription: "Sent to driver when admin assigns them to a booking",
        recipientType: "driver",
        availableVariables: ["driverName", "referenceNumber", "pickupDate", "pickupTime", "pickupLocation", "dropoffLocation", "flightNumber", "vehicleClass", "partySize", "customerName", "customerPhone", "driverFee"],
      },
      {
        templateKey: "driver_assigned_customer",
        name: "Driver Assigned (Customer)",
        subject: "Your Driver Has Been Assigned - Booking {{referenceNumber}}",
        body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h1 style="color: #1a1a2e;">Your Driver Has Been Assigned</h1>
  <p>Dear {{customerName}},</p>
  <p>Great news! A driver has been assigned to your upcoming transfer.</p>
  
  <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p><strong>Reference Number:</strong> {{referenceNumber}}</p>
    <p><strong>Driver Name:</strong> {{driverName}}</p>
    <p><strong>Pickup Date:</strong> {{pickupDate}}</p>
    <p><strong>Pickup Location:</strong> {{pickupLocation}}</p>
    <p><strong>Dropoff Location:</strong> {{dropoffLocation}}</p>
  </div>
  
  <p>Your driver will meet you at the designated pickup location. Please have your booking reference ready.</p>
  
  <p>If you have any questions, please don't hesitate to contact us.</p>
  <p>Best regards,<br>The AirTransfer Team</p>
</div>`,
        triggerDescription: "Sent to customer when a driver is assigned to their booking",
        recipientType: "customer",
        availableVariables: ["customerName", "referenceNumber", "driverName", "pickupDate", "pickupLocation", "dropoffLocation"],
      },
    ];

    for (const template of defaultTemplates) {
      const existing = existingByKey.get(template.templateKey);
      if (existing) {
        // Update availableVariables for existing templates to ensure they have the latest variables
        if (JSON.stringify(existing.availableVariables) !== JSON.stringify(template.availableVariables)) {
          await storage.updateEmailTemplate(existing.id, { 
            availableVariables: template.availableVariables 
          });
          console.log(`Updated availableVariables for template: ${template.templateKey}`);
        }
      } else {
        await storage.createEmailTemplate(template);
        console.log(`Created new template: ${template.templateKey}`);
      }
    }
  };
  
  initDefaultEmailTemplates().catch(console.error);

  const httpServer = createServer(app);
  return httpServer;
}
