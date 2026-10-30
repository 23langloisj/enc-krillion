"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DepthChart, Dial, Ocean, TIER_HEX } from "@/components/ocean";
import { howLabel, StandingsList } from "@/components/ui";
import { api, keys, readLocal, usePoll, useTimeLeft } from "@/lib/client";
import { TIERS } from "@/lib/tiers";
import type { TeamView } from "@/lib/types";

export default function PlayPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = readLocal(keys.team(code));
    if (!t) router.replace(`/join?code=${code}`);
    else setToken(t);
  }, [code, router]);

  const headers = useMemo(() => (token ? { "x-team-token": token } : null), [token]);
  const { data: v, error, offset, refresh } = usePoll<TeamView>(token ? `/api/games/${code}?role=team` : null, headers);

  useEffect(() => {
    if (error?.status === 403 || error?.status === 404) {
      router.replace(`/join?code=${code}&reason=${encodeURIComponent(error.message)}`);
    }
  }, [error, code, router]);

  return (
    <>
      <Ocean />
      <main className="relative z-10 mx-auto flex min-h-dvh max-w-xl flex-col px-4 pt-[18vw] pb-28 sm:pt-28">
        <div className="label absolute top-[8vw] right-4 text-right text-[#0b1424]/80 sm:top-6">
          {v ? `${v.me.name} · ${v.code}` : ""}
        </div>
        {!v ? (
          <Panel className="mt-10 text-center">
            <p className="font-pixel text-xl">{error ? error.message : "Lowering the line…"}</p>
          </Panel>
        ) : (
          <>
            {error && <p className="label mb-3 text-center text-red-300">connection hiccup · retrying</p>}
            <Body v={v} offset={offset} token={token!} refresh={refresh} />
          </>
        )}
      </main>
    </>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`panel p-5 ${className}`}>{children}</section>;
}

function promptLabel(v: TeamView) {
  return `Round ${v.round} · prompt ${(v.index % v.perRound) + 1} of ${v.perRound}`;
}

function Body({ v, offset, token, refresh }: { v: TeamView; offset: number; token: string; refresh: () => void }) {
  const mine = v.standings.find((s) => s.teamId === v.me.id);

  if (v.phase === "lobby") {
    return (
      <Panel className="rise mt-6 text-center">
        <p className="label text-lure">you&apos;re aboard</p>
        <h1 className="mt-3 font-pixel text-3xl">{v.me.name}</h1>
        <p className="mt-4 text-white/70">Huddle up with your team. The first prompt drops when the host starts.</p>
        <p className="label mt-6 text-white/50">
          {v.teamCount} team{v.teamCount === 1 ? "" : "s"} on the water
        </p>
      </Panel>
    );
  }

  if (v.phase === "question") return <Question v={v} offset={offset} token={token} refresh={refresh} />;

  if (v.phase === "reveal") {
    const r = v.me.result;
    const tier = r?.tier ?? null;
    return (
      <>
        <Panel>
          <p className="label text-lure">{promptLabel(v)}</p>
          <h1 className="mt-2 font-pixel text-2xl leading-snug">{v.prompt}</h1>
        </Panel>
        <div className="mt-4 h-[46vh] min-h-72">
          <DepthChart
            catches={[
              { key: v.me.id, team: v.me.name, answer: r?.answer ?? null, tier, points: r?.points ?? 0, note: r ? howLabel(r) : null },
            ]}
            stepMs={0}
          />
        </div>
        <Panel className="rise mt-4 text-center" >
          <p className="font-pixel text-4xl tabular-nums" style={{ color: tier ? TIER_HEX[tier] : "#f87171" }}>
            +{r?.points ?? 0}
          </p>
          <p className="label mt-1 text-white/70">{tier ? TIERS[tier].label : r?.answer ? "not on the list" : "no answer"}</p>
          {mine && <p className="label mt-3 text-white/50">#{mine.rank} overall · {mine.total} pts</p>}
        </Panel>
      </>
    );
  }

  return (
    <Panel className="rise">
      <p className="label text-center text-lure">{v.phase === "final" ? "final catch" : `end of round ${v.round}`}</p>
      {mine && (
        <p className="mt-3 text-center font-pixel text-4xl">
          {v.phase === "final" && mine.rank === 1 ? "🏆 " : ""}#{mine.rank} · {mine.total}
        </p>
      )}
      <div className="mt-5">
        <StandingsList rows={v.standings} highlight={v.me.id} compact />
      </div>
    </Panel>
  );
}

function Question({ v, offset, token, refresh }: { v: TeamView; offset: number; token: string; refresh: () => void }) {
  const left = useTimeLeft(v.deadline, v.pausedRemaining, offset);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAnswer("");
    setSent(null);
    setError(null);
  }, [v.index]);

  const submitted = v.me.submitted ?? sent;
  const paused = v.deadline === null;
  const closed = v.locked || (!paused && left <= 0);
  const pct = v.answerSeconds > 0 ? Math.max(0, Math.min(1, left / (v.answerSeconds * 1000))) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ answer: string }>(`/api/games/${v.code}/submit`, {
        json: { index: v.index, answer },
        headers: { "x-team-token": token },
      });
      setSent(res.answer);
      input.current?.blur();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Panel key={v.index} className="rise">
        <p className="label text-lure">
          {promptLabel(v)}
          {v.tag && <span className="text-white/40"> · {v.tag}</span>}
        </p>
        <h1 className="mt-3 font-pixel text-[1.7rem] leading-snug">{v.prompt}</h1>
        <p className="label mt-4 text-[0.6rem] whitespace-nowrap text-white/45">▼ rarer answers sink deeper ▼</p>
      </Panel>

      {submitted && (
        <div className="sink mx-auto mt-16 flex flex-col items-center" style={{ position: "relative" }}>
          <div className="h-16 w-px bg-white/30" />
          <div className="sway flex flex-col items-center">
            <div className="h-3 w-3 bg-lure" />
            <div className="panel mt-2 px-4 py-2 text-center">
              <div className="font-pixel text-xl">{submitted}</div>
              <div className="label mt-1 text-white/50">sinking… reveal on the big screen</div>
            </div>
          </div>
        </div>
      )}
      {!submitted && closed && (
        <p className="mt-16 text-center font-pixel text-xl text-white/70">Time&apos;s up — eyes on the big screen.</p>
      )}
      {error && <p className="mt-6 text-center text-sm text-red-300">{error}</p>}

      {/* bottom bar */}
      <form onSubmit={submit} className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#070d18]/95 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <Dial ms={left} total={v.answerSeconds} paused={paused} size={52} />
          <div className="min-w-0 flex-1">
            <input
              ref={input}
              className="w-full border border-sonar/70 bg-[#0c1526] px-3 py-3 font-mono text-base text-white outline-none placeholder:text-white/35 focus:border-sonar focus:shadow-[0_0_0_2px_rgb(103_199_238/0.25)] disabled:opacity-60"
              placeholder={submitted ? "locked in ✓" : closed ? "time's up" : paused ? "paused…" : "type one answer…"}
              value={submitted ? "" : answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={60}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="send"
              disabled={!!submitted || closed || paused}
            />
            <div className="mt-1.5 h-1 bg-white/10">
              <div className="h-full bg-sonar transition-[width] duration-150 ease-linear" style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
          <button
            className="shrink-0 border border-[#ff8fb1]/40 bg-lure px-4 py-3 font-mono text-sm font-semibold tracking-[0.25em] text-[#1a0710] shadow-[3px_3px_0_rgb(0_0_0/0.4)] active:translate-y-px disabled:opacity-40"
            disabled={busy || !!submitted || closed || paused || !answer.trim()}
          >
            {busy ? "…" : "DIVE"}
          </button>
        </div>
        <p className="label mt-2 text-center text-[0.6rem] text-white/35">
          one answer per team · {v.submittedCount}/{v.teamCount} locked in
        </p>
      </form>
    </>
  );
}
