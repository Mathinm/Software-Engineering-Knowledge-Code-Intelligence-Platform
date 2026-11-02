import { ApiError, body, notFound, parseId, route } from "@/lib/api";
import {
  deleteService, getRepoCommits, getService, getServiceAdrs, getServiceAssets, getServiceDependencies,
  getServiceOwners, serviceDeletePreview, updateService,
} from "@/lib/data/services";
import { listIncidents, listIssues } from "@/lib/data/work";
import { serviceSchema } from "@/lib/validators";

type P = { id: string };

// GET /api/services/:id — detail with every tab's data (or ?preview=delete)
export const GET = route<P>(async ({ req, params }) => {
  const id = parseId(params.id);
  const service = await getService(id);
  if (!service) throw notFound("Service");
  if (req.nextUrl.searchParams.get("preview") === "delete") return serviceDeletePreview(id);
  const [deps, assets, commits, owners, adrs, issues, incidents] = await Promise.all([
    getServiceDependencies(id), getServiceAssets(id), getRepoCommits(service.repo_id), getServiceOwners(id), getServiceAdrs(id),
    listIssues({ service_id: id, page: 1, pageSize: 100 }), listIncidents({ service_id: id, page: 1, pageSize: 100 }),
  ]);
  return { service, ...deps, ...assets, commits, owners, adrs, issues: issues.rows, incidents: incidents.rows };
});

// PATCH /api/services/:id — admin edit
export const PATCH = route<P>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  if (!(await getService(id))) throw notFound("Service");
  return updateService(user.id, id, await body(req, serviceSchema.partial()));
}, { admin: true });

// DELETE /api/services/:id?confirm=true — 409 while other services depend on it, unless confirmed
export const DELETE = route<P>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  if (!(await getService(id))) throw notFound("Service");
  const preview = await serviceDeletePreview(id);
  if (preview.dependents.length && req.nextUrl.searchParams.get("confirm") !== "true") {
    throw new ApiError(409, `${preview.dependents.length} service(s) depend on this service. Confirm to delete anyway.`, {
      code: "HAS_DEPENDENTS", ...preview,
    });
  }
  return deleteService(user.id, id);
}, { admin: true });
