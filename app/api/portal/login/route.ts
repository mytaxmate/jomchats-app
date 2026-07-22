import { NextRequest, NextResponse } from "next/server";
import { PORTAL_COOKIE, passwordOk, portalToken, portalConfigured } from "@/lib/portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST { password } → set the session cookie. POST { logout:true } → clear it. */
export async function POST(req: NextRequest) {
  let body: { password?: string; logout?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.logout) {
    const res = NextResponse.json({ ok: true });
    res.cookies.set(PORTAL_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  if (!portalConfigured()) {
    return NextResponse.json(
      { ok: false, error: "not_configured" },
      { status: 503 }
    );
  }

  if (!passwordOk(body.password ?? "")) {
    return NextResponse.json({ ok: false, error: "wrong_password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(PORTAL_COOKIE, portalToken(), {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}
