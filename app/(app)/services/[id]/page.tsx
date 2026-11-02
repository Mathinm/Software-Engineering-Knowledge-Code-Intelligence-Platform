import { Suspense } from "react";
import { requireRecord } from "@/lib/data/exists";
import { ServiceDetail } from "./service-detail";

// Server check first: malformed or unknown id → real 404 (app/(app)/not-found.tsx).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = String(await requireRecord("services", (await params).id));
  return <Suspense><ServiceDetail id={id} /></Suspense>;
}
