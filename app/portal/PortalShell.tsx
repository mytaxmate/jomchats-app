"use client";
import { useState } from "react";

// ---- types (shared with the server page) -----------------------------------
type Json = Record<string, unknown> | null;
export interface Turn {
  id: string;
  intent: string | null;
  language: string | null;
  retrieved: Json | { ref: string }[];
  draft: Json;
  verifier: Json;
  numeric_check: Json;
  action: string;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
}
export interface Fact {
  id: string;
  key: string;
  value: string;
  numeric_values: number[];
  disclaimer: string | null;
  source: string | null;
  active: boolean;
}
export interface PortalData {
  turns: Turn[];
  facts: Fact[];
  gaps: { id: string; topic: string; trigger_patterns: string[] | null; active: boolean }[];
  news: { id: string; title: string; body: string; expires_at: string | null; active: boolean }[];
  stats: {
    total: number;
    answered: number;
    handover: number;
    blocked: number;
    grounded: number;
    numOk: number;
    aiResolvedPct: number;
    avgConf: number | null;
    langCount: Record<string, number>;
    reasonCount: Record<string, number>;
    wrongAnswers: number;
  };
}

type Tab = "overview" | "answers" | "knowledge" | "test";

const LANG: Record<string, string> = { en: "EN", ms: "BM", zh: "中文", other: "•" };

export default function PortalShell({ data }: { data: PortalData }) {
  const [tab, setTab] = useState<Tab>("overview");

  async function logout() {
    await fetch("/api/portal/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ logout: true }),
    });
    window.location.href = "/portal/login";
  }

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="bubble">✦</span>
          <span className="word">JomChats</span>
        </div>
        <nav>
          {(
            [
              ["overview", "Overview", "◆"],
              ["answers", "Answers", "✦"],
              ["knowledge", "Knowledge", "❖"],
              ["test", "Test her", "◈"],
            ] as [Tab, string, string][]
          ).map(([id, label, glyph]) => (
            <button
              key={id}
              className={`nav ${tab === id ? "on" : ""}`}
              onClick={() => setTab(id)}
            >
              <span className="g">{glyph}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidefoot">
          <div className="tenant">
            <div className="tname">Aurum @ Bandar Sunway</div>
            <div className="tsub">Aisha · pilot tenant</div>
          </div>
          <button className="logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="top">
          <h1>{titleFor(tab)}</h1>
          <div className="topright">
            <span className="shadow">● Shadow mode — nothing auto-sends</span>
            <button className="refresh" onClick={() => window.location.reload()}>
              ↻ Refresh
            </button>
          </div>
        </header>

        {tab === "overview" && <Overview data={data} />}
        {tab === "answers" && <Answers turns={data.turns} />}
        {tab === "knowledge" && <Knowledge data={data} />}
        {tab === "test" && <TestHer />}
      </main>

      <Style />
    </div>
  );
}

function titleFor(t: Tab) {
  return { overview: "Overview", answers: "Answers — every reply, checked", knowledge: "Knowledge vault", test: "Test her" }[t];
}

// ---------------------------------------------------------------------------
// OVERVIEW
// ---------------------------------------------------------------------------
function Overview({ data }: { data: PortalData }) {
  const s = data.stats;
  const reasons = Object.entries(s.reasonCount).sort((a, b) => b[1] - a[1]);
  const maxReason = Math.max(1, ...reasons.map((r) => r[1]));
  return (
    <div className="pad">
      <div className="tiles">
        <div className="tile hero">
          <div className="spark">✦</div>
          <div className="big">{s.aiResolvedPct}%</div>
          <div className="lbl">Handled by AI</div>
          <div className="sub2">{s.answered} of {s.total} conversations</div>
        </div>
        <div className="tile">
          <div className="num">{s.total}</div>
          <div className="lbl">Conversations</div>
        </div>
        <div className="tile">
          <div className="num coral">{s.handover}</div>
          <div className="lbl">Passed to a human</div>
        </div>
        <div className="tile">
          <div className="num amber">{s.blocked}</div>
          <div className="lbl">Held back (unsure)</div>
        </div>
        <div className="tile">
          <div className="num good">{s.wrongAnswers}</div>
          <div className="lbl">Wrong answers ✓ target 0</div>
        </div>
      </div>

      {/* SIGNATURE: the guardrail funnel — every answer passes both checks */}
      <div className="panel">
        <div className="phead">The safety net · every AI answer passes both gates</div>
        <div className="funnel">
          <Stage n={s.answered} label="AI answered" glyph="✦" tone="teal" />
          <Arrow />
          <Stage n={s.grounded} label="Grounded in the vault" glyph="✓" tone="teal" />
          <Arrow />
          <Stage n={s.numOk} label="Every number verified" glyph="✓" tone="teal" />
        </div>
        <div className="pnote">
          If either gate fails, she falls back honestly and passes it to a human — she never guesses.
        </div>
      </div>

      <div className="two">
        <div className="panel">
          <div className="phead">Why she passed to a human</div>
          {reasons.length === 0 && <div className="empty">No handovers yet.</div>}
          {reasons.map(([r, n]) => (
            <div className="bar" key={r}>
              <div className="blbl">{prettyReason(r)}</div>
              <div className="track">
                <div
                  className="fill"
                  style={{ width: `${(100 * n) / maxReason}%`, background: reasonColor(r) }}
                />
              </div>
              <div className="bn">{n}</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="phead">Languages · avg confidence</div>
          <div className="chips">
            {Object.entries(s.langCount).map(([l, n]) => (
              <span className="chip" key={l}>
                {LANG[l] ?? l} <b>{n}</b>
              </span>
            ))}
          </div>
          <div className="conf">
            <div className="clbl">Average confidence</div>
            <div className="cbar">
              <div className="cfill" style={{ width: `${Math.round((s.avgConf ?? 0) * 100)}%` }} />
            </div>
            <div className="cval">{s.avgConf != null ? Math.round(s.avgConf * 100) + "%" : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stage({ n, label, glyph, tone }: { n: number; label: string; glyph: string; tone: string }) {
  return (
    <div className={`stage ${tone}`}>
      <div className="sg">{glyph}</div>
      <div className="sn">{n}</div>
      <div className="sl">{label}</div>
    </div>
  );
}
function Arrow() {
  return <div className="arrow">→</div>;
}

// ---------------------------------------------------------------------------
// ANSWERS
// ---------------------------------------------------------------------------
function Answers({ turns }: { turns: Turn[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (turns.length === 0)
    return <div className="pad"><div className="empty big">No conversations logged yet. Try the <b>Test her</b> tab.</div></div>;
  return (
    <div className="pad">
      <div className="list">
        {turns.map((t) => {
          const d = (t.draft ?? {}) as { reply_messages?: string[]; confidence?: number; used_evidence?: string[] };
          const v = (t.verifier ?? {}) as { verdict?: string; unsupported_claims?: string[] };
          const nc = (t.numeric_check ?? {}) as { ok?: boolean; orphans?: number[] };
          const reply = (d.reply_messages ?? []).join("  ·  ");
          const isOpen = open === t.id;
          return (
            <div className={`row ${isOpen ? "ropen" : ""}`} key={t.id}>
              <button className="rhead" onClick={() => setOpen(isOpen ? null : t.id)}>
                <span className={`pill ${actionTone(t.action)}`}>{actionLabel(t.action)}</span>
                <span className="lang">{LANG[t.language ?? "other"] ?? "•"}</span>
                <span className="intent">{t.intent ?? "—"}</span>
                <span className="preview">{reply || fallbackPreview(t.action)}</span>
                <span className="time">{fmtTime(t.created_at)}</span>
              </button>
              {isOpen && (
                <div className="trace">
                  {(d.reply_messages ?? []).length > 0 && (
                    <div className="tblock">
                      <div className="tk">Reply</div>
                      <div className="bubbles">
                        {(d.reply_messages ?? []).map((m, i) => (
                          <div className="bub" key={i}>{m}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid3">
                    <div className="gcell">
                      <div className="tk">Evidence used</div>
                      <div className="chips">
                        {evidenceRefs(t.retrieved).map((r) => (
                          <span className="chip mono" key={r}>{r}</span>
                        ))}
                        {evidenceRefs(t.retrieved).length === 0 && <span className="dim">—</span>}
                      </div>
                    </div>
                    <div className="gcell">
                      <div className="tk">Grounding check</div>
                      {v.verdict === "grounded" ? (
                        <span className="verdict ok">✓ grounded</span>
                      ) : v.verdict ? (
                        <span className="verdict bad">✕ {(v.unsupported_claims ?? []).join("; ") || "unsupported"}</span>
                      ) : (
                        <span className="dim">not run</span>
                      )}
                    </div>
                    <div className="gcell">
                      <div className="tk">Number check</div>
                      {nc.ok === false ? (
                        <span className="verdict bad">✕ {(nc.orphans ?? []).join(", ")}</span>
                      ) : (
                        <span className="verdict ok">✓ clean</span>
                      )}
                    </div>
                  </div>
                  <div className="metaline">
                    confidence {d.confidence != null ? Math.round(d.confidence * 100) + "%" : "—"} ·
                    {" "}{(t.tokens_in ?? 0) + (t.tokens_out ?? 0)} tokens
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KNOWLEDGE
// ---------------------------------------------------------------------------
function Knowledge({ data }: { data: PortalData }) {
  return (
    <div className="pad">
      <div className="panel">
        <div className="phead">Verified facts <span className="count">{data.facts.length}</span></div>
        <div className="facts">
          {data.facts.map((f) => (
            <div className="fact" key={f.id}>
              <div className="fkey">{f.key}</div>
              <div className="fval">{f.value}</div>
              <div className="fmeta">
                {f.numeric_values?.map((n, i) => (
                  <span className="chip mono" key={i}>{n.toLocaleString()}</span>
                ))}
                {f.disclaimer && <span className="disc">⚠ {f.disclaimer}</span>}
                <span className="src">✓ {f.source ?? "verified"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="two">
        <div className="panel">
          <div className="phead">Gaps · questions with no answer yet <span className="count coralc">{data.gaps.length}</span></div>
          {data.gaps.length === 0 && <div className="empty">No open gaps.</div>}
          {data.gaps.map((g) => (
            <div className="gaprow" key={g.id}>
              <span className="gtopic">{g.topic.replace(/^gap:/, "")}</span>
              <span className="gtrig">{(g.trigger_patterns ?? []).join(" · ")}</span>
            </div>
          ))}
          <div className="pnote">These route to a human until the client confirms an answer.</div>
        </div>
        <div className="panel">
          <div className="phead">What&apos;s new</div>
          {data.news.length === 0 && <div className="empty">No active promos.</div>}
          {data.news.map((n) => (
            <div className="gaprow" key={n.id}>
              <span className="gtopic amber">{n.title}</span>
              <span className="gtrig">{n.body}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEST HER
// ---------------------------------------------------------------------------
interface ChatMsg {
  who: "me" | "her";
  text: string[];
  trace?: { action: string; intent: string; evidence: string[]; verdict?: string; numeric?: boolean };
}
function TestHer() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState("");

  async function send() {
    const m = input.trim();
    if (!m || busy) return;
    setInput("");
    setMsgs((x) => [...x, { who: "me", text: [m] }]);
    setBusy(true);
    try {
      const r = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: m, history }),
      });
      const t = await r.json();
      const reply: string[] = t.reply_messages ?? ["(no reply)"];
      setMsgs((x) => [
        ...x,
        {
          who: "her",
          text: reply,
          trace: {
            action: t.action,
            intent: t.intent,
            evidence: t.evidence_ids ?? [],
            verdict: t.verify?.verdict,
            numeric: t.numeric_check?.ok !== false,
          },
        },
      ]);
      setHistory((h) => `${h}\ncustomer: ${m}\naisha: ${reply.join(" ")}`.trim().slice(-2000));
    } catch {
      setMsgs((x) => [...x, { who: "her", text: ["(error reaching the bot)"] }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pad">
      <div className="testwrap">
        <div className="chat">
          <div className="chatscroll">
            {msgs.length === 0 && (
              <div className="empty big">
                Ask Aisha anything a real Aurum buyer might — English, BM, Manglish or 中文.
                Try the tricky ones: <i>&ldquo;what&apos;s the psf?&rdquo;</i>, <i>&ldquo;got 3 bedroom?&rdquo;</i>, <i>&ldquo;can discount?&rdquo;</i>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.who}`}>
                {m.text.map((line, j) => (
                  <div className="mbub" key={j}>{line}</div>
                ))}
                {m.trace && (
                  <div className="mtrace">
                    <span className={`pill ${actionTone(m.trace.action)}`}>{actionLabel(m.trace.action)}</span>
                    <span className="tt">{m.trace.intent}</span>
                    {m.trace.evidence.length > 0 && <span className="tt mono">{m.trace.evidence.join(" ")}</span>}
                    {m.trace.verdict === "grounded" && <span className="tt ok">✓ grounded</span>}
                    {m.trace.numeric && <span className="tt ok">✓ numbers</span>}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="msg her"><div className="mbub typing">Aisha is typing…</div></div>}
          </div>
          <div className="composer">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Type a message…"
            />
            <button onClick={send} disabled={busy || !input.trim()}>Send</button>
          </div>
        </div>
        <div className="testnote">
          Every reply here runs the full pipeline — retrieve → draft → grounding check → number check.
          This is your &ldquo;why did she say that?&rdquo; view to show the client.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function actionTone(a: string) {
  if (a === "sent" || a === "shadow_pending") return "teal";
  if (a === "handover") return "coral";
  return "amber";
}
function actionLabel(a: string) {
  return (
    {
      sent: "✦ answered",
      shadow_pending: "✦ drafted",
      handover: "→ human",
      blocked_fallback: "held back",
      verify_failed: "held back",
      numeric_mismatch: "held back",
    } as Record<string, string>
  )[a] ?? a;
}
function fallbackPreview(a: string) {
  if (a === "handover") return "Passed to a human colleague";
  return "Held back — checking with the team";
}
function prettyReason(r: string) {
  return r.replace(/_/g, " ").replace(/:.*/, "").replace(/\bp4\b/, "");
}
function reasonColor(r: string) {
  if (r.includes("no_knowledge") || r.includes("verify") || r.includes("numeric")) return "#EFA22E";
  return "#FF5A3C";
}
function evidenceRefs(retrieved: Turn["retrieved"]): string[] {
  if (!Array.isArray(retrieved)) return [];
  return retrieved.map((r) => (r as { ref?: string }).ref ?? "").filter(Boolean);
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Kuala_Lumpur",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------
function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&display=swap');
      *{box-sizing:border-box}
      body{margin:0}
      .app{--ink:#031D41;--ink2:#0E2A55;--teal:#0A9AA7;--tealD:#077680;--tint:#E1F5F7;
        --paper:#F5F8FA;--coral:#FF5A3C;--amber:#EFA22E;--line:#E3E8EE;--muted:#52627B;--faint:#8A97AC;
        display:grid;grid-template-columns:248px 1fr;min-height:100dvh;
        font-family:Inter,system-ui,sans-serif;color:var(--ink);background:var(--paper)}
      /* sidebar */
      .side{background:var(--ink);color:#fff;display:flex;flex-direction:column;padding:22px 16px;position:sticky;top:0;height:100dvh}
      .brand{display:flex;align-items:center;gap:10px;padding:6px 8px 24px}
      .bubble{width:32px;height:32px;border-radius:50% 50% 50% 6px;background:var(--teal);color:#fff;
        display:grid;place-items:center;font-size:16px;box-shadow:0 4px 12px rgba(10,154,167,.45)}
      .word{font-family:'Bricolage Grotesque';font-weight:800;font-size:19px;letter-spacing:-.02em}
      nav{display:flex;flex-direction:column;gap:4px;flex:1}
      .nav{display:flex;align-items:center;gap:11px;padding:11px 12px;border:0;border-radius:11px;
        background:transparent;color:#B7C4DA;font-size:14.5px;font-weight:500;font-family:inherit;cursor:pointer;text-align:left;transition:.15s}
      .nav .g{width:18px;text-align:center;color:#6E82A6;font-size:13px}
      .nav:hover{background:var(--ink2);color:#fff}
      .nav.on{background:var(--teal);color:#fff}
      .nav.on .g{color:#fff}
      .sidefoot{border-top:1px solid rgba(255,255,255,.09);padding-top:16px;margin-top:12px}
      .tenant .tname{font-family:'Bricolage Grotesque';font-weight:700;font-size:14px}
      .tenant .tsub{color:#7C8DAB;font-size:12px;margin-top:2px}
      .logout{margin-top:14px;width:100%;padding:9px;border:1px solid rgba(255,255,255,.14);
        background:transparent;color:#B7C4DA;border-radius:9px;font-size:13px;font-family:inherit;cursor:pointer}
      .logout:hover{background:var(--ink2);color:#fff}
      /* main */
      .main{min-width:0}
      .top{display:flex;align-items:center;justify-content:space-between;padding:22px 30px;
        border-bottom:1px solid var(--line);background:#fff;position:sticky;top:0;z-index:5}
      .top h1{font-family:'Bricolage Grotesque';font-weight:700;font-size:22px;margin:0;letter-spacing:-.02em}
      .topright{display:flex;align-items:center;gap:14px}
      .shadow{color:var(--tealD);background:var(--tint);font-size:12.5px;font-weight:600;padding:6px 12px;border-radius:999px}
      .refresh{border:1px solid var(--line);background:#fff;border-radius:9px;padding:7px 13px;font-size:13px;font-family:inherit;cursor:pointer;color:var(--muted)}
      .refresh:hover{border-color:var(--teal);color:var(--tealD)}
      .pad{padding:26px 30px;max-width:1120px}
      /* tiles */
      .tiles{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1fr;gap:14px;margin-bottom:18px}
      .tile{background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px}
      .tile .num{font-family:'Bricolage Grotesque';font-weight:800;font-size:30px;letter-spacing:-.02em}
      .tile .lbl{color:var(--muted);font-size:12.5px;margin-top:6px}
      .num.coral{color:var(--coral)}.num.amber{color:var(--amber)}.num.good{color:var(--teal)}
      .tile.hero{background:linear-gradient(150deg,#0A9AA7,#077680);color:#fff;border:0;position:relative;overflow:hidden}
      .tile.hero .spark{position:absolute;right:14px;top:10px;font-size:38px;opacity:.28}
      .tile.hero .big{font-family:'Bricolage Grotesque';font-weight:800;font-size:46px;letter-spacing:-.03em;line-height:1}
      .tile.hero .lbl{color:#D6F3F5;font-size:14px;margin-top:8px;font-weight:600}
      .tile.hero .sub2{color:#B7E6EA;font-size:12.5px;margin-top:3px}
      /* panels */
      .panel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-bottom:18px}
      .phead{font-family:'Bricolage Grotesque';font-weight:700;font-size:15px;margin-bottom:16px;display:flex;align-items:center;gap:8px}
      .count{background:var(--tint);color:var(--tealD);font-size:12px;padding:2px 9px;border-radius:999px;font-family:Inter}
      .count.coralc{background:#FFE9E3;color:var(--coral)}
      .pnote{color:var(--faint);font-size:12.5px;margin-top:14px;line-height:1.5}
      .empty{color:var(--faint);font-size:13.5px;padding:6px 0}
      .empty.big{padding:40px;text-align:center;line-height:1.7;font-size:14.5px}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:18px}
      /* funnel */
      .funnel{display:flex;align-items:stretch;gap:12px}
      .stage{flex:1;background:var(--tint);border-radius:13px;padding:16px;text-align:center}
      .stage .sg{color:var(--teal);font-size:16px}
      .stage .sn{font-family:'Bricolage Grotesque';font-weight:800;font-size:28px;color:var(--ink);margin-top:2px}
      .stage .sl{color:var(--tealD);font-size:12px;margin-top:4px;font-weight:600}
      .arrow{display:grid;place-items:center;color:var(--faint);font-size:20px}
      /* bars */
      .bar{display:grid;grid-template-columns:130px 1fr 32px;align-items:center;gap:12px;margin-bottom:10px}
      .blbl{font-size:13px;color:var(--muted);text-transform:capitalize;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .track{height:9px;background:#F0F3F7;border-radius:999px;overflow:hidden}
      .fill{height:100%;border-radius:999px}
      .bn{font-size:13px;font-weight:600;text-align:right}
      .chips{display:flex;flex-wrap:wrap;gap:8px}
      .chip{background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:5px 11px;font-size:12.5px;color:var(--muted)}
      .chip.mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px}
      .chip b{color:var(--ink)}
      .conf{margin-top:18px}
      .clbl{font-size:12.5px;color:var(--muted);margin-bottom:7px}
      .cbar{height:9px;background:#F0F3F7;border-radius:999px;overflow:hidden}
      .cfill{height:100%;background:var(--teal);border-radius:999px}
      .cval{font-family:'Bricolage Grotesque';font-weight:700;font-size:15px;margin-top:6px}
      /* answers list */
      .list{display:flex;flex-direction:column;gap:8px}
      .row{background:#fff;border:1px solid var(--line);border-radius:13px;overflow:hidden}
      .row.ropen{border-color:var(--teal);box-shadow:0 4px 16px rgba(10,154,167,.1)}
      .rhead{width:100%;display:grid;grid-template-columns:110px 40px 130px 1fr 110px;align-items:center;gap:12px;
        padding:13px 16px;border:0;background:transparent;cursor:pointer;text-align:left;font-family:inherit}
      .pill{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap;text-align:center}
      .pill.teal{background:var(--tint);color:var(--tealD)}
      .pill.coral{background:#FFE9E3;color:var(--coral)}
      .pill.amber{background:#FCF0DB;color:#B67A17}
      .lang{font-size:12px;color:var(--faint);font-weight:600}
      .intent{font-size:13px;color:var(--muted)}
      .preview{font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .time{font-size:12px;color:var(--faint);text-align:right}
      .trace{padding:4px 16px 18px;border-top:1px solid var(--line)}
      .tblock{margin:14px 0}
      .tk{font-size:11px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
      .bubbles{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
      .bub{background:var(--tint);color:var(--ink);padding:9px 13px;border-radius:13px 13px 13px 4px;font-size:13.5px;max-width:80%;line-height:1.5}
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:8px}
      .verdict{font-size:12.5px;font-weight:600}
      .verdict.ok{color:var(--tealD)}
      .verdict.bad{color:var(--coral)}
      .dim{color:var(--faint);font-size:12.5px}
      .metaline{color:var(--faint);font-size:12px;margin-top:14px}
      /* knowledge */
      .facts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .fact{border:1px solid var(--line);border-radius:13px;padding:14px 16px}
      .fkey{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--teal);font-weight:600}
      .fval{font-size:13.5px;margin:7px 0 10px;line-height:1.5}
      .fmeta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .disc{font-size:11.5px;color:var(--amber)}
      .src{font-size:11.5px;color:var(--faint);margin-left:auto}
      .gaprow{display:flex;flex-direction:column;gap:2px;padding:10px 0;border-bottom:1px solid var(--line)}
      .gtopic{font-size:13.5px;font-weight:600;text-transform:capitalize}
      .gtopic.amber{color:#B67A17;text-transform:none}
      .gtrig{font-size:12px;color:var(--faint)}
      /* test her */
      .testwrap{max-width:720px}
      .chat{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;height:min(66dvh,620px)}
      .chatscroll{flex:1;overflow-y:auto;padding:20px;background:linear-gradient(#FBFCFD,#F5F8FA)}
      .msg{margin-bottom:14px;display:flex;flex-direction:column;gap:4px}
      .msg.me{align-items:flex-end}
      .msg.her{align-items:flex-start}
      .mbub{padding:10px 14px;border-radius:16px;font-size:14px;max-width:74%;line-height:1.5}
      .msg.me .mbub{background:var(--teal);color:#fff;border-bottom-right-radius:4px}
      .msg.her .mbub{background:#fff;border:1px solid var(--line);color:var(--ink);border-bottom-left-radius:4px}
      .mbub.typing{color:var(--faint);font-style:italic}
      .mtrace{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:2px}
      .tt{font-size:11px;color:var(--faint)}
      .tt.mono{font-family:ui-monospace,monospace}
      .tt.ok{color:var(--tealD);font-weight:600}
      .composer{display:flex;gap:10px;padding:14px;border-top:1px solid var(--line);background:#fff}
      .composer input{flex:1;padding:11px 14px;border:1.5px solid var(--line);border-radius:12px;font-size:14px;font-family:inherit;outline:none}
      .composer input:focus{border-color:var(--teal);box-shadow:0 0 0 3px var(--tint)}
      .composer button{padding:11px 20px;border:0;border-radius:12px;background:var(--teal);color:#fff;font-weight:600;font-family:inherit;cursor:pointer}
      .composer button:hover:not(:disabled){background:var(--tealD)}
      .composer button:disabled{opacity:.5;cursor:not-allowed}
      .testnote{color:var(--faint);font-size:12.5px;margin-top:14px;line-height:1.6;max-width:640px}
      @media(max-width:900px){
        .app{grid-template-columns:1fr}
        .side{position:static;height:auto;flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px}
        nav{flex-direction:row;flex-wrap:wrap}.sidefoot{display:none}
        .tiles{grid-template-columns:1fr 1fr}.two,.facts,.grid3{grid-template-columns:1fr}
        .rhead{grid-template-columns:90px 1fr 70px}.rhead .lang,.rhead .intent{display:none}
        .funnel{flex-direction:column}.arrow{transform:rotate(90deg)}
      }
    `}</style>
  );
}
