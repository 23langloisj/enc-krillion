"use client";

import { api } from "./client";
import type { WhoAction, WhoPhase } from "./who";

export const whoKeys = {
  host: (code: string) => `enc-who-host-${code}`,
  player: (code: string) => `enc-who-${code}`,
};

export function whoHost(code: string, hostKey: string, action: WhoAction) {
  return api<{ ok: true }>(`/api/who/${code}/host`, { json: action, headers: { "x-host-key": hostKey } });
}

/** The one "do the next obvious thing" action for each phase. */
export function whoPrimary(v: { phase: WhoPhase; index: number; total: number; boardEvery: number }) {
  switch (v.phase) {
    case "lobby":
      return { action: { type: "start" } as WhoAction, label: "Start game" };
    case "question":
      return { action: { type: "reveal" } as WhoAction, label: "Reveal" };
    case "reveal": {
      const done = v.index + 1;
      const label = done >= v.total ? "Final results" : done % v.boardEvery === 0 ? "Show leaderboard" : "Next question";
      return { action: { type: "next" } as WhoAction, label };
    }
    case "board":
      return { action: { type: "next" } as WhoAction, label: "Next question" };
    default:
      return null;
  }
}

/** Seconds left of story time after a reveal (counts down from 20, then 0). */
export const STORY_SECONDS = 20;
