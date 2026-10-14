import { z } from "zod";
import { AppError } from "./domain.js";

export const websiteAuthEnabled = process.env.WEBSITE_AUTH_ENABLED === "true";
const identitySchema = z.object({
  subject: z.string().min(1).max(190),
  role: z.enum(["VENDOR", "CUSTOMER"]),
  active: z.literal(true),
});

// The website must atomically consume a short-lived code bound to this CRM client.
// Identity comes only from the authenticated website backend, never browser input.
export async function exchangeWebsiteCode(code: string, state: string, redirectUri: string) {
  if (!websiteAuthEnabled) throw new AppError(404, "Website sign-in is not enabled.");
  const endpoint = process.env.WEBSITE_CODE_EXCHANGE_URL;
  const clientSecret = process.env.WEBSITE_AUTH_CLIENT_SECRET;
  const clientId = process.env.WEBSITE_AUTH_CLIENT_ID;
  if (!endpoint || !clientSecret || clientSecret.length < 32 || !clientId)
    throw new AppError(503, "Website sign-in is not configured.");
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new AppError(503, "Website sign-in requires a secure backend connection.");
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientSecret}` },
      body: JSON.stringify({ code, clientId, state, redirectUri }),
    });
    if (!response.ok)
      throw new AppError(401, "Website sign-in expired. Please sign in on the website again.");
    const identity = identitySchema.safeParse(await response.json());
    if (!identity.success)
      throw new AppError(401, "Website account is not eligible for CRM access.");
    return identity.data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "Website sign-in is temporarily unavailable.");
  }
}
