import "server-only";
import { q1, withTx, type Tx } from "../db";
import { ApiError } from "../api";
import { INCIDENT_NEXT, ISSUE_NEXT, type IncidentStatus, type IssueStatus } from "../domain";
import type { IncidentRow, IssueRow } from "../types";
import { likeEscape, paged, sortClause, Where } from "./paging";

const SEV_RANK = `CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

export type WorkFilters = {
  search?: string; service_id?: number; severity?: string; status?: string; owner_id?: number;
  from?: string; to?: string; sort?: string; dir?: string; page: number; pageSize: number;
};

function workWhere(f: WorkFilters, text: string) {
  return new Where()
    .add((p) => `(${text} ILIKE ${p})`, f.search && likeEscape(f.search))
    .add((p) => `service_id = ${p}`, f.service_id)
    .add((p) => `severity = ${p}`, f.severity)
    .add((p) => `status = ${p}`, f.status)
    .add((p) => `owner_id = ${p}`, f.owner_id)
    .add((p) => `created_date >= ${p}::date`, f.from)
    .add((p) => `created_date < ${p}::date + 1`, f.to);
}

const WORK_SORT = { id: "id", title: "title", severity: "sev_rank", status: "status", service: "service", created_date: "created_date", owner: "owner" };

/** Issues joined to service, owner (service maintainer) and reporter. Paginated + filtered. */
export function listIssues(f: WorkFilters) {
  const w = workWhere(f, "title || ' ' || coalesce(description, '')");
  return paged<IssueRow>(
    `SELECT * FROM (
       SELECT i.issue_id AS id, i.title, i.description, i.severity, ${SEV_RANK} AS sev_rank, i.status,
              i.created_date, i.updated_date, i.service_id, s.name AS service,
              s.maintainer_id AS owner_id, m.name AS owner, i.reporter_id, r.name AS reporter
         FROM issues i
         JOIN services s   ON s.service_id = i.service_id
         JOIN developers m ON m.developer_id = s.maintainer_id
         JOIN developers r ON r.developer_id = i.reporter_id) t ${w.sql}`,
    w.params, sortClause(WORK_SORT, f.sort, f.dir, "created_date DESC"), f.page, f.pageSize,
  );
}

/** Incidents joined to service and owner. Paginated + filtered. */
export function listIncidents(f: WorkFilters) {
  const w = workWhere(f, "title || ' ' || coalesce(description, '') || ' ' || coalesce(root_cause, '')");
  return paged<IncidentRow>(
    `SELECT * FROM (
       SELECT n.incident_id AS id, n.title, n.description, n.severity, ${SEV_RANK} AS sev_rank, n.status,
              n.root_cause, n.resolution, n.created_date, n.resolved_date, n.service_id, s.name AS service,
              s.maintainer_id AS owner_id, m.name AS owner
         FROM incidents n
         JOIN services s   ON s.service_id = n.service_id
         JOIN developers m ON m.developer_id = s.maintainer_id) t ${w.sql}`,
    w.params, sortClause(WORK_SORT, f.sort, f.dir, "created_date DESC"), f.page, f.pageSize,
  );
}

export function getIssue(id: number) {
  return q1<IssueRow>(
    `SELECT i.issue_id AS id, i.title, i.description, i.severity, i.status, i.created_date, i.updated_date,
            i.service_id, s.name AS service, s.maintainer_id AS owner_id, m.name AS owner,
            i.reporter_id, r.name AS reporter
       FROM issues i JOIN services s ON s.service_id = i.service_id
       JOIN developers m ON m.developer_id = s.maintainer_id
       JOIN developers r ON r.developer_id = i.reporter_id
      WHERE i.issue_id = $1`,
    [id],
  );
}

export function getIncident(id: number) {
  return q1<IncidentRow>(
    `SELECT n.incident_id AS id, n.title, n.description, n.severity, n.status, n.root_cause, n.resolution,
            n.created_date, n.resolved_date, n.service_id, s.name AS service,
            s.maintainer_id AS owner_id, m.name AS owner
       FROM incidents n JOIN services s ON s.service_id = n.service_id
       JOIN developers m ON m.developer_id = s.maintainer_id
      WHERE n.incident_id = $1`,
    [id],
  );
}

export type IssueInput = { title: string; description?: string | null; severity: string; service_id: number };

/** INSERT an issue; the signed-in user is the reporter. Audited by trg_audit_issues. */
export function createIssue(userId: number, i: IssueInput) {
  return withTx(userId, async (tx) =>
    (await tx.query(
      `INSERT INTO issues (title, description, severity, service_id, reporter_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING issue_id AS id`,
      [i.title, i.description ?? null, i.severity, i.service_id, userId],
    )).rows[0],
  );
}

export type IncidentInput = { title: string; description?: string | null; severity: string; service_id: number };

export function createIncident(userId: number, n: IncidentInput) {
  return withTx(userId, async (tx) =>
    (await tx.query(
      `INSERT INTO incidents (title, description, severity, service_id)
       VALUES ($1, $2, $3, $4) RETURNING incident_id AS id`,
      [n.title, n.description ?? null, n.severity, n.service_id],
    )).rows[0],
  );
}

/** Lock a row, read its status, and reject anything that isn't the next workflow step. */
async function checkTransition(tx: Tx, table: "issues" | "incidents", id: number, to: string | undefined) {
  const pk = table === "issues" ? "issue_id" : "incident_id";
  const row = (await tx.query(`SELECT status FROM ${table} WHERE ${pk} = $1 FOR UPDATE`, [id])).rows[0];
  if (!row) throw new ApiError(404, `${table === "issues" ? "Issue" : "Incident"} not found.`);
  if (to === undefined || to === row.status) return;
  const next = table === "issues" ? ISSUE_NEXT[row.status as IssueStatus] : INCIDENT_NEXT[row.status as IncidentStatus];
  if (next !== to) {
    throw new ApiError(400, `Invalid status change: ${row.status} → ${to}. Allowed next step: ${next ?? "none (final state)"}.`);
  }
}

/** UPDATE an issue (only provided fields). Status must follow open → in_progress → resolved → closed. */
export function updateIssue(userId: number, id: number, i: Partial<IssueInput & { status: string }>) {
  return withTx(userId, async (tx) => {
    await checkTransition(tx, "issues", id, i.status);
    const cols = (["title", "description", "severity", "service_id", "status"] as const).filter((k) => i[k] !== undefined);
    if (!cols.length) return { updated: 0 };
    const set = cols.map((c, n) => `${c} = $${n + 2}`).join(", ");
    return { updated: (await tx.query(`UPDATE issues SET ${set} WHERE issue_id = $1`, [id, ...cols.map((c) => i[c])])).rowCount };
  });
}

/** UPDATE an incident. Resolving must use resolveIncident() (the stored procedure). */
export function updateIncident(userId: number, id: number, n: Partial<IncidentInput & { status: string }>) {
  if (n.status === "resolved") throw new ApiError(400, "Use the Resolve action (root cause + resolution) to resolve an incident.");
  return withTx(userId, async (tx) => {
    await checkTransition(tx, "incidents", id, n.status);
    const cols = (["title", "description", "severity", "service_id", "status"] as const).filter((k) => n[k] !== undefined);
    if (!cols.length) return { updated: 0 };
    const set = cols.map((c, k) => `${c} = $${k + 2}`).join(", ");
    return { updated: (await tx.query(`UPDATE incidents SET ${set} WHERE incident_id = $1`, [id, ...cols.map((c) => n[c])])).rowCount };
  });
}

/** Resolve via the resolve_incident stored procedure (validates, locks the row, sets resolved_date). */
export function resolveIncident(userId: number, id: number, rootCause: string, resolution: string) {
  return withTx(userId, async (tx) => {
    await checkTransition(tx, "incidents", id, "resolved");
    await tx.query("CALL resolve_incident($1, $2, $3, $4)", [id, rootCause, resolution, userId]);
    return { resolved: true };
  });
}

export function deleteIssue(userId: number, id: number) {
  return withTx(userId, async (tx) => ({ deleted: (await tx.query("DELETE FROM issues WHERE issue_id = $1", [id])).rowCount }));
}

export function deleteIncident(userId: number, id: number) {
  return withTx(userId, async (tx) => ({ deleted: (await tx.query("DELETE FROM incidents WHERE incident_id = $1", [id])).rowCount }));
}
