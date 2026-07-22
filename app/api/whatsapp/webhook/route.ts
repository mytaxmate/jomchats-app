import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySignature } from "@/lib/wa";
import { handleInbound, type Inbound } from "@/lib/brain/handle";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** GET: Meta webhook verification handshake. */
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const challenge = p.get("hub.challenge");
  if (mode === "subscribe" && token && token === env.metaVerifyToken()) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

/** POST: receive events. Validate signature → 200 fast → process after(). */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifySignature(raw, sig)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed bodies, don't retry
  }

  const inbound = extractMessages(payload);
  if (inbound.length > 0) {
    after(async () => {
      for (const m of inbound) {
        try {
          await handleInbound(m);
        } catch {
          /* one bad message must not break the batch */
        }
      }
    });
  }

  return NextResponse.json({ ok: true }); // always 200 so Meta doesn't retry
}

// ---- payload parsing --------------------------------------------------------
interface WebhookPayload {
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
}

function extractMessages(p: WebhookPayload): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages) continue;
      const name = v.contacts?.[0]?.profile?.name;
      for (const msg of v.messages) {
        if (!msg.from || !msg.id) continue;
        // pilot: text only. Non-text handled gracefully by the pipeline route.
        const body = msg.type === "text" ? msg.text?.body ?? "" : `[${msg.type}]`;
        out.push({ from: msg.from, name, wamid: msg.id, text: body });
      }
    }
  }
  return out;
}
