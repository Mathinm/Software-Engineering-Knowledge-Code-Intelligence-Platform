"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Box, BookOpen, Bug, Code2, GitCommit, Loader2, SearchX } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/client";

type Hit = { id: number; title: string; excerpt: string; meta: string; repo_id?: number };
type Results = Record<"services" | "apis" | "issues" | "commits" | "adrs", Hit[]>;

const GROUPS: { key: keyof Results; label: string; icon: ReactNode; href: (h: Hit) => string }[] = [
  { key: "services", label: "Services", icon: <Box />, href: (h) => `/services/${h.id}` },
  { key: "apis", label: "APIs", icon: <Code2 />, href: (h) => `/apis/${h.id}` },
  { key: "issues", label: "Issues", icon: <Bug />, href: (h) => `/issues/${h.id}` },
  { key: "commits", label: "Commits", icon: <GitCommit />, href: (h) => `/repositories/${h.repo_id}` },
  { key: "adrs", label: "ADRs", icon: <BookOpen />, href: (h) => `/adrs/${h.id}` },
];

/** Wrap every occurrence of the query words in <mark>. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-yellow-200 px-0.5 text-inherit dark:bg-yellow-700/60">{part}</mark> : part))}</>;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      api<Results>(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => { setResults(r); setError(null); })
        .catch((e) => { if (e.name !== "AbortError") setError(e.message); })
        .finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query]);

  const total = results ? GROUPS.reduce((n, g) => n + results[g.key].length, 0) : 0;
  const go = (href: string) => { onOpenChange(false); setQuery(""); router.push(href); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
        <DialogTitle className="sr-only">Search ImpactGraph</DialogTitle>
        <DialogDescription className="sr-only">Search services, APIs, issues, commits and ADRs. Use arrow keys and Enter.</DialogDescription>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput placeholder="Search services, APIs, issues, commits, ADRs…" value={query} onValueChange={setQuery} aria-label="Search" />
          <CommandList className="max-h-[420px]">
            {loading && <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Searching…</div>}
            {error && <div role="alert" className="px-4 py-3 text-sm text-risk-high">{error}</div>}
            {!query.trim() && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Type to search. ↑ ↓ to move, Enter to open, Esc to close.</div>}
            {query.trim() && results && total === 0 && !loading && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-1 py-4"><SearchX className="size-6 text-muted-foreground" /><span>No matches for “{query}”.</span>
                  <span className="text-xs text-muted-foreground">Try a service name, an API path like /orders, or a commit hash.</span></div>
              </CommandEmpty>
            )}
            {results && GROUPS.map((g) => results[g.key].length > 0 && (
              <CommandGroup key={g.key} heading={g.label}>
                {results[g.key].map((h) => (
                  <CommandItem key={`${g.key}-${h.id}`} value={`${g.key}-${h.id}`} onSelect={() => go(g.href(h))} className="items-start gap-3 py-2">
                    <span className="mt-0.5 text-muted-foreground" aria-hidden>{g.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium"><Highlight text={h.title} query={query} /></div>
                      <div className="truncate text-xs text-muted-foreground"><Highlight text={h.excerpt} query={query} /></div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{g.key === "issues" ? `#${h.id}` : h.meta}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
