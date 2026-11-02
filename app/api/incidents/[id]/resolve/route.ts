import { body, forbidden, notFound, parseId, route } from "@/lib/api";
import { canResolveIncident } from "@/lib/domain";
import { refreshIncidentEmbedding } from "@/lib/data/vector";
import { getIncident, resolveIncident } from "@/lib/data/work";
import { resolveSchema } from "@/lib/validators";

// POST /api/incidents/:id/resolve — CALL resolve_incident(id, root_cause, resolution, user)
export const POST = route<{ id: string }>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  const incident = await getIncident(id);
  if (!incident) throw notFound("Incident");
  if (!canResolveIncident(user, incident)) throw forbidden("Only the service maintainer or an admin can resolve this incident.");
  const { root_cause, resolution } = await body(req, resolveSchema);
  const r = await resolveIncident(user.id, id, root_cause, resolution);
  // resolve_incident() wrote root_cause + resolution, which are part of the embedded text.
  await refreshIncidentEmbedding(user.id, id);
  return r;
});
