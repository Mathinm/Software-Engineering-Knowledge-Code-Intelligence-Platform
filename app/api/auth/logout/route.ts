import { NextResponse, type NextRequest } from "next/server";
import { revokeSession } from "@/lib/revocation";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// POST /api/auth/logout — revoke this session's token server-side, then clear the cookie.
export async function POST(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    try {
      await revokeSession(session);
    } catch (e) {
      console.error("[auth] could not revoke session:", (e as Error).message); // cookie is still cleared below
    }
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
