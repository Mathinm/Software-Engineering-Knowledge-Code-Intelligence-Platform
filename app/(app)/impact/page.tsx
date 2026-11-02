"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Box, Check, ChevronDown, CircleHelp, Code2, Database, Lightbulb, Loader2, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState, ErrorState, KindIcon, PageHeader, RiskBadge, kindLabel } from "@/components/common";
import { ImpactGraph } from "@/components/impact/impact-graph";
import { NodeDrawer } from "@/components/impact/node-drawer";
import { ImpactReport } from "@/components/impact/report";
import { api, useApi } from "@/lib/client";
import { CHANGE_TYPES, RISK_RULE_TEXT, type ChangeType, type ComponentKind } from "@/lib/domain";
import type { ImpactNode, ImpactResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type Lookups = {
  services: { id: number; name: string }[];
  apis: { id: number; name: string; path: string; version: string; service: string }[];
  tables: { id: number; name: string; service: string }[];
};
type Pick = { kind: ComponentKind; id: number; name: string; sub: string };

function ComponentPicker({ value, onChange }: { value: Pick | null; onChange: (p: Pick) => void }) {
  const [open, setOpen] = useState(false);
  const lk = useApi<Lookups>("/api/lookups");
  const options = useMemo<Pick[]>(() => !lk.data ? [] : [
    ...lk.data.services.map((s) => ({ kind: "service" as const, id: s.id, name: s.name, sub: "Service" })),
    ...lk.data.apis.map((a) => ({ kind: "api" as const, id: a.id, name: `${a.name}`, sub: `API ${a.path} ${a.version} · ${a.service}` })),
    ...lk.data.tables.map((t) => ({ kind: "table" as const, id: t.id, name: t.name, sub: `Table · ${t.service}` })),
  ], [lk.data]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id="component-picker" aria-haspopup="listbox" aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-lg border bg-background p-2.5 text-left hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring">
          {value ? <KindIcon kind={value.kind} className="size-8 [&_svg]:size-4" /> : <span className="flex size-8 items-center justify-center rounded-md border border-dashed text-muted-foreground"><Box className="size-4" /></span>}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{value?.name ?? "Choose a component…"}</span>
            <span className="block truncate text-xs text-muted-foreground">{value ? value.sub : "Service, API or database table"}</span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search services, APIs, tables…" />
          <CommandList className="max-h-80">
            {lk.error && <div className="p-3 text-sm text-risk-high">{lk.error.message} <button className="underline" onClick={lk.reload}>Retry</button></div>}
            {lk.loading && <div className="p-3 text-sm text-muted-foreground">Loading components…</div>}
            <CommandEmpty>No component matches.</CommandEmpty>
            {(["service", "api", "table"] as const).map((k) => (
              <CommandGroup key={k} heading={{ service: "Services", api: "APIs", table: "Database tables" }[k]}>
                {options.filter((o) => o.kind === k).map((o) => (
                  <CommandItem key={`${k}-${o.id}`} value={`${o.name} ${o.sub} ${k}-${o.id}`} onSelect={() => { onChange(o); setOpen(false); }}>
                    <KindIcon kind={o.kind} className="size-5" />
                    <span className="min-w-0 flex-1"><span className="block truncate">{o.name}</span><span className="block truncate text-xs text-muted-foreground">{o.sub}</span></span>
                    {value?.kind === o.kind && value.id === o.id && <Check className="size-4 text-primary" aria-label="Selected" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function plural(n: number, one: string, many = one + "s") { return `${n} ${n === 1 ? one : many}`; }

function Headline({ r }: { r: ImpactResult }) {
  const change = CHANGE_TYPES.find((c) => c.value === r.changeType)!.label;
  const openInc = r.incidents.filter((i) => i.status !== "resolved").length;
  const tone = r.risk.level === "High" ? "border-risk-high/30 bg-risk-high-bg" : r.risk.level === "Medium" ? "border-risk-med/40 bg-risk-med-bg" : "border-risk-low/40 bg-risk-low-bg";
  const iconTone = r.risk.level === "High" ? "text-risk-high" : r.risk.level === "Medium" ? "text-risk-med" : "text-risk-low";
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-4 break-words rounded-xl border p-4", tone)} role="status" aria-live="polite">
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full bg-card", iconTone)} aria-hidden><AlertTriangle className="size-6" /></span>
      <div className="min-w-0">
        <p className="text-lg leading-snug">
          <b>{change}</b> to <b>{r.root.name}</b> may affect{" "}
          <b className="text-primary">{plural(r.services.length, "service")}</b>, <b className="text-primary">{plural(r.apis.length, "API")}</b>, and{" "}
          <b className="text-primary">{plural(r.tables.length, "database table")}</b>.
        </p>
        <p className="text-sm text-muted-foreground">
          {r.highest
            ? <>Highest risk: <b className="text-risk-high">{r.highest.name}</b> ({plural(r.highest.open_issues, "open issue")}, {plural(r.highest.open_incidents, "open incident")}).</>
            : <>No other service depends on it{r.maxDepth === 0 ? "" : ` within depth ${r.depth}`}.</>}
          {" "}{plural(openInc, "open incident")} across the changed and affected services. Analysed to depth {r.depth}.
        </p>
      </div>
    </div>
  );
}

function RiskCard({ r }: { r: ImpactResult }) {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 lg:w-[340px]">
      <RiskBadge level={r.risk.level} className="px-3 py-1.5 text-base" />
      <div className="min-w-0 flex-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{r.risk.level} risk</span> because: {r.risk.reasons.join(", ")}.
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="rounded-full p-1 text-primary hover:bg-accent" aria-label="How risk is classified"><CircleHelp className="size-5" /></button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left">
          <p className="mb-1 font-semibold">Risk rule (same function on the server)</p>
          <p><b>High:</b> {RISK_RULE_TEXT.High}</p>
          <p><b>Medium:</b> {RISK_RULE_TEXT.Medium}</p>
          <p><b>Low:</b> {RISK_RULE_TEXT.Low}</p>
          <p className="mt-1 opacity-80">Open = issue open/in progress, incident not resolved; counted over the changed and affected services.</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function Metric({ icon, tone, value, label, direct, indirect }: { icon: React.ReactNode; tone: string; value: number; label: string; direct: number; indirect: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg text-white", tone)} aria-hidden>{icon}</span>
      <div>
        <div className="text-2xl font-semibold leading-none">{value}</div>
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{direct} direct · {indirect} indirect</div>
      </div>
    </div>
  );
}

function Explorer() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [pick, setPick] = useState<Pick | null>(null);
  const [changeType, setChangeType] = useState<ChangeType>("breaking_api");
  const [depth, setDepth] = useState(1);
  const [result, setResult] = useState<ImpactResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<{ kind: ComponentKind; id: number; key: string } | null>(null);

  const run = useCallback(async (p: Pick, ct: ChangeType, d: number) => {
    setRunning(true); setError(null);
    try {
      const r = await api<ImpactResult>("/api/impact", { method: "POST", body: { kind: p.kind, id: p.id, changeType: ct, depth: d } });
      setResult(r);
      setSelected((s) => (s && r.graph.nodes.some((n) => n.key === s.key) ? s : null));
      router.replace(`${pathname}?kind=${p.kind}&id=${p.id}&change=${ct}&depth=${d}`, { scroll: false });
    } catch (e) {
      setError(e as Error);
    } finally {
      setRunning(false);
    }
  }, [pathname, router]);

  // Deep link: /impact?kind=service&id=1 (from detail pages) pre-selects and runs.
  useEffect(() => {
    const kind = sp.get("kind") as ComponentKind | null;
    const id = Number(sp.get("id"));
    if (!kind || !["service", "api", "table"].includes(kind) || !id || result || running) return;
    const ct = (CHANGE_TYPES.some((c) => c.value === sp.get("change")) ? sp.get("change") : "breaking_api") as ChangeType;
    const d = Math.min(5, Math.max(1, Number(sp.get("depth")) || 1));
    const p = { kind, id, name: `${kindLabel(kind)} #${id}`, sub: kindLabel(kind) };
    setPick(p); setChangeType(ct); setDepth(d);
    run(p, ct, d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Once the result arrives, show the real component name in the picker.
  useEffect(() => {
    if (result && pick && pick.name.includes("#")) {
      setPick({ ...pick, name: result.root.name, sub: result.root.kind === "service" ? "Service" : `${kindLabel(result.root.kind)} · ${result.root.service}` });
    }
  }, [result, pick]);

  const onSelectNode = useCallback((n: ImpactNode) => setSelected({ kind: n.kind, id: n.id, key: n.key }), []);
  const onInspect = useCallback((kind: ComponentKind, id: number) => setSelected({ kind, id, key: `${kind}-${id}` }), []);

  const split = (rows: { depth: number }[]) => [rows.filter((r) => r.depth <= 1).length, rows.filter((r) => r.depth > 1).length];
  const canExpand = !!result && !running && result.depth < 5 && result.depth < result.maxDepth;
  const expandHint = !result ? "" : result.depth >= 5 ? "Maximum analysis depth (5) reached." : result.depth >= result.maxDepth
    ? `Nothing further: the deepest dependent is ${result.maxDepth} level(s) away.` : `Re-run at depth ${result.depth + 1}.`;

  return (
    <div className="space-y-4">
      <PageHeader title="Impact Explorer" crumbs={[{ label: "Impact Explorer", href: "/impact" }, ...(result ? [{ label: result.root.name }] : [])]} />

      {/* Top row: headline + risk */}
      {result ? (
        <div className="flex flex-col gap-4 lg:flex-row"><Headline r={result} /><RiskCard r={result} /></div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-accent p-4 text-sm">
          <Network className="size-5 text-primary" aria-hidden />
          Choose a component, select the type of change, and simulate its impact.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)]">
        {/* Left: change simulation */}
        <section className="space-y-5 self-start rounded-xl border bg-card p-4" aria-label="Change simulation">
          <h2 className="font-semibold">Change Simulation</h2>
          <div className="space-y-2">
            <label htmlFor="component-picker" className="text-sm font-medium">1. Select component</label>
            <ComponentPicker value={pick} onChange={(p) => { setPick(p); }} />
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">2. Change type</legend>
            <RadioGroup value={changeType} onValueChange={(v) => setChangeType(v as ChangeType)} className="gap-1.5">
              {CHANGE_TYPES.map((c) => (
                <label key={c.value} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", changeType === c.value ? "border-primary/40 bg-accent" : "hover:bg-muted/50")}>
                  <RadioGroupItem value={c.value} id={`ct-${c.value}`} /> {c.label}
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          <div className="space-y-3">
            <label id="depth-label" className="text-sm font-medium">3. Analysis depth</label>
            <Slider min={1} max={5} step={1} value={[depth]} onValueChange={([v]) => setDepth(v)} aria-labelledby="depth-label" aria-valuetext={`Depth ${depth}`} />
            <div className="flex justify-between px-0.5 text-xs text-muted-foreground" aria-hidden>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={cn(n === depth && "font-bold text-primary")}>{n}</span>)}</div>
            <p className="text-xs text-muted-foreground">{depth === 1 ? "Showing only direct dependencies (depth 1)." : `Following dependencies up to ${depth} hops away.`}</p>
          </div>
          <Button className="h-11 w-full text-base" disabled={!pick || running} onClick={() => pick && run(pick, changeType, depth)}>
            {running ? <Loader2 className="animate-spin" /> : null} Simulate Change <ArrowRight />
          </Button>
          {!pick && <p className="text-xs text-muted-foreground">Pick a component first.</p>}
          <div className="rounded-lg bg-accent/60 p-3 text-sm">
            <p className="mb-1 flex items-center gap-2 font-medium text-primary"><Lightbulb className="size-4" aria-hidden /> How it works</p>
            <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
              <li>Pick a component</li><li>Choose a change type</li><li>Set analysis depth</li><li>Click Simulate Change</li>
            </ol>
            <p className="mt-2 text-xs text-muted-foreground">Affected services come from the <code className="font-mono">get_impact()</code> recursive query in PostgreSQL.</p>
          </div>
        </section>

        {/* Centre: metrics, graph, drawer, report */}
        <div className="min-w-0 space-y-4">
          {error && <ErrorState error={error} onRetry={pick ? () => run(pick, changeType, depth) : undefined} />}
          {!result && !running && !error && (
            <EmptyState title="No simulation yet" icon={<Network className="size-10" />}>
              Select a service, API or database table on the left, choose what kind of change you are planning, then press <b>Simulate Change</b>.
              The graph shows which components could be affected.
            </EmptyState>
          )}
          {running && !result && (
            <div className="space-y-3" aria-busy="true" aria-label="Running simulation">
              <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
              <Skeleton className="h-[420px]" />
            </div>
          )}
          {result && (() => {
            const [sd, si] = split(result.services);
            const [td, ti] = split(result.tables);
            const [ad, ai] = split(result.apis);
            return (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Metric icon={<Box className="size-5" />} tone="bg-primary" value={result.services.length} label="Services affected" direct={sd} indirect={si} />
                  <Metric icon={<Database className="size-5" />} tone="bg-table" value={result.tables.length} label="Database tables" direct={td} indirect={ti} />
                  <Metric icon={<Code2 className="size-5" />} tone="bg-api" value={result.apis.length} label="APIs affected" direct={ad} indirect={ai} />
                </div>
                <div className={cn("grid gap-4", selected && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
                  <div className={cn("relative h-[480px] overflow-hidden rounded-xl border bg-card", running && "opacity-60")}>
                    {running && <div className="absolute inset-0 z-10 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="Updating" /></div>}
                    <ImpactGraph nodes={result.graph.nodes} edges={result.graph.edges} selectedKey={selected?.key ?? null} onSelect={onSelectNode}
                      canExpand={canExpand} expandHint={expandHint}
                      onExpand={() => { if (pick) { const d = Math.min(5, result.depth + 1); setDepth(d); run(pick, changeType, d); } }} />
                    {result.graph.nodes.length === 1 && (
                      <div className="pointer-events-none absolute inset-x-0 bottom-16 text-center text-sm text-muted-foreground">No dependencies found for this component.</div>
                    )}
                  </div>
                  {selected && <div className="h-[480px]"><NodeDrawer key={selected.key} kind={selected.kind} id={selected.id} onClose={() => setSelected(null)} /></div>}
                </div>
                <ImpactReport result={result} onInspect={onInspect} />
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function ImpactPage() {
  return <Suspense><Explorer /></Suspense>;
}
