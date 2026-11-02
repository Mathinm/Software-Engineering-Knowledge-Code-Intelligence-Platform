"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertCircle, AlertTriangle, ArrowDownUp, Box, CheckCircle2, ChevronLeft, ChevronRight, ChevronRight as Crumb,
  CircleDot, Code2, Database, Flame, Inbox, Info, Loader2, RefreshCw, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { label, type ComponentKind, type RiskLevel } from "@/lib/domain";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------ formatting
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  const units: [number, string][] = [[31536000, "year"], [2592000, "month"], [604800, "week"], [86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [n, u] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v > 1 ? "s" : ""} ago`; }
  return "just now";
}
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

// ------------------------------------------------------------------ page chrome
export function PageHeader({ title, description, crumbs, actions }: {
  title: ReactNode; description?: ReactNode; crumbs?: { label: string; href?: string }[]; actions?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {crumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <Crumb className="size-3.5" aria-hidden />}
              {c.href ? <Link href={c.href} className="text-primary hover:underline">{c.label}</Link> : <span className="text-foreground">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-card p-4 shadow-xs", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// ------------------------------------------------------------------ states
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <div className="text-muted-foreground" aria-hidden>{icon ?? <Inbox className="size-8" />}</div>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-risk-high/30 bg-risk-high-bg px-6 py-8 text-center">
      <AlertCircle className="size-7 text-risk-high" aria-hidden />
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="text-sm text-muted-foreground">{error?.message ?? "Unknown error."}</p>
      </div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw /> Try again</Button>}
    </div>
  );
}

export function LoadingRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}

/** Renders loading / error / content for a useApi() result. */
export function Async<T>({ state, children, rows }: {
  state: { data: T | null; error: { message: string } | null; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode; rows?: number;
}) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return <LoadingRows rows={rows} />;
  return <>{children(state.data)}</>;
}

export function Banner({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "error"; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const t = {
    info: { cls: "border-primary/30 bg-accent", icon: <Info className="size-5 text-primary" /> },
    warn: { cls: "border-risk-med/40 bg-risk-med-bg", icon: <AlertTriangle className="size-5 text-risk-med" /> },
    error: { cls: "border-risk-high/40 bg-risk-high-bg", icon: <ShieldAlert className="size-5 text-risk-high" /> },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3", t.cls)}>
      <div className="mt-0.5 shrink-0" aria-hidden>{t.icon}</div>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">{title}</div>
        {children && <div className="mt-1 text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ badges (never colour alone)
const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function SeverityBadge({ severity }: { severity: string }) {
  const m: Record<string, [string, ReactNode]> = {
    critical: ["border-risk-high/40 bg-risk-high-bg text-risk-high", <Flame key="i" className="size-3" />],
    high: ["border-risk-high/30 bg-risk-high-bg/60 text-risk-high", <AlertTriangle key="i" className="size-3" />],
    medium: ["border-risk-med/40 bg-risk-med-bg text-risk-med", <CircleDot key="i" className="size-3" />],
    low: ["border-border bg-muted text-muted-foreground", <CircleDot key="i" className="size-3" />],
  };
  const [cls, icon] = m[severity] ?? m.low;
  return <span className={cn(pill, cls)}><span aria-hidden>{icon}</span>{label(severity)}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const done = ["resolved", "closed", "active"].includes(status);
  const warn = ["deprecated", "maintenance", "beta", "investigating", "in_progress"].includes(status);
  const cls = done ? "border-risk-low/40 bg-risk-low-bg text-risk-low" : warn ? "border-risk-med/40 bg-risk-med-bg text-risk-med" : "border-primary/30 bg-accent text-accent-foreground";
  const Icon = done ? CheckCircle2 : warn ? Loader2 : CircleDot;
  return <span className={cn(pill, cls)}><Icon className="size-3" aria-hidden />{label(status)}</span>;
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const cls = { High: "border-risk-high/40 bg-risk-high-bg text-risk-high", Medium: "border-risk-med/40 bg-risk-med-bg text-risk-med", Low: "border-risk-low/40 bg-risk-low-bg text-risk-low" }[level];
  const Icon = { High: AlertCircle, Medium: AlertTriangle, Low: CheckCircle2 }[level];
  return <span className={cn(pill, cls, className)}><Icon className="size-3" aria-hidden />{level}</span>;
}

export function KindIcon({ kind, className }: { kind: ComponentKind; className?: string }) {
  const map = { service: [Box, "bg-primary text-primary-foreground"], api: [Code2, "bg-api text-white"], table: [Database, "bg-table text-white"] } as const;
  const [Icon, cls] = map[kind];
  return <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md", cls, className)} aria-hidden><Icon className="size-3.5" /></span>;
}
export const kindLabel = (k: ComponentKind) => ({ service: "Service", api: "API", table: "Database table" })[k];
export const kindHref = (k: ComponentKind, id: number) => ({ service: `/services/${id}`, api: `/apis/${id}`, table: `/tables/${id}` })[k];

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-accent-foreground", className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Person({ id, name }: { id?: number; name: string }) {
  const inner = <span className="inline-flex items-center gap-2"><Avatar name={name} />{name}</span>;
  return id ? <Link href={`/developers/${id}`} className="hover:underline">{inner}</Link> : inner;
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{children}</code>;
}

export function Stat({ label: l, value, hint, icon, href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; href?: string }) {
  const body = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40">
      {icon && <div className="flex size-11 shrink-0 items-center justify-center rounded-lg" aria-hidden>{icon}</div>}
      <div className="min-w-0">
        <div className="text-2xl font-semibold leading-none">{value}</div>
        <div className="mt-1 text-sm font-medium">{l}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

// ------------------------------------------------------------------ confirm dialog
export function ConfirmDialog({ open, onOpenChange, title, children, confirmLabel = "Delete", onConfirm, destructive = true, disabled }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; children?: ReactNode; confirmLabel?: string;
  onConfirm: () => Promise<void> | void; destructive?: boolean; disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">{children}</div></AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || disabled}
            variant={destructive ? "destructive" : "default"}
            onClick={async (e) => {
              e.preventDefault();
              setBusy(true);
              try { await onConfirm(); onOpenChange(false); } finally { setBusy(false); }
            }}
          >
            {busy && <Loader2 className="animate-spin" />} {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ------------------------------------------------------------------ simple table + pager
export type Col<T> = { key: string; header: string; sortable?: boolean; cell: (r: T) => ReactNode; className?: string };

/** Plain table for in-memory rows (detail tabs). Server lists use DataTable. */
export function SimpleTable<T>({ rows, cols, empty, rowKey }: { rows: T[]; cols: Col<T>[]; empty: ReactNode; rowKey: (r: T) => string | number }) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>{cols.map((c) => <th key={c.key} scope="col" className={cn("px-3 py-2 font-medium", c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-t hover:bg-muted/30">
              {cols.map((c) => <td key={c.key} className={cn("px-3 py-2 align-top", c.className)}>{c.cell(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SortHeader({ active, dir, onClick, children }: { active: boolean; dir?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      aria-label={`Sort by ${children}${active ? (dir === "asc" ? ", currently ascending" : ", currently descending") : ""}`}>
      {children}<ArrowDownUp className={cn("size-3", active ? "text-primary" : "opacity-40")} aria-hidden />
    </button>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
      <span>{total === 0 ? "No results" : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <span className="px-2">Page {page} of {pages}</span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}
