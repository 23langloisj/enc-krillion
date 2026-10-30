"use client";

import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Countdown, howLabel, Logo, StandingsList, TierBadge } from "@/components/ui";
import { hostAction, keys, primaryAction, readLocal, usePoll, useTimeLeft } from "@/lib/client";
import type { DisplayView } from "@/lib/types";

// Projector view. Shows nothing a team couldn't see on its own phone, except
// that results appear for everyone at reveal time.
export default function DisplayPage() {
  const { code } = useParams<{ code: string }>();
  const { data: v, error, offset, refresh } = usePoll<DisplayView>(`/api/games/${code}?role=display`, null);
  useHostKeys(code, v, refresh);

  if (!v) {
    return <main className="flex min-h-dvh items-center justify-center text-2xl text-mist">{error?.message ?? "Loading…"}</main>;
  }

  return (
    <main className="flex min-h-dvh flex-col px-10 py-8">
      <header className="flex items-center justify-between text-mist">
        <Logo className="text-3xl text-foam" />
        {v.phase !== "lobby" && (
          <div className="text-right text-lg">
            Join at <span className="font-semibold text-foam">{hostLabel()}</span> · code{" "}
            <span className="font-display font-bold tracking-widest text-glow">{v.code}</span>
          </div>
        )}
      </header>
      <div className="flex flex-1 flex-col justify-center">
        {v.phase === "lobby" && <Lobby v={v} />}
        {v.phase === "question" && <Question v={v} offset={offset} />}
        {v.phase === "reveal" && <Reveal v={v} />}
        {(v.phase === "roundEnd" || v.phase === "final") && <Board v={v} />}
      </div>
    </main>
  );
}

function hostLabel() {
  return typeof window === "undefined" ? "" : `${window.location.host}/join`;
}

/** If this browser is also the host (mirrored projector), Space advances, P pauses. */
function useHostKeys(code: string, v: DisplayView | null, refresh: () => void) {
  useEffect(() => {
    const hostKey = readLocal(keys.host(code));
    if (!hostKey || !v) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") {
        const p = primaryAction(v.phase);
        if (!p) return;
        e.preventDefault();
        hostAction(code, hostKey, p.action).then(refresh, () => refresh());
      } else if ((e.key === "p" || e.key === "P") && v.phase === "question") {
        hostAction(code, hostKey, { type: v.deadline === null ? "resume" : "pause" }).then(refresh, refresh);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, v, refresh]);
}

function Lobby({ v }: { v: DisplayView }) {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = `${window.location.origin}/join?code=${v.code}`;
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, color: { dark: "#040b1a", light: "#ffffff" } }).then(setQr);
  }, [v.code]);

  return (
    <div className="grid items-center gap-12 lg:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-72 w-72 rounded-3xl bg-white p-4" dangerouslySetInnerHTML={{ __html: qr }} />
        <p className="text-xl text-mist">{url.replace(/^https?:\/\//, "")}</p>
      </div>
      <div>
        <p className="text-2xl text-mist">Room code</p>
        <p className="font-display text-[10rem] leading-none font-extrabold tracking-[0.15em] text-glow">{v.code}</p>
        <p className="mt-6 text-2xl text-mist">
          Teams of 4–5 · one phone per team · {v.rounds} rounds × {v.perRound} categories · {v.answerSeconds}s each
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          {v.teams.length === 0 && <span className="text-xl text-mist/70">Waiting for teams…</span>}
          {v.teams.map((t) => (
            <span key={t.id} className="rise rounded-full border border-glow/40 bg-glow/10 px-5 py-2 text-2xl font-semibold">
              {t.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Question({ v, offset }: { v: DisplayView; offset: number }) {
  const left = useTimeLeft(v.deadline, v.pausedRemaining, offset);
  return (
    <div className="flex flex-col items-center gap-10 text-center">
      <p className="text-2xl tracking-[0.3em] text-mist uppercase">
        Round {v.round} · Category {(v.index % v.perRound) + 1} of {v.perRound}
        {v.tag && <> · {v.tag}</>}
      </p>
      <h1 key={v.index} className="rise max-w-6xl font-display text-7xl leading-tight font-extrabold xl:text-8xl">
        {v.prompt}
      </h1>
      <Countdown ms={left} total={v.answerSeconds} paused={v.deadline === null} big />
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          {Array.from({ length: v.teamCount }, (_, i) => (
            <span key={i} className={`h-4 w-10 rounded-full ${i < v.submittedCount ? "bg-glow" : "bg-white/10"}`} />
          ))}
        </div>
        <p className="text-2xl text-mist">
          {v.locked ? "Lines are in! " : ""}
          {v.submittedCount} / {v.teamCount} teams locked in
        </p>
      </div>
    </div>
  );
}

function Reveal({ v }: { v: DisplayView }) {
  if (!v.reveal) return null;
  // Lowest first, so the biggest catch lands last.
  const answers = [...v.reveal.answers].sort((a, b) => a.points - b.points);
  const step = 700;
  return (
    <div className="grid gap-10 xl:grid-cols-[1fr_26rem]">
      <div>
        <p className="text-xl tracking-[0.3em] text-mist uppercase">
          Round {v.round} · {(v.index % v.perRound) + 1}/{v.perRound}
        </p>
        <h1 className="mb-8 font-display text-5xl font-extrabold">{v.reveal.prompt}</h1>
        <ul className="grid gap-4 md:grid-cols-2">
          {answers.map((a, i) => (
            <li
              key={a.teamId}
              className={`card rise flex items-center gap-5 p-5 ${a.tier === "leviathan" ? "leviathan-glow border-tier-leviathan/60" : ""}`}
              style={{ animationDelay: `${i * step}ms` }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg text-mist">{a.teamName}</p>
                <p className="truncate font-display text-3xl font-bold">{a.answer ?? "—"}</p>
                <div className="mt-2 flex items-center gap-2">
                  <TierBadge tier={a.tier} />
                  {howLabel(a) && <span className="text-sm text-mist">{howLabel(a)}</span>}
                </div>
              </div>
              <span className="font-display text-5xl font-extrabold text-glow tabular-nums">{a.points}</span>
            </li>
          ))}
        </ul>
      </div>
      <aside className="rise" style={{ animationDelay: `${answers.length * step}ms` }}>
        <h2 className="mb-3 text-xl font-semibold text-mist">Standings</h2>
        <StandingsList rows={v.standings} />
      </aside>
    </div>
  );
}

function Board({ v }: { v: DisplayView }) {
  const final = v.phase === "final";
  const winners = v.standings.filter((s) => s.rank === 1);
  return (
    <div className="mx-auto w-full max-w-4xl text-center">
      <p className="text-2xl tracking-[0.3em] text-mist uppercase">{final ? "Final results" : `End of round ${v.round}`}</p>
      {final && winners.length > 0 && (
        <h1 className="rise mt-4 font-display text-7xl font-extrabold">
          🏆 {winners.map((w) => w.name).join(" & ")}
        </h1>
      )}
      {!final && <h1 className="mt-4 font-display text-6xl font-extrabold">Round {v.round + 1} up next</h1>}
      <div className="mt-10 text-left text-2xl">
        <StandingsList rows={v.standings} />
      </div>
    </div>
  );
}
