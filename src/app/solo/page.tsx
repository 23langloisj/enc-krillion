"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnswerKey, DepthChart, Dial, Ocean, TIER_HEX } from "@/components/ocean";
import { api, readLocal, writeLocal } from "@/lib/client";
import type { AnswerKey as AnswerKeyData } from "@/lib/categories";
import { TIERS, type TierId } from "@/lib/tiers";

// Solo mode: one person, one phone, one round of 7 prompts. The server only
// scores answers; progress lives in this browser so a refresh resumes.

interface Prompt {
  id: string;
  prompt: string;
  tag: string;
}

interface Result {
  categoryId: string;
  prompt: string;
  answer: string | null;
  canonical: string | null;
  tier: TierId | null;
  points: number;
  /** Only kept in memory for the reveal screen; not needed in the saved summary. */
  answerKey?: AnswerKeyData;
}

interface Saved {
  round: number;
  name: string;
  results: Result[];
}

const SECONDS = 25;
const SAVE_KEY = "enc-solo";

function loadSaved(round: number): Saved | null {
  try {
    const s = JSON.parse(readLocal(SAVE_KEY) ?? "null") as Saved | null;
    return s && s.round === round ? s : null;
  } catch {
    return null;
  }
}

export default function SoloPage() {
  return (
    <>
      <Ocean />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[18vw] pb-28 sm:pt-28">
        <Suspense>
          <Solo />
        </Suspense>
      </main>
    </>
  );
}

function Solo() {
  const params = useSearchParams();
  const router = useRouter();
  const round = Number(params.get("round") ?? 0);

  if (![1, 2, 3].includes(round)) return <PickRound onPick={(r) => router.push(`/solo?round=${r}`)} />;
  return <Round key={round} round={round} />;
}

function PickRound({ onPick }: { onPick: (round: number) => void }) {
  return (
    <section className="panel rise p-6 text-center">
      <p className="label text-lure">solo dive</p>
      <h1 className="mt-3 font-pixel text-3xl leading-snug">Pick your round</h1>
      <p className="mt-3 text-white/70">
        7 prompts, {SECONDS} seconds each. Name a right answer nobody else would think of — the rarer it is, the deeper
        it sinks and the more points you get.
      </p>
      <div className="mt-6 grid gap-3">
        {[1, 2, 3].map((r) => (
          <button
            key={r}
            onClick={() => onPick(r)}
            className="border border-sonar/50 bg-well px-4 py-4 font-pixel text-2xl hover:bg-sonar/10"
          >
            Round {r}
          </button>
        ))}
      </div>
      <p className="label mt-5 text-white/40">your leader will tell you which round</p>
    </section>
  );
}

function Round({ round }: { round: number }) {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved>(() => ({ round, name: "", results: [] }));
  const [started, setStarted] = useState(false);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const s = loadSaved(round);
    if (s) {
      setSaved(s);
      setStarted(s.results.length > 0);
    }
    api<{ prompts: Prompt[] }>(`/api/solo?round=${round}`).then(
      (r) => setPrompts(r.prompts),
      (e) => setError((e as Error).message),
    );
  }, [round]);

  const persist = useCallback((next: Saved) => {
    setSaved(next);
    // Answer keys can be long (151 Pokémon); the summary doesn't need them.
    writeLocal(SAVE_KEY, JSON.stringify({ ...next, results: next.results.map((r) => ({ ...r, answerKey: undefined })) }));
  }, []);

  if (error) return <section className="panel p-6 text-center font-pixel text-xl">{error}</section>;
  if (!prompts) return <section className="panel p-6 text-center font-pixel text-xl">Lowering the line…</section>;

  const done = saved.results.length >= prompts.length && !revealing;
  const total = saved.results.reduce((s, r) => s + r.points, 0);

  if (!started) {
    return (
      <section className="panel rise p-6 text-center">
        <p className="label text-lure">round {round} · solo</p>
        <h1 className="mt-3 font-pixel text-3xl">Ready to dive?</h1>
        <p className="mt-3 text-white/70">
          {prompts.length} prompts · {SECONDS}s each · one answer per prompt. The clock starts as soon as each prompt
          appears.
        </p>
        <input
          className="mt-5 w-full border border-sonar/60 bg-well px-3 py-3 text-center font-mono text-white outline-none placeholder:text-white/35 focus:border-sonar"
          placeholder="your name (for the scoreboard)"
          maxLength={24}
          value={saved.name}
          onChange={(e) => setSaved({ ...saved, name: e.target.value })}
        />
        <button
          className="mt-4 w-full border border-lure-edge/40 bg-lure py-4 font-mono text-lg font-semibold tracking-[0.3em] text-[#1a0710] shadow-[3px_3px_0_rgb(0_0_0/0.4)]"
          onClick={() => {
            persist({ ...saved, results: [] });
            setStarted(true);
          }}
        >
          DIVE
        </button>
      </section>
    );
  }

  if (done) return <Summary saved={saved} total={total} round={round} onReplay={() => { persist({ ...saved, results: [] }); setStarted(false); }} />;

  const index = revealing ? saved.results.length - 1 : saved.results.length;
  return (
    <PromptView
      key={`${index}-${revealing}`}
      prompt={prompts[index]}
      index={index}
      count={prompts.length}
      round={round}
      result={revealing ? saved.results[index] : null}
      total={total}
      onScored={(r) => {
        persist({ ...saved, results: [...saved.results, r] });
        setRevealing(true);
      }}
      onNext={() => setRevealing(false)}
    />
  );
}

function PromptView({
  prompt,
  index,
  count,
  round,
  result,
  total,
  onScored,
  onNext,
}: {
  prompt: Prompt;
  index: number;
  count: number;
  round: number;
  result: Result | null;
  total: number;
  onScored: (r: Result) => void;
  onNext: () => void;
}) {
  const [deadline] = useState(() => Date.now() + SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);
  const left = Math.max(0, deadline - now);

  const send = useCallback(
    async (text: string) => {
      if (sent.current) return;
      sent.current = true;
      setBusy(true);
      try {
        const r = await api<Omit<Result, "categoryId" | "prompt">>("/api/solo", {
          json: { categoryId: prompt.id, answer: text },
        });
        onScored({ ...r, categoryId: prompt.id, prompt: prompt.prompt });
      } catch {
        sent.current = false;
        setBusy(false);
      }
    },
    [prompt, onScored],
  );

  useEffect(() => {
    if (result) return;
    const h = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(h);
  }, [result]);

  // Time's up: lock in whatever is typed (possibly nothing).
  useEffect(() => {
    if (!result && left <= 0) send(answer);
  }, [left, result, answer, send]);

  const label = `Round ${round} · prompt ${index + 1} of ${count}`;

  if (result) {
    const tier = result.tier;
    return (
      <>
        <section className="panel">
          <div className="p-5">
            <p className="label text-lure">{label}</p>
            <h1 className="mt-2 font-pixel text-2xl leading-snug">{result.prompt}</h1>
          </div>
        </section>
        <div className="mt-4 h-[42vh] min-h-64">
          <DepthChart
            catches={[{ key: "me", team: "your answer", answer: result.answer, tier, points: result.points }]}
            stepMs={0}
          />
        </div>
        <section className="panel rise mt-4 p-5 text-center">
          <p className="font-pixel text-4xl tabular-nums" style={{ color: tier ? TIER_HEX[tier] : "#f87171" }}>
            +{result.points}
          </p>
          <p className="label mt-1 text-white/70">
            {tier ? TIERS[tier].label : result.answer ? "not on the list" : "no answer"}
            {result.canonical && result.canonical !== result.answer ? ` · read as “${result.canonical}”` : ""}
          </p>
          <p className="label mt-3 text-white/45">running total · {total}</p>
          <button
            className="mt-4 w-full border border-sonar/60 bg-well py-3 font-mono tracking-[0.25em] text-sonar hover:bg-sonar/10"
            onClick={onNext}
          >
            {index + 1 < count ? "NEXT PROMPT" : "SEE MY SCORE"}
          </button>
        </section>
        {result.answerKey && (
          <section className="panel rise mt-4 p-5">
            <h2 className="label mb-3 text-lure">answer key · every accepted answer</h2>
            <AnswerKey answerKey={result.answerKey} picked={[result.canonical]} />
          </section>
        )}
      </>
    );
  }

  const pct = left / (SECONDS * 1000);
  return (
    <>
      <section className="panel rise p-5">
        <p className="label text-lure">
          {label}
          <span className="text-white/40"> · {prompt.tag}</span>
        </p>
        <h1 className="mt-3 font-pixel text-[1.7rem] leading-snug">{prompt.prompt}</h1>
        <p className="label mt-4 text-[0.6rem] whitespace-nowrap text-white/45">▼ rarer answers sink deeper ▼</p>
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (answer.trim()) send(answer);
        }}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-bar/95 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]"
      >
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <Dial ms={left} total={SECONDS} size={52} />
          <div className="min-w-0 flex-1">
            <input
              autoFocus
              className="w-full border border-sonar/70 bg-well px-3 py-3 font-mono text-base text-white outline-none placeholder:text-white/35 focus:border-sonar"
              placeholder="type one answer…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={60}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="send"
              disabled={busy}
            />
            <div className="mt-1.5 h-1 bg-white/10">
              <div className="h-full bg-sonar" style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          <button
            className="shrink-0 border border-lure-edge/40 bg-lure px-4 py-3 font-mono text-sm font-semibold tracking-[0.25em] text-[#1a0710] shadow-[3px_3px_0_rgb(0_0_0/0.4)] disabled:opacity-40"
            disabled={busy || !answer.trim()}
          >
            {busy ? "…" : "DIVE"}
          </button>
        </div>
      </form>
    </>
  );
}

function Summary({ saved, total, round, onReplay }: { saved: Saved; total: number; round: number; onReplay: () => void }) {
  return (
    <section className="panel rise p-6">
      <p className="label text-center text-lure">round {round} · final catch</p>
      {saved.name && <p className="mt-3 text-center font-pixel text-2xl">{saved.name}</p>}
      <p className="mt-2 text-center font-pixel text-7xl tabular-nums text-sonar">{total}</p>
      <p className="label mt-1 text-center text-white/50">points · show this to your leader</p>
      <ul className="mt-6 space-y-1.5">
        {saved.results.map((r) => (
          <li key={r.categoryId} className="flex items-center gap-3 border border-white/10 bg-black/20 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-white/50">{r.prompt}</span>
              <span className="block truncate font-pixel">{r.answer ?? "—"}</span>
              <span className="label block text-[0.6rem]" style={{ color: r.tier ? TIER_HEX[r.tier] : "#f87171" }}>
                {r.tier ? TIERS[r.tier].label : "miss"}
              </span>
            </span>
            <span className="w-12 shrink-0 text-right font-pixel text-xl tabular-nums">{r.points}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button className="border border-white/15 bg-white/5 py-3 font-mono text-sm tracking-widest" onClick={onReplay}>
          PLAY AGAIN
        </button>
        <Link className="border border-sonar/60 bg-well py-3 text-center font-mono text-sm tracking-widest text-sonar" href="/solo">
          OTHER ROUND
        </Link>
      </div>
    </section>
  );
}
