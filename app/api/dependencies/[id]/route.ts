import { notFound, parseId, route } from "@/lib/api";
import { deleteDependency } from "@/lib/data/services";

// DELETE /api/dependencies/:id — admin removes an edge
export const DELETE = route<{ id: string }>(async ({ params, user }) => {
  const r = await deleteDependency(user.id, parseId(params.id));
  if (!r.deleted) throw notFound("Dependency");
  return r;
}, { admin: true });
