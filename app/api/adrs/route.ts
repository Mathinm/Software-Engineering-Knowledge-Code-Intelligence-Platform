import { route, searchParams } from "@/lib/api";
import { listAdrs } from "@/lib/data/catalog";
import { listSchema } from "@/lib/validators";

// GET /api/adrs
export const GET = route(async ({ req }) => listAdrs(searchParams(req, listSchema)));
