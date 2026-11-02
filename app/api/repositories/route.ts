import { route, searchParams } from "@/lib/api";
import { listRepositories } from "@/lib/data/catalog";
import { listSchema } from "@/lib/validators";

// GET /api/repositories
export const GET = route(async ({ req }) => listRepositories(searchParams(req, listSchema)));
