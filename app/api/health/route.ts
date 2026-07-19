import { NextResponse } from "next/server";
import { db, TENANT_ID } from "@/lib/db";

export const dynamic = "force-dynamic"; // never cache; runs at request time
export const runtime = "nodejs";

// Lightweight self-check: DB reachable + facts seeded (§12.6).
export async function GET() {
  try {
    const supa = db();
    const { count, error } = await supa
      .from("kb_facts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", TENANT_ID())
      .eq("active", true);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      service: "jomchats-aurum",
      db: "reachable",
      active_facts: count ?? 0,
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
