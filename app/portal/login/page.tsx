"use client";
import { useState } from "react";

export default function PortalLogin() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const j = await r.json();
      if (j.ok) {
        window.location.href = "/portal";
        return;
      }
      setErr(
        j.error === "not_configured"
          ? "Portal isn't set up yet — set PORTAL_PASSWORD in Vercel."
          : "Wrong password. Try again."
      );
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <form className="card" onSubmit={submit}>
        <div className="brand">
          <span className="bubble">✦</span>
          <span className="word">JomChats</span>
        </div>
        <h1>Command centre</h1>
        <p className="sub">Aurum @ Bandar Sunway · pilot</p>
        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Enter portal password"
          autoFocus
        />
        {err && <div className="err">{err}</div>}
        <button type="submit" disabled={busy || !pw}>
          {busy ? "Checking…" : "Enter"}
        </button>
        <div className="foot">JomChats · never miss another customer</div>
      </form>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box}
        .wrap{min-height:100dvh;display:grid;place-items:center;
          background:radial-gradient(1200px 600px at 20% -10%, #0E2A55 0%, #031D41 55%);
          font-family:Inter,system-ui,sans-serif;padding:24px}
        .card{width:100%;max-width:380px;background:#fff;border-radius:20px;
          padding:36px 32px;box-shadow:0 24px 60px rgba(3,29,65,.35)}
        .brand{display:flex;align-items:center;gap:10px;margin-bottom:26px}
        .bubble{width:34px;height:34px;border-radius:50% 50% 50% 6px;background:#0A9AA7;
          color:#fff;display:grid;place-items:center;font-size:17px;box-shadow:0 4px 12px rgba(10,154,167,.4)}
        .word{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:20px;color:#031D41;letter-spacing:-.02em}
        h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:26px;
          color:#031D41;margin:0;letter-spacing:-.02em}
        .sub{color:#52627B;font-size:14px;margin:6px 0 26px}
        label{display:block;font-size:13px;font-weight:600;color:#031D41;margin-bottom:8px}
        input{width:100%;padding:13px 14px;border:1.5px solid #E3E8EE;border-radius:12px;
          font-size:15px;font-family:inherit;outline:none;transition:border-color .15s}
        input:focus{border-color:#0A9AA7;box-shadow:0 0 0 3px #E1F5F7}
        .err{margin-top:12px;background:#FFE9E3;color:#C43A22;font-size:13px;
          padding:10px 12px;border-radius:10px}
        button{width:100%;margin-top:20px;padding:13px;border:0;border-radius:12px;
          background:#0A9AA7;color:#fff;font-size:15px;font-weight:600;font-family:inherit;
          cursor:pointer;transition:background .15s,transform .05s}
        button:hover:not(:disabled){background:#077680}
        button:active:not(:disabled){transform:translateY(1px)}
        button:disabled{opacity:.5;cursor:not-allowed}
        .foot{margin-top:24px;text-align:center;color:#8A97AC;font-size:12px}
      `}</style>
    </main>
  );
}
