import { body, forbidden, notFound, parseId, route } from "@/lib/api";
import { canResolveIncident } from "@/lib/domain";
import { refreshIncidentEmbedding } from "@/lib/data/vector";
import { deleteIncident, getIncident, updateIncident } from "@/lib/data/work";
import { incidentPatchSchema } from "@/lib/validators";

type P = { id: string };

// GET /api/incidents/:id
export const GET = route<P>(async ({ params }) => {
  const incident = await getIncident(parseId(params.id));
  if (!incident) throw notFound("Incident");
  return { incident };
});

// PATCH /api/incidents/:id — admin: any field; developer: status only, for services they maintain
export const PATCH = route<P>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  const incident = await getIncident(id);
  if (!incident) throw notFound("Incident");
  const patch = await body(req, incidentPatchSchema);
  if (user.role !== "admin") {
    if (Object.keys(patch).some((k) => k !== "status")) throw forbidden("Developers can only change an incident's status.");
    if (!canResolveIncident(user, incident)) throw forbidden("Only the service maintainer or an admin can change this incident.");
  }
  const r = await updateIncident(user.id, id, patch);
  // Title/description feed the embedding: refresh it (never fails the request).
  if (patch.title !== undefined || patch.description !== undefined) await refreshIncidentEmbedding(user.id, id);
  return r;
});

// DELETE /api/incidents/:id — admin only
export const DELETE = route<P>(async ({ params, user }) => {
  const r = await deleteIncident(user.id, parseId(params.id));
  if (!r.deleted) throw notFound("Incident");
  return r;
}, { admin: true });
