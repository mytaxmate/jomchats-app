import "server-only";
import { db, TENANT_ID } from "../db";
import { sendText, markRead, pacingMs } from "../wa";
import { runPipeline } from "./pipeline";
import { loadSettings } from "./settings";

// ============================================================================
// Inbound WhatsApp message handler (§6). Runs inside the webhook's after() so
// the webhook can 200 immediately. Dedupe → guard rails → pipeline → send.
// In shadow mode NOTHING is sent (drafts land in the portal for approval).
// ============================================================================

export interface Inbound {
  from: string; // customer wa phone (E.164, no +)
  name?: string;
  wamid: string;
  text: string;
}

const STOP_WORDS = new Set(["stop", "berhenti", "unsubscribe", "henti"]);
const START_WORDS = new Set(["start", "mula"]);

export async function handleInbound(input: Inbound): Promise<void> {
  const supa = db();
  const tid = TENANT_ID();
  const text = (input.text ?? "").trim();

  // ---- contact (upsert by phone) ----
  const { data: existing } = await supa
    .from("contacts")
    .select("id,opted_out")
    .eq("tenant_id", tid)
    .eq("wa_phone", input.from)
    .maybeSingle();

  let contactId = existing?.id as string | undefined;
  let optedOut = existing?.opted_out ?? false;
  if (!contactId) {
    const { data: created } = await supa
      .from("contacts")
      .insert({ tenant_id: tid, wa_phone: input.from, wa_name: input.name ?? null })
      .select("id")
      .single();
    contactId = created?.id;
  }
  if (!contactId) return;

  // ---- conversation (open, or create) ----
  const { data: convo } = await supa
    .from("conversations")
    .select("id,mode")
    .eq("tenant_id", tid)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .maybeSingle();

  let conversationId = convo?.id as string | undefined;
  let mode = convo?.mode ?? "ai";
  if (!conversationId) {
    const { data: c } = await supa
      .from("conversations")
      .insert({ tenant_id: tid, contact_id: contactId, mode: "ai" })
      .select("id,mode")
      .single();
    conversationId = c?.id;
    mode = c?.mode ?? "ai";
  }
  if (!conversationId) return;

  // ---- dedupe on wamid (store inbound) ----
  const ins = await supa.from("messages").insert({
    tenant_id: tid,
    conversation_id: conversationId,
    wamid: input.wamid,
    direction: "in",
    sender: "customer",
    type: "text",
    body: text,
  });
  if (ins.error) return; // duplicate wamid or bad row → already handled / skip

  await supa
    .from("conversations")
    .update({ last_customer_msg_at: new Date().toISOString() })
    .eq("id", conversationId);
  void markRead(input.wamid);

  // ---- opt-out / opt-in (compliance — always honoured) ----
  const low = text.toLowerCase();
  if (STOP_WORDS.has(low)) {
    await supa.from("contacts").update({ opted_out: true }).eq("id", contactId);
    await sendReply(conversationId, ["You're unsubscribed — we won't message you again. Reply START anytime to resume. 🙏"], "system");
    return;
  }
  if (START_WORDS.has(low) && optedOut) {
    await supa.from("contacts").update({ opted_out: false }).eq("id", contactId);
    optedOut = false;
  }
  if (optedOut) return; // ignore everything except START while opted out

  // ---- rate limit: >20 inbound in 5 min → cool-down ----
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await supa
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .gte("created_at", since);
  if ((count ?? 0) > 20) {
    await sendReply(conversationId, ["Give me a moment to catch up 🙏 — I'll get a colleague to help you shortly."], "system");
    return;
  }

  // ---- human takeover: AI stays silent ----
  if (mode === "human") return;

  // ---- run the brain ----
  const history = await buildHistory(conversationId);
  const trace = await runPipeline(text, { history, conversationId, log: true });

  // ---- send (unless shadow mode) ----
  const settings = await loadSettings();
  if (settings.shadow) return; // drafts go to the portal approval queue

  await sendReply(conversationId, trace.reply_messages, "ai");
}

async function sendReply(conversationId: string, bubbles: string[], sender: "ai" | "system"): Promise<void> {
  const supa = db();
  const tid = TENANT_ID();
  for (const b of bubbles.filter(Boolean)) {
    const res = await sendText(await recipientOf(conversationId), b);
    await supa.from("messages").insert({
      tenant_id: tid,
      conversation_id: conversationId,
      wamid: res.id ?? null,
      direction: "out",
      sender,
      type: "text",
      body: b,
      status: res.ok ? "sent" : "failed",
      meta: res.ok ? {} : { error: res.error },
    });
    if (bubbles.length > 1) await sleep(pacingMs(b));
  }
}

async function recipientOf(conversationId: string): Promise<string> {
  const supa = db();
  const { data } = await supa
    .from("conversations")
    .select("contact_id, contacts(wa_phone)")
    .eq("id", conversationId)
    .single();
  const c = data as { contacts?: { wa_phone?: string } | { wa_phone?: string }[] } | null;
  const contact = Array.isArray(c?.contacts) ? c?.contacts[0] : c?.contacts;
  return contact?.wa_phone ?? "";
}

async function buildHistory(conversationId: string): Promise<string> {
  const { data } = await db()
    .from("messages")
    .select("direction,sender,body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(12);
  const rows = (data ?? []).reverse();
  return rows
    .filter((m) => m.body)
    .map((m) => `${m.direction === "in" ? "customer" : "aisha"}: ${m.body}`)
    .join("\n");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
