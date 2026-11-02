import { notFound, parseId, route } from "@/lib/api";
import { getAdr } from "@/lib/data/catalog";

// GET /api/adrs/:id
export const GET = route<{ id: string }>(async ({ params }) => {
  const adr = await getAdr(parseId(params.id));
  if (!adr) throw notFound("ADR");
  return adr;
});
