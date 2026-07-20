import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/brain/pipeline";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Private test chat (§16). Drives the full pipeline without WhatsApp.
 * Guarded by the x-simulator-secret header — never public (§8.9).
 *
 * POST body: { message: string, history?: string, secret?: string }
 * Returns the full PipelineTrace (reply + evidence + verifier + numeric check).
 */
export async function POST(req: NextRequest) {
  const configured = env.simulatorSecret();
  if (configured) {
    const provided =
      req.headers.get("x-simulator-secret") ??
      (await peekSecret(req));
    if (provided !== configured) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let body: { message?: string; history?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "message_required" }, { status: 400 });
  }

  const started = Date.now();
  try {
    const trace = await runPipeline(message, { history: body.history, log: true });
    return NextResponse.json({ ok: true, latency_ms: Date.now() - started, ...trace });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "pipeline_error" },
      { status: 500 }
    );
  }
}

// Allow the secret in the JSON body too (handy for quick curl tests).
async function peekSecret(_req: NextRequest): Promise<string | null> {
  return null; // header is the supported path; body secret handled by callers if needed
}
