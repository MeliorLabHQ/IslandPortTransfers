import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, decimal, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// MULTI-TENANCY: Properties (tenants) and Super Admins
// ============================================================================

// Properties (tenants) - each hotel/villa/STR business
export const properties = pgTable("properties", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(), // used for subdomain routing
  name: text("name").notNull(),
  email: text("email").notNull(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#1e40af"),
  status: text("status").notNull().default("active"), // active, suspended
  plan: text("plan").notNull().default("starter"), // starter, pro, business, enterprise
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({
  id: true,
  createdAt: true,
});

export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type Property = typeof properties.$inferSelect;

// Super admin users (platform admins - you)
export const superAdminUsers = pgTable("super_admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSuperAdminUserSchema = createInsertSchema(superAdminUsers).omit({
  id: true,
  createdAt: true,
});

export type InsertSuperAdminUser = z.infer<typeof insertSuperAdminUserSchema>;
export type SuperAdminUser = typeof superAdminUsers.$inferSelect;

// ============================================================================
// Property users (formerly admin_users) - staff at each property
// Table name kept as admin_users to avoid disruption of existing sessions
// ============================================================================
export const adminUsers = pgTable("admin_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  // Multi-tenancy fields (nullable during migration; backfilled by bootstrap)
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"), // owner, staff
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdminUserSchema = createInsertSchema(adminUsers).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminUser = z.infer<typeof insertAdminUserSchema>;
export type AdminUser = typeof adminUsers.$inferSelect;

// ============================================================================
// Tenant-scoped tables (each has nullable propertyId during migration)
// ============================================================================

// Drivers
export const drivers = pgTable("drivers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  vehicleClass: text("vehicle_class").notNull(),
  vehicleDetails: text("vehicle_details"),
  vehicleNumber: text("vehicle_number"),
  vehiclePhotoUrl: text("vehicle_photo_url"),
  driverPhotoUrl: text("driver_photo_url"),
  bankName: text("bank_name"),
  accountNumber: text("account_number"),
  bankAddress: text("bank_address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDriverSchema = createInsertSchema(drivers).omit({
  id: true,
  createdAt: true,
});

export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;

// Zones
export const zones = pgTable("zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertZoneSchema = createInsertSchema(zones).omit({
  id: true,
  createdAt: true,
});

export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zones.$inferSelect;

// Hotels
export const hotels = pgTable("hotels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  zone: text("zone"), // Legacy field - deprecated in favor of zoneId
  zoneId: varchar("zone_id").references(() => zones.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHotelSchema = createInsertSchema(hotels).omit({
  id: true,
  createdAt: true,
});

export type InsertHotel = z.infer<typeof insertHotelSchema>;
export type Hotel = typeof hotels.$inferSelect;

// Zone Routes (zone-to-zone pricing)
export const zoneRoutes = pgTable("zone_routes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  originZoneId: varchar("origin_zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  destinationZoneId: varchar("destination_zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertZoneRouteSchema = createInsertSchema(zoneRoutes).omit({
  id: true,
  createdAt: true,
});

export type InsertZoneRoute = z.infer<typeof insertZoneRouteSchema>;
export type ZoneRoute = typeof zoneRoutes.$inferSelect;

// Rates (base rates by vehicle class and party size)
export const rates = pgTable("rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  zoneId: varchar("zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  vehicleClass: text("vehicle_class").notNull(),
  minPartySize: integer("min_party_size").notNull(),
  maxPartySize: integer("max_party_size").notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  driverFee: decimal("driver_fee", { precision: 10, scale: 2 }).notNull().default("30.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRateSchema = createInsertSchema(rates).omit({
  id: true,
  createdAt: true,
});

export type InsertRate = z.infer<typeof insertRateSchema>;
export type Rate = typeof rates.$inferSelect;

// Pricing rules
export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  vehicleClass: text("vehicle_class"),
  zoneId: varchar("zone_id").references(() => zones.id, { onDelete: "cascade" }),
  multiplier: decimal("multiplier", { precision: 5, scale: 2 }).notNull().default("1.00"),
  fixedAmount: decimal("fixed_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
  daysOfWeek: text("days_of_week").array(),
  startTime: text("start_time"),
  endTime: text("end_time"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPricingRuleSchema = createInsertSchema(pricingRules).omit({
  id: true,
  createdAt: true,
});

export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRules.$inferSelect;

// Bookings
export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  referenceNumber: text("reference_number").notNull().unique(),
  bookingType: text("booking_type").notNull().default("hotel"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  pickupLocation: text("pickup_location").notNull(),
  dropoffLocation: text("dropoff_location").notNull(),
  accommodation: text("accommodation"),
  hotelId: varchar("hotel_id").references(() => hotels.id),
  destinationLink: text("destination_link"),
  arrivalPortId: varchar("arrival_port_id"),
  pickupDate: timestamp("pickup_date").notNull(),
  partySize: integer("party_size").notNull(),
  flightNumber: text("flight_number").notNull(),
  vehicleClass: text("vehicle_class").notNull(),
  bookingFee: decimal("booking_fee", { precision: 10, scale: 2 }),
  driverFee: decimal("driver_fee", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  balanceDueToDriver: decimal("balance_due_to_driver", { precision: 10, scale: 2 }),
  pricingSet: boolean("pricing_set").notNull().default(false),
  paymentLinkSent: boolean("payment_link_sent").notNull().default(false),
  paymentLinkSentAt: timestamp("payment_link_sent_at"),
  stripeSessionId: text("stripe_session_id"),
  status: text("status").notNull().default("new"),
  driverId: varchar("driver_id").references(() => drivers.id),
  assignedAt: timestamp("assigned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  propertyId: true,
  referenceNumber: true,
  bookingType: true,
  hotelId: true,
  destinationLink: true,
  accommodation: true,
  arrivalPortId: true,
  status: true,
  bookingFee: true,
  driverFee: true,
  totalAmount: true,
  balanceDueToDriver: true,
  pricingSet: true,
  paymentLinkSent: true,
  paymentLinkSentAt: true,
  driverId: true,
  assignedAt: true,
  stripeSessionId: true,
});

export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

// Ports (airports and ferry terminals) - GLOBAL, shared across all properties
export const ports = pgTable("ports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPortSchema = createInsertSchema(ports).omit({
  id: true,
  createdAt: true,
});

export type InsertPort = z.infer<typeof insertPortSchema>;
export type Port = typeof ports.$inferSelect;

// Port to Hotel Rates (per property because hotels are per property)
export const portHotelRates = pgTable("port_hotel_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  portId: varchar("port_id").notNull().references(() => ports.id, { onDelete: "cascade" }),
  hotelId: varchar("hotel_id").notNull().references(() => hotels.id, { onDelete: "cascade" }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPortHotelRateSchema = createInsertSchema(portHotelRates).omit({
  id: true,
  createdAt: true,
});

export type InsertPortHotelRate = z.infer<typeof insertPortHotelRateSchema>;
export type PortHotelRate = typeof portHotelRates.$inferSelect;

// Settings (per-property configuration: tax %, surcharge, stripe env, etc.)
// Uniqueness is now enforced as (propertyId, key) at app level since one property
// can have its own tax_percentage, large_party_surcharge, etc.
export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
  updatedAt: true,
});

export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;

// Email Templates (per-property branded emails)
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyId: varchar("property_id").references(() => properties.id, { onDelete: "cascade" }),
  templateKey: text("template_key").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  triggerDescription: text("trigger_description").notNull(),
  recipientType: text("recipient_type").notNull(),
  availableVariables: text("available_variables").array().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  updatedAt: true,
});

export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

// Legacy users table (kept for backward compatibility)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
