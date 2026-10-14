import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { app } from "./app.js";
import { db } from "./db.js";

test("website handoff requires browser state, explicit linking, matching roles and single-use codes", async () => {
  assert.ok(process.env.DATABASE_URL?.includes("test.db"));
  assert.equal(process.env.WEBSITE_AUTH_ENABLED, "true");
  const clientSecret = randomBytes(32).toString("hex");
  process.env.WEBSITE_AUTH_CLIENT_SECRET = clientSecret;
  process.env.WEBSITE_AUTH_CLIENT_ID = "crm-test";
  process.env.WEBSITE_LOGIN_URL = "http://localhost/login";
  const subject = randomBytes(16).toString("hex");
  const codes = new Map<string, { state: string; role: string }>();
  const website = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    const value = codes.get(input.code);
    if (
      req.headers.authorization !== `Bearer ${clientSecret}` ||
      !value ||
      value.state !== input.state ||
      input.clientId !== "crm-test" ||
      input.redirectUri !== "http://localhost:3000/"
    ) {
      res.writeHead(401);
      res.end();
      return;
    }
    codes.delete(input.code);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ subject, role: value.role, active: true }));
  });
  const server = app.listen(0, "127.0.0.1");
  website.listen(0, "127.0.0.1");
  await Promise.all(
    [server, website].map((s) => new Promise<void>((resolve) => s.once("listening", resolve))),
  );
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  process.env.WEBSITE_CODE_EXCHANGE_URL = `http://127.0.0.1:${(website.address() as { port: number }).port}/exchange`;
  async function post(path: string, body: object, cookie = "", csrf = "") {
    const response = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        Cookie: cookie,
        "x-csrf-token": csrf,
      },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    };
  }
  async function handoff(role = "CUSTOMER") {
    const start = await post("/auth/website-start", {});
    assert.equal(start.status, 200);
    const state = new URL(start.body.data.url).searchParams.get("state")!;
    const code = randomBytes(32).toString("hex");
    codes.set(code, { state, role });
    return { state, code, cookie: start.cookie };
  }
  try {
    const suffix = randomBytes(5).toString("hex");
    const user = await db.user.create({
      data: {
        name: "Linked customer",
        email: `linked-${suffix}@example.com`,
        mobile: `8${Date.now().toString().slice(-9)}`,
        passwordHash: "not-used-for-website-auth",
        role: "CUSTOMER",
        customer: { create: { cardToken: randomBytes(32).toString("hex") } },
      },
    });
    const administrator = await db.user.create({
      data: {
        name: "Website linking administrator",
        email: `website-admin-${suffix}@example.com`,
        mobile: `7${Date.now().toString().slice(-9)}`,
        passwordHash: "test-only",
        role: "ADMIN",
      },
    });
    const adminCookie = `session=${jwt.sign({ version: administrator.sessionVersion }, process.env.JWT_SECRET!, { subject: String(administrator.id), algorithm: "HS256" })}; csrf=test-csrf`;
    assert.equal((await post("/auth/register", {})).status, 403);
    assert.equal(
      (await post("/auth/login", { email: user.email, password: "unused", role: "CUSTOMER" }))
        .status,
      403,
    );
    let login = await handoff();
    assert.equal(
      (await post("/auth/website-exchange", { code: login.code, state: login.state })).status,
      401,
    );
    assert.equal((await post("/auth/website-exchange", login, login.cookie)).status, 403);
    assert.equal((await post(`/admin/users/${user.id}/website-identity`, { subject })).status, 401);
    assert.equal(
      (
        await post(
          `/admin/users/${user.id}/website-identity`,
          { subject },
          adminCookie,
          "test-csrf",
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await post(
          `/admin/users/${user.id}/website-identity`,
          { subject },
          adminCookie,
          "test-csrf",
        )
      ).status,
      409,
    );
    login = await handoff("VENDOR");
    assert.equal((await post("/auth/website-exchange", login, login.cookie)).status, 403);
    login = await handoff();
    const result = await post("/auth/website-exchange", login, login.cookie);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.user.id, user.id);
    assert.ok(result.body.data.csrf);
    assert.ok(result.cookie.includes("session="));
    assert.equal((await post("/auth/website-exchange", login, login.cookie)).status, 401);
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    login = await handoff();
    assert.equal((await post("/auth/website-exchange", login, login.cookie)).status, 403);
    await db.user.update({
      where: { id: user.id },
      data: { active: true, role: "VENDOR", vendor: { create: { businessName: "Linked shop", category: "Retail" } } },
    });
    login = await handoff("VENDOR");
    assert.equal((await post("/auth/website-exchange", login, login.cookie)).status, 403);
    await db.vendor.update({ where: { userId: user.id }, data: { approval: "APPROVED" } });
    login = await handoff("VENDOR");
    assert.equal((await post("/auth/website-exchange", login, login.cookie)).status, 200);
  } finally {
    await Promise.all(
      [server, website].map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
    );
    await db.$disconnect();
  }
});
