// Shared (client + server) domain rules. Enums mirror the CHECK constraints in schema.sql.

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const ISSUE_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const INCIDENT_STATUSES = ["open", "investigating", "resolved"] as const;
export const SERVICE_STATUSES = ["active", "deprecated", "maintenance"] as const;
export const API_STATUSES = ["active", "deprecated", "beta"] as const;
export const DEPENDENCY_TYPES = ["runtime", "build_time", "data"] as const;
export const CHANGE_TYPES = [
  { value: "breaking_api", label: "Breaking API change" },
  { value: "schema", label: "Database schema change" },
  { value: "deprecation", label: "Deprecation" },
  { value: "version_bump", label: "Version bump" },
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type ChangeType = (typeof CHANGE_TYPES)[number]["value"];
export type ComponentKind = "service" | "api" | "table";

/** Valid next status for each workflow (forward only, one step). */
export const ISSUE_NEXT: Record<IssueStatus, IssueStatus | null> = {
  open: "in_progress",
  in_progress: "resolved",
  resolved: "closed",
  closed: null,
};
export const INCIDENT_NEXT: Record<IncidentStatus, IncidentStatus | null> = {
  open: "investigating",
  investigating: "resolved", // resolving goes through the resolve_incident procedure
  resolved: null,
};

export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Risk rule — ONE function, used by the impact API, the report rows and the UI tooltip.
// ---------------------------------------------------------------------------
export type RiskLevel = "High" | "Medium" | "Low";
export type RiskInput = { affectedServices: number; openCritical: number; openHigh: number };

export const RISK_RULE_TEXT = {
  High: "More than 5 affected services, or at least one open critical issue/incident",
  Medium: "2–5 affected services, or any open high-severity issue/incident",
  Low: "Everything else",
} as const;

export function classifyRisk({ affectedServices, openCritical, openHigh }: RiskInput): RiskLevel {
  if (affectedServices > 5 || openCritical > 0) return "High";
  if (affectedServices >= 2 || openHigh > 0) return "Medium";
  return "Low";
}

/** Small self-check for the risk rule (run: node --experimental-strip-types lib/domain.ts). */
export function riskSelfCheck() {
  const c = (a: number, cr: number, h: number) => classifyRisk({ affectedServices: a, openCritical: cr, openHigh: h });
  const ok = c(6, 0, 0) === "High" && c(0, 1, 0) === "High" && c(5, 0, 0) === "Medium" && c(2, 0, 0) === "Medium" &&
    c(1, 0, 1) === "Medium" && c(1, 0, 0) === "Low" && c(0, 0, 0) === "Low";
  if (!ok) throw new Error("risk rule self-check failed");
  return ok;
}

// ---------------------------------------------------------------------------
// Permissions — same functions used by API routes (enforcement) and UI (hiding buttons).
// ---------------------------------------------------------------------------
export type Actor = { id: number; role: "admin" | "developer" };

/** Admin, the issue's reporter, or the maintainer of the issue's service. */
export const canChangeIssueStatus = (u: Actor, issue: { reporter_id: number; owner_id: number }) =>
  u.role === "admin" || issue.reporter_id === u.id || issue.owner_id === u.id;

/** Admin, or the maintainer of the incident's service. */
export const canResolveIncident = (u: Actor, incident: { owner_id: number }) =>
  u.role === "admin" || incident.owner_id === u.id;

export const isAdmin = (u: Actor | null | undefined) => u?.role === "admin";
