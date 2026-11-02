import { route } from "@/lib/api";
import { lookups } from "@/lib/data/catalog";

// GET /api/lookups — id/name lists for pickers and filters
export const GET = route(async () => lookups());
