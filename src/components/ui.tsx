"use client";

import { TIERS, type TierId } from "@/lib/tiers";
import type { ScoredAnswer, Standing } from "@/lib/types";

const TIER_CLASS: Record<TierId, string> = {
  minnow: "text-tier-minnow border-tier-minnow/40 bg-tier-minnow/10",
  sardine: "text-tier-sardine border-tier-sardine/40 bg-tier-sardine/10",
  bass: "text-tier-bass border-tier-bass/40 bg-tier-bass/10",
  marlin: "text-tier-marlin border-tier-marlin/40 bg-tier-marlin/10",
  greatfish: "text-tier-greatfish border-tier-greatfish/40 bg-tier-greatfish/10",
  leviathan: "text-tier-leviathan border-tier-leviathan/50 bg-tier-leviathan/15",
};

export const TIER_TEXT: Record<TierId, string> = {
  minnow: "text-tier-minnow",
  sardine: "text-tier-sardine",
  bass: "text-tier-bass",
  marlin: "text-tier-marlin",
  greatfish: "text-tier-greatfish",
  leviathan: "text-tier-leviathan",
};

export function TierBadge({ tier, size = "sm" }: { tier: TierId | null; size?: "sm" | "lg" }) {
  const cls = tier ? TIER_CLASS[tier] : "text-red-300 border-red-400/40 bg-red-500/10";
  const label = tier ? TIERS[tier].label : "No catch";
  const sz = size === "lg" ? "px-4 py-1.5 text-lg" : "px-2.5 py-0.5 text-xs";
  return (
    <span className={`inline-flex items-center rounded-full border font-semibold tracking-wide uppercase ${sz} ${cls}`}>
      {label}
    </span>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`font-display font-extrabold tracking-tight ${className}`}>
      <span className="text-glow">Levi</span>athan
    </div>
  );
}

export function Countdown({ ms, total, paused, big = false }: { ms: number; total: number; paused?: boolean; big?: boolean }) {
  const secs = Math.ceil(ms / 1000);
  const pct = total > 0 ? Math.max(0, Math.min(1, ms / (total * 1000))) : 0;
  const urgent = secs <= 5 && !paused;
  const r = 44;
  const c = 2 * Math.PI * r;
  const dim = big ? "h-44 w-44" : "h-20 w-20";
  return (
    <div className={`relative ${dim}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? "#f87171" : "#5eead4"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.15s linear" }}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums ${
          big ? "text-6xl" : "text-2xl"
        } ${urgent ? "text-red-300" : ""}`}
      >
        {paused ? "❚❚" : secs}
      </div>
    </div>
  );
}

export function StandingsList({ rows, highlight, compact = false }: { rows: Standing[]; highlight?: string; compact?: boolean }) {
  if (!rows.length) return <p className="text-mist">No teams yet.</p>;
  return (
    <ol className="space-y-2">
      {rows.map((s, i) => (
        <li
          key={s.teamId}
          className={`rise flex items-center gap-3 rounded-xl border px-4 ${compact ? "py-2" : "py-3"} ${
            s.teamId === highlight ? "border-glow/60 bg-glow/10" : "border-white/10 bg-white/5"
          }`}
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="w-8 font-display text-xl font-bold text-mist tabular-nums">{s.rank}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
          {s.lastPoints > 0 && <span className="text-sm text-glow tabular-nums">+{s.lastPoints}</span>}
          <span className="font-display text-xl font-bold tabular-nums">{s.total}</span>
        </li>
      ))}
    </ol>
  );
}

export function howLabel(a: ScoredAnswer): string | null {
  switch (a.how) {
    case "typo":
      return `read as “${a.canonical}”`;
    case "override":
      return "host call";
    case "added":
      return "host-approved earlier";
    case "missing":
      return "no answer";
    default:
      return null;
  }
}

export function ErrorNote({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{message}</p>;
}
