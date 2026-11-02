"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertOctagon, Box, CircleHelp, Clock, Flame, Table2, UserX } from "lucide-react";
import { Tooltip as Tip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Async, Banner, EmptyState, Panel, Person, RiskBadge, Stat, timeAgo, PageHeader } from "@/components/common";
import { useApi } from "@/lib/client";
import type { RiskLevel } from "@/lib/domain";
import { useSearchParams } from "next/navigation";

type Dash = {
  summary: { open_incidents: number; critical_open_incidents: number; total_services: number; active_services: number; critical_issues: number; open_issues: number; mttr_hours: number | null; resolved_incidents: number };
  incidentsByService: { service_id: number; service: string; open: number; resolved: number }[];
  hotspots: { repo_id: number; repo: string; window_end: string; recent_commits: number; open_issues: number; critical_issues: number; services: string }[];
  busFactor: { service_id: number; service: string; repo: string; maintainer: string; maintainer_id: number; authors: number; commits: number; top_share: number; top_author: string; single_contributor: boolean }[];
  activity: { log_id: number; action: string; entity_type: string; entity_id: number; old_value: Record<string, unknown> | null; new_value: Record<string, unknown> | null; timestamp: string; actor: string }[];
};

/** Hotspot rule (shown in the tooltip): churn × open bugs. */
function hotspotRisk(h: Dash["hotspots"][number]): RiskLevel {
  if (h.critical_issues > 0 || (h.recent_commits >= 3 && h.open_issues >= 2)) return "High";
  if (h.open_issues > 0 || h.recent_commits >= 3) return "Medium";
  return "Low";
}

function describe(a: Dash["activity"][number]) {
  const verb = { CREATE: "created", UPDATE: "updated", DELETE: "deleted" }[a.action] ?? a.action.toLowerCase();
  const changes = a.action === "UPDATE" && a.new_value
    ? Object.keys(a.new_value).filter((k) => k !== "updated_date").slice(0, 2)
        .map((k) => `${k} ${String(a.old_value?.[k] ?? "—")} → ${String(a.new_value?.[k])}`).join(", ")
    : (a.new_value?.title ?? a.new_value?.name ?? a.old_value?.name ?? a.old_value?.path ?? "") as string;
  return { verb, target: `${a.entity_type} #${a.entity_id}`, changes };
}

const entityHref = (type: string, id: number) =>
  ({ service: `/services/${id}`, issue: `/issues/${id}`, incident: `/incidents/${id}`, adr: `/adrs/${id}`, developer: `/developers/${id}` } as Record<string, string>)[type];

export default function DashboardPage() {
  return <Suspense><Dashboard /></Suspense>;
}

function Dashboard() {
  const state = useApi<Dash>("/api/dashboard");
  const denied = useSearchParams().get("denied");
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader title="System Overview" description="Health of your services, from the live ImpactGraph database." />
      {denied && <Banner tone="warn" title="The Audit Log is only available to admins.">You were redirected to the dashboard.</Banner>}
      <Async state={state} rows={10}>
        {(d) => {
          const s = d.summary;
          return (
            <>
              <p className="-mt-3 text-sm text-muted-foreground">
                {s.open_incidents === 0 ? "No open incidents." : `${s.open_incidents} incident${s.open_incidents > 1 ? "s" : ""} still open`}
                {" · "}{s.open_issues} open issues across {s.total_services} services.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Stat href="/issues?tab=incidents" label="Open incidents" value={s.open_incidents}
                  hint={`${s.critical_open_incidents} critical · not yet resolved`} icon={<AlertOctagon className="size-6 text-risk-high" />} />
                <Stat href="/services" label="Total services" value={s.total_services} hint={`${s.active_services} active · ${s.total_services - s.active_services} deprecated or in maintenance`} icon={<Box className="size-6 text-primary" />} />
                <Stat href="/issues?severity=critical" label="Critical issues" value={s.critical_issues} hint="open or in progress" icon={<Flame className="size-6 text-risk-high" />} />
                <Stat href="/issues?tab=incidents&status=resolved" label="Average MTTR" value={s.mttr_hours == null ? "—" : `${s.mttr_hours} h`}
                  hint={`mean time to resolve, over ${s.resolved_incidents} resolved incidents`} icon={<Clock className="size-6 text-table" />} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Incidents by service" action={
                  <button type="button" onClick={() => setShowTable((v) => !v)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" aria-pressed={showTable}>
                    <Table2 className="size-3.5" aria-hidden />{showTable ? "Show chart" : "Show as table"}
                  </button>}>
                  {d.incidentsByService.length === 0 ? <EmptyState title="No incidents recorded" /> : showTable ? (
                    <div className="overflow-x-auto"><table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">Service</th><th>Open</th><th>Resolved</th></tr></thead>
                      <tbody>{d.incidentsByService.map((r) => <tr key={r.service_id} className="border-t"><td className="py-1.5"><Link className="hover:underline" href={`/services/${r.service_id}`}>{r.service}</Link></td><td>{r.open}</td><td>{r.resolved}</td></tr>)}</tbody>
                    </table></div>
                  ) : (
                    <div className="h-72" role="img" aria-label={`Bar chart of incidents per service: ${d.incidentsByService.map((r) => `${r.service} ${r.open + r.resolved}`).join(", ")}`}>
                      <ResponsiveContainer>
                        <BarChart data={d.incidentsByService} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
                          <CartesianGrid horizontal={false} stroke="var(--border)" />
                          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                          <YAxis type="category" dataKey="service" width={130} tick={{ fontSize: 12, fill: "var(--foreground)" }} stroke="var(--border)" />
                          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" }} />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="resolved" name="Resolved" stackId="a" fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
                          <Bar dataKey="open" name="Open / investigating" stackId="a" fill="var(--chart-2)" stroke="var(--card)" strokeWidth={2} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Panel>

                <Panel title={<span className="flex items-center gap-2">Component hotspots
                  <Tip><TooltipTrigger asChild><button type="button" aria-label="How hotspot risk is calculated"><CircleHelp className="size-4 text-muted-foreground" /></button></TooltipTrigger>
                    <TooltipContent className="max-w-xs">Recent changes = commits in the 90 days up to the latest recorded commit ({d.hotspots[0]?.window_end?.slice(0, 10) ?? "—"}).
                      High: any open critical issue, or ≥3 recent commits and ≥2 open issues. Medium: any open issue or ≥3 recent commits. Low: otherwise.</TooltipContent></Tip></span>}>
                  <div className="overflow-x-auto"><table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr><th className="py-1.5 font-medium">Repository / services</th><th className="font-medium">Recent changes</th><th className="font-medium">Open bugs</th><th className="font-medium">Risk</th></tr>
                    </thead>
                    <tbody>
                      {d.hotspots.map((h) => (
                        <tr key={h.repo_id} className="border-t">
                          <td className="py-2"><Link href={`/repositories/${h.repo_id}`} className="font-medium hover:underline">{h.repo}</Link><div className="text-xs text-muted-foreground">{h.services}</div></td>
                          <td className="tabular-nums">{h.recent_commits} commit{h.recent_commits === 1 ? "" : "s"}</td>
                          <td className="tabular-nums">{h.open_issues}{h.critical_issues > 0 && <span className="text-xs text-risk-high"> ({h.critical_issues} critical)</span>}</td>
                          <td><RiskBadge level={hotspotRisk(h)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </Panel>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title={<span className="flex items-center gap-2"><UserX className="size-4 text-risk-med" aria-hidden /> Bus-factor warnings</span>}>
                  {(() => {
                    const single = d.busFactor.filter((b) => b.single_contributor);
                    const concentrated = d.busFactor.filter((b) => !b.single_contributor);
                    return (
                      <div className="space-y-3">
                        {single.length === 0 ? (
                          <p className="rounded-lg border border-risk-low/40 bg-risk-low-bg px-3 py-2 text-sm">
                            No service has a single contributor: every repository has commits from at least two people.
                          </p>
                        ) : single.map((b) => <BusRow key={b.service_id} b={b} />)}
                        {concentrated.length > 0 && (
                          <>
                            <p className="text-xs text-muted-foreground">Knowledge concentration: one person wrote ≥ 75% of the repository&apos;s commits.</p>
                            {concentrated.map((b) => <BusRow key={b.service_id} b={b} />)}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </Panel>

                <Panel title={<span className="flex items-center gap-2"><Activity className="size-4 text-primary" aria-hidden /> Recent activity</span>}>
                  {d.activity.length === 0 ? <EmptyState title="No activity yet" /> : (
                    <ol className="space-y-2.5">
                      {d.activity.map((a) => {
                        const x = describe(a);
                        const href = entityHref(a.entity_type, a.entity_id);
                        return (
                          <li key={a.log_id} className="flex gap-3 text-sm">
                            <Person name={a.actor} />
                            <div className="min-w-0 flex-1">
                              <span className="text-muted-foreground">{x.verb} </span>
                              {href && a.action !== "DELETE" ? <Link href={href} className="font-medium hover:underline">{x.target}</Link> : <span className="font-medium">{x.target}</span>}
                              {x.changes && <div className="truncate text-xs text-muted-foreground">{x.changes}</div>}
                            </div>
                            <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.timestamp} title={a.timestamp}>{timeAgo(a.timestamp)}</time>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Panel>
              </div>
            </>
          );
        }}
      </Async>
    </div>
  );
}

function BusRow({ b }: { b: Dash["busFactor"][number] }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
      <div className="min-w-0">
        <Link href={`/services/${b.service_id}?tab=owners`} className="font-medium hover:underline">{b.service}</Link>
        <div className="text-xs text-muted-foreground">
          {b.single_contributor ? "Single contributor" : `${b.top_author} wrote ${b.top_share}% of ${b.commits} commits`} · {b.authors} contributor{b.authors === 1 ? "" : "s"} in {b.repo} · maintainer {b.maintainer}
        </div>
      </div>
      <Link href={`/services/${b.service_id}?tab=owners`} className="shrink-0 text-xs text-primary hover:underline">Inspect owners →</Link>
    </div>
  );
}
