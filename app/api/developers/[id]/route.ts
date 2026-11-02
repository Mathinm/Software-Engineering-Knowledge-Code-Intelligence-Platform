import { notFound, parseId, route } from "@/lib/api";
import { getDeveloper } from "@/lib/data/catalog";

// GET /api/developers/:id — profile, maintained services, commits, reported issues
export const GET = route<{ id: string }>(async ({ params }) => {
  const dev = await getDeveloper(parseId(params.id));
  if (!dev) throw notFound("Developer");
  return dev;
});
