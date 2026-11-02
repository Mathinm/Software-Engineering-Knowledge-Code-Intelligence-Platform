import { route, searchParams } from "@/lib/api";
import { auditFacets, listAudit } from "@/lib/data/insights";
import { auditFilterSchema } from "@/lib/validators";

// GET /api/audit — admin only: audit_logs + actor, filtered and paginated
export const GET = route(async ({ req }) => {
  const [page, facets] = await Promise.all([listAudit(searchParams(req, auditFilterSchema)), auditFacets()]);
  return { ...page, facets };
}, { admin: true });
