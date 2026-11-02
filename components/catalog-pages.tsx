"use client";
// Simple list + detail pages: repositories, developers, ADRs.
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Async, EmptyState, KindIcon, PageHeader, Panel, Person, SeverityBadge, SimpleTable, StatusBadge, fmtDate, timeAgo } from "./common";
import { DataTable, useListQuery } from "./data-table";
import { CommitList, KeyValues, RepoLink } from "./detail";
import { ListFilters } from "./list-filters";
import { useApi } from "@/lib/client";

// ------------------------------------------------------------------ repositories
type Repo = { repo_id: number; name: string; url: string | null; description: string | null; owner_id: number; owner: string; commits: number; services: number; last_commit: string | null; created_date: string };

export function RepositoryList() {
  const router = useRouter();
  const list = useListQuery<Repo>("/api/repositories");
  const cols = useMemo<ColumnDef<Repo>[]>(() => [
    { id: "name", header: "Repository", cell: ({ row: { original: r } }) => <span className="font-medium">{r.name}</span> },
    { id: "desc", header: "Description", cell: ({ row: { original: r } }) => <span className="text-muted-foreground">{r.description}</span> },
    { id: "owner", header: "Owner", cell: ({ row: { original: r } }) => <Person name={r.owner} /> },
    { id: "services", header: "Services", cell: ({ row: { original: r } }) => r.services },
    { id: "commits", header: "Commits", cell: ({ row: { original: r } }) => r.commits },
    { id: "last", header: "Last commit", cell: ({ row: { original: r } }) => timeAgo(r.last_commit) },
  ], []);
  return (
    <div className="space-y-4">
      <PageHeader title="Repositories" description="Source repositories and the services built from them." />
      <ListFilters list={list} placeholder="Search repositories…" />
      <DataTable list={list} columns={cols} onRowClick={(r) => router.push(`/repositories/${r.repo_id}`)} empty={<EmptyState title="No repositories match" />} />
    </div>
  );
}

type RepoDetail = Repo & {
  services: { service_id: number; name: string; status: string }[];
  commits: { commit_id: number; message: string; timestamp: string; hash: string; author_id: number; author: string }[];
  contributors: { developer_id: number; name: string; commits: number }[];
};
export function RepositoryDetail({ id }: { id: string }) {
  const state = useApi<RepoDetail>(`/api/repositories/${id}`);
  return (
    <Async state={state}>
      {(r) => (
        <div className="space-y-4">
          <PageHeader crumbs={[{ label: "Repositories", href: "/repositories" }, { label: r.name }]} title={r.name} description={r.description ?? undefined} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="About"><KeyValues items={[["Owner", <Person key="o" id={r.owner_id} name={r.owner} />], ["Link", <RepoLink key="l" name={r.url?.replace("https://", "") ?? "—"} url={r.url} />], ["Created", fmtDate(r.created_date)]]} /></Panel>
            <Panel title={`Services (${r.services.length})`}>
              {r.services.length === 0 ? <EmptyState title="No services" /> : <ul className="space-y-1.5 text-sm">{r.services.map((s) => (
                <li key={s.service_id} className="flex items-center justify-between"><Link className="flex items-center gap-2 text-primary hover:underline" href={`/services/${s.service_id}`}><KindIcon kind="service" className="size-5" />{s.name}</Link><StatusBadge status={s.status} /></li>))}</ul>}
            </Panel>
            <Panel title={`Contributors (${r.contributors.length})`}>
              <ul className="space-y-1.5 text-sm">{r.contributors.map((c) => <li key={c.developer_id} className="flex justify-between"><Person id={c.developer_id} name={c.name} /><span className="text-muted-foreground">{c.commits} commits</span></li>)}</ul>
              {r.contributors.length === 1 && <p className="mt-2 text-xs text-risk-med">Single contributor: bus-factor risk.</p>}
            </Panel>
          </div>
          <Panel title={`Commits (${r.commits.length})`}><CommitList commits={r.commits} repoUrl={r.url} /></Panel>
        </div>
      )}
    </Async>
  );
}

// ------------------------------------------------------------------ developers (never includes password_hash)
type Dev = { developer_id: number; name: string; email: string; github_username: string | null; role: string | null; joined_date: string; auth_role: string; services: number; commits: number };

export function DeveloperList() {
  const router = useRouter();
  const list = useListQuery<Dev>("/api/developers");
  const cols = useMemo<ColumnDef<Dev>[]>(() => [
    { id: "name", header: "Name", cell: ({ row: { original: d } }) => <Person name={d.name} /> },
    { id: "role", header: "Role", cell: ({ row: { original: d } }) => d.role },
    { id: "email", header: "Email", cell: ({ row: { original: d } }) => <span className="text-muted-foreground">{d.email}</span> },
    { id: "access", header: "Access", cell: ({ row: { original: d } }) => <span className="rounded border px-1.5 py-0.5 text-xs">{d.auth_role === "admin" ? "Admin" : "Developer"}</span> },
    { id: "services", header: "Maintains", cell: ({ row: { original: d } }) => `${d.services} service${d.services === 1 ? "" : "s"}` },
    { id: "commits", header: "Commits", cell: ({ row: { original: d } }) => d.commits },
  ], []);
  return (
    <div className="space-y-4">
      <PageHeader title="Developers" description="People, what they maintain and what they have changed." />
      <ListFilters list={list} placeholder="Search name, email or role…" />
      <DataTable list={list} columns={cols} sortable={["name", "role", "services", "commits"]} onRowClick={(d) => router.push(`/developers/${d.developer_id}`)} empty={<EmptyState title="No developers match" />} />
    </div>
  );
}

type DevDetail = Dev & {
  services: { service_id: number; name: string; status: string }[];
  commits: { commit_id: number; message: string; timestamp: string; hash: string; repo_id: number; repo: string }[];
  issues: { id: number; title: string; severity: string; status: string; service: string }[];
};
export function DeveloperDetail({ id }: { id: string }) {
  const state = useApi<DevDetail>(`/api/developers/${id}`);
  return (
    <Async state={state}>
      {(d) => (
        <div className="space-y-4">
          <PageHeader crumbs={[{ label: "Developers", href: "/developers" }, { label: d.name }]} title={d.name} description={d.role ?? undefined} />
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Profile"><KeyValues items={[["Email", d.email], ["GitHub", d.github_username ?? "—"], ["Access", d.auth_role === "admin" ? "Admin" : "Developer"], ["Joined", fmtDate(d.joined_date)]]} /></Panel>
            <Panel title={`Maintains (${d.services.length})`}>
              {d.services.length === 0 ? <p className="text-sm text-muted-foreground">Not the maintainer of any service.</p> :
                <ul className="space-y-1.5 text-sm">{d.services.map((s) => <li key={s.service_id} className="flex items-center justify-between"><Link className="text-primary hover:underline" href={`/services/${s.service_id}`}>{s.name}</Link><StatusBadge status={s.status} /></li>)}</ul>}
            </Panel>
            <Panel title={`Reported issues (${d.issues.length})`}>
              {d.issues.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> :
                <ul className="space-y-1.5 text-sm">{d.issues.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><Link className="truncate hover:underline" href={`/issues/${i.id}`}>#{i.id} {i.title}</Link><SeverityBadge severity={i.severity} /></li>)}</ul>}
            </Panel>
          </div>
          <Panel title={`Recent commits (${d.commits.length})`}>
            <SimpleTable rows={d.commits} rowKey={(c) => c.commit_id} empty={<EmptyState title="No commits" />} cols={[
              { key: "m", header: "Message", cell: (c) => c.message },
              { key: "r", header: "Repository", cell: (c) => <Link className="text-primary hover:underline" href={`/repositories/${c.repo_id}`}>{c.repo}</Link> },
              { key: "w", header: "When", cell: (c) => fmtDate(c.timestamp) },
            ]} />
          </Panel>
        </div>
      )}
    </Async>
  );
}

// ------------------------------------------------------------------ ADRs
type Adr = { adr_id: number; title: string; decision: string; context: string | null; created_date: string; service_id: number; service: string; author_id: number; author: string };

export function AdrListPage() {
  const router = useRouter();
  const list = useListQuery<Adr>("/api/adrs");
  const cols = useMemo<ColumnDef<Adr>[]>(() => [
    { id: "id", header: "ID", cell: ({ row: { original: a } }) => <span className="font-mono text-xs">ADR-{a.adr_id}</span> },
    { id: "title", header: "Decision", cell: ({ row: { original: a } }) => <span className="font-medium">{a.title}</span> },
    { id: "service", header: "Service", cell: ({ row: { original: a } }) => a.service },
    { id: "author", header: "Author", cell: ({ row: { original: a } }) => <Person name={a.author} /> },
    { id: "date", header: "Date", cell: ({ row: { original: a } }) => fmtDate(a.created_date) },
  ], []);
  return (
    <div className="space-y-4">
      <PageHeader title="Architecture Decision Records" description="Why the system looks the way it does." />
      <ListFilters list={list} placeholder="Search decisions…" />
      <DataTable list={list} columns={cols} onRowClick={(a) => router.push(`/adrs/${a.adr_id}`)} empty={<EmptyState title="No ADRs match" />} />
    </div>
  );
}

export function AdrDetail({ id }: { id: string }) {
  const state = useApi<Adr>(`/api/adrs/${id}`);
  return (
    <Async state={state}>
      {(a) => (
        <div className="max-w-3xl space-y-4">
          <PageHeader crumbs={[{ label: "ADRs", href: "/adrs" }, { label: `ADR-${a.adr_id}` }]} title={a.title}
            description={<>For <Link className="text-primary hover:underline" href={`/services/${a.service_id}`}>{a.service}</Link> · by {a.author} · {fmtDate(a.created_date)}</>} />
          <Panel title="Context"><p className="text-sm">{a.context ?? "No context recorded."}</p></Panel>
          <Panel title="Decision"><p className="text-sm">{a.decision}</p></Panel>
        </div>
      )}
    </Async>
  );
}
