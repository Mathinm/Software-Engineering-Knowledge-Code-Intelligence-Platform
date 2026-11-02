import { body, route, searchParams } from "@/lib/api";
import { createApi, listApis } from "@/lib/data/assets";
import { apiSchema, listSchema } from "@/lib/validators";

// GET /api/apis — paginated list
export const GET = route(async ({ req }) => listApis(searchParams(req, listSchema)));

// POST /api/apis — admin creates an API
export const POST = route(async ({ req, user }) => createApi(user.id, await body(req, apiSchema)), { admin: true });
