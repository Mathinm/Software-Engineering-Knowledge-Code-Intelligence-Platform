import { NotFoundView } from "@/components/not-found-view";

// Unmatched URLs (outside the signed-in shell).
export default function NotFound() {
  return <main className="p-4"><NotFoundView /></main>;
}
