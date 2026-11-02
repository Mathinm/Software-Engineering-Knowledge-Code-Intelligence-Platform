"use client";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import { ArrowRight, Download, FlaskConical, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHANGE_TYPES, type ComponentKind, type RiskLevel } from "@/lib/domain";
import type { ImpactResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState, KindIcon, Pager, Person, RiskBadge, SeverityBadge, SortHeader, StatusBadge, fmtDate, kindHref, kindLabel } from "../common";

type Comp = {
  key: string; kind: ComponentKind; id: number; name: string; relationship: string; depth: number;
  open: number | null; owner: string; owner_id?: number; risk: RiskLevel;
};

/** Flatten services + APIs + tables into one "affected components" list. */
export function affectedComponents(r: ImpactResult): Comp[] {
  return [
    ...r.services.map((s) => ({ key: `service-${s.id}`, kind: "service" as const, id: s.id, name: s.name, relationship: s.relationship, depth: s.depth, open: s.open_issues + s.open_incidents, owner: s.owner, owner_id: s.owner_id, risk: s.risk })),
    ...r.apis.map((a) => ({ key: `api-${a.id}`, kind: "api" as const, id: a.id, name: `${a.name} ${a.path ?? ""} ${a.version ?? ""}`.trim(), relationship: a.relationship, depth: a.depth, open: null, owner: a.owner, risk: a.risk })),
    ...r.tables.map((t) => ({ key: `table-${t.id}`, kind: "table" as const, id: t.id, name: t.name, relationship: t.relationship, depth: t.depth, open: null, owner: t.owner, risk: t.risk })),
  ];
}

const RISK_ORDER = { High: 3, Medium: 2, Low: 1 };

function ClientTable<T>({ rows, columns, empty, label }: { rows: T[]; columns: ColumnDef<T>[]; empty: ReactNode; label: string }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const table = useReactTable({
    data: rows, columns, state: { sorting, globalFilter: filter },
    onSortingChange: setSorting, onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 8 } },
  });
  if (!rows.length) return <>{empty}</>;
  const { pageIndex, pageSize } = table.getState().pagination;
  return (
    <div>
      {rows.length > 8 && (
        <div className="relative mb-2 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${label}…`} className="h-9 pl-8" aria-label={`Filter ${label}`} />
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>{hg.headers.map((h) => (
                <th key={h.id} scope="col" className="px-3 py-2 font-medium whitespace-nowrap"
                  aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : undefined}>
                  {h.column.getCanSort()
                    ? <SortHeader active={!!h.column.getIsSorted()} dir={h.column.getIsSorted() || undefined} onClick={() => h.column.toggleSorting()}>{flexRender(h.column.columnDef.header, h.getContext())}</SortHeader>
                    : flexRender(h.column.columnDef.header, h.getContext())}
                </th>))}</tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                {r.getVisibleCells().map((c) => <td key={c.id} className="px-3 py-2">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.getFilteredRowModel().rows.length > pageSize && (
        <Pager page={pageIndex + 1} pageSize={pageSize} total={table.getFilteredRowModel().rows.length} onPage={(p) => table.setPageIndex(p - 1)} />
      )}
    </div>
  );
}

function exportCsv(r: ImpactResult) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["section", "type", "id", "name", "relationship", "depth", "open_issues_incidents", "owner", "risk", "severity", "status"].join(",")];
  for (const c of affectedComponents(r)) lines.push(["component", c.kind, c.id, c.name, c.relationship, c.depth, c.open ?? "", c.owner, c.risk, "", ""].map(esc).join(","));
  for (const i of r.issues) lines.push(["issue", "issue", i.id, i.title, i.service, "", "", "", "", i.severity, i.status].map(esc).join(","));
  for (const i of r.incidents) lines.push(["incident", "incident", i.id, i.title, i.service, "", "", "", "", i.severity, i.status].map(esc).join(","));
  for (const t of r.tests) lines.push(["suggested_test", "", "", t.title, t.reason, "", "", "", "", "", ""].map(esc).join(","));
  const meta = `# ImpactGraph report: ${CHANGE_TYPES.find((c) => c.value === r.changeType)?.label} to ${r.root.name}; depth ${r.depth}; risk ${r.risk.level}; generated ${new Date().toISOString()}`;
  const blob = new Blob([meta + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `impact-${r.root.kind}-${r.root.id}-${r.changeType}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ImpactReport({ result, onInspect }: { result: ImpactResult; onInspect: (kind: ComponentKind, id: number) => void }) {
  const comps = useMemo(() => affectedComponents(result), [result]);
  const [tab, setTab] = useState("components");

  const compCols = useMemo<ColumnDef<Comp>[]>(() => [
    { id: "name", header: "Name", accessorKey: "name", cell: ({ row: { original: c } }) => <span className="flex items-center gap-2"><KindIcon kind={c.kind} className="size-5" /><span className="font-medium">{c.name}</span></span> },
    { id: "type", header: "Type", accessorFn: (c) => kindLabel(c.kind), cell: (x) => <span className="text-muted-foreground">{x.getValue() as string}</span> },
    { id: "relationship", header: "Relationship", accessorKey: "relationship" },
    { id: "depth", header: "Depth", accessorKey: "depth", cell: (x) => <span className="inline-flex min-w-6 justify-center rounded border bg-muted px-1.5 text-xs tabular-nums">{x.getValue() as number}</span> },
    { id: "open", header: "Open issues", accessorFn: (c) => c.open ?? -1, cell: ({ row: { original: c } }) => c.open === null ? <span className="text-muted-foreground" title="Counted on the parent service">—</span> : <span className={cn("tabular-nums", c.open > 0 && "font-semibold text-risk-high")}>{c.open}</span> },
    { id: "owner", header: "Owner", accessorKey: "owner", cell: ({ row: { original: c } }) => <Person id={c.owner_id} name={c.owner} /> },
    { id: "risk", header: "Risk", accessorFn: (c) => RISK_ORDER[c.risk], cell: ({ row: { original: c } }) => <RiskBadge level={c.risk} /> },
    { id: "actions", header: "Actions", enableSorting: false, cell: ({ row: { original: c } }) => (
      <span className="flex items-center gap-1">
        <Button variant="ghost" size="xs" onClick={() => onInspect(c.kind, c.id)} aria-label={`Inspect ${c.name} in the side panel`}>Inspect</Button>
        <Link href={kindHref(c.kind, c.id)} className="inline-flex items-center gap-1 text-primary hover:underline" aria-label={`View ${c.name}`}>View <ArrowRight className="size-3.5" /></Link>
      </span>) },
  ], [onInspect]);

  const workCols = (kind: "issues" | "incidents"): ColumnDef<ImpactResult["issues"][number]>[] => [
    { id: "id", header: "ID", accessorKey: "id", cell: (x) => <span className="font-mono text-xs">{kind === "issues" ? "#" : "INC-"}{x.getValue() as number}</span> },
    { id: "title", header: "Title", accessorKey: "title", cell: ({ row: { original: i } }) => <Link className="font-medium hover:underline" href={`/${kind}/${i.id}`}>{i.title}</Link> },
    { id: "service", header: "Service", accessorKey: "service" },
    { id: "severity", header: "Severity", accessorFn: (i) => ["low", "medium", "high", "critical"].indexOf(i.severity), cell: ({ row: { original: i } }) => <SeverityBadge severity={i.severity} /> },
    { id: "status", header: "Status", accessorKey: "status", cell: (x) => <StatusBadge status={x.getValue() as string} /> },
    { id: "created", header: "Created", accessorKey: "created_date", cell: (x) => fmtDate(x.getValue() as string) },
  ];

  const tabs = [
    { id: "components", label: "Affected components", n: comps.length },
    { id: "apis", label: "Affected APIs", n: result.apis.length },
    { id: "tables", label: "Affected tables", n: result.tables.length },
    { id: "issues", label: "Related issues", n: result.issues.length },
    { id: "incidents", label: "Related incidents", n: result.incidents.length },
    { id: "tests", label: "Suggested tests", n: result.tests.length },
  ];

  return (
    <section className="rounded-xl border bg-card shadow-xs" aria-label="Impact report">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="text-sm font-semibold">Impact report</h2>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => exportCsv(result)} aria-label="Export report as CSV"><Download /><span className="hidden sm:inline">Export report</span></Button>
      </div>
      <div className="border-b px-3">
        <div role="tablist" aria-label="Report sections" className="flex overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn("shrink-0 whitespace-nowrap border-b-2 px-2.5 py-3 text-sm transition-colors", tab === t.id ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label} ({t.n})
            </button>
          ))}
        </div>
      </div>
      <div className="p-3" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "components" && <ClientTable label="components" rows={comps} columns={compCols} empty={<EmptyState title="Nothing affected">No other component depends on {result.root.name} within depth {result.depth}.</EmptyState>} />}
        {tab === "apis" && <ClientTable label="APIs" rows={comps.filter((c) => c.kind === "api")} columns={compCols} empty={<EmptyState title="No APIs affected" />} />}
        {tab === "tables" && <ClientTable label="tables" rows={comps.filter((c) => c.kind === "table")} columns={compCols} empty={<EmptyState title="No tables affected" />} />}
        {tab === "issues" && <ClientTable label="issues" rows={result.issues} columns={workCols("issues")} empty={<EmptyState title="No open issues">None of the affected services has open issues.</EmptyState>} />}
        {tab === "incidents" && <ClientTable label="incidents" rows={result.incidents} columns={workCols("incidents")} empty={<EmptyState title="No incidents">No incidents recorded for the affected services.</EmptyState>} />}
        {tab === "tests" && (
          result.tests.length === 0 ? <EmptyState title="No suggestions" /> : (
            <div>
              <p className="mb-3 flex items-center gap-2 rounded-lg border border-risk-med/40 bg-risk-med-bg px-3 py-2 text-xs">
                <FlaskConical className="size-4 text-risk-med" aria-hidden />
                <span><b>Suggestions only.</b> These are generated from the dependency graph and change type, not discovered from real test suites.</span>
              </p>
              <ul className="space-y-2">{result.tests.map((t, i) => (
                <li key={i} className="rounded-lg border p-3 text-sm"><div className="font-medium">{t.title}</div><div className="text-muted-foreground">{t.reason}</div></li>
              ))}</ul>
            </div>
          )
        )}
      </div>
    </section>
  );
}
