import "server-only";
import { q, q1, withTx } from "../db";
import { likeEscape, paged, sortClause, Where } from "./paging";

// ----------------------------- APIs -----------------------------

/** List APIs with their provider service and consumer count. */
export function listApis(f: { search?: string; status?: string; service_id?: number; sort?: string; dir?: string; page: number; pageSize: number }) {
  const w = new Where()
    .add((p) => `(name ILIKE ${p} OR path ILIKE ${p} OR service ILIKE ${p})`, f.search && likeEscape(f.search))
    .add((p) => `status = ${p}`, f.status)
    .add((p) => `service_id = ${p}`, f.service_id);
  const order = sortClause({ name: "name", path: "path", status: "status", service: "service", consumers: "consumers" }, f.sort, f.dir, "path ASC, version ASC");
  return paged(
    `SELECT * FROM (SELECT a.api_id, a.name, a.path, a.version, a.status, a.service_id, s.name AS service,
            (SELECT count(*)::int FROM service_api_usage u WHERE u.api_id = a.api_id) AS consumers
       FROM apis a JOIN services s ON s.service_id = a.service_id) t ${w.sql}`,
    w.params, order, f.page, f.pageSize,
  );
}

/** One API with provider service + owner. */
export function getApi(id: number) {
  return q1(
    `SELECT a.api_id, a.name, a.path, a.version, a.status, a.service_id, s.name AS service, s.description AS service_description,
            s.repo_id, r.name AS repo, r.url AS repo_url, s.maintainer_id, d.name AS owner
       FROM apis a JOIN services s ON s.service_id = a.service_id
       JOIN repositories r ON r.repo_id = s.repo_id
       JOIN developers d ON d.developer_id = s.maintainer_id
      WHERE a.api_id = $1`,
    [id],
  );
}

/** Services that call this API (service_api_usage). */
export function getApiConsumers(id: number) {
  return q(
    `SELECT u.usage_id, s.service_id, s.name, s.status, u.relationship_type
       FROM service_api_usage u JOIN services s ON s.service_id = u.service_id
      WHERE u.api_id = $1 ORDER BY s.name`,
    [id],
  );
}

export type ApiInput = { name: string; path?: string | null; version?: string | null; status: string; service_id: number };

export function createApi(userId: number, a: ApiInput) {
  return withTx(userId, async (tx) =>
    (await tx.query(
      `INSERT INTO apis (name, path, version, status, service_id) VALUES ($1, $2, $3, $4, $5) RETURNING api_id`,
      [a.name, a.path ?? null, a.version ?? null, a.status, a.service_id],
    )).rows[0],
  );
}

export function updateApi(userId: number, id: number, a: Partial<ApiInput>) {
  const cols = (["name", "path", "version", "status", "service_id"] as const).filter((k) => a[k] !== undefined);
  return withTx(userId, async (tx) => {
    if (!cols.length) return { updated: 0 };
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    return { updated: (await tx.query(`UPDATE apis SET ${set} WHERE api_id = $1`, [id, ...cols.map((c) => a[c])])).rowCount };
  });
}

/**
 * Delete an API only if nobody consumes it. The consumer check and the DELETE run in
 * the same transaction (row lock on the API) so a consumer can't sneak in between.
 */
export function deleteApi(userId: number, id: number) {
  return withTx(userId, async (tx) => {
    await tx.query("SELECT 1 FROM apis WHERE api_id = $1 FOR UPDATE", [id]);
    const consumers = (await tx.query(
      `SELECT s.service_id, s.name FROM service_api_usage u JOIN services s ON s.service_id = u.service_id
        WHERE u.api_id = $1 ORDER BY s.name`, [id])).rows;
    if (consumers.length) return { deleted: 0, consumers };
    const r = await tx.query("DELETE FROM apis WHERE api_id = $1", [id]);
    return { deleted: r.rowCount ?? 0, consumers: [] };
  });
}

// ----------------------------- Database tables -----------------------------

export function listTables(f: { search?: string; service_id?: number; sort?: string; dir?: string; page: number; pageSize: number }) {
  const w = new Where()
    .add((p) => `(name ILIKE ${p} OR description ILIKE ${p} OR service ILIKE ${p})`, f.search && likeEscape(f.search))
    .add((p) => `service_id = ${p}`, f.service_id);
  const order = sortClause({ name: "name", service: "service", users: "users" }, f.sort, f.dir, "name ASC");
  return paged(
    `SELECT * FROM (SELECT t.table_id, t.name, t.description, t.service_id, s.name AS service,
            (SELECT count(*)::int FROM service_table_usage u WHERE u.table_id = t.table_id) AS users
       FROM database_tables t JOIN services s ON s.service_id = t.service_id) t ${w.sql}`,
    w.params, order, f.page, f.pageSize,
  );
}

export function getTable(id: number) {
  return q1(
    `SELECT t.table_id, t.name, t.description, t.service_id, s.name AS service, s.description AS service_description,
            s.repo_id, r.name AS repo, r.url AS repo_url, s.maintainer_id, d.name AS owner
       FROM database_tables t JOIN services s ON s.service_id = t.service_id
       JOIN repositories r ON r.repo_id = s.repo_id
       JOIN developers d ON d.developer_id = s.maintainer_id
      WHERE t.table_id = $1`,
    [id],
  );
}

/** Services that read/write this table (service_table_usage). */
export function getTableUsers(id: number) {
  return q(
    `SELECT u.usage_id, s.service_id, s.name, s.status, u.relationship_type
       FROM service_table_usage u JOIN services s ON s.service_id = u.service_id
      WHERE u.table_id = $1 ORDER BY s.name`,
    [id],
  );
}

export type TableInput = { name: string; description?: string | null; service_id: number };

export function createTable(userId: number, t: TableInput) {
  return withTx(userId, async (tx) =>
    (await tx.query(`INSERT INTO database_tables (name, description, service_id) VALUES ($1, $2, $3) RETURNING table_id`,
      [t.name, t.description ?? null, t.service_id])).rows[0],
  );
}

export function updateTable(userId: number, id: number, t: Partial<TableInput>) {
  const cols = (["name", "description", "service_id"] as const).filter((k) => t[k] !== undefined);
  return withTx(userId, async (tx) => {
    if (!cols.length) return { updated: 0 };
    const set = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
    return { updated: (await tx.query(`UPDATE database_tables SET ${set} WHERE table_id = $1`, [id, ...cols.map((c) => t[c])])).rowCount };
  });
}

/** Delete a table only if no service other than its owner uses it. */
export function deleteTable(userId: number, id: number) {
  return withTx(userId, async (tx) => {
    await tx.query("SELECT 1 FROM database_tables WHERE table_id = $1 FOR UPDATE", [id]);
    const consumers = (await tx.query(
      `SELECT s.service_id, s.name FROM service_table_usage u
         JOIN services s ON s.service_id = u.service_id
         JOIN database_tables t ON t.table_id = u.table_id
        WHERE u.table_id = $1 AND u.service_id <> t.service_id ORDER BY s.name`, [id])).rows;
    if (consumers.length) return { deleted: 0, consumers };
    return { deleted: (await tx.query("DELETE FROM database_tables WHERE table_id = $1", [id])).rowCount ?? 0, consumers: [] };
  });
}

// ----------------------------- usage edges -----------------------------

export function addApiUsage(userId: number, u: { service_id: number; api_id: number; relationship_type: string }) {
  return withTx(userId, async (tx) =>
    (await tx.query(`INSERT INTO service_api_usage (service_id, api_id, relationship_type) VALUES ($1, $2, $3) RETURNING usage_id`,
      [u.service_id, u.api_id, u.relationship_type])).rows[0]);
}

export function deleteApiUsage(userId: number, usageId: number) {
  return withTx(userId, async (tx) => ({ deleted: (await tx.query("DELETE FROM service_api_usage WHERE usage_id = $1", [usageId])).rowCount }));
}

export function addTableUsage(userId: number, u: { service_id: number; table_id: number; relationship_type: string }) {
  return withTx(userId, async (tx) =>
    (await tx.query(`INSERT INTO service_table_usage (service_id, table_id, relationship_type) VALUES ($1, $2, $3) RETURNING usage_id`,
      [u.service_id, u.table_id, u.relationship_type])).rows[0]);
}

export function deleteTableUsage(userId: number, usageId: number) {
  return withTx(userId, async (tx) => ({ deleted: (await tx.query("DELETE FROM service_table_usage WHERE usage_id = $1", [usageId])).rowCount }));
}
