"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/lib/session";

const Ctx = createContext<SessionUser | null>(null);

export function SessionProvider({ user, children }: { user: SessionUser; children: ReactNode }) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

/** The signed-in user (always present inside the app shell). */
export function useUser(): SessionUser {
  const u = useContext(Ctx);
  if (!u) throw new Error("useUser outside SessionProvider");
  return u;
}
