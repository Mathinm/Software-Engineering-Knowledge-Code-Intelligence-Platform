import { route, searchParams } from "@/lib/api";
import { listDevelopers } from "@/lib/data/catalog";
import { listSchema } from "@/lib/validators";

// GET /api/developers — never includes password_hash
export const GET = route(async ({ req }) => listDevelopers(searchParams(req, listSchema)));
