"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Info, Loader2, SearchX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingRows, PageHeader, SeverityBadge, StatusBadge } from "@/components/common";
import { Highlight } from "@/components/shell/command-palette";
import { api, useApi } from "@/lib/client";
import { SEVERITIES, label } from "@/lib/domain";

type Hit = { id: number; title: string; description: string | null; severity: string; status: string; root_cause: string | null; resolution: string | null; service_id: number; service: string; score: number };
type Res = { engine: string; model: string | null; fallbackReason: string | null; available: { trgm: boolean; vector: boolean }; results: Hit[] };
type Lookups = { services: { id: number; name: string }[] };
type Opt = { rows: { id: number; title: string }[] };

const ENGINE_TEXT: Record<string, string> = {
  pgvector: "Semantic search: pgvector, all-MiniLM-L6-v2",
  fulltext: "Keyword search: full-text fallback",
  "fulltext+trigram": "Keyword search: full-text + trigram fallback",
};
const ENGINE_HOW: Record<string, string> = {
  pgvector: "Your text is turned into a 384-number embedding and compared with each incident's stored embedding by cosine distance (<=>, HNSW index). Matches can share meaning without sharing words.",
  fulltext: "Matches incidents that share words with your text (tsvector + ts_rank_cd).",
  "fulltext+trigram": "Matches shared words (tsvector) blended with trigram similarity (pg_trgm).",
};
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Similar() {
  const sp = useSearchParams();
  const lk = useApi<Lookups>("/api/lookups");
  const engine = useApi<{ engine: string; model: string | null; available: { trgm: boolean; vector: boolean } }>("/api/similar");
  const incidents = useApi<Opt>("/api/incidents?pageSize=100&sort=id&dir=asc");
  const issues = useApi<Opt>("/api/issues?pageSize=100&sort=id&dir=asc");

  const [text, setText] = useState("");
  const [source, setSource] = useState(sp.get("incident") ? `incident:${sp.get("incident")}` : "");
  const [service, setService] = useState("");
  const [severity, setSeverity] = useState("");
  const [limit, setLimit] = useState(5);
  const [state, setState] = useState<{ loading: boolean; error: Error | null; data: Res | null }>({ loading: false, error: null, data: null });
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  const run = async () => {
    const [kind, sid] = source.split(":");
    if (!sid && !text.trim()) { setFieldErr("Describe the problem, or choose an existing issue or incident."); return; }
    setFieldErr(null);
    setState({ loading: true, error: null, data: state.data });
    try {
      const data = await api<Res>("/api/similar", {
        method: "POST",
        body: {
          text, limit,
          incidentId: kind === "incident" ? Number(sid) : undefined, issueId: kind === "issue" ? Number(sid) : undefined,
          service_id: service ? Number(service) : undefined, severity: severity || undefined,
        },
      });
      setState({ loading: false, error: null, data });
    } catch (e) { setState({ loading: false, error: e as Error, data: null }); }
  };

  // Deep link from an incident page: run straight away.
  useEffect(() => {
    if (sp.get("incident")) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Word highlighting only makes sense for keyword matches; semantic matches need not share words.
  const query = source || state.data?.engine === "pgvector" ? "" : text;

  return (
    <div className="space-y-4">
      <PageHeader title="Similar Incidents" description="Reuse what was learned from past failures: paste a bug description, or start from an existing issue or incident." />
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="space-y-4 self-start rounded-xl border bg-card p-4" aria-label="Search input">
          <div className="space-y-1.5">
            <Label htmlFor="sim-text">Bug description or incident summary</Label>
            <Textarea id="sim-text" rows={5} value={text} disabled={!!source} maxLength={5000}
              onChange={(e) => setText(e.target.value)} aria-invalid={!!fieldErr} aria-describedby={fieldErr ? "sim-err" : undefined}
              placeholder="e.g. customers charged twice after the payment gateway timed out" />
            {fieldErr && <p id="sim-err" className="text-xs text-risk-high">{fieldErr}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-src">…or use an existing record</Label>
            <select id="sim-src" className={sel} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">— Use the text above —</option>
              <optgroup label="Incidents">{incidents.data?.rows.map((i) => <option key={i.id} value={`incident:${i.id}`}>INC-{i.id} {i.title}</option>)}</optgroup>
              <optgroup label="Issues">{issues.data?.rows.map((i) => <option key={i.id} value={`issue:${i.id}`}>#{i.id} {i.title}</option>)}</optgroup>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label htmlFor="sim-svc">Service</Label>
              <select id="sim-svc" className={sel} value={service} onChange={(e) => setService(e.target.value)}><option value="">Any</option>{lk.data?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="sim-sev">Severity</Label>
              <select id="sim-sev" className={sel} value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">Any</option>{SEVERITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="sim-n">Number of results</Label>
            <select id="sim-n" className={sel} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
          <Button className="w-full" onClick={run} disabled={state.loading}>{state.loading ? <Loader2 className="animate-spin" /> : <Sparkles />} Find Similar Incidents</Button>
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Search engine</p>
            <p className="font-medium text-primary">{engine.data ? ENGINE_TEXT[engine.data.engine] : "Checking…"}</p>
            {engine.data && <p className="mt-1">{ENGINE_HOW[engine.data.engine]}</p>}
            {engine.data && !engine.data.available.vector && <p className="mt-1">pgvector is not available in this database, so keyword search is used. Start the Docker database (see README) to enable semantic search.</p>}
          </div>
        </section>

        <section aria-label="Results" aria-live="polite" className="space-y-3">
          <div className="flex gap-2 rounded-lg border border-primary/20 bg-accent px-3 py-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>Similarity measures <b>how relevant</b> a past incident&apos;s text is to yours. It does <b>not</b> guarantee that the two share the same cause. Read the root cause before reusing a fix.</p>
          </div>
          {state.data && (
            <div className={state.data.engine === "pgvector" ? "rounded-lg border border-risk-low/40 bg-risk-low-bg px-3 py-2 text-sm" : "rounded-lg border border-risk-med/40 bg-risk-med-bg px-3 py-2 text-sm"} role="status">
              <b>{ENGINE_TEXT[state.data.engine]}</b>
              {state.data.fallbackReason && <span className="text-muted-foreground"> · {state.data.fallbackReason}</span>}
            </div>
          )}
          {state.error && <ErrorState error={state.error} onRetry={run} />}
          {state.loading && !state.data && <LoadingRows rows={4} />}
          {!state.loading && !state.error && !state.data && <EmptyState title="Describe a problem to begin" icon={<Sparkles className="size-8" />}>Results appear here, best match first.</EmptyState>}
          {state.data && state.data.results.length === 0 && (
            <EmptyState title="No similar incidents found" icon={<SearchX className="size-8" />}>No incident matched{service || severity ? " under these filters" : ""}. Try different wording or remove filters.</EmptyState>
          )}
          {state.data?.results.map((h) => (
            <article key={h.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/incidents/${h.id}`} className="font-semibold hover:underline"><span className="font-mono text-muted-foreground">INC-{h.id}</span> <Highlight text={h.title} query={query} /></Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/services/${h.service_id}`} className="text-primary hover:underline">{h.service}</Link>
                    <SeverityBadge severity={h.severity} /><StatusBadge status={h.status} />
                  </div>
                </div>
                <div className="w-44 shrink-0">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Similarity</span><b className="tabular-nums">{(h.score * 100).toFixed(0)}% <span className="font-normal text-muted-foreground">({h.score.toFixed(3)})</span></b></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(h.score * 100)} aria-label="Similarity score">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(3, h.score * 100)}%` }} />
                  </div>
                </div>
              </div>
              {h.description && <p className="mt-2 text-sm"><Highlight text={h.description} query={query} /></p>}
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                <div><dt className="text-xs font-medium text-muted-foreground">Root cause</dt><dd><Highlight text={h.root_cause ?? "Not identified"} query={query} /></dd></div>
                <div><dt className="text-xs font-medium text-muted-foreground">Fix applied</dt><dd><Highlight text={h.resolution ?? "Not resolved yet"} query={query} /></dd></div>
              </dl>
            </article>
          ))}
          {state.data && state.data.results.length > 0 && <p className="text-xs text-muted-foreground">{state.data.engine === "pgvector" ? "Score = 1 − cosine distance, clamped to 0–1." : "Score = ts_rank_cd normalised to 0–1."}</p>}
        </section>
      </div>
    </div>
  );
}

export default function SimilarPage() {
  return <Suspense><Similar /></Suspense>;
}
