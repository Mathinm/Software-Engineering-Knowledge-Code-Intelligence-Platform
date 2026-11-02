import { notFound, parseId, route } from "@/lib/api";
import { getAllDependencies, getService } from "@/lib/data/services";

// GET /api/services/:id/dependencies — all levels of "depends on" (get_dependencies function)
export const GET = route<{ id: string }>(async ({ params }) => {
  const id = parseId(params.id);
  if (!(await getService(id))) throw notFound("Service");
  return { dependencies: await getAllDependencies(id) };
});
