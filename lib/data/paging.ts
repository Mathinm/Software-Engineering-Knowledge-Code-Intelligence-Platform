import "server-only";
import { q } from "../db";

export type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };

/**
 * Server-side pagination: wraps a SELECT with count(*) OVER () and LIMIT/OFFSET.
 * `orderBy` must come from a whitelist (never raw user input).
 */
export async function paged<T>(
  sql: string,
  params: unknown[],
  orderBy: string,
  page: number,
  pageSize: number,
): Promise<Page<T>> {
  const n = params.length;
  const rows = await q<T & { _total: string }>(
    `SELECT x.*, count(*) OVER () AS _total FROM (${sql}) x ORDER BY ${orderBy} LIMIT $${n + 1} OFFSET $${n + 2}`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  const total = rows.length ? Number(rows[0]._total) : 0;
  return { rows: rows.map(({ _total, ...r }) => (void _total, r as T)), total, page, pageSize };
}

/** Build "col dir" from a whitelist; falls back to the default. */
export function sortClause(map: Record<string, string>, sort: string | undefined, dir: string | undefined, dflt: string) {
  const col = sort && map[sort];
  return col ? `${col} ${dir === "asc" ? "ASC" : "DESC"} NULLS LAST` : dflt;
}

/** Collects WHERE conditions with numbered parameters. */
export class Where {
  parts: string[] = [];
  params: unknown[] = [];
  add(cond: (p: string) => string, value: unknown) {
    if (value === undefined || value === null || value === "") return this;
    this.params.push(value);
    this.parts.push(cond(`$${this.params.length}`));
    return this;
  }
  get sql() {
    return this.parts.length ? `WHERE ${this.parts.join(" AND ")}` : "";
  }
}

/** Escape % and _ so user text is matched literally inside ILIKE. */
export const likeEscape = (s: string) => `%${s.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
