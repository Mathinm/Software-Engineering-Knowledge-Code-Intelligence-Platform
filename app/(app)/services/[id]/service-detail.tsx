"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Network, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Async, Banner, ConfirmDialog, EmptyState, KindIcon, Mono, PageHeader, Panel, Person, RiskBadge, SimpleTable, Stat,
  StatusBadge, fmtDate, timeAgo,
} from "@/components/common";
import { AdrList, CommitList, KeyValues, RepoLink, UrlTabs, WorkList } from "@/components/detail";
import { FormDialog, enumOptions } from "@/components/form-dialog";
import { useUser } from "@/components/session";
import { api, useApi } from "@/lib/client";
import { DEPENDENCY_TYPES, SERVICE_STATUSES, classifyRisk, label } from "@/lib/domain";

type Edge = { dependency_id: number; id: number; name: string; status: string; relationship_type: string };
type Detail = {
  service: { service_id: number; name: string; description: string | null; status: string; created_date: string; repo_id: number; repo: string; repo_url: string | null; maintainer_id: number; maintainer: string; last_commit: string | null };
  incoming: Edge[]; outgoing: Edge[];
  apisUsed: { id: number; name: string; path: string; version: string; relationship_type: string; provider: string }[];
  tablesUsed: { id: number; name: string; relationship_type: string; owner_service: string }[];
  apis: { api_id: number; name: string; path: string; version: string; status: string; consumers: number }[];
  tables: { table_id: number; name: string; description: string | null; users: number }[];
  commits: { commit_id: number; message: string; timestamp: string; hash: string; author_id: number; author: string }[];
  owners: { developer_id: number; name: string; role: string; commits: number; is_maintainer: boolean; is_repo_owner: boolean }[];
  adrs: { adr_id: number; title: string; decision: string; context: string | null; created_date: string; author: string }[];
  issues: { id: number; title: string; severity: string; status: string; created_date: string }[];
  incidents: { id: number; title: string; severity: string; status: string; created_date: string }[];
};
type Lookups = { services: { id: number; name: string }[]; repositories: { id: number; name: string }[]; developers: { id: number; name: string }[] };
type Preview = { dependents: { service_id: number; name: string }[]; cascades: Record<string, number> };

export function ServiceDetail({ id }: { id: string }) {
  const user = useUser();
  const admin = user.role === "admin";
  const router = useRouter();
  const state = useApi<Detail>(`/api/services/${id}`);
  const allDeps = useApi<{ dependencies: { id: number; name: string; depth: number; path: string }[] }>(`/api/services/${id}/dependencies`);
  const lk = useApi<Lookups>(admin ? "/api/lookups" : null);
  const [editing, setEditing] = useState(false);
  const [addingDep, setAddingDep] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [removing, setRemoving] = useState<Edge | null>(null);

  const startDelete = async () => {
    try { setPreview(await api<Preview>(`/api/services/${id}?preview=delete`)); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Async state={state} rows={8}>
      {(d) => {
        const s = d.service;
        const openIssues = d.issues.filter((i) => i.status === "open" || i.status === "in_progress");
        const openInc = d.incidents.filter((i) => i.status !== "resolved");
        const open = [...openIssues, ...openInc];
        const risk = classifyRisk({
          affectedServices: d.incoming.length,
          openCritical: open.filter((i) => i.severity === "critical").length,
          openHigh: open.filter((i) => i.severity === "high").length,
        });
        const single = d.owners.filter((o) => o.commits > 0).length <= 1;

        const depTable = (rows: Edge[], dir: "in" | "out") => (
          <SimpleTable rows={rows} rowKey={(r) => r.dependency_id}
            empty={<EmptyState title={dir === "in" ? "Nothing depends on this service" : "No outgoing dependencies"} />}
            cols={[
              { key: "n", header: "Service", cell: (r) => <Link href={`/services/${r.id}`} className="flex items-center gap-2 font-medium hover:underline"><KindIcon kind="service" className="size-5" />{r.name}</Link> },
              { key: "s", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              { key: "t", header: "Type", cell: (r) => label(r.relationship_type) },
              ...(admin ? [{ key: "a", header: "", cell: (r: Edge) => <Button variant="ghost" size="icon-sm" aria-label={`Remove dependency on ${r.name}`} onClick={() => setRemoving(r)}><X /></Button> }] : []),
            ]} />
        );

        return (
          <div className="space-y-4">
            <PageHeader crumbs={[{ label: "Services", href: "/services" }, { label: s.name }]}
              title={<span className="flex items-center gap-3"><KindIcon kind="service" className="size-9 [&_svg]:size-5" />{s.name}</span>}
              description={s.description ?? undefined}
              actions={<>
                <Button asChild><Link href={`/impact?kind=service&id=${s.service_id}`}><Network /> Simulate impact</Link></Button>
                {admin && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
                {admin && <Button variant="outline" className="text-risk-high" onClick={startDelete}><Trash2 /> Delete</Button>}
              </>} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">Type <b className="text-foreground">Service</b></span>
              <span className="flex items-center gap-2 text-muted-foreground">Status <StatusBadge status={s.status} /></span>
              <span className="flex items-center gap-2 text-muted-foreground">Owner <Person id={s.maintainer_id} name={s.maintainer} /></span>
              <span className="flex items-center gap-2 text-muted-foreground">Repository <RepoLink id={s.repo_id} name={s.repo} url={s.repo_url} /></span>
            </div>
            {s.status !== "active" && d.incoming.length > 0 && (
              <Banner tone="warn" title={`This service is in ${s.status}. ${d.incoming.length} service(s) depend on it directly.`}
                action={<Button asChild size="sm" variant="outline"><Link href={`/impact?kind=service&id=${s.service_id}&change=deprecation&depth=5`}>See full impact</Link></Button>}>
                {d.incoming.map((x) => x.name).join(", ")}
              </Banner>
            )}

            <UrlTabs tabs={[
              { id: "overview", label: "Overview", content: (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat label="Used by" value={d.incoming.length} hint="services depending on it" />
                    <Stat label="Depends on" value={d.outgoing.length} hint="services it calls" />
                    <Stat label="Open issues" value={openIssues.length} hint={`${openInc.length} open incident(s)`} />
                    <div className="rounded-xl border bg-card p-4"><div className="mb-1 text-sm font-medium">Current risk</div><RiskBadge level={risk} />
                      <p className="mt-1 text-xs text-muted-foreground">Shared rule, applied to its direct dependents and its own open work.</p></div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title="Summary">
                      <KeyValues items={[
                        ["Created", fmtDate(s.created_date)], ["Last commit", s.last_commit ? timeAgo(s.last_commit) : "—"],
                        ["APIs", d.apis.length], ["Tables", d.tables.length],
                        ["Contributors", `${d.owners.filter((o) => o.commits > 0).length}${single ? " (single contributor)" : ""}`], ["ADRs", d.adrs.length],
                      ]} />
                    </Panel>
                    <Panel title="Recent commits">
                      {d.commits.length === 0 ? <EmptyState title="No commits" /> : (
                        <ul className="space-y-2 text-sm">{d.commits.slice(0, 5).map((c) => (
                          <li key={c.commit_id} className="flex justify-between gap-2"><span className="truncate">{c.message}</span><span className="shrink-0 text-xs text-muted-foreground">{c.author} · {timeAgo(c.timestamp)}</span></li>))}</ul>
                      )}
                    </Panel>
                  </div>
                  <Panel title="Owned APIs and tables">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <SimpleTable rows={d.apis} rowKey={(a) => a.api_id} empty={<EmptyState title="No APIs" />} cols={[
                        { key: "n", header: "API", cell: (a) => <Link href={`/apis/${a.api_id}`} className="hover:underline"><span className="font-medium">{a.name}</span> <Mono>{a.path} {a.version}</Mono></Link> },
                        { key: "s", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
                        { key: "c", header: "Consumers", cell: (a) => a.consumers },
                      ]} />
                      <SimpleTable rows={d.tables} rowKey={(t) => t.table_id} empty={<EmptyState title="No tables" />} cols={[
                        { key: "n", header: "Table", cell: (t) => <Link href={`/tables/${t.table_id}`} className="font-mono text-xs hover:underline">{t.name}</Link> },
                        { key: "u", header: "Used by", cell: (t) => `${t.users} service(s)` },
                      ]} />
                    </div>
                  </Panel>
                </div>
              ) },
              { id: "dependencies", label: `Dependencies (${d.incoming.length + d.outgoing.length})`, content: (
                <div className="space-y-4">
                  {admin && <div><Button size="sm" onClick={() => setAddingDep(true)}><Plus /> Add dependency</Button></div>}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title={`Incoming: used by (${d.incoming.length})`}>
                      <p className="mb-2 text-xs text-muted-foreground">These services depend on {s.name}. A breaking change here can break them.</p>
                      {depTable(d.incoming, "in")}
                    </Panel>
                    <Panel title={`Outgoing: depends on (${d.outgoing.length})`}>
                      <p className="mb-2 text-xs text-muted-foreground">{s.name} calls these services. If they change, {s.name} may break.</p>
                      {depTable(d.outgoing, "out")}
                    </Panel>
                    <Panel title={`Depends on (all levels) (${allDeps.data?.dependencies.length ?? "…"})`}>
                      <p className="mb-2 text-xs text-muted-foreground">Every service {s.name} needs, directly or through other services, from the <code className="font-mono">get_dependencies()</code> recursive query.</p>
                      <Async state={allDeps} rows={3}>
                        {(a) => (
                          <SimpleTable rows={a.dependencies} rowKey={(r) => r.id}
                            empty={<EmptyState title="No dependencies">{s.name} depends on no other service.</EmptyState>}
                            cols={[
                              { key: "n", header: "Service", cell: (r) => <Link href={`/services/${r.id}`} className="flex items-center gap-2 font-medium hover:underline"><KindIcon kind="service" className="size-5" />{r.name}</Link> },
                              { key: "d", header: "Depth", cell: (r) => <span className="inline-flex min-w-6 justify-center rounded border bg-muted px-1.5 text-xs tabular-nums" title={r.depth === 1 ? "direct" : `${r.depth} hops away`}>{r.depth}</span> },
                              { key: "p", header: "Path", cell: (r) => <span className="text-xs text-muted-foreground">{r.path}</span> },
                            ]} />
                        )}
                      </Async>
                    </Panel>
                    <Panel title={`APIs it calls (${d.apisUsed.length})`}>
                      <SimpleTable rows={d.apisUsed} rowKey={(a) => a.id} empty={<EmptyState title="Calls no APIs" />} cols={[
                        { key: "n", header: "API", cell: (a) => <Link href={`/apis/${a.id}`} className="hover:underline"><Mono>{a.path} {a.version}</Mono></Link> },
                        { key: "p", header: "Provider", cell: (a) => a.provider }, { key: "t", header: "Mode", cell: (a) => a.relationship_type },
                      ]} />
                    </Panel>
                    <Panel title={`Tables it uses (${d.tablesUsed.length})`}>
                      <SimpleTable rows={d.tablesUsed} rowKey={(t) => t.id} empty={<EmptyState title="Uses no tables" />} cols={[
                        { key: "n", header: "Table", cell: (t) => <Link href={`/tables/${t.id}`} className="font-mono text-xs hover:underline">{t.name}</Link> },
                        { key: "o", header: "Owner", cell: (t) => t.owner_service }, { key: "t", header: "Access", cell: (t) => label(t.relationship_type) },
                      ]} />
                    </Panel>
                  </div>
                </div>
              ) },
              { id: "commits", label: `Commits (${d.commits.length})`, content: <CommitList commits={d.commits} repoUrl={s.repo_url} /> },
              { id: "issues", label: `Issues (${d.issues.length})`, content: <WorkList rows={d.issues} kind="issues" /> },
              { id: "incidents", label: `Incidents (${d.incidents.length})`, content: <WorkList rows={d.incidents} kind="incidents" /> },
              { id: "adrs", label: `ADRs (${d.adrs.length})`, content: <AdrList adrs={d.adrs} /> },
              { id: "owners", label: "Owners", content: (
                <div className="space-y-3">
                  {single && <Banner tone="warn" title="Single contributor">Only one person has committed to {s.repo}. Knowledge about this service is concentrated.</Banner>}
                  <SimpleTable rows={d.owners} rowKey={(o) => o.developer_id} empty={<EmptyState title="No contributors" />} cols={[
                    { key: "n", header: "Person", cell: (o) => <Person id={o.developer_id} name={o.name} /> },
                    { key: "r", header: "Role", cell: (o) => o.role },
                    { key: "resp", header: "Responsibility", cell: (o) => [o.is_maintainer && "Service maintainer", o.is_repo_owner && "Repository owner", o.commits > 0 && "Contributor"].filter(Boolean).join(" · ") },
                    { key: "c", header: "Commits to repo", cell: (o) => o.commits },
                  ]} />
                </div>
              ) },
            ]} />

            <FormDialog open={editing} onOpenChange={setEditing} title={`Edit ${s.name}`} initial={s} submitLabel="Save changes" successMessage="Service updated."
              description="Changing the status to deprecated or maintenance flags its dependents for review in the Audit Log."
              fields={[
                { name: "name", label: "Name", required: true, minLength: 2, maxLength: 150 },
                { name: "description", label: "Description", type: "textarea", maxLength: 2000 },
                { name: "status", label: "Status", type: "select", required: true, options: enumOptions(SERVICE_STATUSES) },
                { name: "repo_id", label: "Repository", type: "select", required: true, options: lk.data?.repositories.map((r) => ({ value: r.id, label: r.name })) ?? [] },
                { name: "maintainer_id", label: "Maintainer", type: "select", required: true, options: lk.data?.developers.map((x) => ({ value: x.id, label: x.name })) ?? [] },
              ]}
              onSubmit={async (v) => { await api(`/api/services/${s.service_id}`, { method: "PATCH", body: v }); state.reload(); }} />

            <FormDialog open={addingDep} onOpenChange={setAddingDep} title={`${s.name} depends on…`} submitLabel="Add dependency" successMessage="Dependency added."
              description="The database rejects dependencies that would create a cycle (trigger trg_no_dependency_cycle)."
              fields={[
                { name: "depends_on_service_id", label: "Depends on service", type: "select", required: true, options: lk.data?.services.filter((x) => x.id !== s.service_id).map((x) => ({ value: x.id, label: x.name })) ?? [] },
                { name: "relationship_type", label: "Relationship", type: "select", required: true, options: enumOptions(DEPENDENCY_TYPES) },
              ]}
              initial={{ relationship_type: "runtime" }}
              onSubmit={async (v) => { await api("/api/dependencies", { method: "POST", body: { ...v, service_id: s.service_id } }); state.reload(); }} />

            <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove dependency?" confirmLabel="Remove"
              onConfirm={async () => {
                try { await api(`/api/dependencies/${removing!.dependency_id}`, { method: "DELETE" }); toast.success("Dependency removed."); state.reload(); }
                catch (e) { toast.error((e as Error).message); throw e; }
              }}>
              <p>The edge between {s.name} and {removing?.name} will be deleted. Impact analysis will no longer follow it.</p>
            </ConfirmDialog>

            <ConfirmDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={`Delete ${s.name}?`}
              confirmLabel={preview?.dependents.length ? "Delete anyway" : "Delete service"}
              onConfirm={async () => {
                try {
                  await api(`/api/services/${s.service_id}?confirm=true`, { method: "DELETE" });
                  toast.success(`${s.name} deleted.`);
                  router.push("/services");
                } catch (e) { toast.error((e as Error).message); throw e; }
              }}>
              {preview?.dependents.length ? (
                <div className="rounded-lg border border-risk-high/40 bg-risk-high-bg p-3 text-foreground">
                  <p className="font-medium">{preview.dependents.length} service(s) depend on {s.name}:</p>
                  <ul className="mt-1 list-disc pl-5">{preview.dependents.map((x) => <li key={x.service_id}><Link className="text-primary underline" href={`/services/${x.service_id}`}>{x.name}</Link></li>)}</ul>
                  <p className="mt-1 text-xs">Their dependency edges will be removed and impact analysis will no longer see them.</p>
                </div>
              ) : <p>No other service depends on it.</p>}
              {preview && (
                <p>The foreign keys cascade, so this also permanently deletes: {Object.entries(preview.cascades).map(([k, n]) => `${n} ${k}`).join(", ")}.</p>
              )}
            </ConfirmDialog>
            <div className="text-right"><Link href="/services" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">All services <ArrowRight className="size-3.5" /></Link></div>
          </div>
        );
      }}
    </Async>
  );
}

