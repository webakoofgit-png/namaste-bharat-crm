# API contract

Base `/api`. Success `{ "data": ... }`; failures `{ "error": { "message": "..." } }` with 400/401/403/404/409/429/500. Login returns a CSRF token; include `x-csrf-token` on session-authenticated writes. Cookies are HTTP-only, SameSite=Lax, Secure in production. Every write requires an allowed Origin. HTTPS subdomains `crm` and `api` are same-site; CORS allows only the explicit CRM origin.

| Method | Endpoint | Access / behavior |
|---|---|---|
| GET | /health | Database health |
| POST | /auth/register | Customer/vendor; no ADMIN role |
| POST | /auth/login | email, password, selected role |
| GET | /auth/me | Current authenticated user and CSRF |
| POST | /auth/logout | Invalidates all user sessions |
| POST | /auth/forgot-password | Generic response; notifies admins |
| POST | /auth/reset-password | Single-use token and new password |
| GET/PATCH | /profile | Own profile, membership and vendor media |
| GET/POST | /admin/users | Admin; role, search, city, category, active, page |
| PATCH | /admin/users/:id | Admin; profile, active and vendor approval |
| POST | /admin/users/:id/reset-link | Admin after offline identity verification |
| POST | /customers/verify | Vendor/admin; reference or opaque QR token |
| GET/POST | /visits | Scoped listing; vendor creates pending visit |
| POST | /visits/:id/confirm or dispute | Owning customer only |
| GET/POST | /transactions | Scoped listing; vendor creates pending purchase |
| POST | /transactions/:id/confirm or dispute | Owning customer |
| POST | /transactions/:id/verify or cancel | Admin; cancellation/dispute require reason |
| GET | /cashback | Scoped cashback with payments |
| POST | /cashback/:id/approve | Admin, verified purchase required |
| POST | /cashback/:id/pay | Admin; paymentDate, method, reference, remarks |
| GET/POST | /settings/cashback | Admin; percentage as decimal string |
| GET | /notifications | Own notifications |
| POST | /notifications/read | Mark own notifications read |
| GET | /admin/audit | Admin only |
| POST | /uploads/bill/:id | Owning vendor; multipart file, pending purchase |
| POST | /uploads/vendor/:id | Admin/own vendor; file and kind LOGO or IMAGE |
| GET | /documents/:id | Authorized attachment download, never public path |
| GET | /dashboard | Scoped database KPIs; from/to dates |
| GET | /reports/export | Scoped UTF-8 CSV, spreadsheet-safe cell escaping |
| GET | /reports/summary | Admin/vendor; customer, vendor and daily activity aggregates |

Transaction/cashback/export queries support from/to (YYYY-MM-DD), status, category, city; admin additionally customerId/vendorId. Lists have protective upper bounds (transactions/visits/cashback 500, exports 10,000); users have 20-row server pagination. This limitation is explicit: use narrower dates for large financial exports. Amount and percentage inputs are decimal strings. File maximum 5 MB, PDF/JPEG/PNG only, signature checked and authenticated downloads; malware scanning is a deployment hardening dependency.
