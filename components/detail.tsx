"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { ExternalLink, FolderGit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState, Mono, Person, SeverityBadge, SimpleTable, StatusBadge, fmtDate, fmtDateTime } from "./common";

/** Tabs whose selection lives in ?tab= (so links like ?tab=owners work). */
export function UrlTabs({ tabs }: { tabs: { id: string; label: string; content: ReactNode }[] }) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const active = tabs.find((t) => t.id === sp.get("tab"))?.id ?? tabs[0].id;
  return (
    <div>
      <div role="tablist" aria-label="Sections" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })}
            className={cn("shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm", active === t.id ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>{tabs.find((t) => t.id === active)!.content}</div>
    </div>
  );
}

export function RepoLink({ name, url, id }: { name: string; url?: string | null; id?: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <FolderGit2 className="size-3.5 text-muted-foreground" aria-hidden />
      {id ? <Link href={`/repositories/${id}`} className="text-primary hover:underline">{name}</Link> : name}
      {url && <a href={url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary" aria-label={`Open ${name} on GitHub (new tab)`}><ExternalLink className="size-3" /></a>}
    </span>
  );
}

type Commit = { commit_id: number; message: string; timestamp: string; hash: string; author_id?: number; author: string };
export function CommitList({ commits, repoUrl }: { commits: Commit[]; repoUrl?: string | null }) {
  return (
    <SimpleTable rows={commits} rowKey={(c) => c.commit_id} empty={<EmptyState title="No commits recorded" />}
      cols={[
        { key: "msg", header: "Message", cell: (c) => <span className="font-medium">{c.message}</span> },
        { key: "author", header: "Author", cell: (c) => <Person id={c.author_id} name={c.author} /> },
        { key: "hash", header: "Hash", cell: (c) => repoUrl ? <a href={`${repoUrl}/commit/${c.hash}`} target="_blank" rel="noreferrer" className="hover:underline"><Mono>{c.hash.slice(0, 7)}</Mono></a> : <Mono>{c.hash.slice(0, 7)}</Mono> },
        { key: "when", header: "When", cell: (c) => <span className="whitespace-nowrap text-muted-foreground">{fmtDateTime(c.timestamp)}</span> },
      ]} />
  );
}

type Work = { id: number; title: string; severity: string; status: string; created_date: string; reporter?: string };
export function WorkList({ rows, kind }: { rows: Work[]; kind: "issues" | "incidents" }) {
  return (
    <SimpleTable rows={rows} rowKey={(r) => r.id} empty={<EmptyState title={`No ${kind}`}>Nothing recorded for this component.</EmptyState>}
      cols={[
        { key: "id", header: "ID", cell: (r) => <span className="font-mono text-xs">{kind === "issues" ? "#" : "INC-"}{r.id}</span> },
        { key: "title", header: "Title", cell: (r) => <Link href={`/${kind}/${r.id}`} className="font-medium hover:underline">{r.title}</Link> },
        { key: "sev", header: "Severity", cell: (r) => <SeverityBadge severity={r.severity} /> },
        { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        { key: "created", header: "Created", cell: (r) => fmtDate(r.created_date) },
      ]} />
  );
}

type Adr = { adr_id: number; title: string; decision: string; context: string | null; created_date: string; author: string };
export function AdrList({ adrs }: { adrs: Adr[] }) {
  if (!adrs.length) return <EmptyState title="No ADRs">No architecture decisions are linked to this component.</EmptyState>;
  return (
    <ul className="space-y-3">
      {adrs.map((a) => (
        <li key={a.adr_id} className="rounded-lg border p-3 text-sm">
          <Link href={`/adrs/${a.adr_id}`} className="font-medium hover:underline">ADR-{a.adr_id}: {a.title}</Link>
          <p className="mt-1">{a.decision}</p>
          {a.context && <p className="mt-1 text-muted-foreground">Context: {a.context}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{a.author} · {fmtDate(a.created_date)}</p>
        </li>
      ))}
    </ul>
  );
}

export function KeyValues({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0">{v}</dd></div>)}
    </dl>
  );
}
