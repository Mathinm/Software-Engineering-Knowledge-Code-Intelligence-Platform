import "server-only";
import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Return DATE / TIMESTAMP (no time zone) as wall-clock strings instead of shifting them through the
// server time zone. "2026-03-12 08:05:00" -> "2026-03-12T08:05:00" (browsers parse that as local time).
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1114, (v) => v.replace(" ", "T"));

// One pool per server process (kept on globalThis so dev hot-reload doesn't leak pools).
const g = globalThis as unknown as { __igPool?: Pool };

function pool(): Pool {
  if (!g.__igPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (see .env.example)");
    g.__igPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return g.__igPool;
}

/** Run a read-only parameterized query and return its rows. */
export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(sql, params);
  return res.rows;
}

/** Same as q() but returns the first row (or null). */
export async function q1<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null;
}

export type Tx = Pick<PoolClient, "query">;

/**
 * Run fn inside a transaction that first tells the audit trigger who is acting
 * (SET LOCAL app.current_user_id). EVERY write in the app goes through this.
 */
export async function withTx<T>(userId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Query capabilities of this database once (pg_trgm / pgvector + incidents.embedding). */
let caps: Promise<{ trgm: boolean; vector: boolean }> | null = null;
export function dbCapabilities() {
  caps ??= (async () => {
    const r = await q1<{ trgm: boolean; vector: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS trgm,
             EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'incidents' AND column_name = 'embedding') AS vector`);
    return r ?? { trgm: false, vector: false };
  })().catch((e) => {
    caps = null;
    throw e;
  });
  return caps;
}
