import { z } from "zod";
import {
  API_STATUSES, CHANGE_TYPES, DEPENDENCY_TYPES, INCIDENT_STATUSES, ISSUE_STATUSES, SERVICE_STATUSES, SEVERITIES,
} from "./domain";

const id = z.coerce.number().int().positive().max(2147483647);
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).optional().nullable().transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const serviceSchema = z.object({
  name: text(150).min(2, "Name must be at least 2 characters."),
  description: optText(2000),
  status: z.enum(SERVICE_STATUSES),
  repo_id: id,
  maintainer_id: id,
});

export const apiSchema = z.object({
  name: text(150).min(2, "Name must be at least 2 characters."),
  path: optText(255),
  version: optText(20),
  status: z.enum(API_STATUSES),
  service_id: id,
});

export const tableSchema = z.object({
  name: text(150).min(1).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, digits and underscores."),
  description: optText(2000),
  service_id: id,
});

export const dependencySchema = z
  .object({ service_id: id, depends_on_service_id: id, relationship_type: z.enum(DEPENDENCY_TYPES).default("runtime") })
  .refine((d) => d.service_id !== d.depends_on_service_id, { message: "A service cannot depend on itself.", path: ["depends_on_service_id"] });

export const usageSchema = z.object({
  service_id: id,
  relationship_type: z.string().trim().max(50),
});

const workBase = {
  title: text(255).min(5, "Title must be at least 5 characters."),
  description: optText(5000),
  severity: z.enum(SEVERITIES),
  service_id: id,
};
export const issueCreateSchema = z.object(workBase);
export const issuePatchSchema = z.object({ ...workBase, status: z.enum(ISSUE_STATUSES) }).partial().strict();
export const incidentCreateSchema = z.object(workBase);
export const incidentPatchSchema = z.object({ ...workBase, status: z.enum(INCIDENT_STATUSES) }).partial().strict();
export const resolveSchema = z.object({
  root_cause: text(5000).min(5, "Describe the root cause (at least 5 characters)."),
  resolution: text(5000).min(5, "Describe the resolution (at least 5 characters)."),
});

const sortDir = z.enum(["asc", "desc"]).optional();
const page = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const workFilterSchema = z.object({
  ...page,
  search: text(200).optional(),
  service_id: id.optional(),
  severity: z.enum(SEVERITIES).optional(),
  status: z.enum([...new Set([...ISSUE_STATUSES, ...INCIDENT_STATUSES])] as [string, ...string[]]).optional(),
  owner_id: id.optional(),
  from: date.optional(),
  to: date.optional(),
  sort: z.string().max(100).optional(), // only whitelisted column names are ever used
  dir: sortDir,
});

export const listSchema = z.object({
  ...page,
  search: text(200).optional(),
  status: z.string().max(20).optional(),
  service_id: id.optional(),
  sort: z.string().max(30).optional(),
  dir: sortDir,
});

export const auditFilterSchema = z.object({
  ...page,
  actor_id: id.optional(),
  action: z.string().max(50).optional(),
  entity_type: z.string().max(50).optional(),
  from: date.optional(),
  to: date.optional(),
});

export const impactSchema = z.object({
  kind: z.enum(["service", "api", "table"]),
  id,
  changeType: z.enum(CHANGE_TYPES.map((c) => c.value) as [string, ...string[]]),
  depth: z.coerce.number().int().min(1).max(5).default(1),
});

export const similarSchema = z.object({
  text: text(5000).default(""),
  incidentId: id.optional(),
  issueId: id.optional(),
  service_id: id.optional(),
  severity: z.enum(SEVERITIES).optional(),
  limit: z.coerce.number().int().min(1, "Limit must be 1–20.").max(20, "Limit must be 1–20.").default(5),
});
