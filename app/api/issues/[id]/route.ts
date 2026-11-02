import { body, forbidden, notFound, parseId, route } from "@/lib/api";
import { canChangeIssueStatus } from "@/lib/domain";
import { deleteIssue, getIssue, updateIssue } from "@/lib/data/work";
import { issuePatchSchema } from "@/lib/validators";

type P = { id: string };

// GET /api/issues/:id
export const GET = route<P>(async ({ params }) => {
  const issue = await getIssue(parseId(params.id));
  if (!issue) throw notFound("Issue");
  return { issue };
});

// PATCH /api/issues/:id — admin: any field; developer: status only, if reporter or service maintainer
export const PATCH = route<P>(async ({ req, params, user }) => {
  const id = parseId(params.id);
  const issue = await getIssue(id);
  if (!issue) throw notFound("Issue");
  const patch = await body(req, issuePatchSchema);
  if (user.role !== "admin") {
    if (Object.keys(patch).some((k) => k !== "status")) throw forbidden("Developers can only change an issue's status.");
    if (!canChangeIssueStatus(user, issue)) throw forbidden("Only the reporter, the service maintainer or an admin can change this issue.");
  }
  return updateIssue(user.id, id, patch);
});

// DELETE /api/issues/:id — admin only
export const DELETE = route<P>(async ({ params, user }) => {
  const r = await deleteIssue(user.id, parseId(params.id));
  if (!r.deleted) throw notFound("Issue");
  return r;
}, { admin: true });
