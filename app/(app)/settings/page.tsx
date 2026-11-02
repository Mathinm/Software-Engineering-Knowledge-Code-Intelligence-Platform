"use client";
import { useTheme } from "next-themes";
import { PageHeader, Panel } from "@/components/common";
import { useUser } from "@/components/session";
import { useApi } from "@/lib/client";

export default function SettingsPage() {
  const user = useUser();
  const { theme, setTheme } = useTheme();
  const engine = useApi<{ engine: string; available: { trgm: boolean; vector: boolean } }>("/api/similar");
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title="Settings" description="Personal preferences and environment information." />
      <Panel title="Appearance">
        <fieldset className="flex gap-4 text-sm">
          <legend className="sr-only">Theme</legend>
          {["light", "dark"].map((t) => (
            <label key={t} className="flex items-center gap-2">
              <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)} className="accent-[var(--primary)]" />
              {t === "light" ? "Light (default, best for projectors)" : "Dark"}
            </label>
          ))}
        </fieldset>
      </Panel>
      <Panel title="Your account">
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
          <dt className="text-muted-foreground">Name</dt><dd>{user.name}</dd>
          <dt className="text-muted-foreground">Email</dt><dd>{user.email}</dd>
          <dt className="text-muted-foreground">Role</dt><dd>{user.role === "admin" ? "Admin: full read/write, deletions and audit log" : "Developer: read everything, report issues/incidents, update your own work"}</dd>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Sessions last 8 hours. Roles are stored in developers.auth_role and can only be changed in the database.</p>
      </Panel>
      <Panel title="Database features">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Similar-incident search engine: <b>{engine.data?.engine ?? "…"}</b></li>
          <li>pg_trgm extension: {engine.data ? (engine.data.available.trgm ? "installed" : "not installed (optional, see migrations/001_optional_pg_trgm.sql)") : "…"}</li>
          <li>pgvector + incidents.embedding: {engine.data ? (engine.data.available.vector ? "available" : "not available") : "…"}</li>
        </ul>
      </Panel>
    </div>
  );
}
