# Namaste Bharat 24 — implementation decisions

## Architecture and scope

The retained Lovable React/Vite/TanStack Start frontend lives in `src/`; reusable shadcn components remain available. TanStack Router is retained instead of replacing the existing router. The separate TypeScript Express API lives in `backend/`, with Prisma and a normalized MySQL schema. Local development uses a generated SQLite variant of that schema because MySQL is not installed on this workstation. SQLite is a real persisted development database, not a mock production service. Production must generate the MySQL client and apply migrations before starting.

## Rules requiring owner approval before launch

These conservative defaults unblock development; they are not asserted to be official company policies:

- Identity: unique normalized email and Indian ten-digit mobile; one customer identity per account. Reference numbers use a non-reused auto-increment customer ID inside registration transactions; customer removal is deactivation, never deletion.
- Verification: customer confirms a purchase, then an administrator verifies it. Vendor input and QR lookup do not prove presence. Visits require the authenticated customer to confirm within 15 minutes; repeated visits within ten minutes are rejected.
- Eligibility: the entire verified bill amount is eligible, with no category exclusions, expiry, monthly caps or minimum. Maximum bill is ₹10,00,000. No automatic approvals.
- Rate: snapshot the current rate at purchase creation; integer paise and basis points, half-up rounding. Subsequent global rate changes never modify that snapshot.
- Refunds: admin cancellation with a reason cancels unpaid cashback atomically. Once paid, cancellation is blocked pending offline reconciliation. Partial refunds and payout reversals require a separate agreed policy and are not implemented.
- Password recovery: no SMS/email service is integrated. A request notifies admins; after offline identity verification an admin issues a single-use, thirty-minute reset link. No reset token appears in audit logs.
- Totals: sales/purchase KPIs count VERIFIED transactions only. Generated cashback excludes cancelled purchases; pending, approved and paid are separate, non-overlapping states. Visit conversion counts verified visits linked to verified purchases. Reporting date ranges use Asia/Kolkata days.

## Data model

User → Customer or Vendor; Customer + Vendor → Visit and Transaction; Transaction → Documents and one Cashback; Cashback → at most one CashbackPayment. Append-only CashbackSetting captures administrator and rate history. Notification is private to User. AuditLog records actor, entity and action. PasswordReset stores only token hashes. Role is a server-controlled string validated at creation; ADMIN registration is never public. User deactivation invalidates every existing session.

Database uniqueness: user email/mobile, customer reference/card token/user, vendor user, vendor + bill number, visit dedup key, transaction visit, cashback transaction and payment cashback. Foreign keys preserve history. State transitions, notification creation and audits use serializable transactions, compare-and-set updates and bounded conflict retries.

## Permission matrix

| Capability | Admin | Approved vendor | Customer |
|---|---|---|---|
| Manage customers and vendors | All | Own profile | Own profile |
| Approve/disable accounts | Yes | No | No |
| Lookup membership | Yes | Minimal identity | Own card |
| Create visit/purchase | No | Own business | No |
| Confirm/dispute visit/purchase | No | No | Own only |
| Verify/cancel purchase | Yes | No | No |
| Change cashback rate | Yes | No | No |
| Approve/record manual payout | Yes | No | No |
| Reports and documents | All | Own only | Own only |
| Notifications | Own | Own | Own |
| Audit/reset links | Yes | No | No |

## Page structure

Public: three login portals, customer/vendor registration, recovery and reset. Admin: overview, customers, vendors, visits, purchases, cashback, reports, cashback settings, audit, profile, notifications. Vendor: overview, customer verification, visits, purchase entry/history, reports, profile/media, notifications. Customer: overview, membership card, visits, purchase review, cashback, profile, notifications.

## 25-working-day plan and task breakdown

| Days | Phase | Deliverables and acceptance |
|---|---|---|
| 1–3 | Foundation | Schema, API, sessions, CSRF, role isolation and migrations |
| 4–6 | UI | Responsive shell, login, roles, loading/errors and forms |
| 7–10 | Accounts | Registration, CRUD, approval, unique membership and QR |
| 11–14 | Transactions | Visit presence, purchase entry, uploads, confirm/dispute/verify |
| 15–17 | Cashback | Rate snapshots, atomic approvals, manual payments and audit |
| 18–20 | Reports | Scoped KPIs, monthly charts, date filters and CSV |
| 21–23 | Integration/QA | MySQL concurrency tests, browser/device checks, website mapping |
| 24–25 | Deployment | VPS, TLS, backups/restore drill and production acceptance |

The implementation in this checkout can be tested locally. Production acceptance still requires MySQL/VPS credentials, owner-approved policies, real website schema/API documentation, and browser/device/security review. Deployment and importing real website records cannot be completed without those dependencies.

## Existing website inspection

Read-only inspection of https://namastebharat24.com on 2026-10-10 exposed directory/listing/category pages and a logo link. Public HTML is insufficient to determine the private database schema, backend technology or supported integration API. No endpoints or tables are assumed. Before import: obtain a sanitized schema/export, establish legal record ownership and stable source IDs, stage and validate unique email/mobile collisions, reconcile each collision with the owner, and dry-run an idempotent import in an isolated database. No production website writes are performed.
