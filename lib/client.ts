"use client";
// Browser-side access to the API routes. Components use these, never SQL.
import { useCallback, useEffect, useState } from "react";

export class FetchError extends Error {
  constructor(public status: number, message: string, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

/** fetch JSON from our API; throws FetchError with the server's message. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new FetchError(0, "Could not reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth/")) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new FetchError(res.status, data.error ?? `Request failed (${res.status}).`, data);
  return data as T;
}

/** Load a URL with loading / error / reload state. Pass null to skip. */
export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: FetchError | null; loading: boolean }>({
    data: null, error: null, loading: !!url,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    api<T>(url, { signal: ctl.signal })
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((e) => {
        if (e.name !== "AbortError") setState((s) => ({ ...s, error: e, loading: false }));
      });
    return () => ctl.abort();
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
