"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, KindIcon, PageHeader, StatusBadge } from "@/components/common";
import { DataTable, useListQuery } from "@/components/data-table";
import { FormDialog, enumOptions } from "@/components/form-dialog";
import { ListFilters } from "@/components/list-filters";
import { useUser } from "@/components/session";
import { api, useApi } from "@/lib/client";
import { SERVICE_STATUSES } from "@/lib/domain";
import { cn } from "@/lib/utils";

type Row = { service_id: number; service: string; status: string; repo: string; maintainer: string; open_issues: number; open_incidents: number; dependents: number; dependencies: number };
type Lookups = { repositories: { id: number; name: string }[]; developers: { id: number; name: string }[] };

function Services() {
  const user = useUser();
  const router = useRouter();
  const list = useListQuery<Row>("/api/services");
  const [creating, setCreating] = useState(false);
  const lk = useApi<Lookups>(user.role === "admin" ? "/api/lookups" : null);

  const columns = useMemo<ColumnDef<Row>[]>(() => [
    { id: "service", header: "Service", cell: ({ row }) => <span className="flex items-center gap-2"><KindIcon kind="service" className="size-5" /><span className="font-medium">{row.original.service}</span></span> },
    { id: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { id: "repo", header: "Repository", cell: ({ row }) => row.original.repo },
    { id: "maintainer", header: "Maintainer", cell: ({ row }) => row.original.maintainer },
    { id: "open_issues", header: "Open issues", cell: ({ row }) => <span className={cn("tabular-nums", row.original.open_issues > 0 && "font-semibold")}>{row.original.open_issues}</span> },
    { id: "open_incidents", header: "Open incidents", cell: ({ row }) => <span className="tabular-nums">{row.original.open_incidents}</span> },
    { id: "dependents", header: "Used by", cell: ({ row }) => <span className="tabular-nums">{row.original.dependents} service{row.original.dependents === 1 ? "" : "s"}</span> },
    { id: "dependencies", header: "Depends on", cell: ({ row }) => <span className="tabular-nums">{row.original.dependencies}</span> },
  ], []);

  return (
    <div className="space-y-4">
      <PageHeader title="Services" description="Every microservice, from the v_service_overview view."
        actions={user.role === "admin" && <Button onClick={() => setCreating(true)}><Plus /> New service</Button>} />
      <ListFilters list={list} placeholder="Search services, repos, maintainers…" statuses={SERVICE_STATUSES} />
      <DataTable list={list} columns={columns} sortable={["service", "status", "open_issues", "open_incidents", "dependents"]}
        onRowClick={(r) => router.push(`/services/${r.service_id}`)} empty={<EmptyState title="No services match" />} />
      <FormDialog open={creating} onOpenChange={setCreating} title="New service" submitLabel="Create" successMessage="Service created."
        fields={[
          { name: "name", label: "Name", required: true, minLength: 2, maxLength: 150, hint: "Unique within its repository, e.g. checkout-service" },
          { name: "description", label: "Description", type: "textarea", maxLength: 2000 },
          { name: "status", label: "Status", type: "select", required: true, options: enumOptions(SERVICE_STATUSES) },
          { name: "repo_id", label: "Repository", type: "select", required: true, options: lk.data?.repositories.map((r) => ({ value: r.id, label: r.name })) ?? [] },
          { name: "maintainer_id", label: "Maintainer", type: "select", required: true, options: lk.data?.developers.map((d) => ({ value: d.id, label: d.name })) ?? [] },
        ]}
        initial={{ status: "active" }}
        onSubmit={async (v) => { const r = await api<{ service_id: number }>("/api/services", { method: "POST", body: v }); router.push(`/services/${r.service_id}`); }} />
    </div>
  );
}

export default function ServicesPage() {
  return <Suspense><Services /></Suspense>;
}
