"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { TIERS, TIER_IDS, type TierId } from "@/lib/tiers";

// The underwater scene every player-facing screen sits in. All art here is
// simple original SVG/CSS. Specks and fish only render after mount, so float
// formatting differences can't cause hydration mismatches.

const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const css = (vars: Record<string, string | number>) => vars as CSSProperties;

export function Ocean({ boat = true }: { boat?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // z-0 (not negative) so body's background can't paint over it; pages put
  // their content at z-10.
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* sky strip + water column */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#eaf3f8_0%,#eaf3f8_3.2%,#3b6b94_3.3%,#2b557c_14%,#1f4166_32%,#152f4f_55%,#0c1d35_78%,#060f1f_100%)]" />
      <div className="waves absolute inset-x-0 top-[2.4%] h-[14px] opacity-90" />
      {/* light shafts */}
      {[12, 34, 58, 81].map((left, i) => (
        <div
          key={left}
          className="absolute top-[3%] h-[75%] w-[9%] origin-top bg-gradient-to-b from-white/[0.07] to-transparent"
          style={{ left: `${left}%`, transform: `skewX(${i % 2 ? 8 : -10}deg)` }}
        />
      ))}
      {/* drifting specks */}
      {mounted && Array.from({ length: 46 }, (_, i) => (
        <span
          key={i}
          className="drift absolute h-[3px] w-[3px] bg-white/60"
          style={css({
            left: `${rand(i) * 100}%`,
            top: `${20 + rand(i + 100) * 80}%`,
            "--dur": `${10 + rand(i + 200) * 14}s`,
            "--delay": `${-rand(i + 300) * 20}s`,
          })}
        />
      ))}
      {/* fish */}
      {mounted && Array.from({ length: 7 }, (_, i) => {
        const size = 14 + rand(i + 400) * 22;
        return (
          <div
            key={i}
            className={i % 2 ? "swim-back absolute" : "swim absolute"}
            style={css({
              top: `${18 + rand(i + 500) * 70}%`,
              left: 0,
              "--dur": `${28 + rand(i + 600) * 34}s`,
              "--delay": `${-rand(i + 700) * 50}s`,
            })}
          >
            <Fish size={size} />
          </div>
        );
      })}
      {boat && (
        <div className="bob absolute top-0 left-[5%] w-[150px] sm:w-[190px]">
          <Boat />
        </div>
      )}
    </div>
  );
}

export function Fish({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.45} viewBox="0 0 20 9" className="text-[#0a1426]/70" shapeRendering="crispEdges">
      <rect x="4" y="2" width="11" height="5" fill="currentColor" />
      <rect x="6" y="1" width="7" height="7" fill="currentColor" />
      <rect x="15" y="3" width="2" height="3" fill="currentColor" />
      <rect x="0" y="1" width="2" height="7" fill="currentColor" />
      <rect x="2" y="3" width="2" height="3" fill="currentColor" />
    </svg>
  );
}

/** A little pixel fishing boat. Original art. */
export function Boat() {
  return (
    <svg viewBox="0 0 48 16" className="w-full" shapeRendering="crispEdges">
      <rect x="20" y="0" width="1" height="7" fill="#0b1424" />
      <rect x="21" y="0" width="12" height="1" fill="#0b1424" />
      <rect x="18" y="3" width="10" height="5" fill="#16243c" />
      <rect x="20" y="4" width="2" height="2" fill="#9cc8e6" />
      <rect x="24" y="4" width="2" height="2" fill="#9cc8e6" />
      <rect x="6" y="8" width="38" height="3" fill="#0b1424" />
      <rect x="8" y="11" width="34" height="2" fill="#0b1424" />
      <rect x="11" y="13" width="28" height="1" fill="#0b1424" />
      <rect x="9" y="9" width="30" height="1" fill="#d14d72" />
    </svg>
  );
}

/** Circular sonar-style timer. */
export function Dial({ ms, total, paused, size = 56 }: { ms: number; total: number; paused?: boolean; size?: number }) {
  const secs = Math.ceil(ms / 1000);
  const pct = total > 0 ? Math.max(0, Math.min(1, ms / (total * 1000))) : 0;
  const urgent = secs <= 5 && !paused && ms > 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r="48" fill="#0a1222" stroke="rgb(103 199 238 / 0.25)" strokeWidth="2" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? "#f87171" : "#67c7ee"}
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.15s linear" }}
        />
      </svg>
      <div
        className={`absolute inset-0 flex items-center justify-center font-pixel tabular-nums ${urgent ? "text-red-300" : "text-sonar"}`}
        style={{ fontSize: size * 0.36 }}
      >
        {paused ? "II" : secs}
      </div>
    </div>
  );
}

export const TIER_HEX: Record<TierId, string> = {
  plankton: "#94a3b8",
  schooler: "#2dd4bf",
  rare: "#60a5fa",
  deepcut: "#c084fc",
  krillion: "#fbbf24",
};

const SURFACE = 13; // % of the chart taken by the surface band (misses stay here)

export function zoneTop(tier: TierId | null): number {
  if (!tier) return SURFACE * 0.55;
  const band = (100 - SURFACE) / TIER_IDS.length;
  return SURFACE + band * (TIER_IDS.indexOf(tier) + 0.5);
}

export interface Catch {
  key: string;
  team: string;
  answer: string | null;
  tier: TierId | null;
  points: number;
  note?: string | null;
}

/**
 * The reveal: each team's line drops from the surface and stops at the depth
 * of its rarity tier. Lowest scores drop first so the deepest catch lands last.
 */
export function DepthChart({ catches, stepMs = 650, big = false }: { catches: Catch[]; stepMs?: number; big?: boolean }) {
  const order = [...catches].sort((a, b) => a.points - b.points);
  const band = (100 - SURFACE) / TIER_IDS.length;
  const cols = Math.max(order.length, 1);
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* zone bands */}
      {TIER_IDS.map((t, i) => (
        <div
          key={t}
          className="absolute inset-x-0 border-t border-dashed border-white/10"
          style={{ top: `${SURFACE + band * i}%`, height: `${band}%`, background: `rgb(0 0 0 / ${0.04 + i * 0.06})` }}
        >
          <div className={`label absolute top-2 left-3 ${big ? "text-sm" : ""}`} style={{ color: TIER_HEX[t] }}>
            {TIERS[t].label} <span className="text-white/40">· {TIERS[t].points}</span>
          </div>
        </div>
      ))}
      {/* lines + lures */}
      {order.map((c, i) => {
        const left = big ? 18 + ((i + 0.5) / cols) * 78 : ((i + 0.5) / cols) * 100;
        const color = c.tier ? TIER_HEX[c.tier] : "#f87171";
        return (
          <div
            key={c.key}
            className="sink absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={css({ top: `${zoneTop(c.tier)}%`, left: `${left}%`, "--delay": `${i * stepMs}ms` })}
          >
            <div className="absolute bottom-full left-1/2 h-[200vh] w-px -translate-x-1/2 bg-white/30" />
            <div className="sway flex flex-col items-center">
              <div className="h-3 w-3 bg-lure shadow-[0_0_0_2px_#0a1222]" />
              {/* compact (team over "answer  +pts") so a card fits inside its own depth band */}
              <div
                className={`panel mt-1.5 max-w-[22vw] text-center ${big ? "min-w-36 px-3 py-1.5" : "min-w-24 px-2 py-1"} ${c.tier === "krillion" ? "krillion-glow" : ""}`}
                style={{ borderColor: `${color}88` }}
                title={c.note ?? undefined}
              >
                <div className={`label truncate text-white/60 ${big ? "text-[0.65rem]" : "text-[0.55rem]"}`}>{c.team}</div>
                <div className={`flex items-baseline justify-center gap-2 font-pixel ${big ? "text-xl" : "text-sm"}`}>
                  <span className="truncate">{c.answer ?? "—"}</span>
                  <span className="shrink-0 tabular-nums" style={{ color }}>
                    {c.tier ? `+${c.points}` : "0"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
