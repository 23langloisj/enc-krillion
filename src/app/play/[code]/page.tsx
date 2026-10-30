"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Countdown, ErrorNote, howLabel, Logo, StandingsList, TierBadge } from "@/components/ui";
import { api, keys, readLocal, usePoll, useTimeLeft } from "@/lib/client";
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
  const { data: v, error, offset, refresh } = usePoll<TeamView>(
    token ? `/api/games/${code}?role=team` : null,
    headers,
  );

  useEffect(() => {
    if (error?.status === 403 || error?.status === 404) {
      router.replace(`/join?code=${code}&reason=${encodeURIComponent(error.message)}`);
    }
  }, [error, code, router]);

  if (!v) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-mist">
        {error ? error.message : "Connecting…"}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between">
        <Logo className="text-xl" />
        <div className="text-right text-xs text-mist">
          <div className="font-semibold text-foam">{v.me.name}</div>
          <div>Room {v.code}</div>
        </div>
      </header>
      {error && <ErrorNote message="Connection hiccup — retrying…" />}
      <Body v={v} offset={offset} token={token!} refresh={refresh} />
    </main>
  );
}

function Body({ v, offset, token, refresh }: { v: TeamView; offset: number; token: string; refresh: () => void }) {
  const myStanding = v.standings.find((s) => s.teamId === v.me.id);

  if (v.phase === "lobby") {
    return (
      <section className="card flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-5xl">🎣</p>
        <h1 className="font-display text-3xl font-bold">You&apos;re in!</h1>
        <p className="text-mist">Huddle up. The host will start soon.</p>
        <p className="text-sm text-mist">{v.teamCount} team{v.teamCount === 1 ? "" : "s"} joined</p>
      </section>
    );
  }

  if (v.phase === "question") return <Question v={v} offset={offset} token={token} refresh={refresh} />;

  if (v.phase === "reveal") {
    const r = v.me.result;
    return (
      <>
        <section className={`card rise flex flex-col items-center gap-3 p-6 text-center ${r?.tier === "leviathan" ? "leviathan-glow" : ""}`}>
          <p className="text-sm text-mist">{v.prompt}</p>
          <p className="font-display text-3xl font-bold">{r?.answer ?? "—"}</p>
          <TierBadge tier={r?.tier ?? null} size="lg" />
          <p className="font-display text-5xl font-extrabold text-glow tabular-nums">+{r?.points ?? 0}</p>
          {r && howLabel(r) && <p className="text-xs text-mist">{howLabel(r)}</p>}
        </section>
        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold text-mist">Standings</h2>
          <StandingsList rows={v.standings} highlight={v.me.id} compact />
        </section>
      </>
    );
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="text-center">
        <p className="text-sm tracking-widest text-mist uppercase">
          {v.phase === "final" ? "Final results" : `End of round ${v.round}`}
        </p>
        {myStanding && (
          <p className="mt-2 font-display text-4xl font-bold">
            {v.phase === "final" && myStanding.rank === 1 ? "🏆 " : ""}#{myStanding.rank} · {myStanding.total}
          </p>
        )}
      </div>
      <StandingsList rows={v.standings} highlight={v.me.id} compact />
    </section>
  );
}

function Question({ v, offset, token, refresh }: { v: TeamView; offset: number; token: string; refresh: () => void }) {
  const left = useTimeLeft(v.deadline, v.pausedRemaining, offset);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // New category: clear the box.
  useEffect(() => {
    setAnswer("");
    setSent(null);
    setError(null);
    input.current?.focus();
  }, [v.index]);

  const submitted = v.me.submitted ?? sent;
  const closed = v.locked || (v.deadline !== null && left <= 0);
  const paused = v.deadline === null;

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
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-mist uppercase">
            Round {v.round} · {(v.index % v.perRound) + 1}/{v.perRound}
            {v.tag && <> · {v.tag}</>}
          </p>
          <h1 className="mt-1 font-display text-2xl leading-tight font-bold">{v.prompt}</h1>
        </div>
        <Countdown ms={left} total={v.answerSeconds} paused={paused} />
      </div>

      {submitted ? (
        <div className="rise rounded-xl border border-glow/40 bg-glow/10 p-4 text-center">
          <p className="text-xs tracking-widest text-glow uppercase">Locked in</p>
          <p className="mt-1 font-display text-2xl font-bold">{submitted}</p>
          <p className="mt-2 text-xs text-mist">Points are revealed on the big screen.</p>
        </div>
      ) : closed ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center text-mist">
          ⏱ Time&apos;s up — eyes on the screen.
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            ref={input}
            className="input text-xl"
            placeholder={paused ? "Paused…" : "Your rarest answer"}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={60}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            disabled={paused}
          />
          <button className="btn-primary py-3 text-lg" disabled={busy || !answer.trim() || paused}>
            {busy ? "Sending…" : "Lock it in"}
          </button>
          <p className="text-center text-xs text-mist">One shot per category — no edits after you lock in.</p>
        </form>
      )}
      <ErrorNote message={error} />
      <p className="text-center text-xs text-mist">
        {v.submittedCount}/{v.teamCount} teams locked in
      </p>
    </section>
  );
}
