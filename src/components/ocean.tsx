"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { AnswerKey as AnswerKeyData } from "@/lib/categories";
import { TIERS, TIER_IDS, type TierId } from "@/lib/tiers";

// The underwater scene every player-facing screen sits in. All art here is
// simple original SVG/CSS. Specks and fish only render after mount, so float
// formatting differences can't cause hydration mismatches.

const rand = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const css = (vars: Record<string, string | number>) => vars as CSSProperties;

/** True when layout.tsx's theme script turned on the Thanksgiving look. Client-only, so false on first render. */
export function useFestive() {
  const [festive, setFestive] = useState(false);
  useEffect(() => setFestive(document.documentElement.classList.contains("thanksgiving")), []);
  return festive;
}

export function Ocean({ boat = true }: { boat?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const festive = useFestive();
  // z-0 (not negative) so body's background can't paint over it; pages put
  // their content at z-10.
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* sky strip + water column */}
      <div className="ocean-water absolute inset-0" />
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
          {festive ? <TurkeyBoat /> : <Boat />}
        </div>
      )}
      {festive && <Thanksgiving />}
    </div>
  );
}

/** Pumpkins bobbing on the surface, maple leaves sinking through the water, an autumn branch in the corner. */
function Thanksgiving() {
  return (
    <>
      {[
        { left: "24%", size: 30, delay: "-0.8s" },
        { left: "37%", size: 40, delay: "-2.1s" },
        { left: "52%", size: 26, delay: "-1.4s" },
      ].map((p) => (
        <div
          key={p.left}
          className="bob absolute hidden sm:block"
          style={{ left: p.left, top: `calc(3.3% - ${p.size * 0.62}px)`, animationDelay: p.delay }}
        >
          <Pumpkin size={p.size} />
        </div>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <div
          key={i}
          className="leaf-fall absolute opacity-80"
          style={css({
            left: `${6 + rand(i + 800) * 86}%`,
            top: `${5 + rand(i + 900) * 45}%`,
            "--dur": `${16 + rand(i + 1000) * 12}s`,
            "--delay": `${-rand(i + 1100) * 24}s`,
          })}
        >
          <Leaf size={12 + rand(i + 1200) * 10} color={LEAF_COLORS[i % LEAF_COLORS.length]} />
        </div>
      ))}
      <Branch className="absolute top-0 right-0 w-[min(30vw,200px)]" />
    </>
  );
}

// Tiny pixel-sprite helper: each string is a row, each character a color key
// ("." is empty). Rendered as one <path> per color so sprites stay crisp.
function spritePaths(rows: string[], colors: Record<string, string>) {
  const d: Record<string, string> = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      const ch = row[x];
      let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== "." && colors[ch]) d[ch] = (d[ch] ?? "") + `M${x} ${y}h${n}v1h-${n}z`;
      x += n;
    }
  });
  return Object.entries(d).map(([ch, path]) => <path key={ch} d={path} fill={colors[ch]} />);
}

function Sprite({ rows, colors, size }: { rows: string[]; colors: Record<string, string>; size: number }) {
  const w = rows[0].length;
  const h = rows.length;
  return (
    <svg width={size} height={(size * h) / w} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges">
      {spritePaths(rows, colors)}
    </svg>
  );
}

const LEAF_COLORS = ["#c2410c", "#e8891c", "#d4a017", "#a8321f"];
const LEAF = ["....X....", "...XXX...", "X.XXXXX.X", "XXXXXXXXX", ".XXXXXXX.", "XXXXXXXXX", "..XXXXX..", "....s....", "....s...."];

export function Leaf({ size = 16, color = LEAF_COLORS[0] }: { size?: number; color?: string }) {
  return <Sprite rows={LEAF} colors={{ X: color, s: "#5a3418" }} size={size} />;
}

/** Pixel harvest pumpkin (no face this time — it's pie season). Original art. */
export function Pumpkin({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size * (12 / 14)} viewBox="0 0 14 12" shapeRendering="crispEdges">
      <rect x="6" y="0" width="2" height="2" fill="#4d7c2a" />
      <rect x="8" y="1" width="2" height="1" fill="#4d7c2a" />
      <rect x="2" y="2" width="10" height="1" fill="#e8891c" />
      <rect x="1" y="3" width="12" height="7" fill="#e8891c" />
      <rect x="2" y="10" width="10" height="1" fill="#e8891c" />
      <rect x="4" y="3" width="1" height="7" fill="#c2620f" />
      <rect x="9" y="3" width="1" height="7" fill="#c2620f" />
      <rect x="2" y="4" width="1" height="2" fill="#f6b04a" />
    </svg>
  );
}

const TURKEY = [
  "...aaaaaaa...",
  ".aaoooooooaa.",
  "aooyyyyyyyooa",
  "aoyydbbbdyyoa",
  "aoyddkbkddyoa",
  "aoyddbYbddyoa",
  "aoydbbRbbdyoa",
  "aoybbbRbbbyoa",
  ".oybbbbbbbyo.",
  "..ybdbbbdby..",
  "...bbbbbbb...",
  "....l...l....",
  "...ll...ll...",
];
const TURKEY_COLORS = {
  a: "#a8321f",
  o: "#e8891c",
  y: "#e9c46a",
  d: "#4a2c17",
  b: "#8b5a2b",
  k: "#1a0f08",
  Y: "#f5b301",
  R: "#d62828",
  l: "#f5b301",
};

/** Front-facing pixel turkey with a full tail fan. Original art. */
export function Turkey({ size = 28 }: { size?: number }) {
  return <Sprite rows={TURKEY} colors={TURKEY_COLORS} size={size} />;
}

/** A bare autumn branch reaching in from the corner, a few leaves still hanging on. */
function Branch({ className = "" }: { className?: string }) {
  const leaves = [
    { x: 46, y: 3, c: 0, r: -20 },
    { x: 33, y: 8, c: 1, r: 15 },
    { x: 22, y: 14, c: 2, r: -10 },
    { x: 12, y: 18, c: 3, r: 25 },
    { x: 39, y: 11, c: 2, r: 40 },
  ];
  return (
    <svg viewBox="0 0 60 30" className={className}>
      <path d="M62 0Q44 4 28 12Q16 18 4 19" fill="none" stroke="#3b2414" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M34 9Q38 14 40 18" fill="none" stroke="#3b2414" strokeWidth="0.9" strokeLinecap="round" />
      {leaves.map((l) => (
        <g key={`${l.x}-${l.y}`} transform={`translate(${l.x} ${l.y}) rotate(${l.r} 4.5 0) scale(0.9)`} shapeRendering="crispEdges">
          {spritePaths(LEAF, { X: LEAF_COLORS[l.c], s: "#3b2414" })}
        </g>
      ))}
    </svg>
  );
}

/** The boat, crewed by a turkey deckhand who has wisely chosen to go fishing this week. */
export function TurkeyBoat() {
  return (
    <svg viewBox="0 0 48 16" className="w-full" shapeRendering="crispEdges">
      <rect x="20" y="0" width="1" height="7" fill="#0b1424" />
      <rect x="21" y="0" width="12" height="1" fill="#0b1424" />
      <rect x="18" y="3" width="10" height="5" fill="#16243c" />
      <rect x="20" y="4" width="2" height="2" fill="#ffd35a" />
      <rect x="24" y="4" width="2" height="2" fill="#ffd35a" />
      {/* turkey, side view: tail fan behind, facing the rod */}
      <g transform="translate(33 0)">
        {spritePaths(
          ["aoy......", "aoyy..bb.", "aoyy..bkY", "aoyybbbR.", ".oybbbbb.", "..ybbbbb.", "...bbbb..", "....l.l.."],
          TURKEY_COLORS,
        )}
      </g>
      {/* rod and line */}
      <path d="M40.5 4.5L47 0.3" stroke="#5a3a1c" strokeWidth="0.7" shapeRendering="auto" />
      <path d="M47 0.3L47 16" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="0.25" shapeRendering="auto" />
      {/* hull */}
      <rect x="6" y="8" width="38" height="3" fill="#0b1424" />
      <rect x="8" y="11" width="34" height="2" fill="#0b1424" />
      <rect x="11" y="13" width="28" height="1" fill="#0b1424" />
      <rect x="9" y="9" width="30" height="1" fill="#c2410c" />
      {/* a pumpkin pie riding on the bow */}
      <rect x="9" y="6" width="5" height="1" fill="#e8b46a" />
      <rect x="9" y="7" width="5" height="1" fill="#c96a1b" />
      <rect x="11" y="5" width="1" height="1" fill="#fff4e0" />
    </svg>
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
        <circle cx="50" cy="50" r="48" fill="#0a1222" style={{ stroke: "color-mix(in oklab, var(--color-sonar) 25%, transparent)" }} strokeWidth="2" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ stroke: urgent ? "#f87171" : "var(--color-sonar)", transition: "stroke-dashoffset 0.15s linear" }}
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
                className={`panel no-deco mt-1.5 max-w-[22vw] text-center ${big ? "min-w-36 px-3 py-1.5" : "min-w-24 px-2 py-1"} ${c.tier === "krillion" ? "krillion-glow" : ""}`}
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

/**
 * Every accepted answer for a revealed prompt, shallowest tier first (same
 * order as the depth chart). Answers someone actually gave are lit up.
 */
export function AnswerKey({
  answerKey,
  picked = [],
  big = false,
}: {
  answerKey: AnswerKeyData;
  picked?: (string | null)[];
  big?: boolean;
}) {
  const hit = new Set(picked.filter(Boolean).map((p) => p!.toLowerCase()));
  return (
    <div className={big ? "flex flex-col gap-[1.2vh]" : "flex flex-col gap-3"}>
      {TIER_IDS.map((t) => {
        const list = answerKey[t];
        if (!list.length) return null;
        const color = TIER_HEX[t];
        return (
          <section key={t} className={`border-l-4 bg-black/25 ${big ? "px-[1vw] py-[1vh]" : "px-3 py-2"}`} style={{ borderColor: color }}>
            <h3 className={`label flex items-baseline gap-2 ${big ? "text-[min(1.9vh,1.2vw)]" : ""}`} style={{ color }}>
              {TIERS[t].label}
              <span className="text-white/40">
                · {TIERS[t].points} pts · {list.length}
              </span>
            </h3>
            <ul className={`mt-1.5 flex flex-wrap ${big ? "gap-[0.6vh_0.5vw] text-[min(2.1vh,1.3vw)]" : "gap-1.5 text-sm"}`}>
              {list.map((a) => {
                const on = hit.has(a.toLowerCase());
                return (
                  <li
                    key={a}
                    className={`border font-pixel leading-tight ${big ? "px-[0.5vw] py-[0.3vh]" : "px-1.5 py-0.5"} ${on ? "text-[#0a1222]" : "border-white/10 text-white/80"}`}
                    style={on ? { background: color, borderColor: color } : undefined}
                  >
                    {a}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
