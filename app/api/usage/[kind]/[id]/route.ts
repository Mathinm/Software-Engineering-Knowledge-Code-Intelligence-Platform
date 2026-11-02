import { ApiError, body, notFound, parseId, route } from "@/lib/api";
import { addApiUsage, addTableUsage, deleteApiUsage, deleteTableUsage } from "@/lib/data/assets";
import { usageSchema } from "@/lib/validators";

type P = { kind: string; id: string };
const kindOf = (k: string) => {
  if (k !== "api" && k !== "table") throw notFound("Usage type");
  return k;
};

// POST /api/usage/(api|table)/:id — admin records that a service uses this API/table
export const POST = route<P>(async ({ req, params, user }) => {
  const kind = kindOf(params.kind);
  const id = parseId(params.id);
  const u = await body(req, usageSchema);
  const allowed = kind === "api" ? ["sync", "async"] : ["read_only", "write_only", "read_write"];
  if (!allowed.includes(u.relationship_type)) throw new ApiError(400, `relationship_type must be one of: ${allowed.join(", ")}`);
  return kind === "api" ? addApiUsage(user.id, { ...u, api_id: id }) : addTableUsage(user.id, { ...u, table_id: id });
}, { admin: true });

// DELETE /api/usage/(api|table)/:usageId — admin removes a usage edge
export const DELETE = route<P>(async ({ params, user }) => {
  const kind = kindOf(params.kind);
  const id = parseId(params.id);
  const r = kind === "api" ? await deleteApiUsage(user.id, id) : await deleteTableUsage(user.id, id);
  if (!r.deleted) throw notFound("Usage");
  return r;
}, { admin: true });
