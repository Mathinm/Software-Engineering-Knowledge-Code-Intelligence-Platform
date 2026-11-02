"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Person, SeverityBadge, StatusBadge, fmtDateTime } from "@/components/common";
import { DataTable, useListQuery } from "@/components/data-table";
import { FormDialog, enumOptions } from "@/components/form-dialog";
import { api, useApi } from "@/lib/client";
import { INCIDENT_STATUSES, ISSUE_STATUSES, SEVERITIES, label } from "@/lib/domain";
import type { IncidentRow, IssueRow } from "@/lib/types";
import { cn } from "@/lib/utils";

type Lookups = { services: { id: number; name: string }[]; developers: { id: number; name: string }[] };
type Row = (IssueRow | IncidentRow) & { id: number };

const selectCls = "h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function WorkList() {
  const router = useRouter();
  const lk = useApi<Lookups>("/api/lookups");
  // Tab is part of the URL so dashboard cards can deep-link (?tab=incidents)
  const tab = useSearchParams().get("tab") === "incidents" ? "incidents" : "issues";
  return <Inner key={tab} tab={tab} lk={lk.data} router={router} />;
}

function Inner({ tab, lk, router }: { tab: "issues" | "incidents"; lk: Lookups | null; router: ReturnType<typeof useRouter> }) {
  const list = useListQuery<Row>(`/api/${tab}`);
  const { params, set } = list;
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(params.search ?? "");
  const statuses = tab === "issues" ? ISSUE_STATUSES : INCIDENT_STATUSES;
  const prefix = tab === "issues" ? "#" : "INC-";

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { id: "id", header: "ID", cell: ({ row }) => <span className="font-mono text-xs">{prefix}{row.original.id}</span> },
    { id: "title", header: "Title", cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
    { id: "type", header: "Type", cell: () => <span className="text-muted-foreground">{tab === "issues" ? "Issue" : "Incident"}</span> },
    { id: "service", header: "Service", cell: ({ row }) => row.original.service },
    { id: "severity", header: "Severity", cell: ({ row }) => <SeverityBadge severity={row.original.severity} /> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "owner", header: "Owner", cell: ({ row }) => <Person name={row.original.owner} /> },
    { id: "created_date", header: "Created", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{fmtDateTime(row.original.created_date)}</span> },
  ], [tab, prefix]);

  const anyFilter = ["search", "service_id", "severity", "status", "owner_id", "from", "to"].some((k) => params[k]);

  return (
    <div className="space-y-4">
      <PageHeader title="Issues & Incidents" description="Bugs reported against services, and production incidents with their root causes."
        actions={<Button onClick={() => setCreating(true)}><Plus /> {tab === "issues" ? "Report issue" : "Report incident"}</Button>} />

      <div role="tablist" aria-label="Record type" className="flex gap-1 border-b">
        {(["issues", "incidents"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => router.replace(t === "issues" ? "/issues" : "/issues?tab=incidents")}
            className={cn("border-b-2 px-4 py-2 text-sm", tab === t ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "issues" ? "Issues" : "Incidents"}
          </button>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search" onSubmit={(e) => { e.preventDefault(); set({ search: search.trim() || undefined }); }}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or description…" className="h-9 w-64 pl-8" aria-label="Search" />
        </div>
        <select aria-label="Service" className={selectCls} value={params.service_id ?? ""} onChange={(e) => set({ service_id: e.target.value || undefined })}>
          <option value="">All services</option>{lk?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="Severity" className={selectCls} value={params.severity ?? ""} onChange={(e) => set({ severity: e.target.value || undefined })}>
          <option value="">All severities</option>{SEVERITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select aria-label="Status" className={selectCls} value={params.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })}>
          <option value="">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select aria-label="Owner" className={selectCls} value={params.owner_id ?? ""} onChange={(e) => set({ owner_id: e.target.value || undefined })}>
          <option value="">All owners</option>{lk?.developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <label className="text-xs text-muted-foreground">From<Input type="date" className="h-9" value={params.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" className="h-9" value={params.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
        <Button type="submit" variant="secondary" size="sm" className="h-9">Search</Button>
        {anyFilter && <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setSearch(""); router.replace(tab === "issues" ? "/issues" : "/issues?tab=incidents"); }}><X /> Clear filters</Button>}
      </form>

      <DataTable list={list} columns={columns} sortable={["id", "title", "service", "severity", "status", "owner", "created_date"]}
        onRowClick={(r) => router.push(`/${tab}/${r.id}`)}
        empty={<EmptyState title={anyFilter ? "Nothing matches these filters" : `No ${tab} yet`}
          action={anyFilter ? undefined : <Button size="sm" onClick={() => setCreating(true)}><Plus /> Report one</Button>}>
          {anyFilter ? "Try removing a filter or widening the date range." : undefined}</EmptyState>} />

      <FormDialog open={creating} onOpenChange={setCreating}
        title={tab === "issues" ? "Report an issue" : "Report an incident"}
        description={tab === "issues" ? "You will be recorded as the reporter." : "New incidents start as Open. Resolve them later with a root cause and resolution."}
        fields={[
          { name: "title", label: "Title", required: true, minLength: 5, maxLength: 255 },
          { name: "description", label: "Description", type: "textarea", maxLength: 5000 },
          { name: "severity", label: "Severity", type: "select", required: true, options: enumOptions(SEVERITIES) },
          { name: "service_id", label: "Service", type: "select", required: true, options: lk?.services.map((s) => ({ value: s.id, label: s.name })) ?? [] },
        ]}
        submitLabel="Create" successMessage={tab === "issues" ? "Issue reported." : "Incident reported."}
        onSubmit={async (v) => {
          const r = await api<{ id: number }>(`/api/${tab}`, { method: "POST", body: v });
          router.push(`/${tab}/${r.id}`);
        }} />
    </div>
  );
}

export default function IssuesPage() {
  return <Suspense><WorkList /></Suspense>;
}
