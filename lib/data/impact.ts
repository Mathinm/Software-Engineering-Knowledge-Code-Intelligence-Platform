import "server-only";
import { q, q1 } from "../db";
import { ApiError } from "../api";
import { CHANGE_TYPES, classifyRisk, type ChangeType, type ComponentKind } from "../domain";
import type { ImpactEdge, ImpactNode, ImpactResult, ImpactService } from "../types";

type Root = ImpactResult["root"];

/** Resolve the chosen component and the service it belongs to. */
async function loadRoot(kind: ComponentKind, id: number): Promise<Root> {
  const sql = {
    service: `SELECT s.service_id AS id, s.name, s.service_id, s.name AS service FROM services s WHERE s.service_id = $1`,
    api: `SELECT a.api_id AS id, a.name || ' (' || coalesce(a.path, '') || ' ' || coalesce(a.version, '') || ')' AS name,
                 s.service_id, s.name AS service
            FROM apis a JOIN services s ON s.service_id = a.service_id WHERE a.api_id = $1`,
    table: `SELECT t.table_id AS id, t.name, s.service_id, s.name AS service
              FROM database_tables t JOIN services s ON s.service_id = t.service_id WHERE t.table_id = $1`,
  }[kind];
  const r = await q1<Omit<Root, "kind" | "open_issues" | "open_incidents">>(sql, [id]);
  if (!r) throw new ApiError(404, `That ${kind} no longer exists.`);
  const c = await q1<{ open_issues: number; open_incidents: number }>(
    `SELECT open_issues::int, open_incidents::int FROM v_service_overview WHERE service_id = $1`, [r.service_id]);
  return { kind, ...r, open_issues: c?.open_issues ?? 0, open_incidents: c?.open_incidents ?? 0 };
}

/**
 * Affected services via the get_impact() recursive-CTE function.
 *  - service: get_impact(service)
 *  - api:     consumers in service_api_usage (depth 1) + get_impact(each consumer) (depth + 1)
 *  - table:   users in service_table_usage + owner (depth 1) + get_impact(each) (depth + 1)
 * Nearest depth wins. Enriched with owner and open issue/incident counts in the same query.
 */
async function affectedServices(root: Root, depth: number) {
  const reach = {
    service: `SELECT impacted_id AS sid, depth, $2::text || path AS path FROM get_impact($1)`,
    api: `WITH seeds AS (SELECT DISTINCT service_id FROM service_api_usage WHERE api_id = $1)
          SELECT s.service_id AS sid, 1 AS depth, $2::text || ' -> ' || v.name AS path
            FROM seeds s JOIN services v ON v.service_id = s.service_id
          UNION ALL
          SELECT g.impacted_id, g.depth + 1, $2::text || ' -> ' || g.path
            FROM seeds s CROSS JOIN LATERAL get_impact(s.service_id) g`,
    table: `WITH seeds AS (SELECT service_id FROM service_table_usage WHERE table_id = $1
                           UNION SELECT service_id FROM database_tables WHERE table_id = $1)
            SELECT s.service_id AS sid, 1 AS depth, $2::text || ' -> ' || v.name AS path
              FROM seeds s JOIN services v ON v.service_id = s.service_id
            UNION ALL
            SELECT g.impacted_id, g.depth + 1, $2::text || ' -> ' || g.path
              FROM seeds s CROSS JOIN LATERAL get_impact(s.service_id) g`,
  }[root.kind];

  const rows = await q<Omit<ImpactService, "risk" | "relationship"> & { max_depth: number }>(
    `WITH reach AS (${reach}),
          nearest AS (SELECT DISTINCT ON (sid) sid, depth, path FROM reach ORDER BY sid, depth)
     SELECT s.service_id AS id, s.name, s.status, n.depth, n.path,
            d.name AS owner, d.developer_id AS owner_id,
            (SELECT max(depth) FROM nearest)::int AS max_depth,
            (SELECT count(*) FROM issues i WHERE i.service_id = s.service_id AND i.status IN ('open','in_progress'))::int AS open_issues,
            (SELECT count(*) FROM incidents x WHERE x.service_id = s.service_id AND x.status <> 'resolved')::int AS open_incidents,
            ((SELECT count(*) FROM issues i WHERE i.service_id = s.service_id AND i.status IN ('open','in_progress') AND i.severity = 'critical')
           + (SELECT count(*) FROM incidents x WHERE x.service_id = s.service_id AND x.status <> 'resolved' AND x.severity = 'critical'))::int AS open_critical,
            ((SELECT count(*) FROM issues i WHERE i.service_id = s.service_id AND i.status IN ('open','in_progress') AND i.severity = 'high')
           + (SELECT count(*) FROM incidents x WHERE x.service_id = s.service_id AND x.status <> 'resolved' AND x.severity = 'high'))::int AS open_high
       FROM nearest n
       JOIN services s ON s.service_id = n.sid
       JOIN developers d ON d.developer_id = s.maintainer_id
      WHERE n.depth <= $3 AND s.service_id <> $4
      ORDER BY n.depth, s.name`,
    [root.id, root.kind === "service" ? "" : root.name, depth, root.kind === "service" ? root.id : 0],
  );
  const maxRow = rows[0]?.max_depth;
  // max_depth is computed before the depth filter; if nothing is within depth, ask separately.
  const maxDepth = maxRow ?? (await q1<{ m: number | null }>(
    `WITH reach AS (${reach}) SELECT max(depth)::int AS m FROM reach`,
    [root.id, root.kind === "service" ? "" : root.name]).then((r) => r?.m ?? 0)
  );
  return { rows, maxDepth };
}

export async function simulateImpact(kind: ComponentKind, id: number, changeType: ChangeType, depth: number): Promise<ImpactResult> {
  const root = await loadRoot(kind, id);
  const { rows, maxDepth } = await affectedServices(root, depth);

  const services: ImpactService[] = rows.map(({ max_depth, ...s }) => {
    void max_depth;
    const parts = s.path.split(" -> ");
    return {
      ...s,
      relationship: s.depth === 1 ? `uses ${parts[0]}` : `via ${parts[parts.length - 2]}`,
      risk: classifyRisk({ affectedServices: 0, openCritical: s.open_critical, openHigh: s.open_high }),
    };
  });
  const byId = new Map(services.map((s) => [s.id, s]));

  // Services whose assets count as affected: every affected service at its depth,
  // plus the changed service itself (depth 1) when a service was picked.
  const sids = services.map((s) => s.id);
  const depths = services.map((s) => s.depth);
  if (kind === "service") { sids.push(root.id); depths.push(1); }

  const [apis, tables, issues, incidents, depEdges] = await Promise.all([
    // APIs exposed by affected services (excluding the changed API itself)
    q(`SELECT a.api_id AS id, a.name, a.path, a.version, a.status, a.service_id, s.name AS service, x.depth, d.name AS owner
         FROM unnest($1::int[], $2::int[]) AS x(sid, depth)
         JOIN apis a ON a.service_id = x.sid
         JOIN services s ON s.service_id = a.service_id
         JOIN developers d ON d.developer_id = s.maintainer_id
        WHERE ($3::int IS NULL OR a.api_id <> $3)
        ORDER BY x.depth, a.path`, [sids, depths, kind === "api" ? id : null]),
    // Tables owned by affected services, plus tables the changed service reads/writes
    q<Omit<ImpactResult["tables"][number], "risk">>(`SELECT DISTINCT ON (t.table_id) t.table_id AS id, t.name, t.service_id, s.name AS service, x.depth, d.name AS owner,
              CASE WHEN t.service_id = x.sid THEN 'owned by ' || s.name ELSE 'used by ' || u.name END AS relationship
         FROM unnest($1::int[], $2::int[]) AS x(sid, depth)
         JOIN services u ON u.service_id = x.sid
         JOIN database_tables t ON t.service_id = x.sid
                                OR ($4::int IS NOT NULL AND x.sid = $4
                                    AND t.table_id IN (SELECT table_id FROM service_table_usage WHERE service_id = $4))
         JOIN services s ON s.service_id = t.service_id
         JOIN developers d ON d.developer_id = s.maintainer_id
        WHERE ($3::int IS NULL OR t.table_id <> $3)
        ORDER BY t.table_id, x.depth`, [sids, depths, kind === "table" ? id : null, kind === "service" ? root.id : null]),
    // Open issues on the changed + affected services
    q(`SELECT i.issue_id AS id, i.title, i.severity, i.status, i.service_id, s.name AS service, i.created_date
         FROM issues i JOIN services s ON s.service_id = i.service_id
        WHERE i.service_id = ANY($1::int[]) AND i.status IN ('open','in_progress')
        ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, i.created_date DESC`,
      [[...sids, root.service_id]]),
    // All incidents (open first) — history is useful when planning the change
    q(`SELECT n.incident_id AS id, n.title, n.severity, n.status, n.service_id, s.name AS service, n.created_date, n.root_cause
         FROM incidents n JOIN services s ON s.service_id = n.service_id
        WHERE n.service_id = ANY($1::int[])
        ORDER BY (n.status = 'resolved'), n.created_date DESC`, [[...sids, root.service_id]]),
    // Dependency edges between services shown in the graph
    q<{ service_id: number; depends_on_service_id: number }>(
      `SELECT service_id, depends_on_service_id FROM service_dependencies
        WHERE service_id = ANY($1::int[]) AND depends_on_service_id = ANY($1::int[])`,
      [[...services.map((s) => s.id), ...(kind === "service" ? [root.id] : [])]]),
  ]);

  const riskOf = (sid: number) => byId.get(sid)?.risk ?? "Low";
  const apiRows = apis.map((a) => ({
    ...a, relationship: a.service_id === root.service_id && kind === "service" ? "exposed by changed service" : `exposed by ${a.service}`, risk: riskOf(a.service_id),
  })) as ImpactResult["apis"];
  const tableRows = tables
    .map((t) => ({ ...t, risk: riskOf(t.service_id) }))
    .sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name)) as ImpactResult["tables"];

  // ---- risk (shared rule) over the changed service + every affected service
  const rootCounts = await q1<{ c: number; h: number }>(
    `SELECT ((SELECT count(*) FROM issues WHERE service_id = $1 AND status IN ('open','in_progress') AND severity = 'critical')
           + (SELECT count(*) FROM incidents WHERE service_id = $1 AND status <> 'resolved' AND severity = 'critical'))::int AS c,
            ((SELECT count(*) FROM issues WHERE service_id = $1 AND status IN ('open','in_progress') AND severity = 'high')
           + (SELECT count(*) FROM incidents WHERE service_id = $1 AND status <> 'resolved' AND severity = 'high'))::int AS h`,
    [root.service_id]);
  const inSet = byId.has(root.service_id); // root's service may already be in the affected list
  const openCritical = services.reduce((n, s) => n + s.open_critical, 0) + (inSet ? 0 : rootCounts?.c ?? 0);
  const openHigh = services.reduce((n, s) => n + s.open_high, 0) + (inSet ? 0 : rootCounts?.h ?? 0);
  const level = classifyRisk({ affectedServices: services.length, openCritical, openHigh });
  const reasons = [
    `${services.length} affected service${services.length === 1 ? "" : "s"}`,
    `${openCritical} open critical issue/incident${openCritical === 1 ? "" : "s"}`,
    `${openHigh} open high-severity issue/incident${openHigh === 1 ? "" : "s"}`,
  ];

  const highest = [...services].sort((a, b) =>
    b.open_critical - a.open_critical || b.open_high - a.open_high ||
    b.open_issues + b.open_incidents - (a.open_issues + a.open_incidents) || a.depth - b.depth)[0];

  // ---- graph (built from the same rows)
  const rootKey = `${kind}-${id}`;
  const nodes: ImpactNode[] = [{
    key: rootKey, kind, id, name: kind === "service" ? root.name : root.name, subtitle: kind === "service" ? "Service (changed)" : `${kind === "api" ? "API" : "Table"} of ${root.service}`,
    depth: 0, badge: root.open_issues + root.open_incidents, isRoot: true,
  }];
  const edges: ImpactEdge[] = [];
  for (const s of services) {
    nodes.push({ key: `service-${s.id}`, kind: "service", id: s.id, name: s.name, subtitle: "Service", depth: s.depth, badge: s.open_issues + s.open_incidents, isRoot: false });
  }
  const svcKey = (sid: number) => (kind === "service" && sid === root.id ? rootKey : `service-${sid}`);
  for (const e of depEdges) edges.push({ source: svcKey(e.depends_on_service_id), target: svcKey(e.service_id), label: "is used by" });
  if (kind !== "service") {
    // the changed API/table is used directly by the depth-1 services
    for (const s of services.filter((s) => s.depth === 1)) edges.push({ source: rootKey, target: `service-${s.id}`, label: "is used by" });
  }
  for (const a of apiRows) {
    nodes.push({ key: `api-${a.id}`, kind: "api", id: a.id, name: a.name, subtitle: `API ${a.path ?? ""} ${a.version ?? ""}`.trim(), depth: a.depth, badge: 0, isRoot: false });
    edges.push({ source: svcKey(a.service_id), target: `api-${a.id}`, label: "exposes" });
  }
  for (const t of tableRows) {
    nodes.push({ key: `table-${t.id}`, kind: "table", id: t.id, name: t.name, subtitle: "Database table", depth: t.depth, badge: 0, isRoot: false });
    const user = t.relationship.startsWith("used by") && kind === "service" ? rootKey : svcKey(t.service_id);
    edges.push({ source: user, target: `table-${t.id}`, label: "depends on" });
  }
  const keys = new Set(nodes.map((n) => n.key));
  const graphEdges = edges.filter((e) => keys.has(e.source) && keys.has(e.target));

  return {
    root, changeType, depth, maxDepth,
    services, apis: apiRows, tables: tableRows,
    issues: issues as ImpactResult["issues"], incidents: incidents as ImpactResult["incidents"],
    tests: suggestTests(changeType, root, services, apiRows, tableRows),
    graph: { nodes, edges: graphEdges },
    risk: { level, affectedServices: services.length, openCritical, openHigh, reasons },
    highest: highest ? { id: highest.id, name: highest.name, open_issues: highest.open_issues, open_incidents: highest.open_incidents } : null,
  };
}

/** Rule-based test SUGGESTIONS (there is no real test discovery). */
function suggestTests(changeType: ChangeType, root: Root, services: ImpactService[], apis: ImpactResult["apis"], tables: ImpactResult["tables"]) {
  const label = CHANGE_TYPES.find((c) => c.value === changeType)!.label;
  const out: { title: string; reason: string }[] = [];
  const direct = services.filter((s) => s.depth === 1);
  for (const s of direct) out.push({ title: `Contract tests: ${s.name} ↔ ${root.service}`, reason: `${s.name} calls the changed component directly (${label}).` });
  if (changeType === "schema" || root.kind === "table") {
    for (const t of tables.filter((t) => t.depth === 1).slice(0, 5)) out.push({ title: `Migration test on ${t.name}`, reason: `${t.relationship}; verify reads/writes after the schema change.` });
  }
  if (changeType === "breaking_api" || changeType === "version_bump") {
    for (const a of apis.filter((a) => a.depth === 1).slice(0, 5)) out.push({ title: `Regression test ${a.path ?? a.name} ${a.version ?? ""}`.trim(), reason: `${a.relationship}; check request/response compatibility.` });
  }
  if (changeType === "deprecation") out.push({ title: `Consumer migration checklist for ${root.name}`, reason: `${services.length} downstream service(s) must move off before removal.` });
  for (const s of services.filter((s) => s.risk === "High")) out.push({ title: `End-to-end smoke test through ${s.name}`, reason: `Marked High risk (open critical work).` });
  return out;
}
