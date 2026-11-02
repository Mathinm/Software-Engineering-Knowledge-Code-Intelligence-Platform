import { ApiError, body, notFound, parseId, route } from "@/lib/api";
import { deleteTable, getTable, getTableUsers, updateTable } from "@/lib/data/assets";
import { getRepoCommits, getServiceAdrs } from "@/lib/data/services";
import { listIncidents, listIssues } from "@/lib/data/work";
import { tableSchema } from "@/lib/validators";

type P = { id: string };

// GET /api/tables/:id — table detail (owner service, readers/writers)
export const GET = route<P>(async ({ params }) => {
  const id = parseId(params.id);
  const table = await getTable(id);
  if (!table) throw notFound("Table");
  const [users, commits, adrs, issues, incidents] = await Promise.all([
    getTableUsers(id), getRepoCommits(table.repo_id), getServiceAdrs(table.service_id),
    listIssues({ service_id: table.service_id, page: 1, pageSize: 100 }),
    listIncidents({ service_id: table.service_id, page: 1, pageSize: 100 }),
  ]);
  return { table, users, commits, adrs, issues: issues.rows, incidents: incidents.rows };
});

// PATCH /api/tables/:id — admin edit
export const PATCH = route<P>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  if (!(await getTable(id))) throw notFound("Table");
  return updateTable(user.id, id, await body(req, tableSchema.partial()));
}, { admin: true });

// DELETE /api/tables/:id — blocked while services other than the owner use it
export const DELETE = route<P>(async ({ params, user }) => {
  const id = parseId(params.id);
  if (!(await getTable(id))) throw notFound("Table");
  const r = await deleteTable(user.id, id);
  if (r.consumers.length) {
    throw new ApiError(409, `Deletion blocked: ${r.consumers.length} other service(s) still use this table.`, {
      code: "HAS_CONSUMERS", consumers: r.consumers,
    });
  }
  return { deleted: r.deleted };
}, { admin: true });
