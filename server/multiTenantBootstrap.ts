import { db } from "./db";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";

const DEFAULT_PROPERTY = {
  slug: "island-port-transfers",
  name: "Island Port Transfers",
  email: "info@islandporttransfers.com",
  primaryColor: "#1e40af",
  isDefault: true,
};

const DEFAULT_SUPER_ADMIN = {
  email: "jesus@meliorlab.tech",
  password: "testing123",
  name: "Platform Admin",
};

const TENANT_TABLES = [
  "admin_users",
  "drivers",
  "hotels",
  "zones",
  "zone_routes",
  "rates",
  "pricing_rules",
  "bookings",
  "port_hotel_rates",
  "settings",
  "email_templates",
];

export async function bootstrapMultiTenant() {
  // 1) Default property
  const existing = (
    await db.execute(
      sql`SELECT id FROM properties WHERE is_default = true LIMIT 1`,
    )
  ).rows as Array<{ id: string }>;

  let defaultPropertyId: string;
  if (existing.length === 0) {
    const inserted = (
      await db.execute(
        sql`INSERT INTO properties (slug, name, email, primary_color, is_default)
            VALUES (${DEFAULT_PROPERTY.slug}, ${DEFAULT_PROPERTY.name},
                    ${DEFAULT_PROPERTY.email}, ${DEFAULT_PROPERTY.primaryColor}, true)
            RETURNING id`,
      )
    ).rows as Array<{ id: string }>;
    defaultPropertyId = inserted[0].id;
    console.log(`[bootstrap] Created default property "${DEFAULT_PROPERTY.name}" (${defaultPropertyId})`);
  } else {
    defaultPropertyId = existing[0].id;
  }

  // 2) Backfill propertyId on every tenant table where NULL
  for (const table of TENANT_TABLES) {
    const result = await db.execute(
      sql.raw(
        `UPDATE ${table} SET property_id = '${defaultPropertyId}' WHERE property_id IS NULL`,
      ),
    );
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[bootstrap] Backfilled ${result.rowCount} rows in ${table}`);
    }
  }

  // 3) Ensure existing admin_users have role='owner' (already default in schema, but safety)
  await db.execute(
    sql`UPDATE admin_users SET role = 'owner' WHERE role IS NULL OR role = ''`,
  );

  // 4) Default super admin
  const superExisting = (
    await db.execute(
      sql`SELECT id FROM super_admin_users WHERE email = ${DEFAULT_SUPER_ADMIN.email} LIMIT 1`,
    )
  ).rows;

  if (superExisting.length === 0) {
    const hashed = await bcrypt.hash(DEFAULT_SUPER_ADMIN.password, 10);
    await db.execute(
      sql`INSERT INTO super_admin_users (email, password, name)
          VALUES (${DEFAULT_SUPER_ADMIN.email}, ${hashed}, ${DEFAULT_SUPER_ADMIN.name})`,
    );
    console.log(`[bootstrap] Created super-admin ${DEFAULT_SUPER_ADMIN.email}`);
  }
}
