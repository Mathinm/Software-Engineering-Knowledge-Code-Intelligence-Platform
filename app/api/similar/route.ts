import { ApiError, body, route } from "@/lib/api";
import { dbCapabilities } from "@/lib/db";
import { EMBEDDING_MODEL_NAME, findSimilarIncidents } from "@/lib/data/insights";
import { getIncident, getIssue } from "@/lib/data/work";
import { similarSchema } from "@/lib/validators";

// GET /api/similar — which engine is active
export const GET = route(async () => {
  const caps = await dbCapabilities();
  return { available: caps, engine: caps.vector ? "pgvector" : caps.trgm ? "fulltext+trigram" : "fulltext", model: caps.vector ? EMBEDDING_MODEL_NAME : null };
});

// POST /api/similar — find incidents similar to free text, an issue or an incident
export const POST = route(async ({ req }) => {
  const b = await body(req, similarSchema);
  let text = b.text;
  if (b.incidentId) {
    const n = await getIncident(b.incidentId);
    if (!n) throw new ApiError(404, "Incident not found.");
    text = [n.title, n.description, n.root_cause].filter(Boolean).join(" ");
  } else if (b.issueId) {
    const i = await getIssue(b.issueId);
    if (!i) throw new ApiError(404, "Issue not found.");
    text = [i.title, i.description].filter(Boolean).join(" ");
  }
  if (!text.trim()) throw new ApiError(400, "Describe the problem, or pick an issue or incident.", { fields: { text: "Required" } });
  return findSimilarIncidents({ text, incidentId: b.incidentId }, { service_id: b.service_id, severity: b.severity }, b.limit);
});
