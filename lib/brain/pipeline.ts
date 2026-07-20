import "server-only";
import { db, TENANT_ID } from "../db";
import { askJSON, MODELS } from "../anthropic";
import { retrieve, renderEvidence } from "./retrieval";
import { loadSettings } from "./settings";
import {
  personaSystem,
  draftUser,
  DETECT_SYSTEM,
  detectUser,
  VERIFY_SYSTEM,
  verifyUser,
} from "./prompts";
import { numericCheck } from "./numeric";
import type {
  DetectResult,
  DraftResult,
  VerifyResult,
  PipelineTrace,
  PipelineAction,
} from "./types";

const FALLBACK = "Good question — let me check with the team and come back to you 👍";
const HANDOVER_MSG = "Let me bring in my colleague on this one — one moment ya 🙏";

// Confidence gates (§6 step 9)
const CONF_SEND = 0.75;
const CONF_QA = 0.5;
// Retrieval floor (§6 step 5): min top fact score to attempt a draft.
// Kept gentle — the verifier + numeric check are the real hallucination gates,
// and unknown sensitive topics are already routed to handover before retrieval.
const RETRIEVAL_FLOOR = 0.9;

interface RunOpts {
  history?: string; // prior turns as "customer: ..\naisha: .." lines
  conversationId?: string | null;
  log?: boolean; // write ai_turns (default true)
}

/**
 * Run one turn through the full pipeline (§6). Returns a complete trace.
 * Any factual answer must survive: retrieval floor → verifier → numeric check.
 * If ANY guard fails, the bot falls back honestly and hands over — never guesses.
 */
export async function runPipeline(
  message: string,
  opts: RunOpts = {}
): Promise<PipelineTrace> {
  const usage = { input: 0, output: 0, calls: 0 };
  const notes: string[] = [];
  const settings = await loadSettings();

  // ---- 1. Detect (FAST) --------------------------------------------------
  let detect: DetectResult;
  try {
    const r = await askJSON<DetectResult>({
      model: MODELS.fast(),
      system: DETECT_SYSTEM,
      user: detectUser(message, opts.history ?? ""),
      maxTokens: 400,
    });
    detect = normalizeDetect(r.data);
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    usage.calls++;
  } catch {
    // If the classifier itself fails, be safe: treat as a project question.
    detect = normalizeDetect({} as DetectResult);
    notes.push("detect_failed_defaulted");
  }

  const finish = (
    action: PipelineAction,
    reply: string[],
    extra: Partial<PipelineTrace> = {}
  ): PipelineTrace => {
    const trace: PipelineTrace = {
      action,
      language: detect.language,
      intent: detect.intent,
      reply_messages: reply,
      evidence_ids: extra.evidence_ids ?? [],
      detect,
      numeric_check: extra.numeric_check ?? { ok: true, orphans: [] },
      usage,
      notes,
      ...extra,
    };
    if (opts.log !== false) void logTurn(trace, opts.conversationId ?? null, settings.shadow);
    return trace;
  };

  // ---- 2. Route (guard rails before any drafting) ------------------------
  if (
    detect.wants_human ||
    detect.intent === "human_request" ||
    detect.intent === "negotiation" ||
    detect.intent === "financing_legal" ||
    detect.intent === "complaint" ||
    detect.sentiment <= settings.sentimentHandoverThreshold
  ) {
    return finish("handover", [afterHours(HANDOVER_MSG)], {
      handover_reason: handoverReasonFor(detect),
    });
  }

  // Sensitive topics: only a client-approved verbatim may answer; else handover.
  if (detect.sensitive_topic) {
    const v = await findVerbatim(detect.sensitive_topic, detect.language);
    if (v) {
      return finish("handover", [v], {
        handover_reason: undefined,
        notes: [...notes, `verbatim:${detect.sensitive_topic}`],
      } as Partial<PipelineTrace>);
    }
    return finish("handover", [afterHours(HANDOVER_MSG)], {
      handover_reason: `sensitive_no_verbatim:${detect.sensitive_topic}`,
    });
  }

  // Booking + media paths land in later phases; for now, hand to a human.
  if (detect.intent === "booking_request" || detect.intent === "reschedule_cancel") {
    return finish("handover", [HANDOVER_MSG], { handover_reason: "booking_pending_p4" });
  }
  if (detect.intent === "media_received") {
    return finish("handover", ["Thanks for sending that — let me get a colleague to take a look 🙏"], {
      handover_reason: "media_review",
    });
  }
  if (detect.intent === "greeting" || detect.intent === "smalltalk") {
    // Greetings don't need evidence — answer warmly, no facts stated.
    return finish("answered", [greeting(settings.persona.name)], { confidence: 0.9 });
  }

  // ---- 3. Retrieve (facts win) ------------------------------------------
  // Match on the clean English rephrasing (ms/zh/manglish → English facts).
  // Using query_en ALONE avoids the original message's filler words diluting the score.
  const retrievalQuery = detect.query_en?.trim() || message;
  const { evidence, topScore } = await retrieve(retrievalQuery, { limit: 6 });
  if (topScore < RETRIEVAL_FLOOR || evidence.length === 0) {
    notes.push(`retrieval_floor topScore=${topScore.toFixed(2)}`);
    await recordGap(message);
    return finish("blocked_fallback", [FALLBACK], {
      handover_reason: "no_knowledge",
      evidence_ids: [],
    });
  }
  const evidenceBlock = renderEvidence(evidence);

  // ---- 4. Draft (ANSWER, evidence-locked) --------------------------------
  let draft: DraftResult;
  try {
    const r = await askJSON<DraftResult>({
      model: MODELS.answer(),
      system: personaSystem(settings.persona),
      user: draftUser({ history: opts.history ?? "", evidence: evidenceBlock, message }),
      maxTokens: 700,
    });
    draft = r.data;
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    usage.calls++;
  } catch {
    return finish("blocked_fallback", [FALLBACK], { handover_reason: "draft_error" });
  }

  const reply = (draft.reply_messages ?? []).filter(Boolean);
  const evidenceIds = evidence.map((e) => e.ref);
  if (reply.length === 0) {
    return finish("blocked_fallback", [FALLBACK], {
      handover_reason: "empty_draft",
      draft,
      evidence_ids: evidenceIds,
    });
  }

  // If the drafter itself flagged a gap, respect it.
  if (draft.needs_human) {
    return finish("handover", reply.length ? reply : [afterHours(HANDOVER_MSG)], {
      handover_reason: draft.handover_reason || "model_needs_human",
      draft,
      evidence_ids: evidenceIds,
      confidence: draft.confidence,
    });
  }

  const replyText = reply.join(" ");

  // ---- 5. Verify (FAST, independent grounding gate) ----------------------
  let verify: VerifyResult;
  try {
    const r = await askJSON<VerifyResult>({
      model: MODELS.fast(),
      system: VERIFY_SYSTEM,
      user: verifyUser({ evidence: evidenceBlock, reply: replyText }),
      maxTokens: 500,
    });
    verify = r.data;
    usage.input += r.usage.input;
    usage.output += r.usage.output;
    usage.calls++;
  } catch {
    verify = { verdict: "unsupported", unsupported_claims: ["verifier_error"] };
  }
  if (verify.verdict !== "grounded") {
    return finish("verify_failed", [FALLBACK], {
      handover_reason: "verify_failed",
      draft,
      verify,
      evidence_ids: evidenceIds,
      confidence: draft.confidence,
    });
  }

  // ---- 6. Numeric echo check (code, not AI) ------------------------------
  const nc = numericCheck(
    replyText,
    evidence.map((e) => ({ numeric_values: e.numeric_values, text: e.text })),
    { allowText: message } // customer's own numbers are fair to echo when correcting
  );
  if (!nc.ok) {
    return finish("numeric_mismatch", [FALLBACK], {
      handover_reason: "numeric_mismatch",
      draft,
      verify,
      numeric_check: nc,
      evidence_ids: evidenceIds,
      confidence: draft.confidence,
    });
  }

  // ---- 7. Confidence gate + shadow override ------------------------------
  const conf = typeof draft.confidence === "number" ? draft.confidence : 0.7;
  if (conf < CONF_QA) {
    return finish("blocked_fallback", [FALLBACK], {
      handover_reason: "low_confidence",
      draft,
      verify,
      numeric_check: nc,
      evidence_ids: evidenceIds,
      confidence: conf,
    });
  }

  const finalReply = withDisclaimers(reply, evidence);
  const action: PipelineAction =
    settings.shadow ? "shadow_pending" : conf < CONF_SEND ? "answered_low_conf" : "answered";

  return finish(action, finalReply, {
    draft,
    verify,
    numeric_check: nc,
    evidence_ids: evidenceIds,
    confidence: conf,
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function normalizeDetect(d: Partial<DetectResult>): DetectResult {
  return {
    language: d.language ?? "en",
    query_en: d.query_en ?? "",
    intent: d.intent ?? "project_question",
    wants_human: !!d.wants_human,
    sensitive_topic: d.sensitive_topic ?? null,
    sentiment: typeof d.sentiment === "number" ? d.sentiment : 0,
    lead_fields: d.lead_fields ?? {},
    corrects_premise: !!d.corrects_premise,
  };
}

function handoverReasonFor(d: DetectResult): string {
  if (d.intent === "negotiation") return "negotiation";
  if (d.intent === "financing_legal") return "financing_legal";
  if (d.intent === "complaint") return "complaint";
  if (d.intent === "human_request" || d.wants_human) return "human_request";
  return "low_sentiment";
}

/** Append a fact's disclaimer once (e.g. price → indicative). */
function withDisclaimers(
  reply: string[],
  evidence: { disclaimer?: string | null }[]
): string[] {
  const disc = evidence.map((e) => e.disclaimer).find(Boolean);
  if (!disc) return reply;
  const already = reply.some((m) => m.toLowerCase().includes("indicative"));
  if (already) return reply;
  const out = [...reply];
  out[out.length - 1] = `${out[out.length - 1]}\n_(${disc})_`;
  return out;
}

function greeting(name: string): string {
  return `Hi! I'm ${name} from the AURUM @ Bandar Sunway team 😊 How can I help you today?`;
}

function afterHours(msg: string): string {
  return msg; // business-hours callback flow handled in P4
}

async function findVerbatim(topic: string, lang: string): Promise<string | null> {
  const { data } = await db()
    .from("verbatim_answers")
    .select("topic,trigger_patterns,answer_en,answer_ms,answer_zh,active")
    .eq("tenant_id", TENANT_ID())
    .eq("active", true);
  const rows = data ?? [];
  const match = rows.find(
    (r) =>
      (r.topic ?? "").includes(topic) ||
      (r.trigger_patterns ?? []).some((p: string) => p.includes(topic))
  );
  if (!match) return null;
  if (lang === "ms") return match.answer_ms || match.answer_en;
  if (lang === "zh") return match.answer_zh || match.answer_en;
  return match.answer_en;
}

async function recordGap(question: string): Promise<void> {
  // Log the unanswered question so it shows in the portal + digest (§6 step 5).
  try {
    await db().from("verbatim_answers").insert({
      tenant_id: TENANT_ID(),
      topic: `gap:auto`,
      trigger_patterns: [question.slice(0, 120)],
      active: false,
    });
  } catch {
    /* gap logging is best-effort */
  }
}

async function logTurn(
  trace: PipelineTrace,
  conversationId: string | null,
  shadow: boolean
): Promise<void> {
  const dbAction =
    trace.action === "answered" || trace.action === "answered_low_conf"
      ? shadow
        ? "shadow_pending"
        : "sent"
      : trace.action === "handover"
      ? "handover"
      : trace.action === "shadow_pending"
      ? "shadow_pending"
      : "blocked_fallback";
  try {
    await db().from("ai_turns").insert({
      tenant_id: TENANT_ID(),
      conversation_id: conversationId,
      intent: trace.intent,
      language: trace.language,
      retrieved: trace.evidence_ids.map((id) => ({ ref: id })),
      draft: trace.draft ?? null,
      verifier: trace.verify ?? null,
      numeric_check: trace.numeric_check,
      action: dbAction,
      model: MODELS.answer(),
      tokens_in: trace.usage.input,
      tokens_out: trace.usage.output,
    });
  } catch {
    /* logging must never break a reply */
  }
}
