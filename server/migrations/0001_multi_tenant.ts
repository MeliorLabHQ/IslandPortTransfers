import { db } from "../db";
import { sql } from "drizzle-orm";

const MIGRATION_SQL = `
-- Properties (tenants)
CREATE TABLE IF NOT EXISTS properties (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#1e40af',
  status text NOT NULL DEFAULT 'active',
  plan text NOT NULL DEFAULT 'starter',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Super admin users (platform admins)
CREATE TABLE IF NOT EXISTS super_admin_users (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password text NOT NULL,
  name text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

-- Tenancy columns on existing tables
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE zones ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE zone_routes ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE pricing_rules ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE port_hotel_rates ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS property_id varchar REFERENCES properties(id) ON DELETE CASCADE;

-- Drop old global unique constraints (now per-property at app level)
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_name_unique;
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_name_key;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_unique;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key;
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_template_key_unique;
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_template_key_key;
`;

export async function applyMultiTenantSchema() {
  await db.execute(sql.raw(MIGRATION_SQL));
}

if (process.argv[1] && process.argv[1].endsWith("0001_multi_tenant.ts")) {
  applyMultiTenantSchema()
    .then(() => {
      console.log("Multi-tenant schema migration applied.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
