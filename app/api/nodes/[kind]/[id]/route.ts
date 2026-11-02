import { notFound, parseId, route } from "@/lib/api";
import { nodeSummary } from "@/lib/data/catalog";

// GET /api/nodes/(service|api|table)/:id — data for the graph's details drawer
export const GET = route<{ kind: string; id: string }>(async ({ params }) => {
  const kind = params.kind;
  if (kind !== "service" && kind !== "api" && kind !== "table") throw notFound("Component type");
  const node = await nodeSummary(kind, parseId(params.id));
  if (!node) throw notFound("Component");
  return node;
});
