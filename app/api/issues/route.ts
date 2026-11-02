import { body, route, searchParams } from "@/lib/api";
import { createIssue, listIssues } from "@/lib/data/work";
import { issueCreateSchema, workFilterSchema } from "@/lib/validators";

// GET /api/issues — filtered, sorted, server-side paginated
export const GET = route(async ({ req }) => listIssues(searchParams(req, workFilterSchema)));

// POST /api/issues — any signed-in user can report an issue (they become the reporter)
export const POST = route(async ({ req, user }) => createIssue(user.id, await body(req, issueCreateSchema)));
