"use client";

import type { WhoStanding } from "@/lib/who";

// Shared look for "Who Said That?!": four colored, shape-coded answers
// (so color-blind players can go by shape) and a simple leaderboard.

export const OPTION_STYLE = [
  { bg: "#e21b3c", shape: "▲", letter: "A" },
  { bg: "#1368ce", shape: "◆", letter: "B" },
  { bg: "#d89e00", shape: "●", letter: "C" },
  { bg: "#26890c", shape: "■", letter: "D" },
] as const;

export function WhoLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`font-display font-extrabold tracking-tight ${className}`}>
      Who Said <span className="text-glow">That?!</span>
    </div>
  );
}

export function Leaderboard({
  rows,
  highlight,
  limit = 10,
  big = false,
}: {
  rows: WhoStanding[];
  highlight?: string;
  limit?: number;
  big?: boolean;
}) {
  const shown = rows.slice(0, limit);
  const mine = highlight ? rows.find((r) => r.id === highlight) : undefined;
  const extra = mine && !shown.includes(mine) ? mine : null;
  const row = (r: WhoStanding) => (
    <li
      key={r.id}
      className={`flex items-center gap-3 rounded-xl px-4 ${big ? "py-[1.1vh] text-[min(3.4vh,2vw)]" : "py-2"} ${
        r.id === highlight ? "bg-glow/20 ring-1 ring-glow/60" : "bg-white/5"
      }`}
    >
      <span className="w-8 shrink-0 font-display font-bold text-mist tabular-nums">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
      {r.last && <span className="text-sm text-glow">+1</span>}
      <span className="font-display font-extrabold tabular-nums">{r.score}</span>
    </li>
  );
  return (
    <ol className="flex flex-col gap-1.5">
      {shown.map(row)}
      {extra && (
        <>
          <li className="text-center text-mist">…</li>
          {row(extra)}
        </>
      )}
    </ol>
  );
}

export function pct(n: number, of: number) {
  return of > 0 ? Math.round((n / of) * 100) : 0;
}
