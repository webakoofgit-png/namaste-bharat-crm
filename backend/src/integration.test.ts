import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { db } from "./db.js";
import { app } from "./app.js";
// Use a separately configured database, never the application database.
test("HTTP workflow: registration, role isolation, visit presence, immutable rates and manual payout", async () => {
  if (!process.env.DATABASE_URL?.includes("test.db"))
    throw new Error(
      "Integration tests require DATABASE_URL=file:./test.db; run scripts/test-local.mjs.",
    );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  const origin = "http://localhost:3000";
  function client() {
    let cookie = "",
      csrf = "";
    return {
      async request(
        endpoint: string,
        method = "GET",
        body?: unknown,
        customHeaders?: Record<string, string>,
      ) {
        const response = await fetch(base + endpoint, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            ...(cookie ? { Cookie: cookie, "x-csrf-token": csrf } : {}),
            ...customHeaders,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const cookies = response.headers.getSetCookie();
        if (cookies.length) cookie = cookies.map((c) => c.split(";")[0]).join("; ");
        const data = response.headers.get("content-type")?.includes("application/json")
          ? await response.json()
          : await response.text();
        if (data?.data?.csrf) csrf = data.data.csrf;
        return {
          status: response.status,
          data: data?.data,
          error: data?.error,
          text: data,
          cookie,
        };
      },
      async upload(endpoint: string, contents: string, mime = "application/pdf") {
        const form = new FormData();
        form.append("file", new Blob([contents], { type: mime }), "bill.pdf");
        const response = await fetch(base + endpoint, {
          method: "POST",
          headers: { Origin: origin, Cookie: cookie, "x-csrf-token": csrf },
          body: form,
        });
        return { status: response.status, ...(await response.json()) };
      },
    };
  }
  const admin = client(),
    vendor = client(),
    customer = client(),
    otherCustomer = client(),
    otherVendor = client(),
    anonymous = client();
  try {
    const password = `Testing-${randomBytes(8).toString("hex")}`;
    const a = await db.user.create({
      data: {
        email: "admin@test.local",
        mobile: "9000000000",
        name: "Test Admin",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 4),
      },
    });
    await db.cashbackSetting.create({ data: { rateBps: 1000, updatedById: a.id } });
    assert.equal((await anonymous.request("/dashboard")).status, 401);
    assert.equal(
      (
        await admin.request("/auth/login", "POST", {
          email: a.email,
          password: "incorrect",
          role: "ADMIN",
        })
      ).status,
      401,
    );
    assert.equal(
      (await admin.request("/auth/login", "POST", { email: a.email, password, role: "ADMIN" }))
        .status,
      200,
    );
    assert.equal(
      (
        await anonymous.request("/auth/register", "POST", {
          name: "Attacker",
          email: "bad@test.local",
          mobile: "9111111111",
          password,
          role: "ADMIN",
        })
      ).status,
      400,
    );
    async function register(c: ReturnType<typeof client>, role: string, n: number) {
      const values = {
        name: `Test ${role} ${n}`,
        email: `${role.toLowerCase()}${n}@test.local`,
        mobile: `9${String(n).padStart(9, "0")}`,
        password,
        role,
        businessName: `Business ${n}`,
        category: "Retail",
        city: "Pune",
      };
      const result = await c.request("/auth/register", "POST", values);
      assert.equal(result.status, 201, JSON.stringify(result));
      return values;
    }
    const c1 = await register(customer, "CUSTOMER", 1);
    const c2 = await register(otherCustomer, "CUSTOMER", 2);
    const v1 = await register(vendor, "VENDOR", 3);
    const v2 = await register(otherVendor, "VENDOR", 4);
    assert.equal((await customer.request("/auth/register", "POST", c1)).status, 409);
    assert.equal((await vendor.request("/auth/login", "POST", v1)).status, 403);
    for (const v of [v1, v2]) {
      const u = await db.user.findUniqueOrThrow({ where: { email: v.email } });
      assert.equal(
        (await admin.request(`/admin/users/${u.id}`, "PATCH", { approval: "APPROVED" })).status,
        200,
      );
    }
    for (const [c, values] of [
      [customer, c1],
      [otherCustomer, c2],
      [vendor, v1],
      [otherVendor, v2],
    ] as const)
      assert.equal((await c.request("/auth/login", "POST", values)).status, 200);
    const profile = (await customer.request("/profile")).data;
    const otherProfile = (await otherCustomer.request("/profile")).data;
    assert.match(profile.customer.reference, /^NB24-\d+$/);
    assert.notEqual(profile.customer.reference, otherProfile.customer.reference);
    assert.equal(
      (await vendor.request("/settings/cashback", "POST", { percentage: "99" })).status,
      403,
    );
    assert.equal((await customer.request("/admin/users")).status, 403);
    assert.equal(
      (await customer.request("/profile", "PATCH", { ...c1 }, { "x-csrf-token": "wrong" })).status,
      403,
    );
    assert.equal(
      (await vendor.request("/customers/verify", "POST", { reference: "INVALID" })).status,
      404,
    );
    const minimal = (
      await vendor.request("/customers/verify", "POST", { token: profile.customer.cardToken })
    ).data;
    assert.equal(minimal.reference, profile.customer.reference);
    assert.equal(minimal.user.email, undefined);
    assert.equal(minimal.cardToken, undefined);
    const visit = (
      await vendor.request("/visits", "POST", { reference: profile.customer.reference })
    ).data;
    assert.equal(visit.status, "PENDING");
    assert.equal(
      (await vendor.request("/visits", "POST", { reference: profile.customer.reference })).status,
      409,
    );
    assert.equal(
      (await otherCustomer.request(`/visits/${visit.id}/confirm`, "POST", {})).status,
      404,
    );
    assert.equal((await customer.request(`/visits/${visit.id}/confirm`, "POST", {})).status, 200);
    const purchaseValues = {
      reference: profile.customer.reference,
      amount: "5000.00",
      billNumber: "BILL-001",
      billDate: "2026-10-01",
      visitId: visit.id,
    };
    const purchase = (await vendor.request("/transactions", "POST", purchaseValues)).data;
    assert.equal(purchase.rateBps, 1000);
    assert.equal((await vendor.upload(`/uploads/bill/${purchase.id}`, "fake content")).status, 400);
    const document = await vendor.upload(
      `/uploads/bill/${purchase.id}`,
      "%PDF-1.4\nTest bill\n%%EOF",
    );
    assert.equal(document.status, 201);
    assert.equal((await otherVendor.request(`/documents/${document.data.id}`)).status, 404);
    assert.equal((await otherCustomer.request(`/documents/${document.data.id}`)).status, 404);
    assert.equal((await customer.request(`/documents/${document.data.id}`)).status, 200);
    assert.equal((await vendor.request("/transactions", "POST", purchaseValues)).status, 409);
    assert.equal(
      (
        await vendor.request("/transactions", "POST", {
          ...purchaseValues,
          billNumber: "BAD",
          amount: "-1",
        })
      ).status,
      400,
    );
    assert.equal(
      (await admin.request(`/transactions/${purchase.id}/verify`, "POST", {})).status,
      409,
    );
    assert.equal(
      (await otherCustomer.request(`/transactions/${purchase.id}/confirm`, "POST", {})).status,
      404,
    );
    assert.equal((await otherVendor.request("/transactions")).data.length, 0);
    assert.equal(
      (await vendor.request(`/transactions/${purchase.id}/confirm`, "POST", {})).status,
      403,
    );
    assert.equal(
      (await customer.request(`/transactions/${purchase.id}/confirm`, "POST", {})).status,
      200,
    );
    assert.equal(
      (await admin.request("/settings/cashback", "POST", { percentage: "5" })).status,
      201,
    );
    const verifies = await Promise.all([
      admin.request(`/transactions/${purchase.id}/verify`, "POST", {}),
      admin.request(`/transactions/${purchase.id}/verify`, "POST", {}),
    ]);
    assert.equal(verifies.filter((r) => r.status === 200).length, 1);
    assert.equal(await db.cashback.count({ where: { transactionId: purchase.id } }), 1);
    const cashback = (await admin.request("/cashback")).data[0];
    assert.equal(cashback.amountPaise, 50000);
    assert.equal(
      (await customer.request(`/cashback/${cashback.id}/approve`, "POST", {})).status,
      403,
    );
    assert.equal(
      (
        await admin.request(`/cashback/${cashback.id}/pay`, "POST", {
          paymentDate: "2026-10-01",
          method: "CASH",
          reference: "P001",
        })
      ).status,
      409,
    );
    assert.equal((await admin.request(`/cashback/${cashback.id}/approve`, "POST", {})).status, 200);
    const payment = {
      paymentDate: "2026-10-01",
      method: "UPI",
      reference: "MANUAL-001",
      remarks: "Paid outside CRM",
    };
    const payments = await Promise.all([
      admin.request(`/cashback/${cashback.id}/pay`, "POST", payment),
      admin.request(`/cashback/${cashback.id}/pay`, "POST", payment),
    ]);
    assert.equal(payments.filter((r) => r.status === 200).length, 1);
    assert.equal(await db.cashbackPayment.count({ where: { cashbackId: cashback.id } }), 1);
    assert.equal(
      (
        await admin.request(`/transactions/${purchase.id}/cancel`, "POST", {
          reason: "Refund requested",
        })
      ).status,
      409,
    );
    const dashboard = (await customer.request("/dashboard")).data;
    assert.equal(
      (await vendor.upload(`/uploads/bill/${purchase.id}`, "%PDF-1.4\nchanged bill")).status,
      409,
    );
    assert.equal(dashboard.salesPaise, 500000);
    assert.equal(dashboard.paidPaise, 50000);
    assert.equal(dashboard.visits, 1);
    const notifications = (await customer.request("/notifications")).data;
    assert.ok(notifications.some((n: { title: string }) => n.title === "Cashback paid"));
    const report = await customer.request("/reports/export");
    assert.equal(report.status, 200);
    assert.ok(String(report.text).includes("MANUAL-001"));
    const summary = (await vendor.request("/reports/summary")).data;
    assert.equal(summary.vendors.length, 1);
    assert.equal(summary.vendors[0].salesPaise, 500000);
    assert.equal((await otherVendor.request("/reports/summary")).data.customers.length, 0);
    assert.equal((await admin.request("/reports/export?kind=customers")).status, 200);
    assert.equal((await customer.request("/reports/export?kind=vendors")).status, 403);
    const concurrentAccounts = await Promise.all(
      [1, 2].map((n) =>
        admin.request("/admin/users", "POST", {
          ...c1,
          email: `concurrent${n}@test.local`,
          mobile: `900000000${n + 6}`,
        }),
      ),
    );
    assert.ok(concurrentAccounts.every((r) => r.status === 201));
    const registered = await db.customer.findMany({
      where: { userId: { in: concurrentAccounts.map((r) => r.data.id) } },
    });
    assert.equal(new Set(registered.map((c) => c.reference)).size, 2);
    const disputed = (
      await vendor.request("/transactions", "POST", {
        ...purchaseValues,
        billNumber: "DISPUTE-1",
        visitId: undefined,
      })
    ).data;
    assert.equal(disputed.rateBps, 500);
    assert.equal(
      (
        await customer.request(`/transactions/${disputed.id}/dispute`, "POST", {
          reason: "Wrong amount on receipt",
        })
      ).status,
      200,
    );
    assert.equal(
      (await admin.request(`/transactions/${disputed.id}/verify`, "POST", {})).status,
      409,
    );
    assert.equal(
      (
        await admin.request(`/transactions/${disputed.id}/cancel`, "POST", {
          reason: "Dispute accepted",
        })
      ).status,
      200,
    );
    assert.equal(await db.cashback.count({ where: { transactionId: disputed.id } }), 0);
    const reset = (await admin.request(`/admin/users/${profile.id}/reset-link`, "POST", {})).data;
    const token = new URL(reset.url).searchParams.get("reset");
    assert.equal(
      (
        await anonymous.request("/auth/reset-password", "POST", {
          token,
          password: password + "new",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await anonymous.request("/auth/reset-password", "POST", {
          token,
          password: password + "new",
        })
      ).status,
      400,
    );
    assert.equal((await customer.request("/auth/me")).status, 401);
    const expiredToken = jwt.sign({ version: 0 }, process.env.JWT_SECRET!, {
      subject: String(a.id),
      expiresIn: -1,
    });
    assert.equal(
      (await anonymous.request("/auth/me", "GET", undefined, { Cookie: `session=${expiredToken}` }))
        .status,
      401,
    );
    assert.equal((await vendor.request("/auth/logout", "POST", {})).status, 200);
    assert.equal((await vendor.request("/transactions")).status, 401);
    assert.ok((await db.auditLog.count()) > 10);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.$disconnect();
  }
});
