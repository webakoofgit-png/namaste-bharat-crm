# Phase delivery record

The phases below describe implemented local capabilities and their validation, not production deployment claims. All values are database-backed; no static sample dashboard totals are used.

| Phase | Created / modified files | Database changes | Functional result / checks |
|---|---|---|---|
| 1 — Foundation | `backend/package.json`, `backend/src/app.ts`, `db.ts`, `server.ts`, `seed.ts`, `domain.ts`, `backend/prisma/schema.prisma`, migration SQL, `.env.example` | Users, role-controlled profiles, session versions, hashed passwords, reset tokens, audit and notification tables | HTTP-only JWT login, logout, rate limiting, Origin/CSRF checks, server role enforcement; compile and HTTP security tests pass |
| 2 — UI | `src/components/crm/app.tsx`, `auth.tsx`, `primitives.tsx`, `src/crm.css`, `src/lib/api.ts`, `validation.ts`, route/root/start/Vite configuration | No additional tables | Three login portals, responsive sidebar/drawer, forms, shadcn dialogs, error/loading/empty states, React Hook Form/Zod registration, TanStack Query; frontend compile, routing and Chromium desktop/mobile smoke pass |
| 3 — Accounts/cards | `accounts.tsx`, `membership.tsx`, `public/brand-logo.png`, schema and account endpoints | Customer reference/card-token and vendor approval/category/media identities | Registration, admin account management, approval/activation, scoped profile/history, searchable unique references, opaque QR identity, card download/print; concurrent-reference and role-isolation tests plus browser registration/card checks pass |
| 4 — Visits/purchases | `activity.tsx`, visit/purchase/upload handlers and integration tests | Visits with expiry/dedup keys, transactions with vendor/bill uniqueness, private documents and optional visit relation | Customer-confirmed presence, duplicate-visit guard, bill entry/upload, purchase confirm/dispute/verify/cancel, restricted document access and immutable verified bills; HTTP and full browser workflow checks pass |
| 5 — Cashback | `finance.tsx`, financial handlers, `domain.test.ts`, integration tests | Append-only rate settings, saved purchase rate, one cashback per verified transaction, one payment per cashback | Integer-safe currency, historical rates, admin-only rate editing/approval/manual payment, audit and private notifications; repeat-verification/payment, paid-cancellation guard and actual ₹5,000 → ₹500 browser payout checks pass |
| 6 — Reporting | `dashboard.tsx`, `report-summary.tsx`, dashboard/report endpoints | Queries over account/visit/transaction/cashback history; no duplicated financial rollups | Date-scoped KPIs, registrations, sales chart, distribution, linked visit conversion, vendor ranks, recent/pending records, customer/vendor/daily reports and CSV export; scoped-report tests and Chromium report rendering pass |
| 7 — Integration/testing | `backend/src/integration.test.ts`, `backend/scripts/test-local.mjs`, `browser-workflow.mjs`, `scripts/browser-smoke.mjs`, `documentation/screenshots/`, architecture/API/verification docs | Dedicated test and browser-test SQLite databases; normal application database is untouched by fixtures | Unit, HTTP and real browser flows pass. Public website inspected read-only, official logo reused. Actual website record integration and MySQL acceptance remain external dependencies |
| 8 — Deployment preparation | `deployment/nginx.conf`, `ecosystem.config.cjs`, `backup.sh`, `documentation/deployment.md`, `scripts/build-vps.mjs` | Generated initial MySQL migration; no remote database changes | Node-server production build and Express build pass. VPS/DNS/TLS deployment, backup restore drill and production acceptance are not performed without access |

## Test evidence

- Frontend: 1 routing test passed; TypeScript compile passed.
- Backend: 4 test groups passed, including a full HTTP/database workflow with authorization, financial state transitions, currency rounding, uploads, reports and concurrency assertions.
- Chromium admin smoke passed: desktop sign-in, ten pages, accessible dialog, 390px mobile drawer/layout, sign-out and no uncaught browser errors.
- Chromium financial workflow passed in an isolated database: customer/vendor registration, approval, membership download, customer lookup, visit confirmation, PDF upload, purchase confirmation, admin verification, cashback approval/manual payment and scoped vendor reports.
- Production Node frontend and Express compile builds passed. Both npm dependency audits reported zero advisories after scoped dependency patches.

## Still required to finish the uploaded prompt in production

Approve the default business rules in `architecture.md`; supply production-equivalent MySQL 8 and VPS/DNS access; provide existing website schema/API/source identity details; stage and reconcile the import; run MySQL and infrastructure acceptance; deploy TLS and schedule/restore-test backups. The main website is unchanged. Partial refund and paid-cashback reversal policies must be defined before adding those workflows. CSV is the implemented spreadsheet export format; native .xlsx output is not included.
