"use client";

import type { WhoStanding } from "@/lib/who";
import { MAX_FACT, MAX_FACTS, MIN_FACT } from "@/lib/who-rules";

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

/** One to three fact boxes, with an "add another" button and a nudge when a fact is too short. */
export function FactsEditor({
  facts,
  onChange,
  placeholder,
}: {
  facts: string[];
  onChange: (facts: string[]) => void;
  placeholder?: string;
}) {
  const set = (i: number, value: string) => onChange(facts.map((f, j) => (j === i ? value : f)));
  return (
    <div className="flex flex-col gap-3">
      {facts.map((f, i) => {
        const short = f.trim().length > 0 && f.trim().length < MIN_FACT;
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="relative">
              <textarea
                className={`input min-h-24 resize-none pr-9 text-base ${short ? "border-amber-400/70" : ""}`}
                maxLength={MAX_FACT}
                placeholder={i === 0 ? placeholder : "Another one (optional)"}
                value={f}
                onChange={(e) => set(i, e.target.value)}
                aria-label={`Fact ${i + 1}`}
              />
              {facts.length > 1 && (
                <button
                  type="button"
                  className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full text-mist hover:bg-white/10 hover:text-foam"
                  onClick={() => onChange(facts.filter((_, j) => j !== i))}
                  aria-label={`Remove fact ${i + 1}`}
                >
                  ×
                </button>
              )}
            </div>
            <span className={`text-xs ${short ? "text-amber-200" : "text-mist"}`}>
              {short ? `A few more words — at least ${MIN_FACT} characters.` : ""} {f.length}/{MAX_FACT}
            </span>
          </div>
        );
      })}
      {facts.length < MAX_FACTS && (
        <button
          type="button"
          className="rounded-xl border border-dashed border-white/20 py-2.5 text-sm text-mist hover:border-glow/60 hover:text-foam"
          onClick={() => onChange([...facts, ""])}
        >
          + Add another fact <span className="opacity-70">(up to {MAX_FACTS})</span>
        </button>
      )}
    </div>
  );
}
