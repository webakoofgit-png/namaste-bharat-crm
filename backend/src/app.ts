import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { Prisma, type User } from "@prisma/client";
import { db } from "./db.js";
import { AppError, moneyToPaise, cashbackPaise, assertTransition } from "./domain.js";
import { websiteAuthEnabled, exchangeWebsiteCode } from "./website-auth.js";

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32)
  throw new Error("JWT_SECRET must contain at least 32 characters.");
const jwtSecret: string = secret;
const production = process.env.NODE_ENV === "production";
const origins = (process.env.APP_ORIGIN || "http://localhost:3000").split(",");
if (production && origins.some((o) => !o.startsWith("https://")))
  throw new Error("Production APP_ORIGIN must use HTTPS.");
const cookie = {
  httpOnly: true,
  secure: production,
  sameSite: "lax" as const,
  path: "/api",
  maxAge: 8 * 60 * 60 * 1000,
};
const uploads = path.resolve(process.env.UPLOAD_DIR || "./uploads");
export const app = express();
export default app;
app.disable("x-powered-by");
if (production) app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({ windowMs: 60_000, limit: 200, standardHeaders: "draft-8", legacyHeaders: false }),
);
app.use("/api", (req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!req.headers.origin || !origins.includes(req.headers.origin))
      return next(new AppError(403, "Untrusted request origin."));
    if (
      req.cookies.session &&
      (!req.cookies.csrf || req.headers["x-csrf-token"] !== req.cookies.csrf)
    )
      return next(new AppError(403, "Invalid CSRF token."));
  }
  next();
});
const authLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const safeUser = (u: User) => ({
  id: u.id,
  email: u.email,
  mobile: u.mobile,
  name: u.name,
  role: u.role,
  active: u.active,
  address: u.address,
  city: u.city,
  pinCode: u.pinCode,
  createdAt: u.createdAt,
});
type AuthRequest = Request & { actor: User };
const actor = (req: Request) => (req as AuthRequest).actor;
const send = (res: Response, data: unknown, status = 200) => res.status(status).json({ data });
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
const audit = (
  tx: Prisma.TransactionClient,
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | null,
  detail = "",
) => tx.auditLog.create({ data: { userId, action, entity, entityId, detail } });
const notify = (tx: Prisma.TransactionClient, userId: number, title: string, message: string) =>
  tx.notification.create({ data: { userId, title, message } });
async function notifyAdmins(tx: Prisma.TransactionClient, title: string, message: string) {
  const admins = await tx.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true },
  });
  for (const a of admins) await notify(tx, a.id, title, message);
}
async function atomic<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: "Serializable", timeout: 15000 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
}
async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.cookies.session) throw new AppError(401, "Sign in to continue.");
    const payload = jwt.verify(req.cookies.session, jwtSecret, {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;
    const user = await db.user.findUnique({
      where: { id: Number(payload.sub) },
      include: { vendor: true },
    });
    if (!user || !user.active || payload["version"] !== user.sessionVersion)
      throw new AppError(401, "Your session has expired.");
    if (user.role === "VENDOR" && user.vendor?.approval !== "APPROVED")
      throw new AppError(403, "Your business is awaiting administrator approval.");
    (req as AuthRequest).actor = user;
    next();
  } catch (e) {
    next(e instanceof AppError ? e : new AppError(401, "Your session has expired."));
  }
}
const roles =
  (...allowed: string[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    allowed.includes(actor(req).role)
      ? next()
      : next(new AppError(403, "You do not have permission for this action."));
function startSession(res: Response, user: User) {
  const csrf = randomBytes(24).toString("hex");
  res.cookie(
    "session",
    jwt.sign({ version: user.sessionVersion }, jwtSecret, {
      subject: String(user.id),
      expiresIn: "8h",
      algorithm: "HS256",
    }),
    cookie,
  );
  res.cookie("csrf", csrf, { ...cookie, httpOnly: false });
  return csrf;
}
const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .string()
    .email()
    .max(190)
    .transform((v) => v.toLowerCase().trim()),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  address: z.string().trim().max(500).default(""),
  city: z.string().trim().max(100).default(""),
  pinCode: z
    .string()
    .regex(/^\d{6}$|^$/, "PIN code must have six digits")
    .default(""),
});
const registerSchema = profileSchema.extend({
  password: z.string().min(10).max(100),
  role: z.enum(["CUSTOMER", "VENDOR"]),
  businessName: z.string().trim().max(190).optional(),
  category: z.string().trim().max(100).optional(),
  whatsapp: z
    .string()
    .regex(/^[6-9]\d{9}$|^$/)
    .default(""),
});
async function registerAccount(data: z.infer<typeof registerSchema>, administrator?: number) {
  if (data.role === "VENDOR" && (!data.businessName || !data.category))
    throw new AppError(400, "Business name and category are required.");
  const hash = await bcrypt.hash(data.password, 12);
  return atomic(async (tx) => {
    const { password, businessName, category, whatsapp, ...profile } = data;
    const user = await tx.user.create({ data: { ...profile, passwordHash: hash } });
    if (data.role === "CUSTOMER") {
      const c = await tx.customer.create({
        data: { userId: user.id, cardToken: randomBytes(32).toString("hex") },
      });
      await tx.customer.update({
        where: { id: c.id },
        data: { reference: `NB24-${100000 + c.id}` },
      });
    } else {
      await tx.vendor.create({
        data: { userId: user.id, businessName: businessName!, category: category!, whatsapp },
      });
      await notifyAdmins(tx, "New vendor registration", `${businessName} is awaiting approval.`);
    }
    await audit(tx, administrator ?? user.id, "REGISTER", "user", user.id);
    return safeUser(user);
  });
}
app.get("/api/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  send(res, { status: "ok", database: "connected" });
});
app.post("/api/auth/register", authLimit, async (req, res) => {
  if (websiteAuthEnabled)
    throw new AppError(403, "Create your account on the Namaste Bharat website.");
  send(res, await registerAccount(registerSchema.parse(req.body)), 201);
});
app.post("/api/auth/website-start", authLimit, async (_req, res) => {
  if (!websiteAuthEnabled) throw new AppError(404, "Website sign-in is not enabled.");
  const loginUrl = process.env.WEBSITE_LOGIN_URL;
  const clientId = process.env.WEBSITE_AUTH_CLIENT_ID;
  if (!loginUrl || !clientId) throw new AppError(503, "Website sign-in is not configured.");
  const url = new URL(loginUrl);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new AppError(503, "Website sign-in requires HTTPS.");
  const state = randomBytes(32).toString("hex");
  res.cookie("website_login_state", state, { ...cookie, maxAge: 5 * 60 * 1000 });
  url.searchParams.set("state", state);
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("redirectUri", `${origins[0]}/`);
  send(res, { url: url.toString() });
});
app.post("/api/auth/website-exchange", authLimit, async (req, res) => {
  const { code, state } = z
    .object({
      code: z.string().min(32).max(512),
      state: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .parse(req.body);
  if (!req.cookies.website_login_state || state !== req.cookies.website_login_state)
    throw new AppError(401, "Website sign-in verification failed. Start sign-in again from CRM.");
  res.clearCookie("website_login_state", cookie);
  const identity = await exchangeWebsiteCode(code, state, `${origins[0]}/`);
  const link = await db.websiteIdentity.findUnique({
    where: { subject: identity.subject },
    include: { user: { include: { vendor: true, customer: true } } },
  });
  const user = link?.user;
  if (!user || !user.active || user.role !== identity.role)
    throw new AppError(
      403,
      "Your website account is not linked to an active CRM profile. Contact support.",
    );
  if (user.role === "VENDOR" && user.vendor?.approval !== "APPROVED")
    throw new AppError(403, "Your business is awaiting administrator approval.");
  if (user.role === "CUSTOMER" && !user.customer)
    throw new AppError(403, "Your customer profile is not ready. Contact support.");
  await audit(db, user.id, "WEBSITE_LOGIN", "auth", user.id);
  send(res, { user: safeUser(user), csrf: startSession(res, user) });
});
app.post("/api/auth/login", authLimit, async (req, res) => {
  const data = z
    .object({
      email: z.string().email(),
      password: z.string().max(100),
      role: z.enum(["ADMIN", "VENDOR", "CUSTOMER"]),
    })
    .parse(req.body);
  if (websiteAuthEnabled && data.role !== "ADMIN")
    throw new AppError(403, "Vendor and Customer sign-in is handled on the website.");
  const user = await db.user.findUnique({
    where: { email: data.email.toLowerCase().trim() },
    include: { vendor: true },
  });
  if (
    !user ||
    !(await bcrypt.compare(data.password, user.passwordHash)) ||
    user.role !== data.role ||
    !user.active
  ) {
    await db.auditLog.create({
      data: {
        action: "LOGIN_FAILED",
        entity: "auth",
        detail: "Invalid credentials or disabled account",
      },
    });
    throw new AppError(401, "Invalid email or password for this portal.");
  }
  if (user.role === "VENDOR" && user.vendor?.approval !== "APPROVED")
    throw new AppError(403, "Your business is awaiting administrator approval.");
  await db.auditLog.create({
    data: { userId: user.id, action: "LOGIN", entity: "auth", detail: "" },
  });
  send(res, { user: safeUser(user), csrf: startSession(res, user) });
});
app.post("/api/auth/forgot-password", authLimit, async (req, res) => {
  const email = z.string().email().parse(req.body.email).toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (user && (!websiteAuthEnabled || user.role === "ADMIN"))
    await atomic(async (tx) => {
      await notifyAdmins(
        tx,
        "Password reset requested",
        `Account ${user.id} requested a password reset. Verify identity offline, then issue a reset link from Users.`,
      );
      await audit(tx, user.id, "RESET_REQUESTED", "user", user.id);
    });
  send(res, {
    message:
      "If an account exists, the administrator has been notified. Contact support to verify your identity and receive a reset link.",
  });
});
app.post("/api/auth/reset-password", authLimit, async (req, res) => {
  const data = z
    .object({ token: z.string().length(64), password: z.string().min(10).max(100) })
    .parse(req.body);
  const passwordHash = await bcrypt.hash(data.password, 12);
  await atomic(async (tx) => {
    const reset = await tx.passwordReset.findUnique({
      where: { tokenHash: createHash("sha256").update(data.token).digest("hex") },
    });
    if (!reset || reset.used || reset.expiresAt < new Date())
      throw new AppError(400, "This reset link is invalid or expired.");
    if (websiteAuthEnabled) {
      const account = await tx.user.findUnique({ where: { id: reset.userId } });
      if (account?.role !== "ADMIN") throw new AppError(403, "Reset your password on the website.");
    }
    const changed = await tx.passwordReset.updateMany({
      where: { id: reset.id, used: false },
      data: { used: true },
    });
    if (!changed.count) throw new AppError(409, "This reset link has already been used.");
    await tx.user.update({
      where: { id: reset.userId },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.passwordReset.updateMany({ where: { userId: reset.userId }, data: { used: true } });
    await audit(tx, reset.userId, "PASSWORD_RESET", "user", reset.userId);
  });
  res.clearCookie("session", cookie);
  res.clearCookie("csrf", { ...cookie, httpOnly: false });
  send(res, { message: "Password updated. Sign in with your new password." });
});
app.use("/api", authenticate);
app.get("/api/admin/users/:id/website-identity", roles("ADMIN"), async (req, res) => {
  const identity = await db.websiteIdentity.findUnique({
    where: { userId: id(req.params.id) },
    select: { subject: true },
  });
  send(res, identity);
});
app.post("/api/admin/users/:id/website-identity", roles("ADMIN"), async (req, res) => {
  const userId = id(req.params.id);
  const { subject } = z.object({ subject: z.string().trim().min(1).max(190) }).parse(req.body);
  await atomic(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || !["VENDOR", "CUSTOMER"].includes(user.role))
      throw new AppError(400, "Only Vendor and Customer accounts can be linked.");
    // Unique keys reject reassignment and accidental merges; never match by email.
    await tx.websiteIdentity.create({ data: { subject, userId } });
    await audit(tx, actor(req).id, "LINK_WEBSITE_IDENTITY", "user", userId);
  });
  send(res, { message: "Website account linked." }, 201);
});
app.get("/api/auth/me", (req, res) =>
  send(res, { user: safeUser(actor(req)), csrf: req.cookies.csrf }),
);
app.post("/api/auth/logout", async (req, res) => {
  await atomic(async (tx) => {
    await tx.user.update({
      where: { id: actor(req).id },
      data: { sessionVersion: { increment: 1 } },
    });
    await audit(tx, actor(req).id, "LOGOUT", "auth", actor(req).id);
  });
  res.clearCookie("session", cookie);
  res.clearCookie("csrf", { ...cookie, httpOnly: false });
  send(res, { message: "Signed out." });
});
app.get("/api/profile", async (req, res) => {
  const u = await db.user.findUniqueOrThrow({
    where: { id: actor(req).id },
    include: {
      customer: true,
      vendor: { include: { media: { select: { id: true, kind: true, originalName: true } } } },
    },
  });
  send(res, { ...safeUser(u), customer: u.customer, vendor: u.vendor });
});
app.patch("/api/profile", async (req, res) => {
  const data = profileSchema.parse(req.body);
  await atomic(async (tx) => {
    await tx.user.update({ where: { id: actor(req).id }, data });
    await audit(tx, actor(req).id, "PROFILE_UPDATE", "user", actor(req).id);
  });
  send(res, { message: "Profile updated." });
});
app.post("/api/admin/users", roles("ADMIN"), async (req, res) =>
  send(res, await registerAccount(registerSchema.parse(req.body), actor(req).id), 201),
);
app.get("/api/admin/users", roles("ADMIN"), async (req, res) => {
  const role = z.enum(["CUSTOMER", "VENDOR"]).parse(req.query.role || "CUSTOMER");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(req.query.page || 1);
  const search = String(req.query.search || "").slice(0, 100);
  const where: Prisma.UserWhereInput = {
    role,
    ...(req.query.active ? { active: req.query.active === "true" } : {}),
    ...(req.query.city ? { city: String(req.query.city) } : {}),
    ...(req.query.category ? { vendor: { category: String(req.query.category) } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { mobile: { contains: search } },
            { customer: { reference: { contains: search } } },
            { vendor: { businessName: { contains: search } } },
          ],
        }
      : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: {
        customer: true,
        vendor: { include: { media: { select: { id: true, kind: true, originalName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 20,
      take: 20,
    }),
    db.user.count({ where }),
  ]);
  send(res, {
    items: users.map((u) => ({ ...safeUser(u), customer: u.customer, vendor: u.vendor })),
    total,
    page,
    pageSize: 20,
  });
});
app.patch("/api/admin/users/:id", roles("ADMIN"), async (req, res) => {
  const userId = id(req.params.id);
  const data = profileSchema
    .partial()
    .extend({
      active: z.boolean().optional(),
      businessName: z.string().min(2).max(190).optional(),
      category: z.string().min(2).max(100).optional(),
      whatsapp: z
        .string()
        .regex(/^[6-9]\d{9}$|^$/)
        .optional(),
      approval: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
    })
    .parse(req.body);
  await atomic(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === "ADMIN")
      throw new AppError(403, "Administrator accounts cannot be modified here.");
    const { businessName, category, whatsapp, approval, ...profile } = data;
    await tx.user.update({
      where: { id: userId },
      data: { ...profile, sessionVersion: { increment: 1 } },
    });
    if (user.role === "VENDOR") {
      await tx.vendor.update({
        where: { userId },
        data: { businessName, category, whatsapp, approval },
      });
      if (approval)
        await notify(
          tx,
          userId,
          "Business approval updated",
          `Your business status is ${approval.toLowerCase()}.`,
        );
    } else if (approval || businessName || category)
      throw new AppError(400, "Only vendors have business fields.");
    await audit(tx, actor(req).id, "USER_UPDATE", "user", userId, JSON.stringify(data));
  });
  send(res, { message: "Account updated." });
});
app.post("/api/admin/users/:id/reset-link", roles("ADMIN"), async (req, res) => {
  const userId = id(req.params.id);
  const token = randomBytes(32).toString("hex");
  await atomic(async (tx) => {
    await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.passwordReset.updateMany({ where: { userId }, data: { used: true } });
    await tx.passwordReset.create({
      data: {
        userId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await audit(tx, actor(req).id, "RESET_LINK_ISSUED", "user", userId);
  });
  send(res, { url: `${origins[0]}/?reset=${token}`, expiresInMinutes: 30 });
});
async function scope(req: Request) {
  const u = actor(req);
  if (u.role === "CUSTOMER")
    return { customerId: (await db.customer.findUniqueOrThrow({ where: { userId: u.id } })).id };
  if (u.role === "VENDOR")
    return { vendorId: (await db.vendor.findUniqueOrThrow({ where: { userId: u.id } })).id };
  return {};
}
const publicCustomer = {
  id: true,
  reference: true,
  user: { select: { name: true, active: true } },
} as const;
const publicVendor = { id: true, businessName: true, category: true } as const;
const transactionInclude = {
  customer: { select: publicCustomer },
  vendor: { select: publicVendor },
  cashback: { include: { payment: true } },
  documents: { select: { id: true, originalName: true, mime: true } },
} as const;
async function customerIdentity(input: { reference?: string; token?: string }) {
  if (!input.reference && !input.token)
    throw new AppError(400, "Enter a customer reference number or scan a membership QR.");
  const customer = await db.customer.findFirst({
    where: {
      ...(input.token
        ? { cardToken: input.token }
        : { reference: input.reference?.toUpperCase().trim() }),
      user: { active: true },
    },
    select: publicCustomer,
  });
  if (!customer) throw new AppError(404, "Active membership not found.");
  return customer;
}
app.post("/api/customers/verify", roles("VENDOR", "ADMIN"), async (req, res) => {
  const data = z
    .object({ reference: z.string().max(40).optional(), token: z.string().length(64).optional() })
    .parse(req.body);
  send(res, await customerIdentity(data));
});
app.get("/api/visits", async (req, res) => {
  const where = {
    ...(await scope(req)),
    ...dateFilter(req),
    ...(actor(req).role === "ADMIN" && req.query.customerId
      ? { customerId: id(req.query.customerId) }
      : {}),
    ...(actor(req).role === "ADMIN" && req.query.vendorId
      ? { vendorId: id(req.query.vendorId) }
      : {}),
  };
  send(
    res,
    await db.visit.findMany({
      where,
      include: {
        customer: { select: publicCustomer },
        vendor: { select: publicVendor },
        transaction: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  );
});
app.post("/api/visits", roles("VENDOR"), async (req, res) => {
  const data = z
    .object({ reference: z.string().max(40).optional(), token: z.string().length(64).optional() })
    .parse(req.body);
  const customer = await customerIdentity(data);
  const vendor = await db.vendor.findUniqueOrThrow({ where: { userId: actor(req).id } });
  // A ten-minute bucket prevents double clicks; confirmation still requires the customer session.
  const dedupKey = `${vendor.id}:${customer.id}:${Math.floor(Date.now() / 600000)}`;
  send(
    res,
    await atomic(async (tx) => {
      const recent = await tx.visit.findFirst({
        where: {
          customerId: customer.id,
          vendorId: vendor.id,
          createdAt: { gt: new Date(Date.now() - 600000) },
        },
      });
      if (recent) throw new AppError(409, "A visit was already recorded in the last ten minutes.");
      const visit = await tx.visit.create({
        data: {
          customerId: customer.id,
          vendorId: vendor.id,
          method: data.token ? "QR" : "REFERENCE",
          expiresAt: new Date(Date.now() + 15 * 60_000),
          dedupKey,
        },
      });
      const c = await tx.customer.findUniqueOrThrow({ where: { id: customer.id } });
      await notify(
        tx,
        c.userId,
        "Confirm your visit",
        `${vendor.businessName} recorded your visit. Confirm in Visits within 15 minutes.`,
      );
      await audit(tx, actor(req).id, "VISIT_CREATED", "visit", visit.id);
      return visit;
    }),
    201,
  );
});
app.post("/api/visits/:id/:action", roles("CUSTOMER"), async (req, res) => {
  const action = z.enum(["confirm", "dispute"]).parse(req.params.action);
  const own = await scope(req);
  await atomic(async (tx) => {
    const visit = await tx.visit.findFirst({
      where: { id: id(req.params.id), ...own },
      include: { vendor: true },
    });
    if (!visit) throw new AppError(404, "Visit not found.");
    if (visit.status !== "PENDING")
      throw new AppError(409, "This visit has already been reviewed.");
    if (action === "confirm" && visit.expiresAt < new Date())
      throw new AppError(409, "Visit verification expired. Ask the vendor to record a new visit.");
    const updated = await tx.visit.updateMany({
      where: { id: visit.id, status: "PENDING" },
      data: { status: action === "confirm" ? "VERIFIED" : "DISPUTED", confirmedAt: new Date() },
    });
    if (!updated.count) throw new AppError(409, "Visit already reviewed.");
    await notify(
      tx,
      visit.vendor.userId,
      "Visit reviewed",
      `Visit #${visit.id} was ${action === "confirm" ? "confirmed" : "disputed"} by the customer.`,
    );
    await audit(tx, actor(req).id, `VISIT_${action.toUpperCase()}`, "visit", visit.id);
  });
  send(res, { message: "Visit updated." });
});
function dateFilter(req: Request): { createdAt?: { gte?: Date; lte?: Date } } {
  const from = req.query.from
    ? z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.query.from)
    : undefined;
  const to = req.query.to
    ? z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(req.query.to)
    : undefined;
  if (from && to && from > to) throw new AppError(400, "Start date must precede end date.");
  if (!from && !to) return {};
  const gte = from ? new Date(`${from}T00:00:00+05:30`) : undefined;
  const lte = to ? new Date(`${to}T23:59:59.999+05:30`) : undefined;
  if ((gte && isNaN(gte.getTime())) || (lte && isNaN(lte.getTime())))
    throw new AppError(400, "Invalid date range.");
  return { createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}
async function transactionWhere(req: Request): Promise<Prisma.TransactionWhereInput> {
  const where: Prisma.TransactionWhereInput = { ...(await scope(req)), ...dateFilter(req) };
  if (req.query.status)
    where.status = z
      .enum(["PENDING", "CONFIRMED", "VERIFIED", "DISPUTED", "CANCELLED"])
      .parse(req.query.status);
  if (actor(req).role === "ADMIN") {
    if (req.query.customerId) where.customerId = id(req.query.customerId);
    if (req.query.vendorId) where.vendorId = id(req.query.vendorId);
  }
  if (req.query.city) where.vendor = { user: { city: String(req.query.city) } };
  if (req.query.category)
    where.vendor = { ...(where.vendor as object), category: String(req.query.category) };
  return where;
}
app.get("/api/transactions", async (req, res) =>
  send(
    res,
    await db.transaction.findMany({
      where: await transactionWhere(req),
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ),
);
app.post("/api/transactions", roles("VENDOR"), async (req, res) => {
  const data = z
    .object({
      reference: z.string().min(1).max(40),
      amount: z.string(),
      billNumber: z.string().trim().min(1).max(100),
      billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().max(1000).default(""),
      visitId: z.number().int().positive().optional(),
    })
    .parse(req.body);
  const amountPaise = moneyToPaise(data.amount);
  const billDate = new Date(`${data.billDate}T12:00:00+05:30`);
  if (isNaN(billDate.getTime()) || billDate > new Date(Date.now() + 24 * 3600000))
    throw new AppError(400, "Invalid bill date.");
  const customer = await customerIdentity({ reference: data.reference });
  const vendor = await db.vendor.findUniqueOrThrow({ where: { userId: actor(req).id } });
  send(
    res,
    await atomic(async (tx) => {
      if (data.visitId) {
        const visit = await tx.visit.findFirst({
          where: {
            id: data.visitId,
            customerId: customer.id,
            vendorId: vendor.id,
            status: "VERIFIED",
          },
        });
        if (!visit)
          throw new AppError(
            400,
            "Only a verified visit for this customer and vendor can be linked.",
          );
      }
      const settings = await tx.cashbackSetting.findFirst({ orderBy: { id: "desc" } });
      if (!settings) throw new AppError(503, "Cashback settings have not been initialized.");
      const purchase = await tx.transaction.create({
        data: {
          customerId: customer.id,
          vendorId: vendor.id,
          amountPaise,
          rateBps: settings.rateBps,
          billNumber: data.billNumber,
          billDate,
          notes: data.notes,
          visitId: data.visitId,
        },
      });
      const c = await tx.customer.findUniqueOrThrow({ where: { id: customer.id } });
      await notify(
        tx,
        c.userId,
        "Purchase confirmation requested",
        `${vendor.businessName} recorded bill ${data.billNumber}. Review it in Purchases.`,
      );
      await notifyAdmins(
        tx,
        "Pending transaction",
        `Transaction #${purchase.id} is awaiting customer confirmation.`,
      );
      await audit(tx, actor(req).id, "PURCHASE_CREATED", "transaction", purchase.id);
      return purchase;
    }),
    201,
  );
});
app.post("/api/transactions/:id/:action", async (req, res) => {
  const action = z.enum(["confirm", "dispute", "verify", "cancel"]).parse(req.params.action);
  const reason = z
    .string()
    .trim()
    .max(1000)
    .parse(req.body.reason || "");
  if (["dispute", "cancel"].includes(action) && reason.length < 5)
    throw new AppError(400, "Give a reason with at least five characters.");
  const own = await scope(req);
  await atomic(async (tx) => {
    const purchase = await tx.transaction.findFirst({
      where: { id: id(req.params.id), ...own },
      include: { customer: true, vendor: true, cashback: true },
    });
    if (!purchase) throw new AppError(404, "Transaction not found.");
    const status = assertTransition(purchase.status, action, actor(req).role);
    if (action === "cancel" && purchase.cashback?.status === "PAID")
      throw new AppError(
        409,
        "Paid cashback requires offline reconciliation; cancellation is blocked.",
      );
    const changed = await tx.transaction.updateMany({
      where: { id: purchase.id, status: purchase.status },
      data: { status, ...(reason ? { disputeReason: reason } : {}) },
    });
    if (!changed.count) throw new AppError(409, "Transaction was changed by another request.");
    if (action === "verify") {
      await tx.cashback.create({
        data: {
          transactionId: purchase.id,
          amountPaise: cashbackPaise(purchase.amountPaise, purchase.rateBps),
        },
      });
      await notifyAdmins(
        tx,
        "Cashback approval requested",
        `Cashback for transaction #${purchase.id} is ready for review.`,
      );
    }
    if (action === "cancel" && purchase.cashback)
      await tx.cashback.update({
        where: { id: purchase.cashback.id },
        data: { status: "CANCELLED" },
      });
    await notify(
      tx,
      purchase.customer.userId,
      "Purchase status updated",
      `Transaction #${purchase.id} is ${status.toLowerCase()}.`,
    );
    await notify(
      tx,
      purchase.vendor.userId,
      "Purchase status updated",
      `Transaction #${purchase.id} is ${status.toLowerCase()}.`,
    );
    if (action === "dispute")
      await notifyAdmins(tx, "Disputed purchase", `Transaction #${purchase.id}: ${reason}`);
    await audit(
      tx,
      actor(req).id,
      `PURCHASE_${action.toUpperCase()}`,
      "transaction",
      purchase.id,
      reason,
    );
  });
  send(res, { message: "Transaction updated." });
});
app.get("/api/cashback", async (req, res) =>
  send(
    res,
    await db.cashback.findMany({
      where: { transaction: await transactionWhere(req) },
      include: {
        payment: true,
        transaction: {
          include: { customer: { select: publicCustomer }, vendor: { select: publicVendor } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ),
);
app.post("/api/cashback/:id/approve", roles("ADMIN"), async (req, res) => {
  await atomic(async (tx) => {
    const c = await tx.cashback.findUniqueOrThrow({
      where: { id: id(req.params.id) },
      include: { transaction: { include: { customer: true } } },
    });
    if (c.status !== "PENDING" || c.transaction.status !== "VERIFIED")
      throw new AppError(409, "Only pending cashback for a verified purchase can be approved.");
    const changed = await tx.cashback.updateMany({
      where: { id: c.id, status: "PENDING" },
      data: { status: "APPROVED" },
    });
    if (!changed.count) throw new AppError(409, "Cashback already reviewed.");
    await notify(
      tx,
      c.transaction.customer.userId,
      "Cashback approved",
      `Cashback for bill ${c.transaction.billNumber} was approved.`,
    );
    await audit(tx, actor(req).id, "CASHBACK_APPROVED", "cashback", c.id);
  });
  send(res, { message: "Cashback approved." });
});
app.post("/api/cashback/:id/pay", roles("ADMIN"), async (req, res) => {
  const data = z
    .object({
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      method: z.enum(["UPI", "BANK", "CASH", "OTHER"]),
      reference: z.string().trim().min(3).max(190),
      remarks: z.string().trim().max(1000).default(""),
    })
    .parse(req.body);
  const paymentDate = new Date(`${data.paymentDate}T12:00:00+05:30`);
  if (isNaN(paymentDate.getTime()) || paymentDate > new Date(Date.now() + 24 * 3600000))
    throw new AppError(400, "Invalid payment date.");
  await atomic(async (tx) => {
    const c = await tx.cashback.findUniqueOrThrow({
      where: { id: id(req.params.id) },
      include: { transaction: { include: { customer: true } } },
    });
    if (c.status !== "APPROVED" || c.transaction.status !== "VERIFIED")
      throw new AppError(409, "Only approved cashback can be marked paid.");
    const changed = await tx.cashback.updateMany({
      where: { id: c.id, status: "APPROVED" },
      data: { status: "PAID" },
    });
    if (!changed.count) throw new AppError(409, "Cashback has already been paid.");
    await tx.cashbackPayment.create({
      data: { cashbackId: c.id, recordedById: actor(req).id, ...data, paymentDate },
    });
    await notify(
      tx,
      c.transaction.customer.userId,
      "Cashback paid",
      `Manual payment for bill ${c.transaction.billNumber} was recorded. Reference: ${data.reference}.`,
    );
    await audit(tx, actor(req).id, "CASHBACK_PAID", "cashback", c.id, JSON.stringify(data));
  });
  send(res, { message: "Manual payment recorded. No money is transferred by the CRM." });
});
app.get("/api/settings/cashback", roles("ADMIN"), async (_req, res) =>
  send(
    res,
    await db.cashbackSetting.findMany({
      include: { updatedBy: { select: { name: true } } },
      orderBy: { id: "desc" },
      take: 100,
    }),
  ),
);
app.post("/api/settings/cashback", roles("ADMIN"), async (req, res) => {
  const value = z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/)
    .parse(req.body.percentage);
  const rateBps = Math.round(Number(value) * 100);
  if (rateBps > 10000) throw new AppError(400, "Rate must be between 0 and 100 percent.");
  send(
    res,
    await atomic(async (tx) => {
      const setting = await tx.cashbackSetting.create({
        data: { rateBps, updatedById: actor(req).id },
      });
      await audit(tx, actor(req).id, "CASHBACK_RATE_CHANGED", "setting", setting.id, value);
      return setting;
    }),
    201,
  );
});
app.get("/api/notifications", async (req, res) =>
  send(
    res,
    await db.notification.findMany({
      where: { userId: actor(req).id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ),
);
app.post("/api/notifications/read", async (req, res) => {
  await db.notification.updateMany({
    where: { userId: actor(req).id, read: false },
    data: { read: true },
  });
  send(res, { message: "Notifications marked read." });
});
app.get("/api/admin/audit", roles("ADMIN"), async (_req, res) =>
  send(
    res,
    await db.auditLog.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { id: "desc" },
      take: 200,
    }),
  ),
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(400, "Only PDF, PNG and JPEG files are allowed.")),
});
function validateFile(file: Express.Multer.File) {
  const b = file.buffer;
  const valid =
    (file.mimetype === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-") ||
    (file.mimetype === "image/png" &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.mimetype === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255);
  if (!valid) throw new AppError(400, "File content does not match its declared type.");
}
async function storeFile(
  req: Request,
  data: { transactionId?: number; vendorId?: number; kind: string },
) {
  if (!req.file) throw new AppError(400, "Choose a file.");
  validateFile(req.file);
  const storageName = randomBytes(24).toString("hex");
  await mkdir(uploads, { recursive: true });
  await writeFile(path.join(uploads, storageName), req.file.buffer, { flag: "wx", mode: 0o600 });
  try {
    return await atomic(async (tx) => {
      if (data.transactionId) {
        const purchase = await tx.transaction.findUniqueOrThrow({
          where: { id: data.transactionId },
          include: { vendor: true },
        });
        if (purchase.status !== "PENDING" || purchase.vendor.userId !== actor(req).id)
          throw new AppError(409, "Bill uploads are only permitted for your pending purchases.");
        // Acquire the same write lock as a customer status transition before adding its bill.
        const locked = await tx.transaction.updateMany({
          where: { id: purchase.id, status: "PENDING" },
          data: { updatedAt: new Date() },
        });
        if (!locked.count) throw new AppError(409, "The purchase was already confirmed.");
      }
      const doc = await tx.document.create({
        data: {
          ...data,
          storageName,
          originalName: path.basename(req.file!.originalname).slice(0, 190),
          mime: req.file!.mimetype,
          size: req.file!.size,
        },
      });
      await audit(tx, actor(req).id, "DOCUMENT_UPLOADED", "document", doc.id);
      return { id: doc.id, originalName: doc.originalName };
    });
  } catch (e) {
    await unlink(path.join(uploads, storageName));
    throw e;
  }
}
app.post("/api/uploads/bill/:id", roles("VENDOR"), upload.single("file"), async (req, res) => {
  const own = await scope(req);
  const purchase = await db.transaction.findFirst({ where: { id: id(req.params.id), ...own } });
  if (!purchase) throw new AppError(404, "Purchase not found.");
  if (purchase.status !== "PENDING")
    throw new AppError(409, "Bills can only be added before customer confirmation.");
  send(res, await storeFile(req, { transactionId: purchase.id, kind: "BILL" }), 201);
});
app.post(
  "/api/uploads/vendor/:id",
  roles("ADMIN", "VENDOR"),
  upload.single("file"),
  async (req, res) => {
    const vendorId = id(req.params.id);
    const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || (actor(req).role === "VENDOR" && vendor.userId !== actor(req).id))
      throw new AppError(404, "Vendor not found.");
    const kind = z.enum(["LOGO", "IMAGE"]).parse(req.body.kind || "IMAGE");
    if (req.file?.mimetype === "application/pdf")
      throw new AppError(400, "Business media must be an image.");
    send(res, await storeFile(req, { vendorId, kind }), 201);
  },
);
app.get("/api/documents/:id", async (req, res) => {
  const doc = await db.document.findUnique({
    where: { id: id(req.params.id) },
    include: { transaction: { include: { customer: true, vendor: true } }, vendor: true },
  });
  if (!doc) throw new AppError(404, "Document not found.");
  const u = actor(req);
  if (
    u.role !== "ADMIN" &&
    !(
      doc.transaction &&
      (doc.transaction.customer.userId === u.id || doc.transaction.vendor.userId === u.id)
    ) &&
    !(doc.vendor && doc.vendor.userId === u.id)
  )
    throw new AppError(404, "Document not found.");
  res.setHeader("Content-Type", doc.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${doc.originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.send(await readFile(path.join(uploads, doc.storageName)));
});

app.get("/api/dashboard", async (req, res) => {
  const own = await scope(req);
  const range = dateFilter(req);
  const [purchases, visits, customers, vendors] = await Promise.all([
    db.transaction.findMany({
      where: { ...own, ...range },
      include: { cashback: true, vendor: { select: publicVendor } },
    }),
    db.visit.findMany({ where: { ...own, ...range } }),
    actor(req).role === "ADMIN"
      ? db.user.findMany({
          where: { role: "CUSTOMER", ...range },
          select: { createdAt: true, active: true },
        })
      : [],
    actor(req).role === "ADMIN"
      ? db.vendor.findMany({
          where: { user: range },
          include: { user: { select: { active: true, createdAt: true } } },
        })
      : [],
  ]);
  const verified = purchases.filter((t) => t.status === "VERIFIED");
  const cashback = verified.flatMap((t) => (t.cashback ? [t.cashback] : []));
  const sumCash = (status?: string) =>
    cashback
      .filter((c) => !status || c.status === status)
      .reduce((sum, c) => sum + c.amountPaise, 0);
  const months = new Map<
    string,
    { month: string; sales: number; customers: number; vendors: number }
  >();
  const bucket = (date: Date) => {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).format(date);
    if (!months.has(key)) months.set(key, { month: key, sales: 0, customers: 0, vendors: 0 });
    return months.get(key)!;
  };
  verified.forEach((t) => (bucket(t.createdAt).sales += t.amountPaise / 100));
  customers.forEach((c) => bucket(c.createdAt).customers++);
  vendors.forEach((v) => bucket(v.user.createdAt).vendors++);
  const topVendors = new Map<number, { name: string; salesPaise: number; purchases: number }>();
  verified.forEach((t) => {
    const row = topVendors.get(t.vendorId) || {
      name: t.vendor.businessName,
      salesPaise: 0,
      purchases: 0,
    };
    row.salesPaise += t.amountPaise;
    row.purchases++;
    topVendors.set(t.vendorId, row);
  });
  send(res, {
    customers: customers.length,
    vendors: vendors.length,
    activeVendors: vendors.filter((v) => v.user.active && v.approval === "APPROVED").length,
    inactiveVendors: vendors.filter((v) => !v.user.active || v.approval !== "APPROVED").length,
    visits: visits.filter((v) => v.status === "VERIFIED").length,
    pendingVisits: visits.filter((v) => v.status === "PENDING").length,
    purchases: verified.length,
    salesPaise: verified.reduce((sum, t) => sum + t.amountPaise, 0),
    pendingTransactions: purchases.filter((t) => ["PENDING", "CONFIRMED"].includes(t.status))
      .length,
    verifiedTransactions: verified.length,
    generatedPaise: sumCash(),
    pendingPaise: sumCash("PENDING"),
    approvedPaise: sumCash("APPROVED"),
    paidPaise: sumCash("PAID"),
    monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    topVendors: [...topVendors.values()].sort((a, b) => b.salesPaise - a.salesPaise).slice(0, 5),
    conversion: visits.filter((v) => v.status === "VERIFIED").length
      ? Math.round(
          (visits.filter((v) => v.status === "VERIFIED" && verified.some((t) => t.visitId === v.id))
            .length /
            visits.filter((v) => v.status === "VERIFIED").length) *
            100,
        )
      : 0,
    recentTransactions: await db.transaction.findMany({
      where: { ...own, ...range },
      include: transactionInclude,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    pendingApprovals: vendors
      .filter((v) => v.approval === "PENDING")
      .map((v) => ({ id: v.userId, name: v.businessName })),
  });
});
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^\s*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
async function reportSummary(req: Request) {
  const where = await transactionWhere(req);
  const own = await scope(req);
  const customerId =
    actor(req).role === "ADMIN" && req.query.customerId ? id(req.query.customerId) : own.customerId;
  const vendorId =
    actor(req).role === "ADMIN" && req.query.vendorId ? id(req.query.vendorId) : own.vendorId;
  const [purchases, visits] = await Promise.all([
    db.transaction.findMany({ where, include: transactionInclude, take: 10000 }),
    db.visit.findMany({
      where: {
        ...dateFilter(req),
        ...(customerId ? { customerId } : {}),
        ...(vendorId ? { vendorId } : {}),
        vendor: {
          ...(req.query.category ? { category: String(req.query.category) } : {}),
          ...(req.query.city ? { user: { city: String(req.query.city) } } : {}),
        },
      },
      include: { customer: { select: publicCustomer }, vendor: { select: publicVendor } },
      take: 10000,
    }),
  ]);
  type Row = {
    id: number;
    name: string;
    reference: string;
    visits: number;
    purchases: number;
    salesPaise: number;
    pendingPaise: number;
    approvedPaise: number;
    paidPaise: number;
  };
  const customerRows = new Map<number, Row>(),
    vendorRows = new Map<number, Row>();
  const row = (map: Map<number, Row>, entityId: number, name: string, reference = "") => {
    if (!map.has(entityId))
      map.set(entityId, {
        id: entityId,
        name,
        reference,
        visits: 0,
        purchases: 0,
        salesPaise: 0,
        pendingPaise: 0,
        approvedPaise: 0,
        paidPaise: 0,
      });
    return map.get(entityId)!;
  };
  // Admin account reports include members/businesses with no activity as well.
  if (actor(req).role === "ADMIN") {
    const [customers, vendors] = await Promise.all([
      db.customer.findMany({
        where: {
          ...(customerId ? { id: customerId } : {}),
          ...(req.query.city ? { user: { city: String(req.query.city) } } : {}),
        },
        select: publicCustomer,
        take: 10000,
      }),
      db.vendor.findMany({
        where: {
          ...(vendorId ? { id: vendorId } : {}),
          ...(req.query.category ? { category: String(req.query.category) } : {}),
          ...(req.query.city ? { user: { city: String(req.query.city) } } : {}),
        },
        select: publicVendor,
        take: 10000,
      }),
    ]);
    customers.forEach((c) => row(customerRows, c.id, c.user.name, c.reference || ""));
    vendors.forEach((v) => row(vendorRows, v.id, v.businessName));
  }
  for (const visit of visits)
    if (visit.status === "VERIFIED") {
      row(customerRows, visit.customerId, visit.customer.user.name, visit.customer.reference || "")
        .visits++;
      row(vendorRows, visit.vendorId, visit.vendor.businessName).visits++;
    }
  for (const p of purchases) {
    const rows = [
      row(customerRows, p.customerId, p.customer.user.name, p.customer.reference || ""),
      row(vendorRows, p.vendorId, p.vendor.businessName),
    ];
    for (const r of rows)
      if (p.status === "VERIFIED") {
        r.purchases++;
        r.salesPaise += p.amountPaise;
        if (p.cashback?.status === "PENDING") r.pendingPaise += p.cashback.amountPaise;
        if (p.cashback?.status === "APPROVED") r.approvedPaise += p.cashback.amountPaise;
        if (p.cashback?.status === "PAID") r.paidPaise += p.cashback.amountPaise;
      }
  }
  const daily = new Map<
    string,
    { day: string; transactions: number; verified: number; salesPaise: number }
  >();
  for (const p of purchases) {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(p.createdAt);
    const r = daily.get(day) || { day, transactions: 0, verified: 0, salesPaise: 0 };
    r.transactions++;
    if (p.status === "VERIFIED") {
      r.verified++;
      r.salesPaise += p.amountPaise;
    }
    daily.set(day, r);
  }
  const accounts =
    actor(req).role === "ADMIN"
      ? {
          customers: await db.user.count({ where: { role: "CUSTOMER" } }),
          activeCustomers: await db.user.count({ where: { role: "CUSTOMER", active: true } }),
          vendors: await db.vendor.count(),
        }
      : null;
  return {
    customers: [...customerRows.values()],
    vendors: [...vendorRows.values()].sort((a, b) => b.salesPaise - a.salesPaise),
    daily: [...daily.values()].sort((a, b) => b.day.localeCompare(a.day)),
    accounts,
  };
}
app.get("/api/reports/summary", roles("ADMIN", "VENDOR"), async (req, res) =>
  send(res, await reportSummary(req)),
);
app.get("/api/reports/export", async (req, res) => {
  const kind = z
    .enum(["transactions", "customers", "vendors", "daily"])
    .parse(req.query.kind || "transactions");
  if (kind !== "transactions") {
    if (!["ADMIN", "VENDOR"].includes(actor(req).role))
      throw new AppError(403, "Report not available for your role.");
    const summary = await reportSummary(req);
    const rows =
      kind === "daily"
        ? summary.daily.map((r) => [
            r.day,
            r.transactions,
            r.verified,
            (r.salesPaise / 100).toFixed(2),
          ])
        : summary[kind].map((r) => [
            r.id,
            r.name,
            r.reference,
            r.visits,
            r.purchases,
            (r.salesPaise / 100).toFixed(2),
            (r.pendingPaise / 100).toFixed(2),
            (r.approvedPaise / 100).toFixed(2),
            (r.paidPaise / 100).toFixed(2),
          ]);
    const header =
      kind === "daily"
        ? ["Date (IST)", "Transactions", "Verified purchases", "Verified sales INR"]
        : [
            "ID",
            "Name",
            "Reference",
            "Verified visits",
            "Verified purchases",
            "Verified sales INR",
            "Pending cashback INR",
            "Approved cashback INR",
            "Paid cashback INR",
          ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="namaste-bharat-${kind}.csv"`);
    res.send("\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"));
    return;
  }
  const purchases = await db.transaction.findMany({
    where: await transactionWhere(req),
    include: transactionInclude,
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  const header = [
    "ID",
    "Customer reference",
    "Vendor",
    "Bill number",
    "Date",
    "Status",
    "Purchase INR",
    "Cashback rate %",
    "Cashback INR",
    "Cashback status",
    "Payment reference",
  ];
  const rows = purchases.map((t) => [
    t.id,
    t.customer.reference,
    t.vendor.businessName,
    t.billNumber,
    t.billDate.toISOString(),
    t.status,
    (t.amountPaise / 100).toFixed(2),
    (t.rateBps / 100).toFixed(2),
    t.cashback ? (t.cashback.amountPaise / 100).toFixed(2) : "",
    t.cashback?.status || "",
    t.cashback?.payment?.reference || "",
  ]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="namaste-bharat-transactions.csv"');
  res.send("\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"));
});
app.use("/api", (_req, _res, next) => next(new AppError(404, "API endpoint not found.")));
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  let status = 500,
    message = "An unexpected error occurred. Please try again.";
  if (error instanceof AppError) {
    status = error.status;
    message = error.message;
  } else if (error instanceof z.ZodError) {
    status = 400;
    message = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  } else if (error instanceof multer.MulterError) {
    status = 400;
    message =
      error.code === "LIMIT_FILE_SIZE" ? "File must be smaller than 5 MB." : "Invalid file upload.";
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      status = 409;
      message = "A record already exists with this email, mobile, bill number or identity.";
    }
    if (error.code === "P2025") {
      status = 404;
      message = "Record not found.";
    }
    if (error.code === "P2034") {
      status = 409;
      message = "Another request changed this record. Refresh and retry.";
    }
  } else if (error instanceof SyntaxError) {
    status = 400;
    message = "Invalid JSON request.";
  }
  if (status === 500) console.error(error instanceof Error ? error.message : "Internal error");
  res.status(status).json({ error: { message } });
});
