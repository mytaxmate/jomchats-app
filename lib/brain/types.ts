// Shared types for the message pipeline (§6). Kept dependency-free so the
// pure helpers (numeric, retrieval-merge) stay easy to unit-test.

export type Language = "en" | "ms" | "zh" | "other";

export type Intent =
  | "greeting"
  | "project_question"
  | "booking_request"
  | "reschedule_cancel"
  | "negotiation"
  | "financing_legal"
  | "complaint"
  | "human_request"
  | "smalltalk"
  | "media_received"
  | "other";

/** A curated, human-verified fact row (§5 kb_facts). */
export interface Fact {
  id: string;
  key: string;
  question_forms: string[];
  value: string;
  numeric_values: number[];
  disclaimer: string | null;
  source: string | null;
  active: boolean;
}

/** A retrieved chunk from an ingested document (§5 kb_chunks). Optional in P1a. */
export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  score: number;
}

/** One line in the evidence block handed to the drafter + verifier. */
export interface EvidenceLine {
  ref: string; // e.g. "F03" or "C12"
  kind: "fact" | "chunk" | "whats_new";
  text: string;
  numeric_values: number[];
  disclaimer?: string | null;
}

export interface DetectResult {
  language: Language;
  intent: Intent;
  wants_human: boolean;
  sensitive_topic: string | null; // e.g. "refund", "eligibility", "maintenance_fee"
  sentiment: number; // -1..1
  lead_fields: Record<string, string>;
  corrects_premise: boolean; // customer asserts something possibly false ("3-bedroom", "freehold")
}

export interface DraftResult {
  reply_messages: string[];
  used_evidence: string[];
  confidence: number;
  needs_human: boolean;
  handover_reason?: string;
  suggest_booking: boolean;
}

export interface VerifyResult {
  verdict: "grounded" | "unsupported";
  unsupported_claims: string[];
}

export type PipelineAction =
  | "answered"
  | "answered_low_conf" // sent but flagged for QA
  | "blocked_fallback" // no adequate evidence
  | "verify_failed"
  | "numeric_mismatch"
  | "handover"
  | "shadow_pending";

/** The full trace returned by /api/simulate and logged to ai_turns. */
export interface PipelineTrace {
  action: PipelineAction;
  language: Language;
  intent: Intent;
  reply_messages: string[];
  evidence_ids: string[];
  detect: DetectResult;
  draft?: DraftResult;
  verify?: VerifyResult;
  numeric_check: { ok: boolean; orphans: number[] };
  handover_reason?: string;
  confidence?: number;
  usage: { input: number; output: number; calls: number };
  notes: string[];
}
