"use client";
// List + detail pages for APIs and database tables (same shape, different fields).
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Network, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, FetchError, useApi } from "@/lib/client";
import { API_STATUSES, label } from "@/lib/domain";
import {
  Async, Banner, ConfirmDialog, EmptyState, KindIcon, Mono, PageHeader, Panel, Person, SimpleTable, StatusBadge,
} from "./common";
import { DataTable, useListQuery } from "./data-table";
import { AdrList, CommitList, KeyValues, RepoLink, UrlTabs, WorkList } from "./detail";
import { FormDialog, enumOptions, type Field } from "./form-dialog";
import { ListFilters } from "./list-filters";
import { useUser } from "./session";

type Kind = "api" | "table";
type Lookups = { services: { id: number; name: string }[] };

const CFG = {
  api: {
    title: "APIs", noun: "API", endpoint: "/api/apis", base: "/apis", idKey: "api_id",
    description: "Endpoints exposed by services, and how many services consume each.",
    fields: (svc: Field["options"]): Field[] => [
      { name: "name", label: "Name", required: true, minLength: 2, maxLength: 150 },
      { name: "path", label: "Path", maxLength: 255, pattern: /^\//, patternMsg: "Paths start with /", hint: "e.g. /orders/{id}" },
      { name: "version", label: "Version", maxLength: 20, hint: "e.g. v2" },
      { name: "status", label: "Status", type: "select", required: true, options: enumOptions(API_STATUSES) },
      { name: "service_id", label: "Provider service", type: "select", required: true, options: svc },
    ],
  },
  table: {
    title: "Database Tables", noun: "table", endpoint: "/api/tables", base: "/tables", idKey: "table_id",
    description: "Tables owned by services, and which services read or write them.",
    fields: (svc: Field["options"]): Field[] => [
      { name: "name", label: "Table name", required: true, maxLength: 150, pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, patternMsg: "Letters, digits and underscores only." },
      { name: "description", label: "Description", type: "textarea", maxLength: 2000 },
      { name: "service_id", label: "Owner service", type: "select", required: true, options: svc },
    ],
  },
} as const;

type ListRow = { api_id?: number; table_id?: number; name: string; path?: string; version?: string; status?: string; service_id: number; service: string; consumers?: number; users?: number; description?: string };

export function AssetList({ kind }: { kind: Kind }) {
  const c = CFG[kind];
  const user = useUser();
  const router = useRouter();
  const list = useListQuery<ListRow>(c.endpoint);
  const lk = useApi<Lookups>(user.role === "admin" ? "/api/lookups" : null);
  const [creating, setCreating] = useState(false);
  const idOf = (r: ListRow) => (kind === "api" ? r.api_id : r.table_id)!;

  const columns = useMemo<ColumnDef<ListRow>[]>(() => kind === "api" ? [
    { id: "name", header: "Name", cell: ({ row: { original: r } }) => <span className="flex items-center gap-2"><KindIcon kind="api" className="size-5" /><span className="font-medium">{r.name}</span></span> },
    { id: "path", header: "Endpoint", cell: ({ row: { original: r } }) => <Mono>{r.path} {r.version}</Mono> },
    { id: "status", header: "Status", cell: ({ row: { original: r } }) => <StatusBadge status={r.status!} /> },
    { id: "service", header: "Provider", cell: ({ row: { original: r } }) => r.service },
    { id: "consumers", header: "Consumers", cell: ({ row: { original: r } }) => `${r.consumers} service${r.consumers === 1 ? "" : "s"}` },
  ] : [
    { id: "name", header: "Table", cell: ({ row: { original: r } }) => <span className="flex items-center gap-2"><KindIcon kind="table" className="size-5" /><span className="font-mono text-xs font-medium">{r.name}</span></span> },
    { id: "description", header: "Description", cell: ({ row: { original: r } }) => <span className="text-muted-foreground">{r.description}</span> },
    { id: "service", header: "Owner service", cell: ({ row: { original: r } }) => r.service },
    { id: "users", header: "Used by", cell: ({ row: { original: r } }) => `${r.users} service${r.users === 1 ? "" : "s"}` },
  ], [kind]);

  return (
    <div className="space-y-4">
      <PageHeader title={c.title} description={c.description}
        actions={user.role === "admin" && <Button onClick={() => setCreating(true)}><Plus /> New {c.noun}</Button>} />
      <ListFilters list={list} placeholder={`Search ${c.title.toLowerCase()}…`} statuses={kind === "api" ? API_STATUSES : undefined} />
      <DataTable list={list} columns={columns} sortable={kind === "api" ? ["name", "path", "status", "service", "consumers"] : ["name", "service", "users"]}
        onRowClick={(r) => router.push(`${c.base}/${idOf(r)}`)} empty={<EmptyState title={`No ${c.title.toLowerCase()} match`} />} />
      <FormDialog open={creating} onOpenChange={setCreating} title={`New ${c.noun}`} submitLabel="Create" successMessage={`${label(c.noun)} created.`}
        fields={c.fields(lk.data?.services.map((s) => ({ value: s.id, label: s.name })) ?? [])} initial={{ status: "active" }}
        onSubmit={async (v) => { const r = await api<Record<string, number>>(c.endpoint, { method: "POST", body: v }); router.push(`${c.base}/${r[c.idKey]}`); }} />
    </div>
  );
}

type Usage = { usage_id: number; service_id: number; name: string; status: string; relationship_type: string };
type AssetDetailData = {
  api?: Record<string, string | number | null>; table?: Record<string, string | number | null>;
  consumers?: Usage[]; users?: Usage[];
  commits: { commit_id: number; message: string; timestamp: string; hash: string; author_id: number; author: string }[];
  adrs: { adr_id: number; title: string; decision: string; context: string | null; created_date: string; author: string }[];
  issues: { id: number; title: string; severity: string; status: string; created_date: string }[];
  incidents: { id: number; title: string; severity: string; status: string; created_date: string }[];
};

export function AssetDetail({ kind, id }: { kind: Kind; id: string }) {
  const c = CFG[kind];
  const user = useUser();
  const admin = user.role === "admin";
  const router = useRouter();
  const state = useApi<AssetDetailData>(`${c.endpoint}/${id}`);
  const lk = useApi<Lookups>(admin ? "/api/lookups" : null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blocked, setBlocked] = useState<{ message: string; consumers: { service_id: number; name: string }[] } | null>(null);
  const [addingUsage, setAddingUsage] = useState(false);
  const [removingUsage, setRemovingUsage] = useState<Usage | null>(null);

  return (
    <Async state={state} rows={8}>
      {(d) => {
        const a = (d.api ?? d.table)!;
        const usage = (d.consumers ?? d.users)!;
        const title = kind === "api" ? `${a.name}` : String(a.name);
        return (
          <div className="space-y-4">
            <PageHeader crumbs={[{ label: c.title, href: c.base }, { label: title }]}
              title={<span className="flex items-center gap-3"><KindIcon kind={kind} className="size-9 [&_svg]:size-5" />{title}
                {kind === "api" && <Mono>{a.path} {a.version}</Mono>}</span>}
              description={(kind === "table" ? a.description : a.service_description) as string | undefined}
              actions={<>
                <Button asChild><Link href={`/impact?kind=${kind}&id=${id}&change=${kind === "api" ? "breaking_api" : "schema"}`}><Network /> Simulate impact</Link></Button>
                {admin && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
                {admin && <Button variant="outline" className="text-risk-high" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>}
              </>} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span>Type <b className="text-foreground">{kind === "api" ? "API" : "Database table"}</b></span>
              {kind === "api" && <span className="flex items-center gap-2">Status <StatusBadge status={String(a.status)} /></span>}
              <span>{kind === "api" ? "Provider" : "Owner service"} <Link className="text-primary hover:underline" href={`/services/${a.service_id}`}>{a.service}</Link></span>
              <span className="flex items-center gap-2">Owner <Person id={Number(a.maintainer_id)} name={String(a.owner)} /></span>
              <span className="flex items-center gap-2">Repository <RepoLink id={Number(a.repo_id)} name={String(a.repo)} url={a.repo_url as string | null} /></span>
            </div>

            {blocked && (
              <Banner tone="error" title="Deletion blocked" action={<Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setBlocked(null)}><X /></Button>}>
                <p>{blocked.message}</p>
                <p className="mt-1">Consumers: {blocked.consumers.map((s, i) => (
                  <span key={s.service_id}>{i > 0 && ", "}<Link className="font-medium text-primary underline" href={`/services/${s.service_id}`}>{s.name}</Link></span>))}</p>
              </Banner>
            )}

            <UrlTabs tabs={[
              { id: "overview", label: "Overview", content: (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Panel title="Summary">
                    <KeyValues items={[
                      [kind === "api" ? "Consumers" : "Used by", `${usage.length} service(s)`],
                      ["Open issues", `${d.issues.filter((i) => i.status === "open" || i.status === "in_progress").length} (on ${a.service})`],
                      ["Incidents", `${d.incidents.filter((i) => i.status !== "resolved").length} open (on ${a.service})`],
                      ["ADRs", d.adrs.length],
                    ]} />
                    <p className="mt-3 text-xs text-muted-foreground">Issues, incidents, commits and ADRs are recorded per service, so they are shown for the parent service {String(a.service)}.</p>
                  </Panel>
                  <Panel title={kind === "api" ? "Who calls this API" : "Who reads/writes this table"}>
                    {usage.length === 0 ? <p className="text-sm text-muted-foreground">No service uses it.</p> : (
                      <ul className="space-y-1 text-sm">{usage.map((u) => <li key={u.usage_id}><Link href={`/services/${u.service_id}`} className="text-primary hover:underline">{u.name}</Link> <span className="text-muted-foreground">({label(u.relationship_type)})</span></li>)}</ul>
                    )}
                  </Panel>
                </div>
              ) },
              { id: "dependencies", label: `Dependencies (${usage.length + 1})`, content: (
                <div className="space-y-4">
                  {admin && <Button size="sm" onClick={() => setAddingUsage(true)}><Plus /> Add {kind === "api" ? "consumer" : "service usage"}</Button>}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title={`Incoming: ${kind === "api" ? "consumers" : "used by"} (${usage.length})`}>
                      <p className="mb-2 text-xs text-muted-foreground">These services depend on this {c.noun}. Changing it can break them.</p>
                      <SimpleTable rows={usage} rowKey={(u) => u.usage_id} empty={<EmptyState title="No consumers" />} cols={[
                        { key: "n", header: "Service", cell: (u) => <Link href={`/services/${u.service_id}`} className="font-medium hover:underline">{u.name}</Link> },
                        { key: "s", header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
                        { key: "t", header: kind === "api" ? "Mode" : "Access", cell: (u) => label(u.relationship_type) },
                        ...(admin ? [{ key: "x", header: "", cell: (u: Usage) => <Button variant="ghost" size="icon-sm" aria-label={`Remove usage by ${u.name}`} onClick={() => setRemovingUsage(u)}><X /></Button> }] : []),
                      ]} />
                    </Panel>
                    <Panel title="Outgoing: belongs to">
                      <p className="mb-2 text-xs text-muted-foreground">This {c.noun} is {kind === "api" ? "served" : "owned"} by one service.</p>
                      <Link href={`/services/${a.service_id}`} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"><KindIcon kind="service" className="size-5" />{a.service}</Link>
                    </Panel>
                  </div>
                </div>
              ) },
              { id: "commits", label: `Commits (${d.commits.length})`, content: <CommitList commits={d.commits} repoUrl={a.repo_url as string | null} /> },
              { id: "issues", label: `Issues (${d.issues.length})`, content: <WorkList rows={d.issues} kind="issues" /> },
              { id: "incidents", label: `Incidents (${d.incidents.length})`, content: <WorkList rows={d.incidents} kind="incidents" /> },
              { id: "adrs", label: `ADRs (${d.adrs.length})`, content: <AdrList adrs={d.adrs} /> },
              { id: "owners", label: "Owners", content: (
                <Panel><p className="text-sm">Owned through its {kind === "api" ? "provider" : "owner"} service <Link className="text-primary hover:underline" href={`/services/${a.service_id}?tab=owners`}>{a.service}</Link>, maintained by <Person id={Number(a.maintainer_id)} name={String(a.owner)} />.</p></Panel>
              ) },
            ]} />

            <FormDialog open={editing} onOpenChange={setEditing} title={`Edit ${c.noun}`} initial={a} submitLabel="Save changes" successMessage={`${label(c.noun)} updated.`}
              fields={c.fields(lk.data?.services.map((s) => ({ value: s.id, label: s.name })) ?? [])}
              onSubmit={async (v) => { await api(`${c.endpoint}/${id}`, { method: "PATCH", body: v }); state.reload(); }} />

            <FormDialog open={addingUsage} onOpenChange={setAddingUsage} title={kind === "api" ? "Add consumer" : "Add service usage"} submitLabel="Add" successMessage="Usage added."
              fields={[
                { name: "service_id", label: "Service", type: "select", required: true, options: lk.data?.services.map((s) => ({ value: s.id, label: s.name })) ?? [] },
                { name: "relationship_type", label: kind === "api" ? "Mode" : "Access", type: "select", required: true,
                  options: enumOptions(kind === "api" ? ["sync", "async"] : ["read_only", "write_only", "read_write"]) },
              ]}
              initial={{ relationship_type: kind === "api" ? "sync" : "read_only" }}
              onSubmit={async (v) => { await api(`/api/usage/${kind}/${id}`, { method: "POST", body: v }); state.reload(); }} />

            <ConfirmDialog open={!!removingUsage} onOpenChange={(o) => !o && setRemovingUsage(null)} title="Remove usage?" confirmLabel="Remove"
              onConfirm={async () => {
                try { await api(`/api/usage/${kind}/${removingUsage!.usage_id}`, { method: "DELETE" }); toast.success("Usage removed."); state.reload(); }
                catch (e) { toast.error((e as Error).message); throw e; }
              }}>
              <p>{removingUsage?.name} will no longer be recorded as using this {c.noun}.</p>
            </ConfirmDialog>

            <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete ${c.noun} ${title}?`}
              onConfirm={async () => {
                try {
                  await api(`${c.endpoint}/${id}`, { method: "DELETE" });
                  toast.success(`${label(c.noun)} deleted.`);
                  router.push(c.base);
                } catch (e) {
                  const fe = e as FetchError;
                  if (fe.data?.code === "HAS_CONSUMERS") setBlocked({ message: fe.message, consumers: fe.data.consumers as { service_id: number; name: string }[] });
                  else toast.error(fe.message);
                }
              }}>
              {usage.length > 0
                ? <p className="text-risk-high">{usage.length} service(s) still use this {c.noun}; the server will block the deletion until those usages are removed.</p>
                : <p>This permanently removes the {c.noun}{kind === "api" ? " and its usage records" : ""}. It cannot be undone.</p>}
            </ConfirmDialog>
          </div>
        );
      }}
    </Async>
  );
}
