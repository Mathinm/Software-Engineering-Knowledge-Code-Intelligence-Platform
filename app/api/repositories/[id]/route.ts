import { notFound, parseId, route } from "@/lib/api";
import { getRepository } from "@/lib/data/catalog";

// GET /api/repositories/:id — repo with services, commits, contributors
export const GET = route<{ id: string }>(async ({ params }) => {
  const repo = await getRepository(parseId(params.id));
  if (!repo) throw notFound("Repository");
  return repo;
});
