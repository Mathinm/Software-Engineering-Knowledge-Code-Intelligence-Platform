"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/shell/app-shell";
import { api } from "@/lib/client";

const DEMO = {
  admin: { email: "aarav@impactgraph.dev", password: "Demo@1234" },
  developer: { email: "diya@impactgraph.dev", password: "Demo@1234" },
};

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  // Already signed in with a live (non-revoked) session? Skip the form.
  useEffect(() => {
    api("/api/auth/me").then(() => router.replace("/")).catch(() => { /* not signed in */ });
  }, [router]);

  const validate = () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email address.";
    if (!password) e.password = "Password is required.";
    setErrors(e);
    return !e.email && !e.password;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await api("/api/auth/login", { method: "POST", body: { email: email.trim(), password } });
      // only allow same-site relative redirects
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (e) {
      setErrors({ form: (e as Error).message });
      setBusy(false);
    }
  };

  const fill = (k: keyof typeof DEMO) => { setEmail(DEMO[k].email); setPassword(DEMO[k].password); setErrors({}); };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {errors.form && <div role="alert" className="rounded-lg border border-risk-high/40 bg-risk-high-bg px-3 py-2 text-sm text-risk-high">{errors.form}</div>}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!errors.email} aria-describedby={errors.email ? "email-err" : undefined} placeholder="you@impactgraph.dev" autoFocus />
        {errors.email && <p id="email-err" className="text-xs text-risk-high">{errors.email}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!errors.password} aria-describedby={errors.password ? "pw-err" : undefined} />
        {errors.password && <p id="pw-err" className="text-xs text-risk-high">{errors.password}</p>}
      </div>
      <Button type="submit" className="h-10 w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Sign in
      </Button>
      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-xs text-muted-foreground">Demo accounts (password <code className="font-mono">Demo@1234</code>). These buttons only fill in the form.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fill("admin")}><ShieldCheck /> Fill demo Admin</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fill("developer")}>Fill demo Developer</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Sign-in checks your password against a bcrypt hash in PostgreSQL and starts an 8-hour session (httpOnly cookie).
        Your role (Admin or Developer) comes from your account.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">
            Understand what a change to a service, API or database table could break — before you ship it.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Network className="size-3.5" aria-hidden /> Impact analysis</span>
            <span className="flex items-center gap-1"><Sparkles className="size-3.5" aria-hidden /> Similar incidents</span>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="mb-4 text-xl font-semibold">Sign in</h1>
          <Suspense><LoginForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
