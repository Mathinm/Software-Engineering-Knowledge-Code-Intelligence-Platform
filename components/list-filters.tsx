"use client";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { label } from "@/lib/domain";

type ListLike = { params: Record<string, string>; set: (p: Record<string, string | undefined>) => void };

/** Search box + optional status filter for the simple list pages. */
export function ListFilters({ list, placeholder, statuses }: { list: ListLike; placeholder: string; statuses?: readonly string[] }) {
  const [q, setQ] = useState(list.params.search ?? "");
  return (
    <form role="search" className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); list.set({ search: q.trim() || undefined }); }}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-9 w-72 pl-8" aria-label="Search" />
      </div>
      {statuses && (
        <select aria-label="Status" value={list.params.status ?? ""} onChange={(e) => list.set({ status: e.target.value || undefined })}
          className="h-9 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <option value="">All statuses</option>
          {statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
      )}
      <Button type="submit" variant="secondary" size="sm" className="h-9">Search</Button>
      {(list.params.search || list.params.status) && (
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setQ(""); list.set({ search: undefined, status: undefined }); }}><X /> Clear</Button>
      )}
    </form>
  );
}
