import { body, route, searchParams } from "@/lib/api";
import { createTable, listTables } from "@/lib/data/assets";
import { listSchema, tableSchema } from "@/lib/validators";

// GET /api/tables — paginated list
export const GET = route(async ({ req }) => listTables(searchParams(req, listSchema)));

// POST /api/tables — admin creates a table record
export const POST = route(async ({ req, user }) => createTable(user.id, await body(req, tableSchema)), { admin: true });
