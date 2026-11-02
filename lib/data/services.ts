import "server-only";
import { q, q1, withTx } from "../db";
import { paged, sortClause, Where, likeEscape } from "./paging";

export type ServiceRow = {
  service_id: number; service: string; status: string; repo: string; maintainer: string;
  open_issues: number; open_incidents: number; dependents: number; dependencies: number;
};

/** List services from the v_service_overview view (paginated, filterable). */
export function listServices(f: { search?: string; status?: string; sort?: string; dir?: string; page: number; pageSize: number }) {
  const w = new Where()
    .add((p) => `(service ILIKE ${p} OR repo ILIKE ${p} OR maintainer ILIKE ${p})`, f.search && likeEscape(f.search))
    .add((p) => `status = ${p}`, f.status);
  const order = sortClause(
    { service: "service", status: "status", open_issues: "open_issues", open_incidents: "open_incidents", dependents: "dependents" },
    f.sort, f.dir, "service ASC",
  );
  return paged<ServiceRow>(
    `SELECT service_id, service, status, repo, maintainer,
            open_issues::int, open_incidents::int, dependents::int, dependencies::int
       FROM v_service_overview ${w.sql}`,
    w.params, order, f.page, f.pageSize,
  );
}

/** One service with owner and repository. */
export function getService(id: number) {
  return q1(
    `SELECT s.service_id, s.name, s.description, s.status, s.created_date,
            s.repo_id, r.name AS repo, r.url AS repo_url,
            s.maintainer_id, d.name AS maintainer, d.email AS maintainer_email,
            (SELECT max(c."timestamp") FROM commits c WHERE c.repo_id = s.repo_id) AS last_commit
       FROM services s
       JOIN repositories r ON r.repo_id = s.repo_id
       JOIN developers d ON d.developer_id = s.maintainer_id
      WHERE s.service_id = $1`,
    [id],
  );
}

/** Incoming (who depends on this) and outgoing (what this depends on) service edges. */
export async function getServiceDependencies(id: number) {
  const [incoming, outgoing, apisUsed, tablesUsed] = await Promise.all([
    q(`SELECT sd.dependency_id, sd.service_id AS id, s.name, s.status, sd.relationship_type
         FROM service_dependencies sd JOIN services s ON s.service_id = sd.service_id
        WHERE sd.depends_on_service_id = $1 ORDER BY s.name`, [id]),
    q(`SELECT sd.dependency_id, sd.depends_on_service_id AS id, s.name, s.status, sd.relationship_type
         FROM service_dependencies sd JOIN services s ON s.service_id = sd.depends_on_service_id
        WHERE sd.service_id = $1 ORDER BY s.name`, [id]),
    q(`SELECT a.api_id AS id, a.name, a.path, a.version, u.relationship_type, s.name AS provider
         FROM service_api_usage u JOIN apis a ON a.api_id = u.api_id JOIN services s ON s.service_id = a.service_id
        WHERE u.service_id = $1 ORDER BY a.name`, [id]),
    q(`SELECT t.table_id AS id, t.name, u.relationship_type, s.name AS owner_service
         FROM service_table_usage u JOIN database_tables t ON t.table_id = u.table_id JOIN services s ON s.service_id = t.service_id
        WHERE u.service_id = $1 ORDER BY t.name`, [id]),
  ]);
  return { incoming, outgoing, apisUsed, tablesUsed };
}

/** Everything this service depends on, directly or indirectly, via the get_dependencies() recursive CTE function. */
export function getAllDependencies(id: number) {
  return q<{ id: number; name: string; depth: number; path: string }>(
    "SELECT dependency_service_id AS id, dependency_service AS name, depth, path FROM get_dependencies($1)",
    [id],
  );
}

/** APIs and tables this service owns. */
export async function getServiceAssets(id: number) {
  const [apis, tables] = await Promise.all([
    q(`SELECT a.api_id, a.name, a.path, a.version, a.status,
              (SELECT count(*)::int FROM service_api_usage u WHERE u.api_id = a.api_id) AS consumers
         FROM apis a WHERE a.service_id = $1 ORDER BY a.path, a.version`, [id]),
    q(`SELECT t.table_id, t.name, t.description,
              (SELECT count(*)::int FROM service_table_usage u WHERE u.table_id = t.table_id) AS users
         FROM database_tables t WHERE t.service_id = $1 ORDER BY t.name`, [id]),
  ]);
  return { apis, tables };
}

/** Commits in the repository a service lives in. */
export function getRepoCommits(repoId: number, limit = 20) {
  return q(
    `SELECT c.commit_id, c.message, c."timestamp", c.hash, d.developer_id AS author_id, d.name AS author
       FROM commits c JOIN developers d ON d.developer_id = c.author_id
      WHERE c.repo_id = $1 ORDER BY c."timestamp" DESC LIMIT $2`,
    [repoId, limit],
  );
}

/** Contributors to the service's repo, with commit counts, plus the maintainer. */
export function getServiceOwners(id: number) {
  return q(
    `SELECT d.developer_id, d.name, d.role, d.email,
            count(c.commit_id)::int AS commits,
            (d.developer_id = s.maintainer_id) AS is_maintainer,
            (d.developer_id = r.owner_id) AS is_repo_owner
       FROM services s
       JOIN repositories r ON r.repo_id = s.repo_id
       JOIN developers d ON d.developer_id IN (SELECT author_id FROM commits WHERE repo_id = s.repo_id)
                         OR d.developer_id = s.maintainer_id OR d.developer_id = r.owner_id
       LEFT JOIN commits c ON c.repo_id = s.repo_id AND c.author_id = d.developer_id
      WHERE s.service_id = $1
      GROUP BY d.developer_id, s.maintainer_id, r.owner_id
      ORDER BY commits DESC, d.name`,
    [id],
  );
}

export function getServiceAdrs(id: number) {
  return q(
    `SELECT a.adr_id, a.title, a.decision, a.context, a.created_date, d.name AS author
       FROM adrs a JOIN developers d ON d.developer_id = a.author_id
      WHERE a.service_id = $1 ORDER BY a.created_date DESC`,
    [id],
  );
}

/** Who would be hit if this service were deleted (direct dependents + cascading row counts). */
export async function serviceDeletePreview(id: number) {
  const [dependents, counts] = await Promise.all([
    q(`SELECT s.service_id, s.name FROM service_dependencies sd JOIN services s ON s.service_id = sd.service_id
        WHERE sd.depends_on_service_id = $1 ORDER BY s.name`, [id]),
    q1(`SELECT (SELECT count(*)::int FROM apis WHERE service_id = $1) AS apis,
               (SELECT count(*)::int FROM database_tables WHERE service_id = $1) AS tables,
               (SELECT count(*)::int FROM issues WHERE service_id = $1) AS issues,
               (SELECT count(*)::int FROM incidents WHERE service_id = $1) AS incidents,
               (SELECT count(*)::int FROM adrs WHERE service_id = $1) AS adrs`, [id]),
  ]);
  return { dependents, cascades: counts };
}

export type ServiceInput = { name: string; description?: string | null; status: string; repo_id: number; maintainer_id: number };

/** INSERT a service (audited by trg_audit_services). */
export function createService(userId: number, s: ServiceInput) {
  return withTx(userId, async (tx) =>
    (await tx.query(
      `INSERT INTO services (name, description, status, repo_id, maintainer_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING service_id`,
      [s.name, s.description ?? null, s.status, s.repo_id, s.maintainer_id],
    )).rows[0],
  );
}

/** UPDATE only the provided fields of a service. */
export function updateService(userId: number, id: number, s: Partial<ServiceInput>) {
  const cols = (["name", "description", "status", "repo_id", "maintainer_id"] as const).filter((k) => s[k] !== undefined);
  return withTx(userId, async (tx) => {
    if (!cols.length) return { updated: 0 };
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    const r = await tx.query(`UPDATE services SET ${set} WHERE service_id = $1`, [id, ...cols.map((c) => s[c])]);
    return { updated: r.rowCount };
  });
}

/** DELETE a service (FKs cascade to its APIs, tables, issues, incidents, ADRs, edges). */
export function deleteService(userId: number, id: number) {
  return withTx(userId, async (tx) => ({ deleted: (await tx.query("DELETE FROM services WHERE service_id = $1", [id])).rowCount }));
}

/** Add an edge "service depends on depends_on". trg_no_dependency_cycle rejects cycles. */
export function addDependency(userId: number, d: { service_id: number; depends_on_service_id: number; relationship_type: string }) {
  return withTx(userId, async (tx) =>
    (await tx.query(
      `INSERT INTO service_dependencies (service_id, depends_on_service_id, relationship_type)
       VALUES ($1, $2, $3) RETURNING dependency_id`,
      [d.service_id, d.depends_on_service_id, d.relationship_type],
    )).rows[0],
  );
}

export function deleteDependency(userId: number, dependencyId: number) {
  return withTx(userId, async (tx) => ({
    deleted: (await tx.query("DELETE FROM service_dependencies WHERE dependency_id = $1", [dependencyId])).rowCount,
  }));
}

/** Who maintains a service (used for developer permission checks). */
export async function serviceMaintainer(id: number): Promise<number | null> {
  return (await q1<{ maintainer_id: number }>("SELECT maintainer_id FROM services WHERE service_id = $1", [id]))?.maintainer_id ?? null;
}
