"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HostAction } from "./engine";
import type { Phase } from "./types";

// ---------- localStorage (can throw in private mode; never required to render) ----------

export const keys = {
  host: (code: string) => `enc-host-${code}`,
  team: (code: string) => `enc-team-${code}`,
};

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ---------- API ----------

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (json !== undefined ? "POST" : "GET"),
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : undefined,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function hostAction(code: string, hostKey: string, action: HostAction) {
  return api<{ ok: true }>(`/api/games/${code}/host`, { json: action, headers: { "x-host-key": hostKey } });
}

/** The one "do the next obvious thing" action for each phase. */
export function primaryAction(phase: Phase): { action: HostAction; label: string } | null {
  switch (phase) {
    case "lobby":
      return { action: { type: "start" }, label: "Start game" };
    case "question":
      return { action: { type: "reveal" }, label: "Reveal answers" };
    case "reveal":
      return { action: { type: "next" }, label: "Next category" };
    case "roundEnd":
      return { action: { type: "next" }, label: "Start next round" };
    default:
      return null;
  }
}

// ---------- polling ----------

interface PollState<T> {
  data: T | null;
  error: ApiError | null;
  /** serverNow - Date.now() at the last response, for drift-free countdowns. */
  offset: number;
  refresh: () => void;
}

export function usePoll<T extends { serverNow: number }>(
  path: string | null,
  headers: Record<string, string> | null,
  intervalMs = 1000,
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [offset, setOffset] = useState(0);
  const tick = useRef(0);
  const headerKey = JSON.stringify(headers);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++tick.current;
    try {
      const sent = Date.now();
      const next = await api<T>(path, { headers: headers ?? undefined });
      if (id !== tick.current) return; // a newer request already landed
      const rtt = Date.now() - sent;
      setOffset(next.serverNow + rtt / 2 - Date.now());
      setData(next);
      setError(null);
    } catch (e) {
      if (id !== tick.current) return;
      setError(e instanceof ApiError ? e : new ApiError(0, "Can't reach the server. Retrying…"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, headerKey]);

  useEffect(() => {
    if (!path) return;
    load();
    const h = window.setInterval(load, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(h);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, intervalMs, load]);

  return { data, error, offset, refresh: load };
}

/** Milliseconds left on the round clock, re-rendering ~10x a second. */
export function useTimeLeft(deadline: number | null, pausedRemaining: number | null, offset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const h = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(h);
  }, [deadline]);
  if (deadline === null) return pausedRemaining ?? 0;
  return Math.max(0, deadline - (now + offset));
}
