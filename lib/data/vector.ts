import "server-only";
import { dbCapabilities, q, q1, withTx } from "../db";
import type { SimilarFilters, SimilarHit } from "./insights";

// The embedding model is loaded lazily with a dynamic import, so routes that never
// embed don't pay for onnxruntime, and a failure to load it becomes a normal error
// we can fall back from instead of crashing the route.
const embeddings = () => import("../embeddings");

/** Embed free text with the same model the batch script used. Throws if the model is unavailable. */
export async function embedText(text: string): Promise<string> {
  if (process.env.EMBEDDINGS_DISABLED === "1") throw new Error("embeddings disabled by EMBEDDINGS_DISABLED=1");
  const m = await embeddings();
  return m.toVectorLiteral(await m.embed(text));
}

/**
 * Recompute incidents.embedding for one incident (after create / edit / resolve).
 * Never throws: on any failure the write that called us still succeeds, the embedding
 * stays as it was (NULL for new rows) and the error is logged server-side only.
 */
export async function refreshIncidentEmbedding(userId: number, incidentId: number): Promise<boolean> {
  try {
    if (!(await dbCapabilities()).vector) return false;
    const row = await q1<{ title: string; description: string | null; root_cause: string | null; resolution: string | null }>(
      "SELECT title, description, root_cause, resolution FROM incidents WHERE incident_id = $1", [incidentId]);
    if (!row) return false;
    const m = await embeddings();
    const vec = await embedText(m.incidentText(row));
    // Embedding-only UPDATE: fn_audit_row strips 'embedding', so this adds no audit noise.
    await withTx(userId, (tx) => tx.query("UPDATE incidents SET embedding = $1::vector WHERE incident_id = $2", [vec, incidentId]));
    return true;
  } catch (e) {
    console.error(`[embeddings] could not embed incident ${incidentId}:`, (e as Error).message);
    return false;
  }
}

const HIT_COLS = `n.incident_id AS id, n.title, n.description, n.severity, n.status, n.root_cause, n.resolution,
                  n.service_id, s.name AS service`;

/** Optional service/severity filters, numbered after the query's own parameters. */
function filters(f: SimilarFilters, offset: number) {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.service_id) { params.push(f.service_id); parts.push(`n.service_id = $${offset + params.length}`); }
  if (f.severity) { params.push(f.severity); parts.push(`n.severity = $${offset + params.length}`); }
  return { sql: parts.map((p) => `AND ${p}`).join(" "), params };
}

/**
 * Semantic search by a query vector: cosine distance (<=>) on the HNSW index.
 * similarity = 1 - distance, clamped to 0..1 for the UI bar.
 */
export function vectorSearchByText(vec: string, f: SimilarFilters, limit: number) {
  const fl = filters(f, 2);
  return q<SimilarHit>(
    `SELECT ${HIT_COLS}, GREATEST(0, LEAST(1, 1 - (n.embedding <=> $1::vector)))::float AS score
       FROM incidents n JOIN services s ON s.service_id = n.service_id
      WHERE n.embedding IS NOT NULL ${fl.sql}
      ORDER BY n.embedding <=> $1::vector
      LIMIT $2`,
    [vec, limit, ...fl.params],
  );
}

/** Semantic search by an existing incident: uses its STORED embedding (no re-embedding) and excludes it. */
export function vectorSearchByIncident(incidentId: number, f: SimilarFilters, limit: number) {
  const fl = filters(f, 2);
  return q<SimilarHit>(
    `SELECT ${HIT_COLS},
            GREATEST(0, LEAST(1, 1 - (n.embedding <=> (SELECT embedding FROM incidents WHERE incident_id = $1))))::float AS score
       FROM incidents n JOIN services s ON s.service_id = n.service_id
      WHERE n.embedding IS NOT NULL AND n.incident_id <> $1 ${fl.sql}
      ORDER BY n.embedding <=> (SELECT embedding FROM incidents WHERE incident_id = $1)
      LIMIT $2`,
    [incidentId, limit, ...fl.params],
  );
}

/** Does this incident have a stored embedding? */
export async function hasEmbedding(incidentId: number) {
  return !!(await q1("SELECT 1 FROM incidents WHERE incident_id = $1 AND embedding IS NOT NULL", [incidentId]));
}
