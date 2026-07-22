import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// ============================================================================
// Portal auth (pilot). A single shared PORTAL_PASSWORD gates the whole portal;
// on login we set an httpOnly cookie holding an HMAC token (never the password).
// Supabase email-OTP for seeded staff (§11) is the P3-final upgrade.
// ============================================================================

export const PORTAL_COOKIE = "jc_portal";

function secret(): string {
  return process.env.PORTAL_PASSWORD ?? "";
}

/** The opaque cookie value we set after a correct password. */
export function portalToken(): string {
  return createHmac("sha256", secret() || "unset")
    .update("jomchats-portal-v1")
    .digest("base64url");
}

/** Is this the correct portal password? (timing-safe) */
export function passwordOk(input: string): boolean {
  const pw = secret();
  if (!pw) return false; // portal stays locked until PORTAL_PASSWORD is set
  const a = Buffer.from(input);
  const b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Is this cookie value a valid portal session? */
export function cookieOk(value: string | undefined): boolean {
  if (!secret() || !value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(portalToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function portalConfigured(): boolean {
  return secret().length > 0;
}
