import { body, route } from "@/lib/api";
import { addDependency } from "@/lib/data/services";
import { dependencySchema } from "@/lib/validators";

// POST /api/dependencies — admin adds "service depends on X" (trg_no_dependency_cycle may reject → 400)
export const POST = route(async ({ req, user }) => addDependency(user.id, await body(req, dependencySchema)), { admin: true });
