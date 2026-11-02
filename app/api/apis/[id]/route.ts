import { ApiError, body, notFound, parseId, route } from "@/lib/api";
import { deleteApi, getApi, getApiConsumers, updateApi } from "@/lib/data/assets";
import { getRepoCommits, getServiceAdrs } from "@/lib/data/services";
import { listIncidents, listIssues } from "@/lib/data/work";
import { apiSchema } from "@/lib/validators";

type P = { id: string };

// GET /api/apis/:id — API detail (provider, consumers, related work)
export const GET = route<P>(async ({ params }) => {
  const id = parseId(params.id);
  const api = await getApi(id);
  if (!api) throw notFound("API");
  const [consumers, commits, adrs, issues, incidents] = await Promise.all([
    getApiConsumers(id), getRepoCommits(api.repo_id), getServiceAdrs(api.service_id),
    listIssues({ service_id: api.service_id, page: 1, pageSize: 100 }),
    listIncidents({ service_id: api.service_id, page: 1, pageSize: 100 }),
  ]);
  return { api, consumers, commits, adrs, issues: issues.rows, incidents: incidents.rows };
});

// PATCH /api/apis/:id — admin edit
export const PATCH = route<P>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  if (!(await getApi(id))) throw notFound("API");
  return updateApi(user.id, id, await body(req, apiSchema.partial()));
}, { admin: true });

// DELETE /api/apis/:id — always blocked while service_api_usage has consumers
export const DELETE = route<P>(async ({ params, user }) => {
  const id = parseId(params.id);
  if (!(await getApi(id))) throw notFound("API");
  const r = await deleteApi(user.id, id);
  if (r.consumers.length) {
    throw new ApiError(409, `Deletion blocked: ${r.consumers.length} service(s) still consume this API. Remove those usages first.`, {
      code: "HAS_CONSUMERS", consumers: r.consumers,
    });
  }
  return { deleted: r.deleted };
}, { admin: true });
