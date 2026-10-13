import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import path from "node:path";

const apiOrigin = "http://localhost:4100";
const siteOrigin = "http://localhost:3100";
const password = `Browser-${randomBytes(12).toString("hex")}`;
const databaseUrl = "file:./browser-test.db";
if (!existsSync("prisma/browser-test.db")) writeFileSync("prisma/browser-test.db", "");
const clean = new DatabaseSync("prisma/browser-test.db");
clean.exec("PRAGMA foreign_keys=OFF;");
for (const r of clean
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all())
  clean.exec(`DROP TABLE "${String(r.name).replaceAll('"', '""')}";`);
clean.close();
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: randomBytes(48).toString("hex"),
  NODE_ENV: "development",
  PORT: "4100",
  APP_ORIGIN: siteOrigin,
  UPLOAD_DIR: "./browser-test-uploads",
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
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
await db.user.create({
  data: {
    email: "admin@browser.test",
    mobile: "9000000010",
    name: "Browser Admin",
    role: "ADMIN",
    passwordHash: await bcrypt.hash(password, 4),
  },
});
await db.cashbackSetting.create({ data: { rateBps: 1000 } });
const apiProcess = spawn(process.execPath, ["dist/server.js"], { env, stdio: "pipe" });
const webProcess = spawn(
  process.execPath,
  [path.resolve("../node_modules/vite/bin/vite.js"), "--port", "3100", "--host", "127.0.0.1"],
  {
    cwd: path.resolve(".."),
    env: { ...process.env, VITE_API_URL: apiOrigin + "/api" },
    stdio: "pipe",
  },
);
let log = "";
for (const p of [apiProcess, webProcess]) {
  p.stdout.on("data", (b) => {
    log += b.toString();
  });
  p.stderr.on("data", (b) => {
    log += b.toString();
  });
}
async function ready(url) {
  const start = Date.now();
  while (Date.now() - start < 45000) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Server failed to start: " + log.slice(-1500));
}
let browser;
mkdirSync("../documentation/screenshots", { recursive: true });
try {
  await Promise.all([ready(apiOrigin + "/api/health"), ready(siteOrigin)]);
  browser = await chromium.launch({ headless: true });
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [admin, vendor, customer] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const p of [admin, vendor, customer]) {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    p.setDefaultTimeout(20000);
  }
  async function login(page, role, email) {
    await page.getByRole("button", { name: role, exact: true }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
  }
  async function nav(page, label) {
    await page.locator(".crm-sidebar").getByRole("button", { name: label, exact: true }).click();
  }
  async function register(page, role, email, mobile) {
    await page.goto(siteOrigin, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Create an account", exact: true }).click();
    await page.getByRole("button", { name: role, exact: true }).click();
    await page.getByLabel("Full name", { exact: true }).fill(`Browser ${role}`);
    await page.getByLabel("Mobile number", { exact: true }).fill(mobile);
    if (role === "Vendor") {
      await page.getByLabel("Business name", { exact: true }).fill("Browser Retail");
      await page.getByLabel("Business category", { exact: true }).fill("Retail");
    }
    await page.getByLabel("City", { exact: true }).fill("Pune");
    await page.getByLabel("PIN code", { exact: true }).fill("411024");
    await page.getByLabel("Address", { exact: true }).fill("Test address");
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await page.getByRole("heading", { name: "Sign in to Namaste Bharat" }).waitFor();
  }
  await register(customer, "Customer", "customer@browser.test", "9000000011");
  await login(customer, "Customer", "customer@browser.test");
  const profile = await db.customer.findFirstOrThrow();
  const reference = profile.reference;
  await nav(customer, "Membership card");
  await customer.locator(".card-reference").getByText(reference, { exact: true }).waitFor();
  const cardDownload = customer.waitForEvent("download");
  await customer.getByRole("button", { name: "Download card", exact: true }).click();
  assert.ok((await cardDownload).suggestedFilename().includes(reference));
  await customer.screenshot({
    path: "../documentation/screenshots/customer-card.png",
    fullPage: true,
  });
  await register(vendor, "Vendor", "vendor@browser.test", "9000000012");
  await admin.goto(siteOrigin, { waitUntil: "networkidle" });
  await login(admin, "Super Admin", "admin@browser.test");
  await nav(admin, "Vendors");
  await admin.getByRole("button", { name: "View Browser Vendor", exact: true }).click();
  await admin.getByRole("button", { name: "Approve vendor", exact: true }).click();
  await admin.getByRole("dialog").waitFor({ state: "hidden" });
  await login(vendor, "Vendor", "vendor@browser.test");
  await nav(vendor, "Customer verification");
  await vendor.getByLabel("Customer reference number", { exact: true }).fill(reference);
  await vendor.getByRole("button", { name: "Verify membership", exact: true }).click();
  await vendor
    .locator(".verified-customer")
    .getByText("Browser Customer", { exact: true })
    .waitFor();
  await nav(vendor, "Customer visits");
  await vendor.getByRole("button", { name: "Record visit", exact: true }).click();
  await vendor.getByLabel("Customer reference", { exact: true }).fill(reference);
  await vendor.getByRole("button", { name: "Request visit confirmation", exact: true }).click();
  await vendor.getByRole("dialog").waitFor({ state: "hidden" });
  await nav(customer, "Customer visits");
  await customer.getByRole("button", { name: "Confirm", exact: true }).click();
  await customer.getByText("Verified", { exact: true }).waitFor();
  await nav(vendor, "Purchases");
  await vendor.getByRole("button", { name: "Add purchase", exact: true }).click();
  await vendor.getByLabel("Customer reference number", { exact: true }).fill(reference);
  await vendor.getByLabel("Purchase amount (₹)", { exact: true }).fill("5000.00");
  await vendor.getByLabel("Bill number", { exact: true }).fill("BROWSER-001");
  await vendor.getByLabel("Link a verified visit (optional)").selectOption({ index: 1 });
  await vendor
    .locator("input[type=file]")
    .setInputFiles({
      name: "bill.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nTest bill\n%%EOF"),
    });
  await vendor.getByRole("button", { name: "Record purchase", exact: true }).click();
  await vendor.getByRole("dialog").waitFor({ state: "hidden" });
  await vendor.getByText("BROWSER-001", { exact: true }).waitFor();
  await nav(customer, "Pending confirmations");
  await customer.getByRole("button", { name: "View", exact: true }).click();
  await customer.getByRole("link", { name: "bill.pdf", exact: true }).waitFor();
  await customer.keyboard.press("Escape");
  await customer.getByRole("button", { name: "Confirm", exact: true }).click();
  await nav(admin, "Purchases");
  await admin.getByRole("button", { name: "Verify", exact: true }).click();
  await admin.getByText("Verified", { exact: true }).waitFor();
  await nav(admin, "Cashback");
  await admin.getByRole("button", { name: "Approve", exact: true }).click();
  await admin.getByRole("button", { name: "Record payment", exact: true }).click();
  await admin.getByLabel("Payment reference / receipt number").fill("BROWSER-MANUAL-001");
  await admin.getByLabel("I confirm this cashback has been paid manually.").check();
  await admin.getByRole("button", { name: "Mark as paid", exact: true }).click();
  await admin.getByRole("dialog").waitFor({ state: "hidden" });
  await admin.getByText("BROWSER-MANUAL-001", { exact: false }).waitFor();
  await nav(customer, "Cashback");
  await customer.getByText("BROWSER-MANUAL-001", { exact: false }).waitFor();
  await customer.screenshot({
    path: "../documentation/screenshots/customer-cashback.png",
    fullPage: true,
  });
  await nav(vendor, "Reports & analytics");
  await vendor.getByRole("button", { name: "Vendor performance", exact: true }).click();
  await vendor.getByText("Browser Retail", { exact: true }).first().waitFor();
  await vendor.screenshot({
    path: "../documentation/screenshots/vendor-report.png",
    fullPage: true,
  });
  const saved = await db.cashback.findFirstOrThrow({ include: { payment: true } });
  assert.equal(saved.amountPaise, 50000);
  assert.equal(saved.status, "PAID");
  assert.equal(saved.payment.reference, "BROWSER-MANUAL-001");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser financial workflow passed: registrations, vendor approval, QR membership download, customer lookup, confirmed visit, bill upload, purchase confirmation, admin verification, ₹500 cashback approval, manual payout and scoped vendor reports. Isolated browser-test.db only.",
  );
} catch (e) {
  console.error("Browser workflow failed:", e.message);
  throw e;
} finally {
  if (browser) await browser.close();
  apiProcess.kill();
  webProcess.kill();
  await db.$disconnect();
}
