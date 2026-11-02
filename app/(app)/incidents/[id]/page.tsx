import { Suspense } from "react";
import { requireRecord } from "@/lib/data/exists";
import { WorkDetail } from "@/components/work-detail";

// Server check first: malformed or unknown id → real 404 (app/(app)/not-found.tsx).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = String(await requireRecord("incidents", (await params).id));
  return <Suspense><WorkDetail kind="incidents" id={id} /></Suspense>;
}
