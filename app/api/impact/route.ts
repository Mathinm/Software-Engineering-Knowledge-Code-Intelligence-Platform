import { body, route } from "@/lib/api";
import { simulateImpact } from "@/lib/data/impact";
import type { ChangeType } from "@/lib/domain";
import { impactSchema } from "@/lib/validators";

// POST /api/impact — run a change simulation; returns ONE ImpactResult object
export const POST = route(async ({ req }) => {
  const { kind, id, changeType, depth } = await body(req, impactSchema);
  return simulateImpact(kind, id, changeType as ChangeType, depth);
});
