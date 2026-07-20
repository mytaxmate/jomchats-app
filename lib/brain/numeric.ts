// ============================================================================
// Numeric echo check (§6 step 8, anti-hallucination layer 6).
// Deterministic, no AI. Every number the bot says MUST trace to used evidence.
// This single check kills the worst class of hallucination (invented prices,
// psf = 265000/550, fake installments, "15k rebate", etc.).
//
// Pure functions only — heavily unit-tested (this is a known bug farm).
// ============================================================================

/**
 * Normalize one raw numeric token to a canonical number.
 *  "RM265,000" -> 265000 | "265k" -> 265000 | "550" -> 550 | "2.5" -> 2.5
 *  "1,199" -> 1199 | "3 ribu" handled by caller-level regex (see extractNumbers)
 * Returns null if it isn't really a number.
 */
export function normalizeToken(raw: string): number | null {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^rm\s*/i, ""); // strip currency
  s = s.replace(/[, ]/g, ""); // strip thousands separators / spaces
  let mult = 1;
  if (/k$/.test(s)) {
    mult = 1000;
    s = s.replace(/k$/, "");
  }
  if (s === "" || !/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract every number-bearing token from free text, returning canonical values.
 * Handles: RM265,000 · 265k · 265 ribu/rb · 1,199 · 550 · ranges "L10-44" (→10,44)
 * · 2BR/2-bath (→2,2). Times like "2:00" split to 2 and 0 are intentionally
 * excluded by the pattern (colon-separated groups are skipped).
 */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  if (!text) return out;

  // "265 ribu" / "3 rb" / "2 juta"  -> multiply
  const wordMult = text.replace(
    /(\d[\d,\.]*)\s*(ribu|rb|k)\b/gi,
    (_m, num) => {
      const n = normalizeToken(String(num));
      if (n !== null) out.push(n * 1000);
      return " "; // consume so the base pattern doesn't double-count
    }
  ).replace(/(\d[\d,\.]*)\s*(juta|million|mil)\b/gi, (_m, num) => {
    const n = normalizeToken(String(num));
    if (n !== null) out.push(n * 1_000_000);
    return " ";
  });

  // Skip clock times (e.g. 2:00, 14:30) — split by colon-adjacency.
  const noTimes = wordMult.replace(/\b\d{1,2}:\d{2}\b/g, " ");

  // Base pattern: optional RM, digits with commas/decimals, optional k.
  const re = /(?:rm\s*)?(\d[\d,]*(?:\.\d+)?)(k)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noTimes)) !== null) {
    const token = (m[1] || "") + (m[2] || "");
    const n = normalizeToken(token);
    if (n !== null) out.push(n);
  }
  return out;
}

/** Digits-only signature of a string, for substring containment checks. */
function digitsOnly(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export interface NumericEvidence {
  numeric_values: number[];
  text: string;
}

export interface NumericCheckResult {
  ok: boolean;
  orphans: number[]; // numbers in the reply not justified by evidence
}

/**
 * A reply number is JUSTIFIED if either:
 *  (a) it equals a value in used evidence's numeric_values[], or
 *  (b) its digit-signature appears inside a used evidence text (covers phones,
 *      exact strings like "L10-44", "550 sq ft", contact numbers).
 * Any unjustified number => orphan => the caller must BLOCK + handover.
 */
export function numericCheck(
  reply: string,
  evidence: NumericEvidence[],
  opts: { allowText?: string } = {}
): NumericCheckResult {
  const replyNums = extractNumbers(reply);
  if (replyNums.length === 0) return { ok: true, orphans: [] };

  const allowedValues = new Set<number>();
  for (const e of evidence) for (const v of e.numeric_values) allowedValues.add(v);
  // Numbers the CUSTOMER typed are allowed too — echoing them back to correct a
  // false premise ("we don't have an 800 sq ft unit, only 550") is not a hallucination.
  for (const n of extractNumbers(opts.allowText ?? "")) allowedValues.add(n);

  const evidenceDigitBlob =
    evidence.map((e) => digitsOnly(e.text)).join("|") +
    "|" + digitsOnly(opts.allowText ?? "");
  const evidenceValueDigits = new Set<string>();
  for (const e of evidence)
    for (const v of e.numeric_values) evidenceValueDigits.add(digitsOnly(String(v)));

  const orphans: number[] = [];
  for (const n of replyNums) {
    if (allowedValues.has(n)) continue;
    const sig = digitsOnly(String(n));
    // Small integers (0–10) are structural ("2 bedrooms", "1 block"): allow only
    // if they actually appear in evidence values OR text — never blanket-allow.
    if (sig && (evidenceDigitBlob.includes(sig) || evidenceValueDigits.has(sig))) continue;
    orphans.push(n);
  }
  return { ok: orphans.length === 0, orphans };
}
