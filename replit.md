# AirTransfer - Airport Transfer Booking Service (Multi-Tenant)

## Overview

AirTransfer (Island Port Transfers) is a premium airport-transfer booking platform for St. Lucia. As of Phase 1 of the B2B transformation, it is a **white-label multi-tenant platform**: each "Property" (hotel/villa/resort) gets a branded booking page, isolated data (hotels, rates, bookings, drivers, settings, email templates), and its own owner+staff admin users. A super-admin manages all properties from a dedicated dashboard.

## Multi-Tenancy

**Tenant model:** `properties` table is the tenant. Every tenant-scoped table (admin_users, drivers, hotels, zones, zone_routes, rates, pricing_rules, bookings, port_hotel_rates, settings, email_templates) carries a `propertyId` foreign key.

**Default property:** "Island Port Transfers" (slug `island-port-transfers`, email `info@islandporttransfers.com`, isDefault=true) — created by bootstrap on first run; legacy data backfilled to it.

**Super-admin:** `jesus@meliorlab.tech` / `testing123` (bcrypt-seeded by bootstrap). Can list, create, update, delete properties via `/super-admin` UI; deletion of default property is blocked. New properties get seeded default settings + email templates but NO hotels/rates.

**Tenant resolution (server):** `server/tenantMiddleware.ts` `attachProperty` middleware resolves the active property from (in order): `?property=<slug>` query, `X-Property-Slug` header, subdomain (production), or falls back to default property. Mounted on all public booking endpoints.

**Tenant resolution (client):** `client/src/lib/queryClient.ts` automatically injects `?property=<slug>` from the current URL into every `/api/*` request, so all TanStack Query reads + apiRequest mutations are tenant-scoped without per-call changes. `client/src/hooks/useProperty.ts` fetches `/api/property` and applies `--brand-color` CSS variable + document title.

**Auth/session shape:** `{ userType: 'super_admin' | 'property_user', userId, propertyId? }`. Legacy `adminId`/`isAdmin` fields kept for backward compat in `/api/admin/login`. Middleware: `requireSuperAdmin`, `requirePropertyUser` (the latter sets `req.property` from session.propertyId).

**Bootstrap:** `server/migrations/0001_multi_tenant.ts` (idempotent ALTER+ADD COLUMN IF NOT EXISTS, drops legacy global unique constraints on settings.key/zones.name/email_templates.template_key) and `server/multiTenantBootstrap.ts` (idempotent default property + super-admin + backfills) both run on startup from `server/index.ts`.

**Property branding:** `propertyId`, `slug`, `name`, `logoUrl` (nullable), `primaryColor` (hex), `email`, `status`, `plan`, `isDefault`. New properties show a generic taxi logo (logoUrl null → frontend falls back). Branded HeroSection shows `Premium Transfers for {{propertyName}}` and uses `primaryColor` for the primary CTA. Property owners can edit branding from `/admin/property` (AdminPropertySettings).

**Stripe + Email:** Webhook reads `metadata.propertyId` from Stripe sessions/payment links and routes events to the correct tenant. `server/emailService.ts` requires `propertyId`, loads per-property email templates (with hardcoded fallback), and uses property `email` as the from-name.

The platform emphasizes conversion-focused design with professional imagery, transparent pricing, and a simplified booking experience inspired by leading travel and transportation services.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React with TypeScript for component-based UI development
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching
- shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens

**Design System:**
- Typography: Poppins for headings, Inter for body text (Google Fonts)
- Color scheme: Custom HSL-based color system with CSS variables for theming
- Component library: Extensive set of pre-built UI components (40+ components including forms, dialogs, tables, etc.)
- Responsive design with mobile-first approach

**Key UI Patterns:**
- Multi-step booking form with validation at each step
- Admin layout with sidebar navigation for management features
- Toast notifications for user feedback
- Modal dialogs for CRUD operations
- Server-side data fetching with optimistic updates

### Backend Architecture

**Server Framework:**
- Express.js for HTTP server and API routing
- Session-based authentication for admin users
- RESTful API endpoints under `/api` prefix

**Development Environment:**
- Vite for fast development with HMR (Hot Module Replacement)
- Custom middleware for request/response logging
- Development-only features (runtime error overlay, dev banner)

**API Structure:**
- Admin authentication: `/api/admin/login`, `/api/admin/logout`, `/api/admin/me`
- Admin user management: `/api/admin/users` (GET, POST, PATCH, DELETE)
- Resource management endpoints for drivers, zones, rates, pricing rules, and bookings
- CRUD operations with proper HTTP methods (GET, POST, PUT, DELETE)

### Data Storage

**Database:**
- PostgreSQL via Neon serverless driver
- Drizzle ORM for type-safe database queries and schema management
- Connection pooling for efficient database access

**Schema Design:**
- Admin users table with bcrypt-hashed passwords
- Drivers table with contact info, vehicle details, bank details (bankName, accountNumber, bankAddress), and active status
- Zones table for 17 St. Lucia service zones (seeded on first run)
- Zone routes table for zone-to-zone pricing with unique constraint on origin/destination pairs
- Hotels table with zoneId foreign key linking to zones
- Rates table for base pricing by vehicle class and party size
- Pricing rules table for dynamic pricing adjustments
- Bookings table with comprehensive trip details and status tracking
- Settings table for configurable system values (key-value pairs)

**Large Party Surcharge:**
- Configurable fee applied to bookings with party size >= threshold (default: $20 for 4+ travelers)
- Settings stored in database: `large_party_surcharge_amount` and `large_party_surcharge_min_party_size`
- Admin can adjust via Settings page in admin dashboard
- Surcharge automatically added to totalAmount when creating hotel bookings
- Public endpoint `/api/settings/large-party-surcharge` returns current settings for frontend price display
- Booking confirmation shows base rate + surcharge breakdown when applicable

**Tax:**
- Configurable tax percentage applied to all bookings (default: 0%)
- Setting stored in database: `tax_percentage`
- Admin can adjust via Settings page in admin dashboard
- Tax calculated on subtotal (base rate + surcharge) and added to final booking total
- Public endpoint `/api/settings/tax` returns current tax percentage

**Bulk Rate Import:**
- Admin can upload CSV file to bulk import/update port-hotel rates
- CSV format: name, rate from UVF, rate from GFL, rate from PORT_Castries
- Hotel names matched case-insensitively against existing hotels
- Supports quoted CSV fields for hotel names with commas
- Existing rates are overwritten, new rates are created
- API endpoint: POST `/api/admin/hotels/bulk-import-rates`

**Zone Management:**
- 17 St. Lucia zones: Gros Islet, Babonneau, Castries (North/East/Central/South/South East), Anse-La-Raye/Canaries, Soufriere, Choiseul, Laborie, Vieux-Fort (South/North), Micoud (South/North), Dennery (South/North)
- Zone-to-zone pricing: Admin selects origin zone, then sets prices to each destination zone
- Pricing uses upsert logic to update existing routes or create new ones
- Unique database constraint prevents duplicate zone route entries

**Data Models:**
- Zod schemas for runtime validation
- TypeScript types inferred from Drizzle schemas
- Insert schemas for data validation on create/update operations

### Authentication & Authorization

**Admin Authentication:**
- Username/password-based login with bcrypt password hashing
- Multiple admin users supported with full CRUD management via Admin Users page
- Self-deletion protection prevents admins from deleting their own accounts
- Session management using express-session
- Session data stored server-side (session middleware configured but storage details in routes)
- Protected admin routes requiring authenticated session

**Security Considerations:**
- Password hashing with bcrypt (salt rounds: 10)
- Session-based auth prevents token exposure
- Admin-only endpoints require session validation

### External Dependencies

**UI Component Libraries:**
- Radix UI primitives for accessible, unstyled components
- shadcn/ui for pre-styled component implementations
- Lucide React for icon library

**State Management:**
- TanStack Query for server state, caching, and synchronization
- React Hook Form with Zod resolvers for form state and validation

**Styling:**
- Tailwind CSS v3 with custom configuration
- PostCSS for CSS processing
- Custom CSS variables for theme customization

**Database & ORM:**
- @neondatabase/serverless for PostgreSQL connection
- Drizzle ORM for type-safe database operations
- WebSocket support for Neon serverless via ws package

**Build Tools:**
- Vite for frontend bundling and dev server
- esbuild for backend bundling in production
- TypeScript compiler for type checking

**Development Tools:**
- @replit/vite-plugin-runtime-error-modal for error overlay
- @replit/vite-plugin-cartographer for code visualization
- tsx for running TypeScript in development

**Form Validation:**
- Zod for schema validation
- @hookform/resolvers for React Hook Form integration

**Date Handling:**
- date-fns for date manipulation and formatting
- react-day-picker for calendar UI component

**Session Management:**
- connect-pg-simple for PostgreSQL session store (configured but implementation details in server routes)

### Payment Processing (Stripe)

**Integration:**
- Stripe sandbox environment via Replit connector (stripe-replit-sync)
- Payment links created dynamically for each booking
- Webhook processing for payment status updates

**Payment Flows:**
- Hotel bookings: Fixed $30 booking fee, payment link sent after booking
- Destination bookings: Custom quote set by admin, payment link sent after pricing confirmed
- Idempotency: Payment links check paymentLinkSent flag (use force=true to resend)

**Key Files:**
- `server/stripeClient.ts`: Stripe client and webhook sync initialization
- `server/webhookHandlers.ts`: Stripe webhook event handlers

### Email Notifications (Resend)

**Integration:**
- Resend API via Replit connector
- HTML email templates stored in database with admin editing capability

**Email Template Management:**
- Email templates table stores: templateKey, name, subject, body, triggerDescription, recipientType, availableVariables, isActive
- Default templates seeded on first run: Booking Confirmation, Quote Ready, Payment Link, Payment Confirmation, Driver Assignment
- Admin can edit subject and body via "Emails" tab in admin dashboard
- Templates use `{{variableName}}` placeholder syntax for dynamic content
- Available variables displayed as badges in editor for easy reference
- Email service fetches templates from database with fallback to hardcoded templates if missing/inactive
- API endpoints: GET/PUT /api/admin/email-templates

**Email Workflows:**
1. **Booking Confirmation** (booking_confirmation): Sent to customer when completing booking form
2. **Quote Ready** (quote_notification): Sent to customer when admin sets pricing for destination bookings (idempotent - only first time)
3. **Payment Link** (payment_link): Sent to customer when admin triggers payment link (includes Stripe payment URL)
4. **Payment Confirmation** (payment_confirmation): Sent to customer when payment completes via Stripe webhook
5. **Driver Assignment** (driver_assignment): Sent to driver when admin assigns them to a booking

**Key Files:**
- `server/resendClient.ts`: Resend API client
- `server/emailService.ts`: Email template generation and sending with database template support
- `client/src/pages/AdminEmails.tsx`: Admin email template management UI