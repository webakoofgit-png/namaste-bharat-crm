import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
const schema = readFileSync("prisma/schema.prisma", "utf8")
  .replace('provider = "mysql"', 'provider = "sqlite"')
  .replaceAll(" @db.Text", "")
  .replaceAll(" @db.VarChar(190)", "");
writeFileSync("prisma/schema.local.prisma", schema);
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    `DATABASE_URL=file:./local.db\nJWT_SECRET=${randomBytes(48).toString("hex")}\nPORT=4000\nAPP_ORIGIN=http://localhost:3000,http://127.0.0.1:3000\nNODE_ENV=development\n`,
  );
if (!existsSync("prisma/local.db")) writeFileSync("prisma/local.db", "");
const cli = "node_modules/prisma/build/index.js";
execFileSync(process.execPath, [cli, "generate", "--schema", "prisma/schema.local.prisma"], {
  stdio: "inherit",
});
execFileSync(process.execPath, [cli, "db", "push", "--schema", "prisma/schema.local.prisma"], {
  stdio: "inherit",
});
console.log("Local SQLite database initialized. Production uses the canonical MySQL schema.");
