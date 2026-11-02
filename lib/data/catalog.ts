import "server-only";
import { q, q1 } from "../db";
import type { ComponentKind } from "../domain";
import { likeEscape, paged, sortClause, Where } from "./paging";

// Developer columns that are safe to expose. password_hash is NEVER selected outside lib/auth.ts.
const DEV_COLS = `d.developer_id, d.name, d.email, d.github_username, d.role, d.joined_date, d.auth_role`;

export function listDevelopers(f: { search?: string; page: number; pageSize: number; sort?: string; dir?: string }) {
  const w = new Where().add((p) => `(name ILIKE ${p} OR email ILIKE ${p} OR role ILIKE ${p})`, f.search && likeEscape(f.search));
  return paged(
    `SELECT * FROM (SELECT ${DEV_COLS},
            (SELECT count(*)::int FROM services s WHERE s.maintainer_id = d.developer_id) AS services,
            (SELECT count(*)::int FROM commits c WHERE c.author_id = d.developer_id) AS commits
       FROM developers d) t ${w.sql}`,
    w.params, sortClause({ name: "name", role: "role", commits: "commits", services: "services" }, f.sort, f.dir, "name ASC"), f.page, f.pageSize,
  );
}

export async function getDeveloper(id: number) {
  const dev = await q1(`SELECT ${DEV_COLS} FROM developers d WHERE d.developer_id = $1`, [id]);
  if (!dev) return null;
  const [services, commits, issues] = await Promise.all([
    q(`SELECT service_id, name, status FROM services WHERE maintainer_id = $1 ORDER BY name`, [id]),
    q(`SELECT c.commit_id, c.message, c."timestamp", c.hash, r.repo_id, r.name AS repo
         FROM commits c JOIN repositories r ON r.repo_id = c.repo_id WHERE c.author_id = $1 ORDER BY c."timestamp" DESC LIMIT 20`, [id]),
    q(`SELECT i.issue_id AS id, i.title, i.severity, i.status, s.name AS service
         FROM issues i JOIN services s ON s.service_id = i.service_id WHERE i.reporter_id = $1 ORDER BY i.created_date DESC LIMIT 20`, [id]),
  ]);
  return { ...dev, services, commits, issues };
}

export function listRepositories(f: { search?: string; page: number; pageSize: number }) {
  const w = new Where().add((p) => `(name ILIKE ${p} OR description ILIKE ${p})`, f.search && likeEscape(f.search));
  return paged(
    `SELECT * FROM (SELECT r.repo_id, r.name, r.url, r.description, r.created_date, r.owner_id, d.name AS owner,
            (SELECT count(*)::int FROM commits c WHERE c.repo_id = r.repo_id) AS commits,
            (SELECT count(*)::int FROM services s WHERE s.repo_id = r.repo_id) AS services,
            (SELECT max(c."timestamp") FROM commits c WHERE c.repo_id = r.repo_id) AS last_commit
       FROM repositories r JOIN developers d ON d.developer_id = r.owner_id) t ${w.sql}`,
    w.params, "name ASC", f.page, f.pageSize,
  );
}

export async function getRepository(id: number) {
  const repo = await q1(
    `SELECT r.repo_id, r.name, r.url, r.description, r.created_date, r.owner_id, d.name AS owner
       FROM repositories r JOIN developers d ON d.developer_id = r.owner_id WHERE r.repo_id = $1`, [id]);
  if (!repo) return null;
  const [services, commits, contributors] = await Promise.all([
    q(`SELECT service_id, name, status FROM services WHERE repo_id = $1 ORDER BY name`, [id]),
    q(`SELECT c.commit_id, c.message, c."timestamp", c.hash, d.developer_id AS author_id, d.name AS author
         FROM commits c JOIN developers d ON d.developer_id = c.author_id WHERE c.repo_id = $1 ORDER BY c."timestamp" DESC`, [id]),
    q(`SELECT d.developer_id, d.name, count(*)::int AS commits
         FROM commits c JOIN developers d ON d.developer_id = c.author_id WHERE c.repo_id = $1
        GROUP BY d.developer_id, d.name ORDER BY commits DESC`, [id]),
  ]);
  return { ...repo, services, commits, contributors };
}

export function listAdrs(f: { search?: string; service_id?: number; page: number; pageSize: number }) {
  const w = new Where()
    .add((p) => `(title ILIKE ${p} OR decision ILIKE ${p} OR context ILIKE ${p})`, f.search && likeEscape(f.search))
    .add((p) => `service_id = ${p}`, f.service_id);
  return paged(
    `SELECT * FROM (SELECT a.adr_id, a.title, a.decision, a.context, a.created_date, a.service_id, s.name AS service,
                           a.author_id, d.name AS author
       FROM adrs a JOIN services s ON s.service_id = a.service_id JOIN developers d ON d.developer_id = a.author_id) t ${w.sql}`,
    w.params, "created_date DESC", f.page, f.pageSize,
  );
}

export function getAdr(id: number) {
  return q1(
    `SELECT a.adr_id, a.title, a.decision, a.context, a.created_date, a.service_id, s.name AS service, a.author_id, d.name AS author
       FROM adrs a JOIN services s ON s.service_id = a.service_id JOIN developers d ON d.developer_id = a.author_id
      WHERE a.adr_id = $1`, [id]);
}

/** Small id/name lists for pickers and filter dropdowns. */
export async function lookups() {
  const [services, apis, tables, developers, repositories] = await Promise.all([
    q(`SELECT service_id AS id, name, maintainer_id FROM services ORDER BY name`),
    q(`SELECT a.api_id AS id, a.name, a.path, a.version, s.name AS service FROM apis a JOIN services s ON s.service_id = a.service_id ORDER BY a.path, a.version`),
    q(`SELECT t.table_id AS id, t.name, s.name AS service FROM database_tables t JOIN services s ON s.service_id = t.service_id ORDER BY t.name`),
    q(`SELECT developer_id AS id, name FROM developers ORDER BY name`),
    q(`SELECT repo_id AS id, name FROM repositories ORDER BY name`),
  ]);
  return { services, apis, tables, developers, repositories };
}

/** Everything the graph drawer shows for a node (service, API or table). */
export async function nodeSummary(kind: ComponentKind, id: number) {
  const head = await q1<{
    id: number; name: string; detail: string | null; description: string | null; service_id: number; service: string;
    service_description: string | null; repo_id: number; repo: string; repo_url: string | null; owner_id: number; owner: string;
  }>(
    {
      service: `SELECT s.service_id AS id, s.name, s.status AS detail, s.description, s.service_id, s.name AS service, s.description AS service_description,
                       r.repo_id, r.name AS repo, r.url AS repo_url, d.developer_id AS owner_id, d.name AS owner
                  FROM services s JOIN repositories r ON r.repo_id = s.repo_id JOIN developers d ON d.developer_id = s.maintainer_id
                 WHERE s.service_id = $1`,
      api: `SELECT a.api_id AS id, a.name, coalesce(a.path, '') || ' ' || coalesce(a.version, '') || ' · ' || a.status AS detail,
                   NULL AS description, s.service_id, s.name AS service, s.description AS service_description,
                   r.repo_id, r.name AS repo, r.url AS repo_url, d.developer_id AS owner_id, d.name AS owner
              FROM apis a JOIN services s ON s.service_id = a.service_id JOIN repositories r ON r.repo_id = s.repo_id
              JOIN developers d ON d.developer_id = s.maintainer_id WHERE a.api_id = $1`,
      table: `SELECT t.table_id AS id, t.name, NULL AS detail, t.description, s.service_id, s.name AS service, s.description AS service_description,
                     r.repo_id, r.name AS repo, r.url AS repo_url, d.developer_id AS owner_id, d.name AS owner
                FROM database_tables t JOIN services s ON s.service_id = t.service_id JOIN repositories r ON r.repo_id = s.repo_id
                JOIN developers d ON d.developer_id = s.maintainer_id WHERE t.table_id = $1`,
    }[kind],
    [id],
  );
  if (!head) return null;
  const sid = head.service_id;
  const [stats, commits, issues, incidents, adrs, dependents, dependencies] = await Promise.all([
    q1(`SELECT (SELECT count(*)::int FROM apis WHERE service_id = $1) AS apis,
               (SELECT count(*)::int FROM database_tables WHERE service_id = $1) AS tables,
               (SELECT dependents::int FROM v_service_overview WHERE service_id = $1) AS dependents,
               (SELECT open_issues::int FROM v_service_overview WHERE service_id = $1) AS open_issues,
               (SELECT open_incidents::int FROM v_service_overview WHERE service_id = $1) AS open_incidents,
               (SELECT max("timestamp") FROM commits WHERE repo_id = $2) AS last_updated,
               ${kind === "api" ? "(SELECT count(*)::int FROM service_api_usage WHERE api_id = $3)" : kind === "table" ? "(SELECT count(*)::int FROM service_table_usage WHERE table_id = $3)" : "NULL::int"} AS consumers`,
      kind === "service" ? [sid, head.repo_id] : [sid, head.repo_id, id]),
    q(`SELECT c.commit_id, c.message, c.hash, c."timestamp", d.name AS author FROM commits c JOIN developers d ON d.developer_id = c.author_id
        WHERE c.repo_id = $1 ORDER BY c."timestamp" DESC LIMIT 5`, [head.repo_id]),
    q(`SELECT issue_id AS id, title, severity, status FROM issues WHERE service_id = $1 AND status IN ('open','in_progress')
        ORDER BY created_date DESC`, [sid]),
    q(`SELECT incident_id AS id, title, severity, status FROM incidents WHERE service_id = $1 ORDER BY (status = 'resolved'), created_date DESC LIMIT 5`, [sid]),
    q(`SELECT adr_id, title, created_date FROM adrs WHERE service_id = $1 ORDER BY created_date DESC`, [sid]),
    q(`SELECT s.service_id AS id, s.name FROM service_dependencies x JOIN services s ON s.service_id = x.service_id WHERE x.depends_on_service_id = $1 ORDER BY s.name`, [sid]),
    q(`SELECT s.service_id AS id, s.name FROM service_dependencies x JOIN services s ON s.service_id = x.depends_on_service_id WHERE x.service_id = $1 ORDER BY s.name`, [sid]),
  ]);
  return { kind, ...head, stats, commits, issues, incidents, adrs, dependents, dependencies };
}
