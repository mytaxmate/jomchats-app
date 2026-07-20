import "server-only";
import { db, TENANT_ID } from "../db";
import type { EvidenceLine, Fact } from "./types";

// ============================================================================
// Retrieval (§6 step 5). P1a: curated facts win (anti-hallucination layer 1).
// Facts are matched by keyword overlap against their question_forms/key/value.
// Chunk (pgvector) retrieval is added in P1b for depth beyond the 20 facts.
// ============================================================================

const STOP = new Set([
  "the", "a", "an", "is", "are", "of", "for", "to", "at", "in", "on", "and",
  "or", "how", "much", "what", "whats", "how's", "got", "have", "has", "do",
  "does", "can", "i", "you", "it", "this", "that", "there", "please", "ya",
  "leh", "ah", "lah", "ke", "kah", "yang", "apa", "berapa", "ada", "boleh",
  "的", "吗", "是", "有", "多少",
]);

export function tokenize(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Score a fact against the query tokens. Question-form hits weigh most. */
export function scoreFact(queryTokens: string[], fact: Fact): number {
  if (queryTokens.length === 0) return 0;
  const q = new Set(queryTokens);
  const formTokens = new Set(fact.question_forms.flatMap(tokenize));
  const keyTokens = new Set(tokenize(fact.key.replace(/[._]/g, " ")));
  const valueTokens = new Set(tokenize(fact.value));

  let score = 0;
  for (const t of q) {
    if (formTokens.has(t)) score += 3;
    else if (keyTokens.has(t)) score += 2;
    else if (valueTokens.has(t)) score += 1;
  }
  // normalize lightly by query length so long questions don't inflate
  return score / Math.sqrt(q.size);
}

export interface RetrievalResult {
  evidence: EvidenceLine[];
  topScore: number;
  usedFacts: Fact[];
}

/**
 * Retrieve the best facts for a message. Returns an ordered evidence block plus
 * the top score, so the pipeline can enforce the retrieval floor (§6 step 5).
 */
export async function retrieve(
  message: string,
  opts: { limit?: number; floor?: number } = {}
): Promise<RetrievalResult> {
  const limit = opts.limit ?? 6;
  const supa = db();

  const { data, error } = await supa
    .from("kb_facts")
    .select("id,key,question_forms,value,numeric_values,disclaimer,source,active")
    .eq("tenant_id", TENANT_ID())
    .eq("active", true);
  if (error) throw error;

  const facts = (data ?? []) as Fact[];
  const qTokens = tokenize(message);

  const ranked = facts
    .map((f) => ({ f, s: scoreFact(qTokens, f) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);

  const usedFacts = ranked.map((r) => r.f);
  const evidence: EvidenceLine[] = usedFacts.map((f, i) => ({
    ref: factRef(f, i),
    kind: "fact",
    text: f.value,
    numeric_values: f.numeric_values ?? [],
    disclaimer: f.disclaimer,
  }));

  // whats_new: always append active, non-expired rows as context.
  const nowIso = new Date().toISOString();
  const { data: news } = await supa
    .from("whats_new")
    .select("id,title,body,expires_at,active")
    .eq("tenant_id", TENANT_ID())
    .eq("active", true);
  for (const n of news ?? []) {
    if (n.expires_at && n.expires_at < nowIso) continue; // freshness (layer 9)
    evidence.push({
      ref: `N${n.id}`,
      kind: "whats_new",
      text: `${n.title}: ${n.body}`,
      numeric_values: [],
    });
  }

  return { evidence, topScore: ranked[0]?.s ?? 0, usedFacts };
}

function factRef(f: Fact, i: number): string {
  // Prefer a stable Fxx style if the key hints one, else positional.
  return `F${String(i + 1).padStart(2, "0")}`;
}

/** Render the evidence block the drafter + verifier both see. */
export function renderEvidence(evidence: EvidenceLine[]): string {
  if (evidence.length === 0) return "(no evidence found)";
  return evidence
    .map((e) => {
      const disc = e.disclaimer ? `  [disclaimer: ${e.disclaimer}]` : "";
      return `[${e.ref}] ${e.text}${disc}`;
    })
    .join("\n");
}
