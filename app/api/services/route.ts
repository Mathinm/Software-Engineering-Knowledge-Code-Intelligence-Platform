import { body, route, searchParams } from "@/lib/api";
import { createService, listServices } from "@/lib/data/services";
import { listSchema, serviceSchema } from "@/lib/validators";

// GET /api/services — paginated list (v_service_overview)
export const GET = route(async ({ req }) => listServices(searchParams(req, listSchema)));

// POST /api/services — admin creates a service
export const POST = route(async ({ req, user }) => createService(user.id, await body(req, serviceSchema)), { admin: true });
