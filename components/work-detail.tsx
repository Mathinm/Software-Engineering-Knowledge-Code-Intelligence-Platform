"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, useApi } from "@/lib/client";
import {
  INCIDENT_NEXT, ISSUE_NEXT, SEVERITIES, canChangeIssueStatus, canResolveIncident, label,
  type IncidentStatus, type IssueStatus,
} from "@/lib/domain";
import type { IncidentRow, IssueRow } from "@/lib/types";
import { Async, ConfirmDialog, PageHeader, Panel, Person, SeverityBadge, StatusBadge, fmtDateTime } from "./common";
import { FormDialog, enumOptions } from "./form-dialog";
import { useUser } from "./session";

type Lookups = { services: { id: number; name: string }[] };

/** Visual workflow: every step, current highlighted. */
function Workflow({ steps, current }: { steps: readonly string[]; current: string }) {
  const idx = steps.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Status workflow">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span aria-current={i === idx ? "step" : undefined}
            className={i < idx ? "rounded-full border border-risk-low/40 bg-risk-low-bg px-2 py-0.5 text-risk-low"
              : i === idx ? "rounded-full border border-primary bg-accent px-2 py-0.5 font-semibold text-accent-foreground"
              : "rounded-full border px-2 py-0.5 text-muted-foreground"}>
            {i < idx && <CheckCircle2 className="mr-1 inline size-3" aria-hidden />}{label(s)}
          </span>
          {i < steps.length - 1 && <ArrowRight className="size-3 text-muted-foreground" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function WorkDetail({ kind, id }: { kind: "issues" | "incidents"; id: string }) {
  const user = useUser();
  const router = useRouter();
  const state = useApi<{ issue?: IssueRow; incident?: IncidentRow }>(`/api/${kind}/${id}`);
  const lk = useApi<Lookups>(user.role === "admin" ? "/api/lookups" : null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const isIssue = kind === "issues";
  const noun = isIssue ? "Issue" : "Incident";

  return (
    <Async state={state} rows={6}>
      {(d) => {
        const r = (d.issue ?? d.incident)!;
        const next = isIssue ? ISSUE_NEXT[r.status as IssueStatus] : INCIDENT_NEXT[r.status as IncidentStatus];
        const canStatus = isIssue ? canChangeIssueStatus(user, r as IssueRow) : canResolveIncident(user, r);
        const ref = isIssue ? `#${r.id}` : `INC-${r.id}`;

        const advance = async () => {
          if (!next) return;
          if (!isIssue && next === "resolved") { setResolving(true); return; }
          setBusy(true);
          try {
            await api(`/api/${kind}/${r.id}`, { method: "PATCH", body: { status: next } });
            toast.success(`${noun} ${ref} moved to ${label(next)}.`);
            state.reload();
          } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
        };

        return (
          <div className="space-y-4">
            <PageHeader
              crumbs={[{ label: "Issues & Incidents", href: isIssue ? "/issues" : "/issues?tab=incidents" }, { label: ref }]}
              title={<span><span className="font-mono text-muted-foreground">{ref}</span> {r.title}</span>}
              actions={<>
                {next && canStatus && (
                  <Button onClick={advance} disabled={busy}>
                    {!isIssue && next === "resolved" ? <><CheckCircle2 /> Resolve incident</> : <>Move to {label(next)} <ArrowRight /></>}
                  </Button>
                )}
                {!isIssue && <Button variant="outline" asChild><Link href={`/similar?incident=${r.id}`}><Sparkles /> Find similar</Link></Button>}
                {user.role === "admin" && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> Edit</Button>}
                {user.role === "admin" && <Button variant="outline" className="text-risk-high" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>}
              </>}
            />
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Panel title="Details">
                <div className="space-y-4 text-sm">
                  <Workflow steps={isIssue ? ["open", "in_progress", "resolved", "closed"] : ["open", "investigating", "resolved"]} current={r.status} />
                  {!canStatus && next && (
                    <p className="text-xs text-muted-foreground">
                      {isIssue ? "Only the reporter, the service maintainer or an admin can change this issue's status." : "Only the service maintainer or an admin can change this incident."}
                    </p>
                  )}
                  <div><h3 className="mb-1 font-medium">Description</h3><p className="whitespace-pre-wrap text-muted-foreground">{r.description || "No description."}</p></div>
                  {!isIssue && (
                    <>
                      <div><h3 className="mb-1 font-medium">Root cause</h3><p className="text-muted-foreground">{(r as IncidentRow).root_cause || "Not identified yet."}</p></div>
                      <div><h3 className="mb-1 font-medium">Resolution</h3><p className="text-muted-foreground">{(r as IncidentRow).resolution || "Not resolved yet."}</p></div>
                    </>
                  )}
                </div>
              </Panel>
              <Panel>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Severity</dt><dd><SeverityBadge severity={r.severity} /></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Status</dt><dd><StatusBadge status={r.status} /></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Service</dt><dd><Link href={`/services/${r.service_id}`} className="text-primary hover:underline">{r.service}</Link></dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Owner</dt><dd><Person id={r.owner_id} name={r.owner} /></dd></div>
                  {isIssue && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Reporter</dt><dd><Person id={(r as IssueRow).reporter_id} name={(r as IssueRow).reporter} /></dd></div>}
                  <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Created</dt><dd>{fmtDateTime(r.created_date)}</dd></div>
                  {isIssue
                    ? <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Updated</dt><dd>{fmtDateTime((r as IssueRow).updated_date)}</dd></div>
                    : <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Resolved</dt><dd>{fmtDateTime((r as IncidentRow).resolved_date)}</dd></div>}
                </dl>
                <Button asChild variant="outline" size="sm" className="mt-4 w-full"><Link href={`/impact?kind=service&id=${r.service_id}`}>Simulate impact on {r.service} <ArrowRight /></Link></Button>
              </Panel>
            </div>

            <FormDialog open={editing} onOpenChange={setEditing} title={`Edit ${noun.toLowerCase()} ${ref}`}
              description="Status changes use the workflow buttons, not this form."
              initial={r} submitLabel="Save changes" successMessage={`${noun} ${ref} updated.`}
              fields={[
                { name: "title", label: "Title", required: true, minLength: 5, maxLength: 255 },
                { name: "description", label: "Description", type: "textarea", maxLength: 5000 },
                { name: "severity", label: "Severity", type: "select", required: true, options: enumOptions(SEVERITIES) },
                { name: "service_id", label: "Service", type: "select", required: true, options: lk.data?.services.map((s) => ({ value: s.id, label: s.name })) ?? [] },
              ]}
              onSubmit={async (v) => { await api(`/api/${kind}/${r.id}`, { method: "PATCH", body: v }); state.reload(); }} />

            <FormDialog open={resolving} onOpenChange={setResolving} title={`Resolve ${ref}`}
              description={<>Runs the <code className="font-mono">resolve_incident</code> stored procedure: it locks the row, checks the input and sets the resolved date in one transaction.</>}
              submitLabel="Resolve incident" successMessage={`Incident ${ref} resolved.`}
              initial={{ root_cause: (r as IncidentRow).root_cause ?? "" }}
              fields={[
                { name: "root_cause", label: "Root cause", type: "textarea", required: true, minLength: 5, maxLength: 5000 },
                { name: "resolution", label: "Resolution / fix applied", type: "textarea", required: true, minLength: 5, maxLength: 5000 },
              ]}
              onSubmit={async (v) => { await api(`/api/incidents/${r.id}/resolve`, { method: "POST", body: v }); state.reload(); }} />

            <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete ${noun.toLowerCase()} ${ref}?`}
              onConfirm={async () => {
                try {
                  await api(`/api/${kind}/${r.id}`, { method: "DELETE" });
                  toast.success(`${noun} ${ref} deleted.`);
                  router.push(isIssue ? "/issues" : "/issues?tab=incidents");
                } catch (e) { toast.error((e as Error).message); throw e; }
              }}>
              <p>“{r.title}” will be permanently removed. The deletion is recorded in the audit log.</p>
            </ConfirmDialog>
          </div>
        );
      }}
    </Async>
  );
}
