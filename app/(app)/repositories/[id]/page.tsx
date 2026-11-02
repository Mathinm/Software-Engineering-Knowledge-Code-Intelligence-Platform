import { Suspense } from "react";
import { requireRecord } from "@/lib/data/exists";
import { RepositoryDetail } from "@/components/catalog-pages";

// Server check first: malformed or unknown id → real 404 (app/(app)/not-found.tsx).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const id = String(await requireRecord("repositories", (await params).id));
  return <Suspense><RepositoryDetail id={id} /></Suspense>;
}
