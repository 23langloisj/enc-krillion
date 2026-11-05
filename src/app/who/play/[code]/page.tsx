"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Leaderboard, OPTION_STYLE, WhoLogo } from "@/components/who";
import { api, readLocal, usePoll, useTimeLeft } from "@/lib/client";
import { whoKeys } from "@/lib/who-client";
import type { WhoPlayerView } from "@/lib/who";

export default function WhoPlayPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = readLocal(whoKeys.player(code));
    if (!t) router.replace(`/who/join?code=${code}`);
    else setToken(t);
  }, [code, router]);

  const headers = useMemo(() => (token ? { "x-player-token": token } : null), [token]);
  const { data: v, error, offset, refresh } = usePoll<WhoPlayerView>(token ? `/api/who/${code}?role=player` : null, headers);

  useEffect(() => {
    if (error?.status === 403 || error?.status === 404) {
      router.replace(`/who/join?code=${code}&reason=${encodeURIComponent(error.message)}`);
    }
  }, [error, code, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-5">
      <header className="mb-4 flex items-center justify-between">
        <WhoLogo className="text-xl" />
        <span className="text-right text-xs text-mist">
          {v ? (
            <>
              {v.me.name}
              <br />
              {v.me.score} pt{v.me.score === 1 ? "" : "s"}
            </>
          ) : null}
        </span>
      </header>
      {!v ? (
        <div className="card m-auto p-6 text-center">{error ? error.message : "Connecting…"}</div>
      ) : (
        <>
          {error && <p className="mb-3 text-center text-xs text-red-300">connection hiccup · retrying</p>}
          <Body v={v} offset={offset} token={token!} refresh={refresh} />
        </>
      )}
    </main>
  );
}

function Body({ v, offset, token, refresh }: { v: WhoPlayerView; offset: number; token: string; refresh: () => void }) {
  if (v.phase === "lobby") return <Lobby v={v} token={token} refresh={refresh} />;
  if (v.phase === "question") return <Question v={v} offset={offset} token={token} refresh={refresh} />;
  if (v.phase === "reveal") return <Reveal v={v} />;

  const final = v.phase === "final";
  return (
    <section className="card rise p-5">
      <p className="text-center text-sm font-semibold tracking-[0.25em] text-mist uppercase">
        {final ? "final results" : `leaderboard · ${v.index + 1} of ${v.total} done`}
      </p>
      <p className="mt-2 text-center font-display text-5xl font-extrabold">
        {final && v.me.rank === 1 ? "🏆 " : ""}#{v.me.rank}
      </p>
      <p className="text-center text-mist">
        {v.me.score} correct guess{v.me.score === 1 ? "" : "es"}
      </p>
      <div className="mt-5">
        <Leaderboard rows={v.standings} highlight={v.me.id} limit={5} />
      </div>
    </section>
  );
}

function Lobby({ v, token, refresh }: { v: WhoPlayerView; token: string; refresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [fact, setFact] = useState(v.me.fact);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await api(`/api/who/${v.code}/join`, { json: { fact, token } });
      setEditing(false);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="card rise p-6 text-center">
      <p className="text-4xl">🎉</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold">You&apos;re in, {v.me.name}!</h1>
      <p className="mt-2 text-mist">Hang tight — the game starts when the host is ready.</p>
      <div className="mt-6 rounded-xl bg-white/5 p-4 text-left">
        <p className="text-xs font-semibold tracking-widest text-mist uppercase">your fact (secret!)</p>
        {editing ? (
          <>
            <textarea className="input mt-2 min-h-24 resize-none" maxLength={160} value={fact} onChange={(e) => setFact(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <button className="btn-primary flex-1" onClick={save} disabled={fact.trim().length < 8}>
                Save
              </button>
              <button className="btn-ghost" onClick={() => (setEditing(false), setFact(v.me.fact))}>
                Cancel
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          </>
        ) : (
          <>
            <p className="mt-1 text-lg">“{v.me.fact}”</p>
            <button className="mt-2 text-sm text-glow underline-offset-4 hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>
      <p className="mt-5 text-sm text-mist">
        {v.playerCount} player{v.playerCount === 1 ? "" : "s"} in so far
      </p>
    </section>
  );
}

function Timer({ v, offset }: { v: WhoPlayerView; offset: number }) {
  const left = useTimeLeft(v.deadline, null, offset);
  const pct = Math.max(0, Math.min(1, left / (v.questionSeconds * 1000)));
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full ${left < 5000 ? "bg-red-400" : "bg-glow"}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="w-6 text-right font-display font-bold tabular-nums">{Math.ceil(left / 1000)}</span>
    </div>
  );
}

function Question({ v, offset, token, refresh }: { v: WhoPlayerView; offset: number; token: string; refresh: () => void }) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const left = useTimeLeft(v.deadline, null, offset);

  useEffect(() => {
    setSent(null);
    setError(null);
  }, [v.index]);

  const q = v.question!;
  const mine = v.me.vote ?? sent;
  const closed = v.locked || left <= 0;

  async function guess(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/who/${v.code}/vote`, { json: { index: v.index, choice: id }, headers: { "x-player-token": token } });
      setSent(id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Timer v={v} offset={offset} />
      <p className="text-center text-xs font-semibold tracking-[0.25em] text-mist uppercase">
        question {v.index + 1} of {v.total} · who said…
      </p>
      <h1 key={v.index} className="rise mt-2 mb-5 text-center font-display text-2xl leading-snug font-bold">
        “{q.fact}”
      </h1>

      {v.me.isSubject ? (
        <section className="card rise p-6 text-center">
          <p className="text-5xl">🤫</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold">This one&apos;s YOURS!</h2>
          <p className="mt-2 text-mist">You sit this one out. Keep a straight face…</p>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {q.options.map((o, i) => {
            const s = OPTION_STYLE[i];
            const picked = mine === o.id;
            const dim = (mine && !picked) || (!mine && closed);
            return (
              <button
                key={o.id}
                onClick={() => guess(o.id)}
                disabled={busy || !!mine || closed}
                className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-white shadow-[0_5px_0_rgb(0_0_0/0.35)] transition active:translate-y-1 active:shadow-none ${
                  dim ? "opacity-30" : ""
                } ${picked ? "ring-4 ring-white" : ""}`}
                style={{ background: s.bg }}
              >
                <span className="text-3xl leading-none">{s.shape}</span>
                <span className="font-display text-xl leading-tight font-bold break-words">{o.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {!v.me.isSubject && (
        <p className="mt-5 text-center text-mist">
          {mine
            ? `Locked in: ${q.options.find((o) => o.id === mine)?.name}. Eyes on the big screen 👀`
            : closed
              ? "Time's up!"
              : "Tap who you think said it."}
        </p>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-300">{error}</p>}
      <p className="mt-auto pt-6 text-center text-xs text-mist">
        {v.votedCount}/{v.voterCount} guessed
      </p>
    </>
  );
}

function Reveal({ v }: { v: WhoPlayerView }) {
  const r = v.result!;
  let face: string, title: string, sub: string;
  if (v.me.isSubject) {
    face = "🎤";
    title = "Your moment!";
    sub = `${r.right.length} of ${r.voters} guessed you. Tell everyone the story!`;
  } else if (v.me.correct) {
    face = "✅";
    title = "You got it!";
    sub = `It was ${r.subjectName}. +1 point`;
  } else {
    face = v.me.vote ? "❌" : "⏰";
    title = v.me.vote ? "Nope!" : "No guess";
    sub = `It was ${r.subjectName}.`;
  }
  return (
    <section className={`card rise mt-4 p-6 text-center ${v.me.correct ? "border-emerald-400/50" : ""}`}>
      <p className="text-6xl">{face}</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold">{title}</h1>
      <p className="mt-2 text-lg text-mist">{sub}</p>
      <p className="mt-5 text-sm text-mist">
        #{v.me.rank} · {v.me.score} pt{v.me.score === 1 ? "" : "s"}
      </p>
    </section>
  );
}
