"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

const LISTS: Record<string, [string, string]> = {
  services: ["/services", "Services"],
  apis: ["/apis", "APIs"],
  tables: ["/tables", "Database Tables"],
  issues: ["/issues", "Issues & Incidents"],
  incidents: ["/issues?tab=incidents", "Incidents"],
  adrs: ["/adrs", "ADRs"],
  repositories: ["/repositories", "Repositories"],
  developers: ["/developers", "Developers"],
};

/** "Not found" message with a link back to the list the URL belongs to. */
export function NotFoundView() {
  const first = usePathname().split("/")[1] ?? "";
  const [href, label] = LISTS[first] ?? ["/", "Dashboard"];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This record doesn&apos;t exist or the link is wrong. It may have been deleted.
      </p>
      <Button asChild variant="outline"><Link href={href}><ArrowLeft /> Back to {label}</Link></Button>
    </div>
  );
}
