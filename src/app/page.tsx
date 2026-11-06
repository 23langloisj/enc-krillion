"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Boat, Fish, TurkeyBoat, useFestive } from "@/components/ocean";
import { Logo } from "@/components/ui";
import { OPTION_STYLE, WhoLogo } from "@/components/who";
import { TIERS, TIER_IDS } from "@/lib/tiers";

// The ENC.ICE hub: one card per game. Each card's preview is a tiny, static
// picture of the game that plays a short animation on hover / keyboard focus
// (styles in globals.css under "ENC.ICE hub").

const GAMES = [
  {
    href: "/leviathan",
    accent: "var(--color-sonar)",
    title: <Logo className="text-3xl sm:text-4xl" accent={34} />,
    blurb: "Teams name the rarest right answer they can think of. The deeper the answer, the bigger the catch.",
    preview: <LeviathanPreview />,
  },
  {
    href: "/who",
    accent: "var(--color-glow)",
    title: <WhoLogo className="text-3xl sm:text-4xl" />,
    blurb: "Everyone shares one surprising fact, then the whole room guesses whose it is.",
    preview: <WhoPreview />,
  },
];

export default function Hub() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-10 px-4 py-12 sm:py-16">
      <header>
        <h1 className="font-pixel text-[clamp(4.5rem,16vw,9.5rem)] leading-[0.85] tracking-tight text-foam">ENC.ICE</h1>
        <p className="mt-4 text-lg text-mist">Pick a game.</p>
      </header>

      <div className="grid gap-8 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="hub-card flex flex-col border border-white/10 bg-panel"
            style={{ "--accent": g.accent } as CSSProperties}
          >
            <div className="relative aspect-16/10 overflow-hidden border-b border-white/10" aria-hidden>
              {g.preview}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              {g.title}
              <p className="text-mist">{g.blurb}</p>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

/** The boat on the surface, the depth tiers below, and a line that drops to Krillion on hover. */
function LeviathanPreview() {
  const festive = useFestive();
  const band = 80 / TIER_IDS.length; // water starts 20% down
  return (
    <div className="absolute inset-0">
      <div className="hub-water absolute inset-0" />
      <div className="waves absolute inset-x-0 top-[17%] h-3.5 opacity-90" />
      {TIER_IDS.map((id, i) => (
        <div
          key={id}
          className="absolute inset-x-0 flex items-start justify-end border-t border-dashed border-white/10 px-3 pt-1"
          style={{ top: `${20 + i * band}%`, height: `${band}%` }}
        >
          <span
            className={`font-pixel text-xs sm:text-sm ${id === "krillion" ? "hub-krillion" : "opacity-70"}`}
            style={{ color: `var(--color-tier-${id})` }}
          >
            {TIERS[id].label}
          </span>
        </div>
      ))}
      {[
        { top: "41%", size: 22, dur: "7s", delay: "-2s", back: false },
        { top: "60%", size: 16, dur: "9s", delay: "-6s", back: true },
        { top: "74%", size: 26, dur: "11s", delay: "-4s", back: false },
      ].map((f) => (
        <div
          key={f.top}
          className={`hub-fish absolute ${f.back ? "hub-fish-back" : ""}`}
          style={{ top: f.top, "--dur": f.dur, "--delay": f.delay } as CSSProperties}
        >
          <Fish size={f.size} />
        </div>
      ))}
      {/* the line, with a hook and the prize waiting at the bottom */}
      <div className="hub-line absolute top-[20%] left-[39.3%] w-px bg-white/60">
        <svg viewBox="0 0 6 8" className="absolute -bottom-1.75 -left-0.75 w-1.75" fill="none" stroke="#e5e7eb" strokeWidth="1.2">
          <path d="M3 0V5.5A1.8 1.8 0 0 1 0.6 5.5" />
        </svg>
      </div>
      <div
        className="absolute top-[91%] left-[39.3%] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 bg-tier-krillion shadow-[0_0_14px_var(--color-tier-krillion)]"
      />
      <span className="hub-points absolute top-[80%] left-[43%] font-pixel text-lg text-tier-krillion">
        +{TIERS.krillion.points}
      </span>
      <div className="absolute top-[11%] left-[6%] w-[34%]">{festive ? <TurkeyBoat /> : <Boat />}</div>
    </div>
  );
}

const WHO_VOTES = [
  { name: "Luke", pct: 18 },
  { name: "Darnelle", pct: 47 },
  { name: "Justin", pct: 9 },
  { name: "Emma", pct: 26, answer: true },
];

/** A fact and four names; on hover the votes fill in and the real owner pops. */
function WhoPreview() {
  return (
    <div className="absolute inset-0 flex flex-col gap-[4%] bg-deep p-[5%]">
      <p className="rounded-xl bg-white px-4 py-[3%] text-center font-display text-[clamp(0.9rem,2.4vw,1.25rem)] leading-snug font-bold text-abyss">
        “I was the voice of a cereal ad when I was six.”
      </p>
      <div className="grid flex-1 grid-cols-2 gap-[4%]">
        {WHO_VOTES.map((v, i) => {
          const o = OPTION_STYLE[i];
          return (
            <div
              key={v.name}
              className={`relative flex items-center gap-2 overflow-hidden rounded-lg px-3 text-white ${v.answer ? "hub-who-win" : "hub-who-lose"}`}
              style={{ background: o.bg }}
            >
              <span
                className="hub-bar absolute inset-y-0 left-0 bg-black/25"
                style={{ "--w": `${v.pct}%`, "--i": i } as CSSProperties}
              />
              <span className="relative text-lg">{o.shape}</span>
              <span className="relative min-w-0 flex-1 truncate font-semibold">{v.name}</span>
              <span className="hub-pct relative font-display font-bold tabular-nums">
                {v.answer ? "✓ " : ""}
                {v.pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
