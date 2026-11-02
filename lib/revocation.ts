import "server-only";
import { q1, withTx } from "./db";
import type { VerifiedSession } from "./session";

/** Has this token been revoked by a logout? (PK lookup on revoked_tokens) */
export async function isRevoked(jti: string): Promise<boolean> {
  return !!(await q1("SELECT 1 FROM revoked_tokens WHERE jti = $1", [jti]));
}

/** Logout: remember this token's jti until it would have expired, and drop rows that already have. */
export function revokeSession(s: VerifiedSession) {
  return withTx(s.id, async (tx) => {
    await tx.query(
      "INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT (jti) DO NOTHING",
      [s.jti, s.exp],
    );
    await tx.query("DELETE FROM revoked_tokens WHERE expires_at < now()");
  });
}
