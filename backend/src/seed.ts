import bcrypt from "bcryptjs";
import { db } from "./db.js";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 12)
  throw new Error(
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) to create the initial administrator.",
  );
await db.user.upsert({
  where: { email },
  update: {},
  create: {
    email,
    mobile: process.env.ADMIN_MOBILE || "9000000000",
    name: "Super Admin",
    role: "ADMIN",
    passwordHash: await bcrypt.hash(password, 12),
  },
});
if (!(await db.cashbackSetting.count()))
  await db.cashbackSetting.create({ data: { rateBps: 1000 } });
console.log(
  "Administrator and cashback settings initialized. Existing passwords were not changed.",
);
await db.$disconnect();
