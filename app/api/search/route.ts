import { z } from "zod";
import { route, searchParams } from "@/lib/api";
import { globalSearch } from "@/lib/data/insights";

// GET /api/search?q= — grouped results for the Ctrl/Cmd+K palette
export const GET = route(async ({ req }) => {
  const { q } = searchParams(req, z.object({ q: z.string().trim().min(1).max(100) }));
  return globalSearch(q);
});
