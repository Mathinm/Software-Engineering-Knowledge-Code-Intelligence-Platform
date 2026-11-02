import "server-only";
import { dbCapabilities, q, q1 } from "../db";
import { embedText, hasEmbedding, vectorSearchByIncident, vectorSearchByText } from "./vector";
import { likeEscape, paged, Where } from "./paging";

// ============================== Dashboard ==============================

/** Summary cards: aggregates over incidents, services and issues. */
export function dashboardSummary() {
  return q1<{
    open_incidents: number; critical_open_incidents: number; total_services: number; active_services: number;
    critical_issues: number; open_issues: number; mttr_hours: number | null; resolved_incidents: number;
  }>(`
    SELECT (SELECT count(*) FROM incidents WHERE status <> 'resolved')::int                              AS open_incidents,
           (SELECT count(*) FROM incidents WHERE status <> 'resolved' AND severity = 'critical')::int    AS critical_open_incidents,
           (SELECT count(*) FROM services)::int                                                         AS total_services,
           (SELECT count(*) FROM services WHERE status = 'active')::int                                 AS active_services,
           (SELECT count(*) FROM issues WHERE severity = 'critical' AND status IN ('open','in_progress'))::int AS critical_issues,
           (SELECT count(*) FROM issues WHERE status IN ('open','in_progress'))::int                   AS open_issues,
           (SELECT round(avg(EXTRACT(EPOCH FROM (resolved_date - created_date)) / 3600)::numeric, 1)::float
              FROM incidents WHERE status = 'resolved')                                                 AS mttr_hours,
           (SELECT count(*) FROM incidents WHERE status = 'resolved')::int                              AS resolved_incidents`);
}

/** Bar chart: incidents per service (GROUP BY), split open vs resolved. */
export function incidentsPerService() {
  return q(`
    SELECT s.service_id, s.name AS service,
           count(n.incident_id) FILTER (WHERE n.status <> 'resolved')::int AS open,
           count(n.incident_id) FILTER (WHERE n.status = 'resolved')::int  AS resolved
      FROM services s LEFT JOIN incidents n ON n.service_id = s.service_id
     GROUP BY s.service_id, s.name
    HAVING count(n.incident_id) > 0
     ORDER BY count(n.incident_id) DESC, s.name`);
}

/**
 * Hotspots: commit churn per repository in the 90 days up to the latest commit
 * (the seed data stops in mid-2026, so "now() - 90 days" would show nothing),
 * plus open issues across that repo's services.
 */
export function hotspots() {
  return q(`
    WITH anchor AS (SELECT LEAST(now()::timestamp, max("timestamp")) AS t FROM commits)
    SELECT * FROM (
    SELECT r.repo_id, r.name AS repo, r.url,
           (SELECT t FROM anchor) AS window_end,
           (SELECT count(*) FROM commits c, anchor a
             WHERE c.repo_id = r.repo_id AND c."timestamp" > a.t - interval '90 days')::int AS recent_commits,
           (SELECT count(*) FROM issues i JOIN services s ON s.service_id = i.service_id
             WHERE s.repo_id = r.repo_id AND i.status IN ('open','in_progress'))::int     AS open_issues,
           (SELECT count(*) FROM issues i JOIN services s ON s.service_id = i.service_id
             WHERE s.repo_id = r.repo_id AND i.status IN ('open','in_progress') AND i.severity = 'critical')::int AS critical_issues,
           (SELECT string_agg(name, ', ' ORDER BY name) FROM services s WHERE s.repo_id = r.repo_id) AS services
      FROM repositories r) h
     ORDER BY recent_commits + 2 * open_issues DESC, repo`);
}

/**
 * Bus factor: per service, how many distinct people committed to its repository
 * and what share the top contributor has. Single contributor = classic bus-factor 1.
 */
export function busFactor() {
  return q(`
    WITH per_author AS (
      SELECT repo_id, author_id, count(*) AS n FROM commits GROUP BY repo_id, author_id),
    per_repo AS (
      SELECT repo_id, count(*)::int AS authors, sum(n)::int AS commits, max(n)::int AS top_n FROM per_author GROUP BY repo_id)
    SELECT s.service_id, s.name AS service, r.name AS repo, m.name AS maintainer, s.maintainer_id,
           coalesce(p.authors, 0) AS authors, coalesce(p.commits, 0) AS commits,
           round(100.0 * coalesce(p.top_n, 0) / NULLIF(p.commits, 0))::int AS top_share,
           (SELECT d.name FROM per_author pa JOIN developers d ON d.developer_id = pa.author_id
             WHERE pa.repo_id = s.repo_id ORDER BY pa.n DESC, d.name LIMIT 1) AS top_author,
           (coalesce(p.authors, 0) <= 1
             OR NOT EXISTS (SELECT 1 FROM commits c WHERE c.repo_id = s.repo_id AND c.author_id <> s.maintainer_id)) AS single_contributor
      FROM services s
      JOIN repositories r ON r.repo_id = s.repo_id
      JOIN developers m ON m.developer_id = s.maintainer_id
      LEFT JOIN per_repo p ON p.repo_id = s.repo_id
     WHERE coalesce(p.authors, 0) <= 1
        OR NOT EXISTS (SELECT 1 FROM commits c WHERE c.repo_id = s.repo_id AND c.author_id <> s.maintainer_id)
        OR 100.0 * p.top_n / NULLIF(p.commits, 0) >= 75
     ORDER BY single_contributor DESC, top_share DESC, s.name`);
}

/** Recent audit_logs joined to the acting developer. */
export function recentActivity(limit = 8) {
  return q(`
    SELECT l.log_id, l.action, l.entity_type, l.entity_id, l.old_value, l.new_value, l."timestamp", d.name AS actor
      FROM audit_logs l JOIN developers d ON d.developer_id = l.performed_by
     ORDER BY l."timestamp" DESC, l.log_id DESC LIMIT $1`, [limit]);
}

// ============================== Global search ==============================

/** ILIKE search across services, APIs, issues, commits and ADRs (5 per group). */
export async function globalSearch(text: string) {
  const p = likeEscape(text);
  const [services, apis, issues, commits, adrs] = await Promise.all([
    q(`SELECT service_id AS id, name AS title, coalesce(description, '') AS excerpt, status AS meta
         FROM services WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY name LIMIT 5`, [p]),
    q(`SELECT a.api_id AS id, a.name AS title, coalesce(a.path, '') || ' ' || coalesce(a.version, '') AS excerpt, s.name AS meta
         FROM apis a JOIN services s ON s.service_id = a.service_id
        WHERE a.name ILIKE $1 OR a.path ILIKE $1 ORDER BY a.path LIMIT 5`, [p]),
    q(`SELECT i.issue_id AS id, i.title, coalesce(i.description, '') AS excerpt, i.severity || ' · ' || i.status AS meta
         FROM issues i WHERE i.title ILIKE $1 OR i.description ILIKE $1 ORDER BY i.created_date DESC LIMIT 5`, [p]),
    q(`SELECT c.commit_id AS id, c.message AS title, left(c.hash, 7) AS excerpt, r.name AS meta, c.repo_id
         FROM commits c JOIN repositories r ON r.repo_id = c.repo_id
        WHERE c.message ILIKE $1 OR c.hash ILIKE $1 ORDER BY c."timestamp" DESC LIMIT 5`, [p]),
    q(`SELECT adr_id AS id, title, decision AS excerpt, 'ADR-' || adr_id AS meta
         FROM adrs WHERE title ILIKE $1 OR decision ILIKE $1 OR context ILIKE $1 ORDER BY created_date DESC LIMIT 5`, [p]),
  ]);
  return { services, apis, issues, commits, adrs };
}

// ============================== Similar incidents ==============================

export type SimilarFilters = { service_id?: number; severity?: string };
export type SimilarHit = {
  id: number; title: string; description: string | null; severity: string; status: string;
  root_cause: string | null; resolution: string | null; service_id: number; service: string; score: number;
};
export type SimilarEngine = "fulltext" | "fulltext+trigram" | "pgvector";

/** Strategy interface: anything that can rank incidents against a query. */
export interface SimilarIncidentFinder {
  engine: SimilarEngine;
  find(text: string, filters: SimilarFilters, limit: number, excludeId?: number): Promise<SimilarHit[]>;
}

const DOC = `setweight(to_tsvector('english', coalesce(n.title, '')), 'A') ||
             setweight(to_tsvector('english', coalesce(n.description, '')), 'B') ||
             setweight(to_tsvector('english', coalesce(n.root_cause, '')), 'B') ||
             setweight(to_tsvector('english', coalesce(n.resolution, '')), 'C')`;

/**
 * Full-text search: the input words are OR-ed together (a pasted paragraph would
 * never match with AND), ranked with ts_rank_cd normalised to 0..1 (flag 32 = rank/(rank+1)).
 * With pg_trgm installed, trigram similarity is blended in (70/30).
 */
function fullTextFinder(trgm: boolean): SimilarIncidentFinder {
  return {
    engine: trgm ? "fulltext+trigram" : "fulltext",
    async find(text, f, limit, excludeId) {
      const w = new Where()
        .add((p) => `n.service_id = ${p}`, f.service_id)
        .add((p) => `n.severity = ${p}`, f.severity)
        .add((p) => `n.incident_id <> ${p}`, excludeId);
      const n = w.params.length;
      const extra = w.parts.length ? `AND ${w.parts.join(" AND ")}` : "";
      const score = trgm
        ? `0.7 * ts_rank_cd(${DOC}, qq.tsq, 32) + 0.3 * similarity(n.title || ' ' || coalesce(n.description, ''), $${n + 1})`
        : `ts_rank_cd(${DOC}, qq.tsq, 32)`;
      return q<SimilarHit>(
        `WITH qq AS (SELECT NULLIF(replace(plainto_tsquery('english', $${n + 1})::text, '&', '|'), '')::tsquery AS tsq)
         SELECT n.incident_id AS id, n.title, n.description, n.severity, n.status, n.root_cause, n.resolution,
                n.service_id, s.name AS service, round((${score})::numeric, 3)::float AS score
           FROM incidents n JOIN services s ON s.service_id = n.service_id, qq
          WHERE qq.tsq IS NOT NULL AND (${DOC}) @@ qq.tsq ${extra}
          ORDER BY score DESC, n.created_date DESC
          LIMIT $${n + 2}`,
        [...w.params, text, limit],
      );
    },
  };
}

export type SimilarResult = {
  engine: SimilarEngine;
  model: string | null;            // embedding model when engine = pgvector
  fallbackReason: string | null;   // why keyword search was used instead of semantic search
  available: { trgm: boolean; vector: boolean };
  results: SimilarHit[];
};

/**
 * findSimilarIncidents: picks the engine at runtime.
 *  1. pgvector (semantic): when the vector extension + incidents.embedding exist.
 *     - by incident: its STORED embedding, excluding itself (no re-embedding)
 *     - by text:     the text is embedded now with all-MiniLM-L6-v2
 *  2. full-text (keyword) fallback: no pgvector, source incident has no embedding,
 *     or the embedding model could not load. The reason is returned to the UI.
 */
export async function findSimilarIncidents(
  input: { text: string; incidentId?: number }, filters: SimilarFilters, limit: number,
): Promise<SimilarResult> {
  const caps = await dbCapabilities();
  let fallbackReason: string | null = null;
  if (!caps.vector) {
    fallbackReason = "pgvector or the incidents.embedding column is not available in this database.";
  } else if (input.incidentId) {
    if (await hasEmbedding(input.incidentId)) {
      return { engine: "pgvector", model: EMBEDDING_MODEL_NAME, fallbackReason: null, available: caps, results: await vectorSearchByIncident(input.incidentId, filters, limit) };
    }
    fallbackReason = "This incident has no embedding yet (run npm run embed).";
  } else {
    try {
      const vec = await embedText(input.text);
      return { engine: "pgvector", model: EMBEDDING_MODEL_NAME, fallbackReason: null, available: caps, results: await vectorSearchByText(vec, filters, limit) };
    } catch (e) {
      console.error("[similar] embedding failed, using full-text search:", (e as Error).message);
      fallbackReason = "The embedding model could not be loaded on the server.";
    }
  }
  const finder = fullTextFinder(caps.trgm);
  const results = await finder.find(input.text, filters, limit, input.incidentId);
  return { engine: finder.engine, model: null, fallbackReason, available: caps, results };
}

// Kept as a constant here so this module doesn't import the model library itself.
export const EMBEDDING_MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

// ============================== Audit log ==============================

export type AuditFilters = { actor_id?: number; action?: string; entity_type?: string; from?: string; to?: string; page: number; pageSize: number };

/** audit_logs joined to developers (actor), filtered + paginated. */
export function listAudit(f: AuditFilters) {
  const w = new Where()
    .add((p) => `performed_by = ${p}`, f.actor_id)
    .add((p) => `action = ${p}`, f.action)
    .add((p) => `entity_type = ${p}`, f.entity_type)
    .add((p) => `"timestamp" >= ${p}::date`, f.from)
    .add((p) => `"timestamp" < ${p}::date + 1`, f.to);
  return paged(
    `SELECT * FROM (SELECT l.log_id, l.action, l.entity_type, l.entity_id, l.old_value, l.new_value, l."timestamp",
                           l.performed_by, d.name AS actor
                      FROM audit_logs l JOIN developers d ON d.developer_id = l.performed_by) t ${w.sql}`,
    w.params, `"timestamp" DESC, log_id DESC`, f.page, f.pageSize,
  );
}

/** Distinct actions / entity types for the audit filter dropdowns. */
export async function auditFacets() {
  const [actions, entities] = await Promise.all([
    q<{ v: string }>(`SELECT DISTINCT action AS v FROM audit_logs ORDER BY 1`),
    q<{ v: string }>(`SELECT DISTINCT entity_type AS v FROM audit_logs ORDER BY 1`),
  ]);
  return { actions: actions.map((r) => r.v), entities: entities.map((r) => r.v) };
}

/**
 * Review flags: every audit event that moved a service to deprecated/maintenance,
 * with its dependents computed by get_impact() (JSONB containment on new_value).
 */
export function reviewFlags() {
  return q(`
    SELECT l.log_id, l.entity_id AS service_id, s.name AS service, l.new_value ->> 'status' AS status,
           l."timestamp", d.name AS actor,
           coalesce((SELECT json_agg(json_build_object('id', g.impacted_id, 'name', g.impacted_service, 'depth', g.depth)
                                     ORDER BY g.depth, g.impacted_service)
                       FROM get_impact(l.entity_id) g), '[]') AS dependents
      FROM audit_logs l
      JOIN services s ON s.service_id = l.entity_id
      JOIN developers d ON d.developer_id = l.performed_by
     WHERE l.entity_type = 'service'
       AND (l.new_value @> '{"status":"deprecated"}' OR l.new_value @> '{"status":"maintenance"}')
       AND s.status = l.new_value ->> 'status'          -- still in that state
     ORDER BY l."timestamp" DESC`);
}
