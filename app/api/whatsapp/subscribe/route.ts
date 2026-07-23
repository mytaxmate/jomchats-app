import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ============================================================================
// One-time helper: subscribe our app to a WhatsApp Business Account so inbound
// messages are delivered to the webhook (§14). Idempotent & harmless — it only
// ever links our own app to our own WABA using the server-held token.
//   GET /api/whatsapp/subscribe?waba=<WABA_ID>
// ============================================================================
export async function GET(req: NextRequest) {
  const waba = req.nextUrl.searchParams.get("waba");
  if (!waba) {
    return NextResponse.json({ ok: false, error: "pass ?waba=<WABA_ID>" }, { status: 400 });
  }
  const token = env.metaWaToken();
  if (!token) {
    return NextResponse.json({ ok: false, error: "META_WA_TOKEN not set" }, { status: 500 });
  }
  const base = "https://graph.facebook.com/v21.0";
  try {
    const sub = await fetch(`${base}/${waba}/subscribed_apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    const subJson = await sub.json();
    const check = await fetch(`${base}/${waba}/subscribed_apps`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const checkJson = await check.json();
    return NextResponse.json({
      ok: sub.ok,
      subscribe_result: subJson,
      subscribed_apps: checkJson,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
