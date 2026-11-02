import { Suspense } from "react";
import { requireRecord } from "@/lib/data/exists";
import { DeveloperDetail } from "@/components/catalog-pages";

// Server check first: malformed or unknown id → real 404 (app/(app)/not-found.tsx).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = String(await requireRecord("developers", (await params).id));
  return <Suspense><DeveloperDetail id={id} /></Suspense>;
}
