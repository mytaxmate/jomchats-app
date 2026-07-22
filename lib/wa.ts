import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

// ============================================================================
// WhatsApp Cloud API client (§6, §14). Send text, mark read; verify webhook
// signatures. All server-only. Graph API version is pinned but easy to bump.
// ============================================================================

const GRAPH = "https://graph.facebook.com/v21.0";

/** Verify Meta's X-Hub-Signature-256 over the raw request body (timing-safe). */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const appSecret = env.metaAppSecret();
  if (!appSecret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function call(body: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const phoneId = env.metaPhoneNumberId();
  const token = env.metaWaToken();
  if (!phoneId || !token) return { ok: false, error: "wa_not_configured" };
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });
    const j = (await res.json()) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: j.error?.message ?? `http_${res.status}` };
    return { ok: true, id: j.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "wa_error" };
  }
}

export function sendText(to: string, body: string) {
  return call({ to, type: "text", text: { preview_url: false, body } });
}

export async function markRead(messageId: string): Promise<void> {
  const phoneId = env.metaPhoneNumberId();
  const token = env.metaWaToken();
  if (!phoneId || !token) return;
  try {
    await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
    });
  } catch {
    /* best-effort */
  }
}

/** Natural pacing per bubble (§6 step 9): min(1.2 + chars/60, 4) seconds. */
export function pacingMs(text: string): number {
  return Math.round(Math.min(1.2 + text.length / 60, 4) * 1000);
}
