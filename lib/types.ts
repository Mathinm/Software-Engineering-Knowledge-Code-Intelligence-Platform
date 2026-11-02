// Shared response types (client + server).
import type { ChangeType, ComponentKind, RiskLevel } from "./domain";

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

export type ImpactService = {
  id: number; name: string; status: string; depth: number; path: string; relationship: string;
  owner: string; owner_id: number; open_issues: number; open_incidents: number;
  open_critical: number; open_high: number; risk: RiskLevel;
};
export type ImpactApi = {
  id: number; name: string; path: string | null; version: string | null; status: string;
  service_id: number; service: string; depth: number; relationship: string; owner: string; risk: RiskLevel;
};
export type ImpactTable = {
  id: number; name: string; service_id: number; service: string; depth: number; relationship: string; owner: string; risk: RiskLevel;
};
export type ImpactIssue = { id: number; title: string; severity: string; status: string; service_id: number; service: string; created_date: string };
export type ImpactIncident = ImpactIssue & { root_cause: string | null };
export type ImpactNode = {
  key: string; kind: ComponentKind; id: number; name: string; subtitle: string; depth: number; badge: number; isRoot: boolean;
};
export type ImpactEdge = { source: string; target: string; label: "is used by" | "depends on" | "exposes" };

/** The ONE simulation result: graph, headline, metrics, risk and report all render from this. */
export type ImpactResult = {
  root: { kind: ComponentKind; id: number; name: string; service_id: number; service: string; open_issues: number; open_incidents: number };
  changeType: ChangeType;
  depth: number;
  maxDepth: number; // deepest level reachable at all (so the UI knows if "Expand next level" can do anything)
  services: ImpactService[];
  apis: ImpactApi[];
  tables: ImpactTable[];
  issues: ImpactIssue[];
  incidents: ImpactIncident[];
  tests: { title: string; reason: string }[];
  graph: { nodes: ImpactNode[]; edges: ImpactEdge[] };
  risk: { level: RiskLevel; affectedServices: number; openCritical: number; openHigh: number; reasons: string[] };
  highest: { id: number; name: string; open_issues: number; open_incidents: number } | null;
};

export type IssueRow = {
  id: number; title: string; description: string | null; severity: string; status: string;
  created_date: string; updated_date: string | null; service_id: number; service: string;
  owner_id: number; owner: string; reporter_id: number; reporter: string;
};
export type IncidentRow = {
  id: number; title: string; description: string | null; severity: string; status: string;
  root_cause: string | null; resolution: string | null; created_date: string; resolved_date: string | null;
  service_id: number; service: string; owner_id: number; owner: string;
};
