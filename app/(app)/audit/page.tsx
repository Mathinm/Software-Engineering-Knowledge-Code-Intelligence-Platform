"use client";
import Link from "next/link";
import { Suspense, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banner, EmptyState, PageHeader, Person, fmtDateTime } from "@/components/common";
import { DataTable, useListQuery } from "@/components/data-table";
import { useApi } from "@/lib/client";

type Row = { log_id: number; action: string; entity_type: string; entity_id: number; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; timestamp: string; performed_by: number; actor: string };
type Flag = { log_id: number; service_id: number; service: string; status: string; timestamp: string; actor: string; dependents: { id: number; name: string; depth: number }[] };
type Lookups = { developers: { id: number; name: string }[] };

const sel = "h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const href = (t: string, id: number) => ({ service: `/services/${id}`, issue: `/issues/${id}`, incident: `/incidents/${id}`, adr: `/adrs/${id}`, developer: `/developers/${id}`, api: `/apis/${id}` } as Record<string, string>)[t];

function Json({ v }: { v: Record<string, unknown> | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  const entries = Object.entries(v).filter(([k]) => k !== "updated_date");
  return (
    <ul className="max-w-xs space-y-0.5 font-mono text-[11px]">
      {entries.slice(0, 4).map(([k, x]) => <li key={k} className="truncate" title={`${k}: ${JSON.stringify(x)}`}><span className="text-muted-foreground">{k}:</span> {typeof x === "string" ? x : JSON.stringify(x)}</li>)}
      {entries.length > 4 && <li className="text-muted-foreground">+{entries.length - 4} more</li>}
    </ul>
  );
}

function Audit() {
  const list = useListQuery<Row>("/api/audit");
  const flags = useApi<{ flags: Flag[] }>("/api/audit/flags");
  const lk = useApi<Lookups>("/api/lookups");
  const facets = (list.data as unknown as { facets?: { actions: string[]; entities: string[] } })?.facets;
  const { params, set } = list;

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { id: "ts", header: "Time", cell: ({ row: { original: r } }) => <span className="whitespace-nowrap">{fmtDateTime(r.timestamp)}</span> },
    { id: "actor", header: "Actor", cell: ({ row: { original: r } }) => <Person id={r.performed_by} name={r.actor} /> },
    { id: "action", header: "Action", cell: ({ row: { original: r } }) => <span className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{r.action}</span> },
    { id: "entity", header: "Entity", cell: ({ row: { original: r } }) => {
      const h = r.action !== "DELETE" ? href(r.entity_type, r.entity_id) : undefined;
      return h ? <Link className="text-primary hover:underline" href={h}>{r.entity_type} #{r.entity_id}</Link> : <span>{r.entity_type} #{r.entity_id}</span>;
    } },
    { id: "old", header: "Previous value", cell: ({ row: { original: r } }) => <Json v={r.old_value} /> },
    { id: "new", header: "New value", cell: ({ row: { original: r } }) => <Json v={r.new_value} /> },
  ], []);

  const any = ["actor_id", "action", "entity_type", "from", "to"].some((k) => params[k]);

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Log" description="Every create, update and delete on services, issues, incidents and ADRs, written by a database trigger (fn_audit_row) with the signed-in user as actor." />

      {flags.data?.flags.filter((f) => f.dependents.length > 0).map((f) => (
        <Banner key={f.log_id} tone="warn"
          title={`${f.dependents.length} dependent service${f.dependents.length === 1 ? "" : "s"} flagged for review`}
          action={<Button asChild size="sm" variant="outline"><Link href={`/impact?kind=service&id=${f.service_id}&change=deprecation&depth=5`}>Open impact</Link></Button>}>
          <p><Link className="font-medium text-primary underline" href={`/services/${f.service_id}`}>{f.service}</Link> was set to <b>{f.status}</b> by {f.actor} on {fmtDateTime(f.timestamp)} (audit event #{f.log_id}).
            {" "}Dependents from <code className="font-mono">get_impact({f.service_id})</code>:</p>
          <p className="mt-1">{f.dependents.map((x, i) => <span key={x.id}>{i > 0 && ", "}<Link href={`/services/${x.id}`} className="text-primary underline">{x.name}</Link> <span className="text-xs">(depth {x.depth})</span></span>)}</p>
        </Banner>
      ))}
      {flags.data?.flags.filter((f) => f.dependents.length === 0).map((f) => (
        <Banner key={f.log_id} tone="info" title={`${f.service} is ${f.status}. No dependent services to review.`} />
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <select aria-label="Actor" className={sel} value={params.actor_id ?? ""} onChange={(e) => set({ actor_id: e.target.value || undefined })}>
          <option value="">All actors</option>{lk.data?.developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select aria-label="Action" className={sel} value={params.action ?? ""} onChange={(e) => set({ action: e.target.value || undefined })}>
          <option value="">All actions</option>{facets?.actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="Entity type" className={sel} value={params.entity_type ?? ""} onChange={(e) => set({ entity_type: e.target.value || undefined })}>
          <option value="">All entity types</option>{facets?.entities.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="text-xs text-muted-foreground">From<Input type="date" className="h-9" value={params.from ?? ""} onChange={(e) => set({ from: e.target.value || undefined })} /></label>
        <label className="text-xs text-muted-foreground">To<Input type="date" className="h-9" value={params.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} /></label>
        {any && <Button variant="ghost" size="sm" className="h-9" onClick={() => set({ actor_id: undefined, action: undefined, entity_type: undefined, from: undefined, to: undefined })}><X /> Clear</Button>}
      </div>
      <DataTable list={list} columns={columns} empty={<EmptyState title="No audit events match">Try removing a filter.</EmptyState>} />
    </div>
  );
}

export default function AuditPage() {
  return <Suspense><Audit /></Suspense>;
}
