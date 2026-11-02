import "server-only";
import bcrypt from "bcryptjs";
import { q1, withTx } from "./db";
import type { SessionUser } from "./session";

// ponytail: in-memory limiter, resets on restart and isn't shared across instances; move to Redis/DB if deployed multi-node.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, number[]>();

function recent(key: string) {
  const now = Date.now();
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, list);
  return list;
}

/** Seconds until this ip+email may try again, or 0 if not limited. */
export function loginRetryAfter(ip: string, email: string): number {
  const list = recent(`${ip}|${email}`);
  return list.length >= MAX_FAILURES ? Math.ceil((list[0] + WINDOW_MS - Date.now()) / 1000) : 0;
}

const recordFailure = (ip: string, email: string) => recent(`${ip}|${email}`).push(Date.now());
const clearFailures = (ip: string, email: string) => failures.delete(`${ip}|${email}`);

// A real hash of a random string, so unknown emails still pay the bcrypt cost (no timing oracle).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-" + Math.random(), 10);

/** Check credentials against developers.password_hash. Returns the user or null. */
export async function verifyLogin(email: string, password: string, ip: string): Promise<SessionUser | null> {
  // Fetch only the columns we need — the hash never leaves this function.
  const row = await q1<{ developer_id: number; name: string; email: string; auth_role: "admin" | "developer"; password_hash: string }>(
    `SELECT developer_id, name, email, auth_role, password_hash
       FROM developers WHERE lower(email) = lower($1)`,
    [email],
  );
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    recordFailure(ip, email);
    return null;
  }
  clearFailures(ip, email);

  // Seed hashes come from pgcrypto gen_salt('bf') (cost 6). Upgrade to cost 12 on login.
  if (bcrypt.getRounds(row.password_hash) < 10) {
    const upgraded = await bcrypt.hash(password, 12);
    await withTx(row.developer_id, (tx) =>
      tx.query("UPDATE developers SET password_hash = $1 WHERE developer_id = $2", [upgraded, row.developer_id]),
    );
  }
  return { id: row.developer_id, name: row.name, email: row.email, role: row.auth_role };
}
