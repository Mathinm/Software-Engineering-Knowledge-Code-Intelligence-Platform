// JWT session helpers. Edge-safe (jose only) so middleware can use them too.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ig_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export type Role = "admin" | "developer";
export type SessionUser = { id: number; name: string; email: string; role: Role };
/** A verified token: the user plus its unique id (jti) and expiry (seconds since epoch), used for revocation. */
export type VerifiedSession = SessionUser & { jti: string; exp: number };

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is missing or too short (see .env.example)");
  return new TextEncoder().encode(s);
}

export async function signSession(u: SessionUser): Promise<string> {
  return new SignJWT({ name: u.name, email: u.email, role: u.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setJti(crypto.randomUUID()) // lets logout revoke exactly this token (revoked_tokens)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

/** Returns the session in a valid token, or null for a missing/expired/tampered token (or one without a jti).
 *  Signature-only: revocation is checked server-side in currentUser() (lib/api.ts). */
export async function verifySession(token: string | undefined): Promise<VerifiedSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (role !== "admin" && role !== "developer") return null;
    if (typeof payload.jti !== "string" || typeof payload.exp !== "number") return null;
    return { id: Number(payload.sub), name: String(payload.name), email: String(payload.email), role, jti: payload.jti, exp: payload.exp };
  } catch {
    return null;
  }
}
