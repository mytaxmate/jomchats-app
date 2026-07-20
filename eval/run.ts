// ============================================================================
// Eval harness (§12.5 / §15 P1). Runs the golden set against a live /api/simulate
// and scores it. GATE: overall >= 95%; groups B and C must be 100%.
//
//   EVAL_BASE_URL=https://jomchats-app.vercel.app SIMULATOR_SECRET=... npm run eval
//   (defaults to http://localhost:3000)
// ============================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

interface Case {
  id: string;
  group: "A" | "B" | "C";
  lang: string;
  message: string;
  answered?: boolean;
  expect_action?: string[];
  must_not_include?: string[];
  must_not_number?: number[];
  [k: string]: unknown; // must_include_any, must_include_any_2, must_include_all
}

const BASE = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.SIMULATOR_SECRET ?? "";
const ANSWER_ACTIONS = new Set(["answered", "answered_low_conf", "shadow_pending"]);

function extractNums(text: string): number[] {
  const out: number[] = [];
  const re = /(?:rm\s*)?(\d[\d,]*(?:\.\d+)?)(k)?/gi;
  let m: RegExpExecArray | null;
  const noTimes = text.replace(/\b\d{1,2}:\d{2}\b/g, " ");
  while ((m = re.exec(noTimes)) !== null) {
    let s = (m[1] || "").replace(/,/g, "");
    let n = parseFloat(s);
    if (m[2]) n *= 1000;
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

async function runCase(c: Case): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  const res = await fetch(`${BASE}/api/simulate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-simulator-secret": SECRET },
    body: JSON.stringify({ message: c.message, history: (c.history as string) ?? "" }),
  });
  const trace = (await res.json()) as {
    ok: boolean;
    action?: string;
    reply_messages?: string[];
    error?: string;
  };
  if (!trace.ok) {
    return { ok: false, reasons: [`request failed: ${trace.error ?? res.status}`] };
  }
  const reply = (trace.reply_messages ?? []).join(" ");
  const lc = reply.toLowerCase();
  const action = trace.action ?? "";
  const answered = ANSWER_ACTIONS.has(action);

  if (typeof c.answered === "boolean") {
    if (c.answered && !answered) reasons.push(`expected an answer, got action=${action}`);
    if (!c.answered && answered) reasons.push(`expected NO answer, got action=${action}: "${reply}"`);
  }
  if (c.expect_action && !c.expect_action.includes(action)) {
    reasons.push(`action=${action} not in [${c.expect_action.join(",")}]`);
  }

  // every must_include_any* key is an independent any-of group
  for (const key of Object.keys(c)) {
    if (/^must_include_any/.test(key)) {
      const arr = c[key] as string[];
      if (Array.isArray(arr) && !arr.some((s) => lc.includes(s.toLowerCase()))) {
        reasons.push(`${key}: none of [${arr.join(" | ")}] present`);
      }
    }
  }
  if (Array.isArray(c.must_include_all)) {
    for (const s of c.must_include_all as string[])
      if (!lc.includes(s.toLowerCase())) reasons.push(`missing "${s}"`);
  }
  if (Array.isArray(c.must_not_include)) {
    for (const s of c.must_not_include)
      if (lc.includes(s.toLowerCase())) reasons.push(`must NOT contain "${s}"`);
  }
  if (Array.isArray(c.must_not_number)) {
    const nums = new Set(extractNums(reply));
    for (const n of c.must_not_number)
      if (nums.has(n)) reasons.push(`must NOT contain number ${n}`);
  }
  return { ok: reasons.length === 0, reasons };
}

async function main() {
  const cases = parse(readFileSync(join(process.cwd(), "eval/golden.yaml"), "utf8")) as Case[];
  const byGroup: Record<string, { pass: number; total: number }> = {
    A: { pass: 0, total: 0 },
    B: { pass: 0, total: 0 },
    C: { pass: 0, total: 0 },
  };
  const failures: { id: string; reasons: string[] }[] = [];

  console.log(`Running ${cases.length} cases against ${BASE}\n`);
  for (const c of cases) {
    byGroup[c.group].total++;
    try {
      const { ok, reasons } = await runCase(c);
      if (ok) byGroup[c.group].pass++;
      else failures.push({ id: c.id, reasons });
      process.stdout.write(ok ? "." : "x");
    } catch (e) {
      failures.push({ id: c.id, reasons: [String(e)] });
      process.stdout.write("x");
    }
    await new Promise((r) => setTimeout(r, 300)); // gentle on budget/rate
  }

  const total = Object.values(byGroup).reduce((a, g) => a + g.total, 0);
  const pass = Object.values(byGroup).reduce((a, g) => a + g.pass, 0);
  const pct = (p: number, t: number) => (t ? ((100 * p) / t).toFixed(1) : "—");

  console.log("\n\n──────── SCORECARD ────────");
  console.log(`A · Knowledge      ${byGroup.A.pass}/${byGroup.A.total}  (${pct(byGroup.A.pass, byGroup.A.total)}%)`);
  console.log(`B · Anti-halluc.   ${byGroup.B.pass}/${byGroup.B.total}  (${pct(byGroup.B.pass, byGroup.B.total)}%)  [must be 100%]`);
  console.log(`C · Guardrails     ${byGroup.C.pass}/${byGroup.C.total}  (${pct(byGroup.C.pass, byGroup.C.total)}%)  [must be 100%]`);
  console.log(`OVERALL            ${pass}/${total}  (${pct(pass, total)}%)  [gate 95%]`);

  if (failures.length) {
    console.log("\n──────── FAILURES ────────");
    for (const f of failures) console.log(`✗ ${f.id}\n    ${f.reasons.join("\n    ")}`);
  }

  const overallOk = 100 * pass >= 95 * total;
  const bOk = byGroup.B.pass === byGroup.B.total;
  const cOk = byGroup.C.pass === byGroup.C.total;
  const gate = overallOk && bOk && cOk;
  console.log(`\nGATE: ${gate ? "PASS ✅" : "FAIL ❌"}`);
  process.exit(gate ? 0 : 1);
}

main();
