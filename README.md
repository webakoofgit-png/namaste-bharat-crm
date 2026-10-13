# Namaste Bharat 24 CRM

React + TypeScript frontend, Express API, Prisma/MySQL production schema and a persisted SQLite local development database. Three portals: Super Admin, approved Vendor and Customer. No payment gateway, SMS or WhatsApp integration.

## Run locally

```powershell
npm install
npm --prefix backend install
npm --prefix backend run db:local
# Create the first admin using ADMIN_EMAIL and ADMIN_PASSWORD environment variables.
npm --prefix backend run seed
npm --prefix backend run dev
```

In another terminal: `npm run dev`, then open http://localhost:3000.

Registration, vendor approval, member cards, confirmed visits, bills, customer purchase confirmation, admin verification, cashback snapshots, manual payout tracking, notifications and CSV reports connect to the API/database. Financial tests run with `npm --prefix backend test`; frontend checks with `npm test` and `npx tsc --noEmit`.

See [architecture and business rules](documentation/architecture.md), [API contract](documentation/api.md), [deployment instructions](documentation/deployment.md) and [verification status](documentation/verification.md). MySQL/VPS and existing website integration require external access and staging acceptance. The original TanStack/Lovable frontend is retained for compatibility. Do not rewrite published Lovable git history.
