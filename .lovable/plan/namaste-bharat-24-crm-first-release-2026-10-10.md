# Namaste Bharat 24 CRM — first release

## Goal
Deliver a usable first release for customer, vendor, and Super Admin operations, with managed Lovable Cloud for sign-in and persistent records. Use the project’s supported TanStack Start stack rather than the prompt’s Express/MySQL/React Router stack; that stack is not supported here.

## Build
- Replace the placeholder home with a polished CRM sign-in/create-account experience and session-aware role landing.
- Add email/password and Google sign-in, role-specific customer/vendor enrollment, profile capture, and protected app views. Never allow public self-assignment of Super Admin; keep role grants in a protected role table.
- Create the relational Cloud schema, database constraints, triggers, indexes, audit history, grants, and row-level policies for profiles, roles, customer cards, vendors, visits, transactions, cashback settings/history, and notifications.
- Build an operational workspace with role-specific navigation and dashboard totals, customer/vendor management, vendor approval, membership card/reference, customer-confirmed visits and purchases, dispute handling, admin-controlled cashback rate/approval/manual payment status, and basic searchable/filterable records.
- Add focused rule tests for unique NB24 identity generation and 10% default / immutable transaction-rate cashback calculations.
- Apply the project design system, add distinct route metadata, and validate the hosted-backed public/auth flows and key screen states.

## Boundaries and dependencies
- No payment gateway, automatic payouts, SMS/WhatsApp, or production website integration. Do not change namastebharat24.com or import its customer/vendor data without a reviewed API/schema and explicit approval.
- Initial Super Admin assignment must be done by a trusted Cloud administrator after the account is created; never bootstrap admin privileges from public registration or user metadata.
- Vendor applicants remain pending until an administrator approves them. Email confirmation remains enabled.
- VPS/Nginx deployment instructions are outside this first release: this project runs on Lovable’s managed hosting and Cloud.

## Technical approach
- TanStack Start routes and React UI, existing Supabase browser client with RLS, Cloud Auth, and additive SQL migrations via Lovable’s database migration tool.
- Use security-definer database functions for constrained state transitions and customer reference allocation; scope all ordinary reads/writes by authenticated user and approved vendor status.
- Preserve the existing generated auth modules and start middleware. Keep admin-only operations server/database enforced; frontend visibility is not authorization.
