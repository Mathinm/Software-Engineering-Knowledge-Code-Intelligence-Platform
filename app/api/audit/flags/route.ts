import { route } from "@/lib/api";
import { reviewFlags } from "@/lib/data/insights";

// GET /api/audit/flags — admin only: deprecated/maintenance events + dependents from get_impact()
export const GET = route(async () => ({ flags: await reviewFlags() }), { admin: true });
