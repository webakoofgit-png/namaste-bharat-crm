import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const envText = readFileSync(".env", "utf8");
if (!envText.includes("DATABASE_URL=file:./local.db"))
  throw new Error("This helper only creates credentials for the local development database.");
const password = `NB24-${randomBytes(14).toString("base64url")}`;
if (existsSync("../local-access.txt")) {
  console.log("Local development access is already initialized.");
  process.exit(0);
}
const email = "admin@namastebharat24.local";
execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/seed.ts"], {
  env: { ...process.env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
  stdio: "inherit",
});
writeFileSync(
  "../local-access.txt",
  `LOCAL DEVELOPMENT ONLY\nOpen http://localhost:3000\nPortal: Super Admin\nEmail: ${email}\nPassword: ${password}\n\nThese are development credentials, not production credentials. This file is ignored by Git.\n`,
  { flag: "wx", mode: 0o600 },
);
console.log("Local administrator credentials saved to the ignored local-access.txt file.");
