"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  BookOpen, Box, ChevronsLeft, ChevronsRight, Code2, Menu, Database, FolderGit2, Home, LifeBuoy, LogOut, Moon,
  Network, ScrollText, Search, Settings, ShieldCheck, Sparkles, Sun, Users,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Avatar } from "../common";
import { useUser } from "../session";
import { CommandPalette } from "./command-palette";

type NavItem = { href: string; label: string; icon: ReactNode; admin?: boolean };
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: <Home /> },
  { href: "/impact", label: "Impact Explorer", icon: <Network /> },
  { href: "/services", label: "Services", icon: <Box /> },
  { href: "/apis", label: "APIs", icon: <Code2 /> },
  { href: "/tables", label: "Database Tables", icon: <Database /> },
  { href: "/issues", label: "Issues & Incidents", icon: <LifeBuoy /> },
  { href: "/similar", label: "Similar Incidents", icon: <Sparkles /> },
  { href: "/repositories", label: "Repositories", icon: <FolderGit2 /> },
  { href: "/developers", label: "Developers", icon: <Users /> },
  { href: "/adrs", label: "ADRs", icon: <BookOpen /> },
  { href: "/audit", label: "Audit Log", icon: <ScrollText />, admin: true },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <path d="M16 2 28 9v14l-12 7-12-7V9z" className="fill-primary" />
        <path d="M16 9l6 3.5v7L16 23l-6-3.5v-7z" className="fill-primary-foreground/90" />
        <path d="M16 9v14M10 12.5l12 7M22 12.5l-12 7" className="stroke-primary" strokeWidth="1.4" />
      </svg>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-lg font-bold text-primary">ImpactGraph</span>
          <span className="block text-[11px] text-muted-foreground">Software Engineering Intelligence</span>
        </span>
      )}
    </span>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" onClick={() => setTheme(dark ? "light" : "dark")}
      className="inline-flex h-9 items-center gap-1 rounded-full border bg-card p-1"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} aria-pressed={dark}>
      <span className={cn("rounded-full p-1", !dark && "bg-accent text-primary")}><Sun className="size-4" aria-hidden /></span>
      <span className={cn("rounded-full p-1", dark && "bg-primary text-primary-foreground")}><Moon className="size-4" aria-hidden /></span>
    </button>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Close the mobile navigation drawer whenever the route changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("ig-sidebar") === "1"); } catch { /* storage blocked */ }
  }, []);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem("ig-sidebar", c ? "0" : "1"); } catch { /* ignore */ }
    return !c;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [isMac, setIsMac] = useState(false);
  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };

  const items = NAV.filter((n) => !n.admin || user.role === "admin");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  // `compact` = icon-only (desktop collapsed sidebar). The mobile drawer always shows labels.
  const navLink = (n: NavItem, compact: boolean) => {
    const active = isActive(n.href);
    const link = (
      <Link href={n.href} aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground [&_svg]:size-[18px]",
          active && "bg-accent text-accent-foreground before:absolute before:-left-3 before:top-1 before:bottom-1 before:w-1 before:rounded-r before:bg-primary",
          compact && "justify-center px-0",
        )}>
        <span aria-hidden>{n.icon}</span>
        {compact ? <span className="sr-only">{n.label}</span> : n.label}
      </Link>
    );
    return compact ? (
      <Tooltip key={n.href}><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="right">{n.label}</TooltipContent></Tooltip>
    ) : <div key={n.href}>{link}</div>;
  };
  const settingsItem: NavItem = { href: "/settings", label: "Settings", icon: <Settings /> };

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:gap-4 sm:px-4">
        <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-2 hover:bg-accent lg:hidden"
          aria-label="Open navigation menu" aria-expanded={mobileOpen} aria-controls="mobile-nav">
          <Menu className="size-5" aria-hidden />
        </button>
        <Link href="/" className={cn("shrink-0", collapsed ? "lg:w-12" : "lg:w-56")} aria-label="ImpactGraph home">
          <span className="sm:hidden"><Logo compact /></span>
          <span className="hidden sm:block lg:hidden"><Logo /></span>
          <span className="hidden lg:block"><Logo compact={collapsed} /></span>
        </Link>
        <button type="button" onClick={() => setPaletteOpen(true)}
          className="flex h-10 min-w-0 max-w-2xl flex-1 items-center gap-2 rounded-lg border bg-background px-3 text-left text-sm text-muted-foreground hover:border-primary/40"
          aria-label="Open global search" aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}>
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="hidden flex-1 truncate sm:inline">Search services, APIs, issues, commits, ADRs…</span>
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[11px] md:inline">{isMac ? "⌘" : "Ctrl"}</kbd>
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[11px] md:inline">K</kbd>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-sm font-medium sm:px-2.5",
            user.role === "admin" ? "border-primary/30 bg-accent text-accent-foreground" : "border-risk-low/40 bg-risk-low-bg text-risk-low")}>
            <ShieldCheck className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">{user.role === "admin" ? "Admin" : "Developer"}</span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring lg:pr-2" aria-label={`Account menu for ${user.name}`}>
              <Avatar name={user.name} className="size-9 bg-primary text-sm text-primary-foreground" />
              <span className="hidden text-left text-xs leading-tight lg:block"><span className="block font-medium">{user.name}</span><span className="text-muted-foreground">{user.email}</span></span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-medium">{user.name}</div>
                <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link href={`/developers/${user.id}`}><Users /> My profile</Link></DropdownMenuItem>
              <DropdownMenuItem asChild><Link href="/settings"><Settings /> Settings</Link></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Below lg: the sidebar becomes a slide-over drawer (closes on navigation, see effect above). */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" id="mobile-nav" className="w-64 gap-0 bg-sidebar p-0 lg:hidden">
          <SheetTitle className="border-b px-4 py-4"><Logo /></SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">{items.map((n) => navLink(n, false))}</nav>
          <div className="border-t px-3 py-3">{navLink(settingsItem, false)}</div>
        </SheetContent>
      </Sheet>

      <div className="flex flex-1">
        <aside className={cn("sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col border-r bg-sidebar py-4 transition-[width] lg:flex", collapsed ? "w-[72px] px-3" : "w-60 px-3")}
          aria-label="Main navigation">
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">{items.map((n) => navLink(n, collapsed))}</nav>
          <div className="flex flex-col gap-1 border-t pt-3">
            {navLink(settingsItem, collapsed)}
            <button type="button" onClick={toggle}
              className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent", collapsed && "justify-center px-0")}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
              {collapsed ? <ChevronsRight className="size-[18px]" /> : <><ChevronsLeft className="size-[18px]" /> Collapse</>}
            </button>
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
