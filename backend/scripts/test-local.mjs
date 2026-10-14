import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
if (!existsSync("prisma/schema.local.prisma")) throw new Error("Run npm run db:local first.");
if (!existsSync("prisma/test.db")) writeFileSync("prisma/test.db", "");
// Clear only the explicitly named isolated test database, never local.db or DATABASE_URL from .env.
const db = new DatabaseSync("prisma/test.db");
db.exec("PRAGMA foreign_keys=OFF;");
for (const row of db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all())
  db.exec(`DROP TABLE "${String(row.name).replaceAll('"', '""')}";`);
db.close();
const env = {
  ...process.env,
  DATABASE_URL: "file:./test.db",
  JWT_SECRET: randomBytes(48).toString("hex"),
  APP_ORIGIN: "http://localhost:3000",
  NODE_ENV: "test",
  WEBSITE_AUTH_ENABLED: "false",
  UPLOAD_DIR: "./test-uploads",
};
execFileSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "db",
    "push",
    "--schema",
    "prisma/schema.local.prisma",
    "--skip-generate",
  ],
  { env, stdio: "inherit" },
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "--test", "src/website-auth.test.ts"],
  { env: { ...env, WEBSITE_AUTH_ENABLED: "true" }, stdio: "inherit" },
);
execFileSync(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "--test", "src/domain.test.ts", "src/integration.test.ts"],
  { env, stdio: "inherit" },
);
