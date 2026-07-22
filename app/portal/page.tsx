import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, TENANT_ID } from "@/lib/db";
import { PORTAL_COOKIE, cookieOk } from "@/lib/portal";
import PortalShell, { type PortalData } from "./PortalShell";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PortalPage() {
  const jar = await cookies();
  if (!cookieOk(jar.get(PORTAL_COOKIE)?.value)) redirect("/portal/login");

  const data = await loadPortalData();
  return <PortalShell data={data} />;
}

async function loadPortalData(): Promise<PortalData> {
  const supa = db();
  const tid = TENANT_ID();

  const [turnsRes, factsRes, gapsRes, newsRes] = await Promise.all([
    supa
      .from("ai_turns")
      .select("id,intent,language,retrieved,draft,verifier,numeric_check,action,tokens_in,tokens_out,created_at")
      .eq("tenant_id", tid)
      .order("created_at", { ascending: false })
      .limit(120),
    supa
      .from("kb_facts")
      .select("id,key,value,numeric_values,disclaimer,source,active")
      .eq("tenant_id", tid)
      .eq("active", true)
      .order("key"),
    supa
      .from("verbatim_answers")
      .select("id,topic,trigger_patterns,active")
      .eq("tenant_id", tid)
      .eq("active", false),
    supa
      .from("whats_new")
      .select("id,title,body,expires_at,active")
      .eq("tenant_id", tid)
      .eq("active", true),
  ]);

  const turns = (turnsRes.data ?? []) as PortalData["turns"];

  // ---- scorecard aggregates ----
  const total = turns.length;
  const isAnswer = (a: string) => a === "sent" || a === "shadow_pending";
  const answered = turns.filter((t) => isAnswer(t.action)).length;
  const handover = turns.filter((t) => t.action === "handover").length;
  const blocked = turns.filter((t) => t.action === "blocked_fallback").length;
  const grounded = turns.filter(
    (t) => isAnswer(t.action) && (t.verifier as { verdict?: string } | null)?.verdict === "grounded"
  ).length;
  const numOk = turns.filter(
    (t) => isAnswer(t.action) && (t.numeric_check as { ok?: boolean } | null)?.ok !== false
  ).length;

  const confs = turns
    .map((t) => (t.draft as { confidence?: number } | null)?.confidence)
    .filter((c): c is number => typeof c === "number");
  const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

  const langCount: Record<string, number> = {};
  for (const t of turns) langCount[t.language || "?"] = (langCount[t.language || "?"] ?? 0) + 1;

  const reasonCount: Record<string, number> = {};
  for (const t of turns) {
    if (t.action === "handover" || t.action === "blocked_fallback") {
      const r =
        (t.draft as { handover_reason?: string } | null)?.handover_reason ??
        (t.action === "blocked_fallback" ? "no_knowledge" : "handover");
      reasonCount[r] = (reasonCount[r] ?? 0) + 1;
    }
  }

  return {
    turns,
    facts: (factsRes.data ?? []) as PortalData["facts"],
    gaps: (gapsRes.data ?? []) as PortalData["gaps"],
    news: (newsRes.data ?? []) as PortalData["news"],
    stats: {
      total,
      answered,
      handover,
      blocked,
      grounded,
      numOk,
      aiResolvedPct: total ? Math.round((100 * answered) / total) : 0,
      avgConf,
      langCount,
      reasonCount,
      wrongAnswers: 0, // no human "wrong" verdicts yet (QA review is P3-next)
    },
  };
}
