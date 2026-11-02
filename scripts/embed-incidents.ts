// Batch-embed incidents into incidents.embedding (pgvector).
//   npm run embed            only rows WHERE embedding IS NULL
//   npm run embed -- --all   re-embed every incident
// Reads DATABASE_URL from .env.local. Uses lib/embeddings.ts — the same model and
// settings as the Next.js server — so stored and query vectors are comparable.
import fs from "node:fs";
import pg from "pg";
import { EMBEDDING_MODEL, embed, getEmbedder, incidentText, toVectorLiteral } from "../lib/embeddings.ts";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing in .env.local");

const all = process.argv.includes("--all");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  const { rows } = await client.query<{ incident_id: number; title: string; description: string | null; root_cause: string | null; resolution: string | null }>(
    `SELECT incident_id, title, description, root_cause, resolution
       FROM incidents ${all ? "" : "WHERE embedding IS NULL"}
      ORDER BY incident_id`,
  );
  console.log(`${rows.length} incident(s) to embed${all ? " (--all)" : " (embedding IS NULL)"} with ${EMBEDDING_MODEL}`);
  if (rows.length === 0) process.exit(0);

  const t0 = Date.now();
  await getEmbedder(); // first run downloads the model into .cache/
  console.log(`model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  let ok = 0, failed = 0;
  for (const r of rows) {
    try {
      const v = await embed(incidentText(r));
      // UPDATE that only touches embedding: fn_audit_row strips 'embedding', so no audit row is written.
      await client.query("UPDATE incidents SET embedding = $1::vector WHERE incident_id = $2", [toVectorLiteral(v), r.incident_id]);
      ok++;
      console.log(`  [${ok + failed}/${rows.length}] INC-${r.incident_id} ✓ ${r.title}`);
    } catch (e) {
      failed++;
      console.log(`  [${ok + failed}/${rows.length}] INC-${r.incident_id} ✗ ${(e as Error).message}`);
    }
  }
  const { rows: [c] } = await client.query(`SELECT count(*)::int AS total, count(embedding)::int AS embedded FROM incidents`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${ok} embedded, ${failed} failed. Table: ${c.embedded}/${c.total} incidents have an embedding.`);
  if (failed) process.exitCode = 1;
} finally {
  await client.end();
}
