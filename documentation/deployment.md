# Installation and VPS deployment

## Local Windows setup

Requires Node.js 22.13+ (Node 24 works), npm and network access during installation.

```powershell
npm install
npm --prefix backend install
cd backend
npm run db:local
# In PowerShell, set credentials without committing them:
$env:ADMIN_EMAIL = 'your-admin@example.com'
$env:ADMIN_PASSWORD = 'choose-a-long-unique-password'
npm run seed
npm run dev
```

In another terminal in the repository root:

```powershell
npm run dev
```

Open http://localhost:3000. API: http://localhost:4000/api/health. Customers and vendors register through Create an account. Vendor approval is required before login. Development creates no sample sales or permanent dummy accounts. Local passwords/secret belong in ignored `.env` files. SQLite persists in `backend/prisma/local.db`. Do not point the development SQLite client at MySQL.

## Tests and builds

```powershell
npm test
npx tsc --noEmit
npm run build
npm --prefix backend run build
npm --prefix backend test
```

Backend integration tests clear only `backend/prisma/test.db`, a dedicated isolated test database. They never delete application data. Re-run the same workflow against a disposable MySQL database before release, especially concurrency, SQL uniqueness and deployment access boundaries.

## Ubuntu / Hostinger VPS

1. Provision a separate VPS; create a non-root deployment user; install Node 22.13+, MySQL 8, Nginx, PM2, certbot and firewall rules. Restrict SSH, allow ports 80/443, and do not expose MySQL or Node ports.
2. Create `namaste_bharat` with UTF-8 encoding. Create separate least-privilege runtime and migration users. Credentials are secrets, not frontend variables. The migration user needs DDL access; runtime only needs SELECT/INSERT/UPDATE (no DELETE is required by runtime workflows).
3. Copy source to `/srv/namaste-bharat`, run root `npm ci` and `npm --prefix backend ci`. Create backend `.env` from `.env.example`; set MySQL DATABASE_URL, random JWT_SECRET (e.g. `openssl rand -hex 48`), NODE_ENV=production, APP_ORIGIN=https://crm.namastebharat24.com and private UPLOAD_DIR. Set file mode 600 and a deployment-user-owned uploads folder.
4. Generate the canonical MySQL client and migrate:

```bash
cd /srv/namaste-bharat/backend
npm run db:generate
npm run db:migrate
# Supply ADMIN_EMAIL / ADMIN_PASSWORD securely for the one-time seed.
npm run seed
npm run build
```

5. Build the frontend for a Node server (the retained Lovable config defaults to Cloudflare otherwise):

```bash
cd /srv/namaste-bharat
NITRO_PRESET=node-server npm run build
# Or use the cross-platform wrapper:
# npm run build:vps
```

Default frontend API path is `/api`, proxied by Nginx, avoiding third-party cookies. Optional `VITE_API_URL=https://api.namastebharat24.com/api` must be set at build time. Never put JWT_SECRET or DATABASE_URL in any VITE variable.
6. Start the two PM2 services using `deployment/ecosystem.config.cjs`; run `pm2 save`, `pm2 startup` and follow its service installation output. Check `.output/server/index.mjs` exists after the Node preset build.
7. Point only `crm` and `api` DNS A records to the VPS; leave the existing main website's records unchanged. Obtain certificates for both domains using certbot. Install the supplied Nginx config after certificate paths exist. Run `nginx -t`, then reload.
8. Verify `/api/health`, HTTPS, login/logout, admin/customer/vendor isolation, file downloads, confirmation, verification, payout and CSV using real staging accounts. Approve business policies before enabling public registration. Add malware scanning and monitor audit/error logs.
9. Install `deployment/backup.sh` with executable mode and a root-readable MySQL option file. Schedule `15 2 * * * /srv/namaste-bharat/deployment/backup.sh` in a dedicated backup user's cron (UTC host time; adjust deliberately). Encrypt and copy backups off-host. Back up database and uploads together. Restore into an isolated database with `gunzip -c backup.sql.gz | mysql --defaults-extra-file=... restored_database`; extract uploads into a staging directory, then run a restore drill before launch.

Deployment requires VPS/SSH/DNS credentials and the owner's authorization for actual production changes. This checkout does not alter the main website or import its records. Generated configurations are templates, not evidence of a deployed VPS.
