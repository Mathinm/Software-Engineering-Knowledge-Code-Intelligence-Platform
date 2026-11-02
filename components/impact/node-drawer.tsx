"use client";
import Link from "next/link";
import { ArrowRight, ExternalLink, FolderGit2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApi } from "@/lib/client";
import type { ComponentKind } from "@/lib/domain";
import {
  Async, Avatar, EmptyState, KindIcon, Mono, SeverityBadge, StatusBadge, fmtDate, kindHref, kindLabel, timeAgo,
} from "../common";

type Row = { id: number; title: string; severity: string; status: string };
type NodeSummary = {
  kind: ComponentKind; id: number; name: string; detail: string | null; description: string | null;
  service_id: number; service: string; service_description: string | null;
  repo_id: number; repo: string; repo_url: string | null; owner_id: number; owner: string;
  stats: { apis: number; tables: number; dependents: number; open_issues: number; open_incidents: number; last_updated: string | null; consumers: number | null };
  commits: { commit_id: number; message: string; hash: string; timestamp: string; author: string }[];
  issues: Row[]; incidents: Row[];
  adrs: { adr_id: number; title: string; created_date: string }[];
  dependents: { id: number; name: string }[]; dependencies: { id: number; name: string }[];
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[96px_1fr] gap-2 py-1 text-sm"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0">{children}</dd></div>;
}

export function NodeDrawer({ kind, id, onClose }: { kind: ComponentKind; id: number; onClose: () => void }) {
  const state = useApi<NodeSummary>(`/api/nodes/${kind}/${id}`);
  return (
    <aside className="flex h-full flex-col rounded-xl border bg-card shadow-xs" aria-label="Component details">
      <div className="flex items-start gap-3 border-b p-4">
        <KindIcon kind={kind} className="size-10 [&_svg]:size-5" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{state.data?.name ?? "Loading…"}</h2>
          <p className="text-sm text-muted-foreground">{kindLabel(kind)}{state.data && kind !== "service" ? ` of ${state.data.service}` : ""}</p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details"><X /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <Async state={state} rows={6}>
          {(n) => (
            <Tabs defaultValue="overview">
              <TabsList className="mb-3 flex h-auto w-full justify-start overflow-x-auto [&>button]:flex-none [&>button]:px-2 [&>button]:text-xs">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="deps">Dependencies</TabsTrigger>
                <TabsTrigger value="issues">Issues ({n.issues.length})</TabsTrigger>
                <TabsTrigger value="commits">Commits</TabsTrigger>
                <TabsTrigger value="adrs">ADRs</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <p className="text-sm">{n.description ?? n.service_description ?? "No description."}</p>
                <dl>
                  {n.detail && kind === "api" && <Field label="Endpoint"><Mono>{n.detail}</Mono></Field>}
                  <Field label="Owner"><Link href={`/developers/${n.owner_id}`} className="inline-flex items-center gap-2 hover:underline"><Avatar name={n.owner} />{n.owner}</Link></Field>
                  <Field label="Repository">
                    {n.repo_url
                      ? <a href={n.repo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FolderGit2 className="size-3.5" aria-hidden />{n.repo}<ExternalLink className="size-3" aria-hidden /><span className="sr-only">(opens in new tab)</span></a>
                      : n.repo}
                  </Field>
                  <Field label="Last updated">{n.stats.last_updated ? <span title={n.stats.last_updated}>{timeAgo(n.stats.last_updated)} <span className="text-xs text-muted-foreground">(last commit)</span></span> : "—"}</Field>
                  {kind !== "service" && <Field label="Service"><Link className="text-primary hover:underline" href={`/services/${n.service_id}`}>{n.service}</Link></Field>}
                </dl>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    [n.stats.apis, "APIs"], [n.stats.tables, "DB tables"], [n.stats.dependents, "Dependents"],
                    [n.stats.open_issues + n.stats.open_incidents, "Open items"],
                  ].map(([v, l]) => (
                    <div key={l as string} className="rounded-lg border p-2">
                      <div className="text-lg font-semibold">{v}</div>
                      <div className="text-[11px] leading-tight text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
                {n.stats.consumers !== null && <p className="text-xs text-muted-foreground">{n.stats.consumers} service(s) use this {kind === "api" ? "API" : "table"} directly. Counts above are for its parent service.</p>}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Recent commits</h3>
                    <Link href={`/repositories/${n.repo_id}`} className="text-xs text-primary hover:underline">View all</Link>
                  </div>
                  {n.commits.length === 0 ? <p className="text-sm text-muted-foreground">No commits recorded for this repository.</p> : (
                    <ul className="space-y-2">
                      {n.commits.slice(0, 3).map((c) => (
                        <li key={c.commit_id} className="flex gap-2 text-sm">
                          <Avatar name={c.author} className="mt-0.5" />
                          <div className="min-w-0"><div className="truncate">{c.message}</div>
                            <div className="text-xs text-muted-foreground"><Mono>{c.hash.slice(0, 7)}</Mono> · {c.author} · {timeAgo(c.timestamp)}</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="w-full"><Link href={kindHref(kind, id)}>Open {kindLabel(kind).toLowerCase()} page <ArrowRight /></Link></Button>
              </TabsContent>

              <TabsContent value="deps" className="space-y-4 text-sm">
                <div>
                  <h3 className="mb-1 font-semibold">Used by ({n.dependents.length})</h3>
                  <p className="mb-2 text-xs text-muted-foreground">Services that depend on {n.service} — they may break if it changes.</p>
                  {n.dependents.length ? <ul className="space-y-1">{n.dependents.map((d) => <li key={d.id}><Link className="text-primary hover:underline" href={`/services/${d.id}`}>{d.name}</Link></li>)}</ul> : <p className="text-muted-foreground">Nothing depends on it.</p>}
                </div>
                <div>
                  <h3 className="mb-1 font-semibold">Depends on ({n.dependencies.length})</h3>
                  {n.dependencies.length ? <ul className="space-y-1">{n.dependencies.map((d) => <li key={d.id}><Link className="text-primary hover:underline" href={`/services/${d.id}`}>{d.name}</Link></li>)}</ul> : <p className="text-muted-foreground">No service dependencies.</p>}
                </div>
              </TabsContent>

              <TabsContent value="issues" className="space-y-3">
                {n.issues.length === 0 && n.incidents.length === 0 && <EmptyState title="No open issues">Nothing open on {n.service}.</EmptyState>}
                {n.issues.length > 0 && <ul className="space-y-2">{n.issues.map((i) => (
                  <li key={i.id} className="rounded-lg border p-2 text-sm"><Link href={`/issues/${i.id}`} className="font-medium hover:underline">#{i.id} {i.title}</Link>
                    <div className="mt-1 flex gap-1"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></div></li>))}</ul>}
                {n.incidents.length > 0 && (<>
                  <h3 className="pt-2 text-sm font-semibold">Recent incidents</h3>
                  <ul className="space-y-2">{n.incidents.map((i) => (
                    <li key={i.id} className="rounded-lg border p-2 text-sm"><Link href={`/incidents/${i.id}`} className="font-medium hover:underline">INC-{i.id} {i.title}</Link>
                      <div className="mt-1 flex gap-1"><SeverityBadge severity={i.severity} /><StatusBadge status={i.status} /></div></li>))}</ul>
                </>)}
              </TabsContent>

              <TabsContent value="commits">
                {n.commits.length === 0 ? <EmptyState title="No commits" /> : (
                  <ul className="space-y-2">{n.commits.map((c) => (
                    <li key={c.commit_id} className="flex gap-2 text-sm"><Avatar name={c.author} className="mt-0.5" />
                      <div className="min-w-0"><div>{c.message}</div><div className="text-xs text-muted-foreground"><Mono>{c.hash.slice(0, 7)}</Mono> · {c.author} · {fmtDate(c.timestamp)}</div></div></li>))}</ul>
                )}
              </TabsContent>

              <TabsContent value="adrs">
                {n.adrs.length === 0 ? <EmptyState title="No ADRs">No architecture decisions recorded for {n.service}.</EmptyState> : (
                  <ul className="space-y-2">{n.adrs.map((a) => (
                    <li key={a.adr_id} className="rounded-lg border p-2 text-sm"><Link href={`/adrs/${a.adr_id}`} className="font-medium hover:underline">ADR-{a.adr_id}: {a.title}</Link>
                      <div className="text-xs text-muted-foreground">{fmtDate(a.created_date)}</div></li>))}</ul>
                )}
              </TabsContent>
            </Tabs>
          )}
        </Async>
      </div>
    </aside>
  );
}
