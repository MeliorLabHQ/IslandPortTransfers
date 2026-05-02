import { db } from "./db";
import {
  type AdminUser,
  type InsertAdminUser,
  type Driver,
  type InsertDriver,
  type Hotel,
  type InsertHotel,
  type Zone,
  type InsertZone,
  type ZoneRoute,
  type InsertZoneRoute,
  type Rate,
  type InsertRate,
  type PricingRule,
  type InsertPricingRule,
  type Booking,
  type InsertBooking,
  type Port,
  type InsertPort,
  type PortHotelRate,
  type InsertPortHotelRate,
  type Setting,
  type InsertSetting,
  type EmailTemplate,
  type InsertEmailTemplate,
  type Property,
  type InsertProperty,
  type SuperAdminUser,
  type InsertSuperAdminUser,
  adminUsers,
  drivers,
  hotels,
  zones,
  zoneRoutes,
  rates,
  pricingRules,
  bookings,
  ports,
  portHotelRates,
  settings,
  emailTemplates,
  properties,
  superAdminUsers,
} from "@shared/schema";
import { eq, and, desc, or, like, sql } from "drizzle-orm";

export interface IStorage {
  // Properties (tenants)
  getAllProperties(): Promise<Property[]>;
  getProperty(id: string): Promise<Property | undefined>;
  getPropertyBySlug(slug: string): Promise<Property | undefined>;
  getDefaultProperty(): Promise<Property | undefined>;
  createProperty(p: InsertProperty): Promise<Property>;
  createPropertyWithOwner(args: { property: InsertProperty; owner: Omit<InsertAdminUser, "propertyId"> }): Promise<Property>;
  updateProperty(id: string, p: Partial<InsertProperty>): Promise<Property | undefined>;
  deleteProperty(id: string): Promise<boolean>;

  // Super admins
  getSuperAdmin(id: string): Promise<SuperAdminUser | undefined>;
  getSuperAdminByEmail(email: string): Promise<SuperAdminUser | undefined>;
  createSuperAdmin(u: InsertSuperAdminUser): Promise<SuperAdminUser>;
  getAllSuperAdmins(): Promise<SuperAdminUser[]>;

  // Property users (admin_users)
  getAllAdminUsers(propertyId: string): Promise<AdminUser[]>;
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  getAdminUserByUsername(username: string): Promise<AdminUser | undefined>;
  createAdminUser(user: InsertAdminUser): Promise<AdminUser>;
  updateAdminUser(id: string, propertyId: string, data: Partial<InsertAdminUser>): Promise<AdminUser | undefined>;
  deleteAdminUser(id: string, propertyId: string): Promise<boolean>;

  // Drivers
  getAllDrivers(propertyId: string): Promise<Driver[]>;
  getDriver(id: string, propertyId: string): Promise<Driver | undefined>;
  createDriver(driver: InsertDriver): Promise<Driver>;
  updateDriver(id: string, propertyId: string, driver: Partial<InsertDriver>): Promise<Driver | undefined>;
  deleteDriver(id: string, propertyId: string): Promise<boolean>;

  // Hotels
  getAllHotels(propertyId: string): Promise<Hotel[]>;
  getActiveHotels(propertyId: string): Promise<Hotel[]>;
  getHotel(id: string, propertyId: string): Promise<Hotel | undefined>;
  getHotelByName(name: string, propertyId: string): Promise<Hotel | undefined>;
  createHotel(hotel: InsertHotel): Promise<Hotel>;
  bulkCreateHotels(hotelsList: InsertHotel[]): Promise<Hotel[]>;
  updateHotel(id: string, propertyId: string, hotel: Partial<InsertHotel>): Promise<Hotel | undefined>;
  deleteHotel(id: string, propertyId: string): Promise<boolean>;

  // Zones
  getAllZones(propertyId: string): Promise<Zone[]>;
  getActiveZones(propertyId: string): Promise<Zone[]>;
  getZone(id: string, propertyId: string): Promise<Zone | undefined>;
  getZoneByName(name: string, propertyId: string): Promise<Zone | undefined>;
  createZone(zone: InsertZone): Promise<Zone>;
  updateZone(id: string, propertyId: string, zone: Partial<InsertZone>): Promise<Zone | undefined>;
  deleteZone(id: string, propertyId: string): Promise<boolean>;

  // Zone Routes
  getAllZoneRoutes(propertyId: string): Promise<ZoneRoute[]>;
  getZoneRoute(originZoneId: string, destinationZoneId: string, propertyId: string): Promise<ZoneRoute | undefined>;
  getZoneRouteById(id: string, propertyId: string): Promise<ZoneRoute | undefined>;
  createZoneRoute(route: InsertZoneRoute): Promise<ZoneRoute>;
  updateZoneRoute(id: string, propertyId: string, route: Partial<InsertZoneRoute>): Promise<ZoneRoute | undefined>;
  upsertZoneRoute(route: InsertZoneRoute): Promise<ZoneRoute>;
  deleteZoneRoute(id: string, propertyId: string): Promise<boolean>;

  // Rates
  getAllRates(propertyId: string): Promise<Rate[]>;
  getRatesByZone(zoneId: string, propertyId: string): Promise<Rate[]>;
  getRate(id: string, propertyId: string): Promise<Rate | undefined>;
  createRate(rate: InsertRate): Promise<Rate>;
  updateRate(id: string, propertyId: string, rate: Partial<InsertRate>): Promise<Rate | undefined>;
  deleteRate(id: string, propertyId: string): Promise<boolean>;

  // Pricing rules
  getAllPricingRules(propertyId: string): Promise<PricingRule[]>;
  getPricingRule(id: string, propertyId: string): Promise<PricingRule | undefined>;
  createPricingRule(rule: InsertPricingRule): Promise<PricingRule>;
  updatePricingRule(id: string, propertyId: string, rule: Partial<InsertPricingRule>): Promise<PricingRule | undefined>;
  deletePricingRule(id: string, propertyId: string): Promise<boolean>;

  // Bookings
  getAllBookings(propertyId: string, filters?: { status?: string; search?: string }): Promise<Booking[]>;
  getBooking(id: string, propertyId: string): Promise<Booking | undefined>;
  getBookingByReference(referenceNumber: string): Promise<Booking | undefined>;
  getBookingByStripeSessionId(sessionId: string): Promise<Booking | undefined>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  updateBooking(id: string, booking: Partial<InsertBooking>): Promise<Booking | undefined>;
  assignDriver(bookingId: string, driverId: string): Promise<Booking | undefined>;
  updateBookingStatus(id: string, status: string): Promise<Booking | undefined>;
  updateBookingPricing(id: string, pricing: { bookingFee?: string; driverFee?: string; totalAmount?: string; balanceDueToDriver?: string; pricingSet?: boolean }): Promise<Booking | undefined>;
  markPaymentLinkSent(id: string): Promise<Booking | undefined>;

  // Ports (GLOBAL — same airports/ferry terminals for all properties)
  getAllPorts(): Promise<Port[]>;
  getActivePorts(): Promise<Port[]>;
  getPort(id: string): Promise<Port | undefined>;
  getPortByCode(code: string): Promise<Port | undefined>;

  // Port-Hotel Rates
  getPortHotelRates(hotelId: string, propertyId: string): Promise<PortHotelRate[]>;
  getPortHotelRate(portId: string, hotelId: string, propertyId: string): Promise<PortHotelRate | undefined>;
  upsertPortHotelRate(rate: InsertPortHotelRate): Promise<PortHotelRate>;

  // Settings (per-property key/value)
  getAllSettings(propertyId: string): Promise<Setting[]>;
  getSetting(key: string, propertyId: string): Promise<Setting | undefined>;
  upsertSetting(setting: InsertSetting): Promise<Setting>;

  // Email Templates
  getAllEmailTemplates(propertyId: string): Promise<EmailTemplate[]>;
  getEmailTemplate(id: string, propertyId: string): Promise<EmailTemplate | undefined>;
  getEmailTemplateByKey(templateKey: string, propertyId: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, propertyId: string, template: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined>;
}

// Helper for property scoping in WHERE clauses
const scoped = (table: any, propertyId: string) => eq(table.propertyId, propertyId);

export class DbStorage implements IStorage {
  // ========== Properties ==========
  async getAllProperties(): Promise<Property[]> {
    return await db.select().from(properties).orderBy(desc(properties.isDefault), properties.name);
  }
  async getProperty(id: string): Promise<Property | undefined> {
    const r = await db.select().from(properties).where(eq(properties.id, id));
    return r[0];
  }
  async getPropertyBySlug(slug: string): Promise<Property | undefined> {
    const r = await db.select().from(properties).where(eq(properties.slug, slug));
    return r[0];
  }
  async getDefaultProperty(): Promise<Property | undefined> {
    const r = await db.select().from(properties).where(eq(properties.isDefault, true)).limit(1);
    return r[0];
  }
  async createProperty(p: InsertProperty): Promise<Property> {
    const r = await db.insert(properties).values(p).returning();
    return r[0];
  }
  async createPropertyWithOwner(args: { property: InsertProperty; owner: Omit<InsertAdminUser, "propertyId"> }): Promise<Property> {
    return await db.transaction(async (tx) => {
      const [prop] = await tx.insert(properties).values(args.property).returning();
      await tx.insert(adminUsers).values({ ...args.owner, propertyId: prop.id });
      return prop;
    });
  }
  async updateProperty(id: string, p: Partial<InsertProperty>): Promise<Property | undefined> {
    const r = await db.update(properties).set(p).where(eq(properties.id, id)).returning();
    return r[0];
  }
  async deleteProperty(id: string): Promise<boolean> {
    const r = await db.delete(properties).where(and(eq(properties.id, id), eq(properties.isDefault, false))).returning();
    return r.length > 0;
  }

  // ========== Super admins ==========
  async getSuperAdmin(id: string): Promise<SuperAdminUser | undefined> {
    const r = await db.select().from(superAdminUsers).where(eq(superAdminUsers.id, id));
    return r[0];
  }
  async getSuperAdminByEmail(email: string): Promise<SuperAdminUser | undefined> {
    const r = await db.select().from(superAdminUsers).where(eq(superAdminUsers.email, email));
    return r[0];
  }
  async createSuperAdmin(u: InsertSuperAdminUser): Promise<SuperAdminUser> {
    const r = await db.insert(superAdminUsers).values(u).returning();
    return r[0];
  }
  async getAllSuperAdmins(): Promise<SuperAdminUser[]> {
    return await db.select().from(superAdminUsers).orderBy(desc(superAdminUsers.createdAt));
  }

  // ========== Property users (admin_users) ==========
  async getAllAdminUsers(propertyId: string): Promise<AdminUser[]> {
    return await db.select().from(adminUsers).where(scoped(adminUsers, propertyId)).orderBy(desc(adminUsers.createdAt));
  }
  async getAdminUser(id: string): Promise<AdminUser | undefined> {
    const r = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return r[0];
  }
  async getAdminUserByUsername(username: string): Promise<AdminUser | undefined> {
    const r = await db.select().from(adminUsers).where(eq(adminUsers.username, username));
    return r[0];
  }
  async createAdminUser(user: InsertAdminUser): Promise<AdminUser> {
    const r = await db.insert(adminUsers).values(user).returning();
    return r[0];
  }
  async updateAdminUser(id: string, propertyId: string, data: Partial<InsertAdminUser>): Promise<AdminUser | undefined> {
    const r = await db.update(adminUsers).set(data).where(and(eq(adminUsers.id, id), scoped(adminUsers, propertyId))).returning();
    return r[0];
  }
  async deleteAdminUser(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(adminUsers).where(and(eq(adminUsers.id, id), scoped(adminUsers, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Drivers ==========
  async getAllDrivers(propertyId: string): Promise<Driver[]> {
    return await db.select().from(drivers).where(scoped(drivers, propertyId)).orderBy(desc(drivers.createdAt));
  }
  async getDriver(id: string, propertyId: string): Promise<Driver | undefined> {
    const r = await db.select().from(drivers).where(and(eq(drivers.id, id), scoped(drivers, propertyId)));
    return r[0];
  }
  async createDriver(driver: InsertDriver): Promise<Driver> {
    const r = await db.insert(drivers).values(driver).returning();
    return r[0];
  }
  async updateDriver(id: string, propertyId: string, driver: Partial<InsertDriver>): Promise<Driver | undefined> {
    const r = await db.update(drivers).set(driver).where(and(eq(drivers.id, id), scoped(drivers, propertyId))).returning();
    return r[0];
  }
  async deleteDriver(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(drivers).where(and(eq(drivers.id, id), scoped(drivers, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Hotels ==========
  async getAllHotels(propertyId: string): Promise<Hotel[]> {
    return await db.select().from(hotels).where(scoped(hotels, propertyId)).orderBy(desc(hotels.createdAt));
  }
  async getActiveHotels(propertyId: string): Promise<Hotel[]> {
    return await db.select().from(hotels).where(and(scoped(hotels, propertyId), eq(hotels.isActive, true))).orderBy(hotels.name);
  }
  async getHotel(id: string, propertyId: string): Promise<Hotel | undefined> {
    const r = await db.select().from(hotels).where(and(eq(hotels.id, id), scoped(hotels, propertyId)));
    return r[0];
  }
  async getHotelByName(name: string, propertyId: string): Promise<Hotel | undefined> {
    const r = await db.select().from(hotels).where(and(sql`LOWER(${hotels.name}) = LOWER(${name})`, scoped(hotels, propertyId)));
    return r[0];
  }
  async createHotel(hotel: InsertHotel): Promise<Hotel> {
    const r = await db.insert(hotels).values(hotel).returning();
    return r[0];
  }
  async bulkCreateHotels(hotelsList: InsertHotel[]): Promise<Hotel[]> {
    if (hotelsList.length === 0) return [];
    return await db.insert(hotels).values(hotelsList).returning();
  }
  async updateHotel(id: string, propertyId: string, hotel: Partial<InsertHotel>): Promise<Hotel | undefined> {
    const r = await db.update(hotels).set(hotel).where(and(eq(hotels.id, id), scoped(hotels, propertyId))).returning();
    return r[0];
  }
  async deleteHotel(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(hotels).where(and(eq(hotels.id, id), scoped(hotels, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Zones ==========
  async getAllZones(propertyId: string): Promise<Zone[]> {
    return await db.select().from(zones).where(scoped(zones, propertyId)).orderBy(zones.name);
  }
  async getActiveZones(propertyId: string): Promise<Zone[]> {
    return await db.select().from(zones).where(and(scoped(zones, propertyId), eq(zones.isActive, true))).orderBy(zones.name);
  }
  async getZone(id: string, propertyId: string): Promise<Zone | undefined> {
    const r = await db.select().from(zones).where(and(eq(zones.id, id), scoped(zones, propertyId)));
    return r[0];
  }
  async getZoneByName(name: string, propertyId: string): Promise<Zone | undefined> {
    const r = await db.select().from(zones).where(and(eq(zones.name, name), scoped(zones, propertyId)));
    return r[0];
  }
  async createZone(zone: InsertZone): Promise<Zone> {
    const r = await db.insert(zones).values(zone).returning();
    return r[0];
  }
  async updateZone(id: string, propertyId: string, zone: Partial<InsertZone>): Promise<Zone | undefined> {
    const r = await db.update(zones).set(zone).where(and(eq(zones.id, id), scoped(zones, propertyId))).returning();
    return r[0];
  }
  async deleteZone(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(zones).where(and(eq(zones.id, id), scoped(zones, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Zone Routes ==========
  async getAllZoneRoutes(propertyId: string): Promise<ZoneRoute[]> {
    return await db.select().from(zoneRoutes).where(scoped(zoneRoutes, propertyId)).orderBy(desc(zoneRoutes.createdAt));
  }
  async getZoneRoute(originZoneId: string, destinationZoneId: string, propertyId: string): Promise<ZoneRoute | undefined> {
    const r = await db.select().from(zoneRoutes).where(and(
      eq(zoneRoutes.originZoneId, originZoneId),
      eq(zoneRoutes.destinationZoneId, destinationZoneId),
      scoped(zoneRoutes, propertyId),
    ));
    return r[0];
  }
  async getZoneRouteById(id: string, propertyId: string): Promise<ZoneRoute | undefined> {
    const r = await db.select().from(zoneRoutes).where(and(eq(zoneRoutes.id, id), scoped(zoneRoutes, propertyId)));
    return r[0];
  }
  async createZoneRoute(route: InsertZoneRoute): Promise<ZoneRoute> {
    const r = await db.insert(zoneRoutes).values(route).returning();
    return r[0];
  }
  async updateZoneRoute(id: string, propertyId: string, route: Partial<InsertZoneRoute>): Promise<ZoneRoute | undefined> {
    const r = await db.update(zoneRoutes).set(route).where(and(eq(zoneRoutes.id, id), scoped(zoneRoutes, propertyId))).returning();
    return r[0];
  }
  async upsertZoneRoute(route: InsertZoneRoute): Promise<ZoneRoute> {
    if (!route.propertyId) throw new Error("propertyId required for upsertZoneRoute");
    const existing = await this.getZoneRoute(route.originZoneId, route.destinationZoneId, route.propertyId);
    if (existing) {
      const updated = await this.updateZoneRoute(existing.id, route.propertyId, route);
      return updated!;
    }
    return await this.createZoneRoute(route);
  }
  async deleteZoneRoute(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(zoneRoutes).where(and(eq(zoneRoutes.id, id), scoped(zoneRoutes, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Rates ==========
  async getAllRates(propertyId: string): Promise<Rate[]> {
    return await db.select().from(rates).where(scoped(rates, propertyId)).orderBy(desc(rates.createdAt));
  }
  async getRatesByZone(zoneId: string, propertyId: string): Promise<Rate[]> {
    return await db.select().from(rates).where(and(eq(rates.zoneId, zoneId), scoped(rates, propertyId)));
  }
  async getRate(id: string, propertyId: string): Promise<Rate | undefined> {
    const r = await db.select().from(rates).where(and(eq(rates.id, id), scoped(rates, propertyId)));
    return r[0];
  }
  async createRate(rate: InsertRate): Promise<Rate> {
    const r = await db.insert(rates).values(rate).returning();
    return r[0];
  }
  async updateRate(id: string, propertyId: string, rate: Partial<InsertRate>): Promise<Rate | undefined> {
    const r = await db.update(rates).set(rate).where(and(eq(rates.id, id), scoped(rates, propertyId))).returning();
    return r[0];
  }
  async deleteRate(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(rates).where(and(eq(rates.id, id), scoped(rates, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Pricing rules ==========
  async getAllPricingRules(propertyId: string): Promise<PricingRule[]> {
    return await db.select().from(pricingRules).where(scoped(pricingRules, propertyId)).orderBy(desc(pricingRules.priority), desc(pricingRules.createdAt));
  }
  async getPricingRule(id: string, propertyId: string): Promise<PricingRule | undefined> {
    const r = await db.select().from(pricingRules).where(and(eq(pricingRules.id, id), scoped(pricingRules, propertyId)));
    return r[0];
  }
  async createPricingRule(rule: InsertPricingRule): Promise<PricingRule> {
    const r = await db.insert(pricingRules).values(rule).returning();
    return r[0];
  }
  async updatePricingRule(id: string, propertyId: string, rule: Partial<InsertPricingRule>): Promise<PricingRule | undefined> {
    const r = await db.update(pricingRules).set(rule).where(and(eq(pricingRules.id, id), scoped(pricingRules, propertyId))).returning();
    return r[0];
  }
  async deletePricingRule(id: string, propertyId: string): Promise<boolean> {
    const r = await db.delete(pricingRules).where(and(eq(pricingRules.id, id), scoped(pricingRules, propertyId))).returning();
    return r.length > 0;
  }

  // ========== Bookings ==========
  async getAllBookings(propertyId: string, filters?: { status?: string; search?: string }): Promise<Booking[]> {
    const conditions = [scoped(bookings, propertyId)];
    if (filters?.status) conditions.push(eq(bookings.status, filters.status));
    if (filters?.search) {
      const searchPattern = `%${filters.search}%`;
      const orCond = or(
        like(bookings.referenceNumber, searchPattern),
        like(bookings.customerName, searchPattern),
        like(bookings.customerEmail, searchPattern),
        like(bookings.flightNumber, searchPattern),
      );
      if (orCond) conditions.push(orCond);
    }
    return await db.select().from(bookings).where(and(...conditions)).orderBy(desc(bookings.createdAt));
  }
  async getBooking(id: string, propertyId: string): Promise<Booking | undefined> {
    const r = await db.select().from(bookings).where(and(eq(bookings.id, id), scoped(bookings, propertyId)));
    return r[0];
  }
  async getBookingByReference(referenceNumber: string): Promise<Booking | undefined> {
    const r = await db.select().from(bookings).where(eq(bookings.referenceNumber, referenceNumber));
    return r[0];
  }
  async getBookingByStripeSessionId(sessionId: string): Promise<Booking | undefined> {
    const r = await db.select().from(bookings).where(eq(bookings.stripeSessionId, sessionId));
    return r[0];
  }
  async createBooking(booking: InsertBooking): Promise<Booking> {
    const r = await db.insert(bookings).values(booking as any).returning();
    return r[0];
  }
  async updateBooking(id: string, booking: Partial<InsertBooking>): Promise<Booking | undefined> {
    const r = await db.update(bookings).set({ ...booking, updatedAt: new Date() }).where(eq(bookings.id, id)).returning();
    return r[0];
  }
  async assignDriver(bookingId: string, driverId: string): Promise<Booking | undefined> {
    const r = await db.update(bookings).set({
      driverId, assignedAt: new Date(), status: "driver_assigned", updatedAt: new Date(),
    }).where(eq(bookings.id, bookingId)).returning();
    return r[0];
  }
  async updateBookingStatus(id: string, status: string): Promise<Booking | undefined> {
    const r = await db.update(bookings).set({ status, updatedAt: new Date() }).where(eq(bookings.id, id)).returning();
    return r[0];
  }
  async updateBookingPricing(id: string, pricing: { bookingFee?: string; driverFee?: string; totalAmount?: string; balanceDueToDriver?: string; pricingSet?: boolean }): Promise<Booking | undefined> {
    const r = await db.update(bookings).set({ ...pricing, updatedAt: new Date() }).where(eq(bookings.id, id)).returning();
    return r[0];
  }
  async markPaymentLinkSent(id: string): Promise<Booking | undefined> {
    const r = await db.update(bookings).set({
      paymentLinkSent: true, paymentLinkSentAt: new Date(), updatedAt: new Date(),
    }).where(eq(bookings.id, id)).returning();
    return r[0];
  }

  // ========== Ports (GLOBAL) ==========
  async getAllPorts(): Promise<Port[]> {
    return await db.select().from(ports).orderBy(ports.name);
  }
  async getActivePorts(): Promise<Port[]> {
    return await db.select().from(ports).where(eq(ports.isActive, true)).orderBy(ports.name);
  }
  async getPort(id: string): Promise<Port | undefined> {
    const r = await db.select().from(ports).where(eq(ports.id, id));
    return r[0];
  }
  async getPortByCode(code: string): Promise<Port | undefined> {
    const r = await db.select().from(ports).where(eq(ports.code, code));
    return r[0];
  }

  // ========== Port-Hotel Rates ==========
  async getPortHotelRates(hotelId: string, propertyId: string): Promise<PortHotelRate[]> {
    return await db.select().from(portHotelRates).where(and(eq(portHotelRates.hotelId, hotelId), scoped(portHotelRates, propertyId)));
  }
  async getPortHotelRate(portId: string, hotelId: string, propertyId: string): Promise<PortHotelRate | undefined> {
    const r = await db.select().from(portHotelRates).where(and(
      eq(portHotelRates.portId, portId),
      eq(portHotelRates.hotelId, hotelId),
      scoped(portHotelRates, propertyId),
    ));
    return r[0];
  }
  async upsertPortHotelRate(rate: InsertPortHotelRate): Promise<PortHotelRate> {
    if (!rate.propertyId) throw new Error("propertyId required for upsertPortHotelRate");
    const existing = await this.getPortHotelRate(rate.portId, rate.hotelId, rate.propertyId);
    if (existing) {
      const r = await db.update(portHotelRates).set({ price: rate.price, isActive: rate.isActive }).where(eq(portHotelRates.id, existing.id)).returning();
      return r[0];
    }
    const r = await db.insert(portHotelRates).values(rate).returning();
    return r[0];
  }

  // ========== Settings ==========
  async getAllSettings(propertyId: string): Promise<Setting[]> {
    return await db.select().from(settings).where(scoped(settings, propertyId)).orderBy(settings.key);
  }
  async getSetting(key: string, propertyId: string): Promise<Setting | undefined> {
    const r = await db.select().from(settings).where(and(eq(settings.key, key), scoped(settings, propertyId)));
    return r[0];
  }
  async upsertSetting(setting: InsertSetting): Promise<Setting> {
    if (!setting.propertyId) throw new Error("propertyId required for upsertSetting");
    const existing = await this.getSetting(setting.key, setting.propertyId);
    if (existing) {
      const r = await db.update(settings).set({
        value: setting.value, description: setting.description, updatedAt: new Date(),
      }).where(eq(settings.id, existing.id)).returning();
      return r[0];
    }
    const r = await db.insert(settings).values(setting).returning();
    return r[0];
  }

  // ========== Email Templates ==========
  async getAllEmailTemplates(propertyId: string): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates).where(scoped(emailTemplates, propertyId)).orderBy(emailTemplates.name);
  }
  async getEmailTemplate(id: string, propertyId: string): Promise<EmailTemplate | undefined> {
    const r = await db.select().from(emailTemplates).where(and(eq(emailTemplates.id, id), scoped(emailTemplates, propertyId)));
    return r[0];
  }
  async getEmailTemplateByKey(templateKey: string, propertyId: string): Promise<EmailTemplate | undefined> {
    const r = await db.select().from(emailTemplates).where(and(eq(emailTemplates.templateKey, templateKey), scoped(emailTemplates, propertyId)));
    return r[0];
  }
  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const r = await db.insert(emailTemplates).values(template).returning();
    return r[0];
  }
  async updateEmailTemplate(id: string, propertyId: string, template: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined> {
    const r = await db.update(emailTemplates).set({ ...template, updatedAt: new Date() }).where(and(eq(emailTemplates.id, id), scoped(emailTemplates, propertyId))).returning();
    return r[0];
  }
}

export const storage = new DbStorage();
