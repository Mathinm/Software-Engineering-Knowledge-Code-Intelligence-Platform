import { redirect } from "next/navigation";
import { currentUser } from "@/lib/api";

// Server-side role check for the Audit Log page (middleware also blocks it).
export default async function AuditLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/?denied=audit");
  return <>{children}</>;
}
