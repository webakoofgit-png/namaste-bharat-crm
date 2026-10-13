# Verification and remaining launch dependencies

This CRM is implemented against a real database and separate API. The local app database has an initial development administrator and no seeded customer/vendor sales. All automated financial/browser fixtures live in explicitly isolated test databases.

## Verified checks

- Frontend TypeScript compile and retained routing test.
- Express TypeScript production compile.
- Vite production build with the original Cloudflare target and explicit VPS Node server target.
- Integer-paise money validation, half-up cashback rounding and role-gated transaction state transitions.
- HTTP/database integration: customer/vendor registration, unique reference numbers, duplicates, pending vendor login, approval, customer QR identity lookup, minimal identity disclosure, role isolation, CSRF rejection, visit confirmation, purchase confirmation, snapshots, serializable repeated verification/payment, manual payout references, disputes/cancellation, password reset replay, expired sessions and logout.
- Upload signature rejection, authorized customer bill downloads, cross-account document denial, locked verified bills, scoped customer/vendor/daily reports and concurrent customer-reference generation are also covered by the integration test.
- Real Chromium admin smoke: login, ten API-connected admin pages, dialog open/Escape, responsive mobile drawer, no page overflow and logout. Screenshots are in `documentation/screenshots/`.
- Real Chromium isolated financial workflow: customer/vendor registrations, vendor approval, member card download, customer lookup, confirmed visit, PDF bill upload, customer confirmation, administrator verification, ₹500 cashback approval/manual payment and scoped vendor reports.
- Initial backend and frontend dependency advisories were addressed with scoped patched dependency overrides. Run `npm audit` again when deploying; a clean audit is not a complete security assessment.

## Repeatable commands

`npm test`, `npx tsc --noEmit`, `npm --prefix backend run build`, `npm --prefix backend test`.

With local servers running and `local-access.txt` initialized: `node scripts/browser-smoke.mjs`.

From backend: `node scripts/browser-workflow.mjs` starts isolated ports 3100/4100 and a dedicated browser test database, then stops its own servers. It never alters the normal local database.

## Limits before production sign-off

- MySQL migration is generated but must be applied and tested on real MySQL 8. Local integration tests use SQLite; they do not prove MySQL concurrency/locking behavior.
- VPS, SSH, DNS and TLS are not provisioned or deployed. Nginx/PM2/SSL/backup instructions are provided. Build on Ubuntu for Ubuntu deployment rather than copying Windows native dependencies.
- Main website branding was read from the public site and its actual logo downloaded. Backend technology, source record identities, schemas and integration APIs require website-owner access. No existing production website records were changed or imported.
- Owner approval is required for the documented default eligibility, refund/reconciliation and identity policies. Partial refunds and reversals of already-paid cashback are deliberately blocked pending an agreed policy.
- Recovery is admin-assisted, since Phase 1 permits only in-app notifications. No outbound email/SMS/WhatsApp is configured.
- Camera scanning uses BarcodeDetector when supported and requires camera permission/HTTPS. Unsupported browsers can paste a scanner's opaque QR value or enter a reference. Physical presence always still requires customer confirmation.
- CSV exports open in Excel; native .xlsx files are not generated. Listing/export bounds are documented and should be replaced with cursor pagination/streamed exports if the network grows beyond the first-release limits.
- File signature validation and authenticated downloads are implemented; antivirus scanning, independent penetration testing, backup restore drills and a production security review remain launch checks.
- Preserve Lovable's published history. This supplied workspace has no `.git` directory, so no commits or pushes were performed.

The local implementation is reviewable and runnable. These external dependencies prevent claiming full production deployment or unconditional production readiness.
