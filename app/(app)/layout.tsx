import { redirect } from "next/navigation";
import { currentUser } from "@/lib/api";
import { SessionProvider } from "@/components/session";
import { AppShell } from "@/components/shell/app-shell";

// Every page in this group requires a signed-in user (middleware also enforces this).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <SessionProvider user={user}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
