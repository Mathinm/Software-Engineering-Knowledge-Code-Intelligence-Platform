import { route } from "@/lib/api";

// GET /api/auth/me — the signed-in user (401 if none).
export const GET = route(async ({ user }) => ({ user }));
