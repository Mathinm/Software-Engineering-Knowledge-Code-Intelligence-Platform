"use client";
import { useCallback, useMemo, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { qs, useApi } from "@/lib/client";
import type { Page } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, LoadingRows, Pager, SortHeader } from "./common";

/**
 * List state (filters, sort, page) lives in the URL so dashboard cards can deep-link
 * to filtered views and the back button works. Fetches `${endpoint}?...` from the API.
 */
export function useListQuery<T>(endpoint: string, defaults: Record<string, string> = {}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const params = useMemo(() => {
    const p: Record<string, string> = { ...defaults };
    sp.forEach((v, k) => { p[k] = v; });
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const set = useCallback((patch: Record<string, string | undefined>, resetPage = true) => {
    const next: Record<string, string | undefined> = { ...params, ...patch };
    if (resetPage && !("page" in patch)) delete next.page;
    router.replace(`${pathname}${qs(next)}`, { scroll: false });
  }, [params, pathname, router]);
  const state = useApi<Page<T>>(`${endpoint}${qs(params)}`);
  return { params, set, ...state };
}

export function DataTable<T>({ columns, list, empty, onRowClick, sortable = [] }: {
  columns: ColumnDef<T>[];
  list: ReturnType<typeof useListQuery<T>>;
  empty: ReactNode;
  onRowClick?: (row: T) => void;
  sortable?: string[];
}) {
  const { data, error, loading, reload, params, set } = list;
  const table = useReactTable({
    data: data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: data?.total ?? 0,
  });

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return <LoadingRows rows={8} />;

  const toggleSort = (id: string) =>
    set({ sort: id, dir: params.sort === id && params.dir !== "asc" ? "asc" : "desc" });

  return (
    <div className={cn(loading && "opacity-60 transition-opacity")} aria-busy={loading}>
      {data.rows.length === 0 ? (
        <>{empty ?? <EmptyState title="No results" />}</>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const title = flexRender(h.column.columnDef.header, h.getContext());
                    return (
                      <th key={h.id} scope="col" className="px-3 py-2 font-medium whitespace-nowrap"
                        aria-sort={params.sort === h.id ? (params.dir === "asc" ? "ascending" : "descending") : undefined}>
                        {sortable.includes(h.id)
                          ? <SortHeader active={params.sort === h.id} dir={params.dir} onClick={() => toggleSort(h.id)}>{title}</SortHeader>
                          : title}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr key={r.id}
                  className={cn("border-t hover:bg-muted/30", onRowClick && "cursor-pointer")}
                  onClick={onRowClick ? () => onRowClick(r.original) : undefined}>
                  {r.getVisibleCells().map((c) => (
                    <td key={c.id} className="px-3 py-2 align-middle">{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: String(p) }, false)} />
    </div>
  );
}
