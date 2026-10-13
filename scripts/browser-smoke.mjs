import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const credentials = readFileSync("local-access.txt", "utf8");
const email = credentials.match(/^Email: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
if (!email || !password) throw new Error("Initialize the local administrator first.");
mkdirSync("documentation/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
try {
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Sign in to Namaste Bharat" }).waitFor();
  await page.screenshot({ path: "documentation/screenshots/login-desktop.png", fullPage: true });
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
  await page.getByText("Registered customers", { exact: true }).waitFor();
  await page.screenshot({ path: "documentation/screenshots/admin-desktop.png", fullPage: true });
  for (const [menu, expected] of [
    ["Customers", "Add customer"],
    ["Vendors", "Add vendor"],
    ["Customer visits", "All statuses"],
    ["Purchases", "All statuses"],
    ["Cashback", "Reward history"],
    ["Reports & analytics", "Transaction & cashback report"],
    ["Cashback settings", "Cashback percentage"],
    ["Audit logs", "System audit trail"],
    ["Notifications", "Your notifications"],
    ["My profile", "Your account details"],
  ]) {
    await page.locator(".crm-sidebar").getByRole("button", { name: menu, exact: true }).click();
    await page.getByRole("heading", { name: `${menu}.`, exact: true }).waitFor();
    if (expected === "All statuses") await page.getByRole("combobox").first().waitFor();
    else await page.getByText(expected, { exact: true }).first().waitFor();
    assert.equal(await page.locator(".error-state").count(), 0, `API error on ${menu}`);
  }
  await page
    .locator(".crm-sidebar")
    .getByRole("button", { name: "Customers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add customer", exact: true }).click();
  await page.getByRole("dialog", { name: "Add customer" }).waitFor();
  await page.getByLabel("Full name / owner").fill("Unsaved browser check");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.locator(".crm-sidebar").getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
  await page.waitForTimeout(250); // Let the mobile drawer's CSS transition finish before capture.
  await page.screenshot({ path: "documentation/screenshots/admin-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "Mobile page should not overflow",
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.locator(".crm-sidebar").getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in to Namaste Bharat" }).waitFor();
  await page.screenshot({ path: "documentation/screenshots/login-mobile.png", fullPage: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser smoke passed: desktop login, 10 API-connected admin pages, accessible modal, mobile drawer/layout, logout, no uncaught browser errors.",
  );
} finally {
  await browser.close();
}
