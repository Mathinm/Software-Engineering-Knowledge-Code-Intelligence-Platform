import { body, route, searchParams } from "@/lib/api";
import { refreshIncidentEmbedding } from "@/lib/data/vector";
import { createIncident, listIncidents } from "@/lib/data/work";
import { incidentCreateSchema, workFilterSchema } from "@/lib/validators";

// GET /api/incidents — filtered, sorted, server-side paginated
export const GET = route(async ({ req }) => listIncidents(searchParams(req, workFilterSchema)));

// POST /api/incidents — any signed-in user can report an incident
export const POST = route(async ({ req, user }) => {
  const created = await createIncident(user.id, await body(req, incidentCreateSchema));
  // Embed in the same request; failure is logged and leaves embedding NULL (the insert still stands).
  const embedded = await refreshIncidentEmbedding(user.id, created.id);
  return { ...created, embedded };
});
