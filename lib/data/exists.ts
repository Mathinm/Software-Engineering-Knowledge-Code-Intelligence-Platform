import "server-only";
import { notFound } from "next/navigation";
import { q1 } from "../db";

// Whitelisted table / primary-key pairs for detail pages (never built from user input).
const RECORDS = {
  services: ["services", "service_id"],
  issues: ["issues", "issue_id"],
  incidents: ["incidents", "incident_id"],
  adrs: ["adrs", "adr_id"],
  repositories: ["repositories", "repo_id"],
  developers: ["developers", "developer_id"],
} as const;

/**
 * For detail pages: a positive int4 id that exists, or a real HTTP 404 via notFound().
 * Malformed ids ("abc", "1.5", "0", 99999999999) are 404s too, never a 500.
 */
export async function requireRecord(kind: keyof typeof RECORDS, raw: string): Promise<number> {
  const id = /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id > 2147483647) notFound();
  const [table, pk] = RECORDS[kind];
  if (!(await q1(`SELECT 1 FROM ${table} WHERE ${pk} = $1`, [id]))) notFound();
  return id;
}
