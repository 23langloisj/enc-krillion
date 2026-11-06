"use client";

import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { AnswerKey, DepthChart, Dial, Ocean } from "@/components/ocean";
import { howLabel, StandingsList } from "@/components/ui";
import { hostAction, keys, primaryAction, readLocal, usePoll, useTimeLeft } from "@/lib/client";
import type { DisplayView } from "@/lib/types";

// Projector view. Shows nothing a team couldn't see on its own phone, except
// that results appear for everyone at reveal time.
export default function DisplayPage() {
  const { code } = useParams<{ code: string }>();
  const { data: v, error, offset, refresh } = usePoll<DisplayView>(`/api/games/${code}?role=display`, null);
  useHostKeys(code, v, refresh);

  return (
    <>
      <Ocean />
      <main className="relative z-10 flex h-dvh flex-col overflow-hidden px-[3vw] pt-[7vh] pb-[3vh]">
        {v && v.phase !== "lobby" && (
          <div className="label absolute top-[1.2vh] right-[2vw] text-sm text-[#0b1424]/80">
            join: {hostLabel()} · code <span className="font-semibold text-[#0b1424]">{v.code}</span>
          </div>
        )}
        {!v ? (
          <div className="m-auto font-pixel text-3xl">{error?.message ?? "Lowering the line…"}</div>
        ) : (
          <>
            {v.phase === "lobby" && <Lobby v={v} />}
            {v.phase === "question" && <Question v={v} offset={offset} />}
            {v.phase === "reveal" && <Reveal v={v} />}
            {(v.phase === "roundEnd" || v.phase === "final") && <Board v={v} />}
          </>
        )}
      </main>
    </>
  );
}

function hostLabel() {
  return typeof window === "undefined" ? "" : `${window.location.host}/join`;
}

/** If this browser is also the host (mirrored projector), Space advances, P pauses, K toggles the answer key. */
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
      } else if ((e.key === "k" || e.key === "K") && v.phase === "reveal") {
        hostAction(code, hostKey, { type: "showKey", show: !v.showKey }).then(refresh, refresh);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, v, refresh]);
}

function roundLabel(v: DisplayView) {
  return `Round ${v.round} of ${v.rounds} · prompt ${(v.index % v.perRound) + 1} of ${v.perRound}`;
}

function Lobby({ v }: { v: DisplayView }) {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = `${window.location.origin}/join?code=${v.code}`;
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, color: { dark: "#0a1222", light: "#ffffff" } }).then(setQr);
  }, [v.code]);

  return (
    <div className="m-auto flex w-full max-w-6xl flex-col items-center gap-[4vh]">
      <div className="panel flex w-full items-center gap-[4vw] p-[3vw]">
        <div className="w-[min(30vh,24vw)] shrink-0 bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="min-w-0">
          <p className="label text-base text-lure">scan to join · or go to {url.replace(/^https?:\/\//, "").replace(/\?.*/, "")}</p>
          <p className="mt-2 font-pixel text-[min(22vh,13vw)] leading-none tracking-[0.12em]">{v.code}</p>
          <p className="mt-4 font-mono text-[min(2.6vh,1.6vw)] text-white/70">
            Teams of 4–5 · one phone per team · {v.rounds} rounds × {v.perRound} prompts · {v.answerSeconds}s each
          </p>
          <p className="mt-2 font-mono text-[min(2.6vh,1.6vw)] text-white/50">
            Name a right answer nobody else would think of. The rarer it is, the deeper it sinks.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {v.teams.length === 0 && <span className="label text-base text-white/50">waiting for teams…</span>}
        {v.teams.map((t) => (
          <span key={t.id} className="rise panel px-5 py-2 font-pixel text-[min(3.2vh,2vw)]">
            {t.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function Question({ v, offset }: { v: DisplayView; offset: number }) {
  const left = useTimeLeft(v.deadline, v.pausedRemaining, offset);
  return (
    <div className="flex flex-1 flex-col items-center">
      <div key={v.index} className="panel rise w-full max-w-6xl p-[3vh_3vw]">
        <p className="label text-base text-lure">
          {roundLabel(v)}
          {v.tag && <span className="text-white/40"> · {v.tag}</span>}
        </p>
        <h1 className="mt-[2vh] font-pixel text-[min(9vh,6vw)] leading-tight">{v.prompt}</h1>
        <p className="label mt-[2vh] text-sm text-white/45">▼ rarer answers sink deeper ▼</p>
      </div>
      <div className="mt-auto flex flex-col items-center gap-[3vh]">
        <Dial ms={left} total={v.answerSeconds} paused={v.deadline === null} size={170} />
        <div className="flex flex-wrap justify-center gap-3">
          {v.teams.map((t, i) => {
            const done = i < v.submittedCount; // counts only, so we never reveal who answered what
            return (
              <span key={t.id} className={`h-4 w-12 ${done ? "bg-sonar shadow-[0_0_12px_var(--color-sonar)]" : "bg-white/10"}`} />
            );
          })}
        </div>
        <p className="label text-base text-white/70">
          {v.locked ? "lines are in · " : ""}
          {v.submittedCount} / {v.teamCount} teams locked in
        </p>
      </div>
    </div>
  );
}

function Reveal({ v }: { v: DisplayView }) {
  if (!v.reveal) return null;
  const step = 750;
  const catches = v.reveal.answers.map((a) => ({
    key: a.teamId,
    team: a.teamName,
    answer: a.answer,
    tier: a.tier,
    points: a.points,
    note: howLabel(a),
  }));
  return (
    <div className="flex min-h-0 flex-1 gap-[2vw]">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="panel p-[2vh_2vw]">
          <p className="label text-sm text-lure">{roundLabel(v)}</p>
          <h1 className="mt-1 font-pixel text-[min(5vh,3.2vw)] leading-tight">{v.reveal.prompt}</h1>
        </div>
        {v.showKey && v.answerKey ? (
          <div className="panel rise mt-[2vh] min-h-0 flex-1 overflow-y-auto p-[1.5vh_1.2vw]">
            <h2 className="label mb-[1vh] text-[min(1.9vh,1.2vw)] text-lure">answer key · every accepted answer</h2>
            <AnswerKey answerKey={v.answerKey} picked={v.reveal.answers.map((a) => a.canonical)} big />
          </div>
        ) : (
          <div className="mt-[2vh] min-h-0 flex-1">
            <DepthChart catches={catches} stepMs={step} big />
          </div>
        )}
      </div>
      <aside
        className="panel rise w-[24vw] shrink-0 self-start p-5"
        style={{ animationDelay: v.showKey ? "0ms" : `${catches.length * step + 900}ms` }}
      >
        <h2 className="label mb-3 text-sm text-lure">standings</h2>
        <StandingsList rows={v.standings} compact />
      </aside>
    </div>
  );
}

function Board({ v }: { v: DisplayView }) {
  const final = v.phase === "final";
  const winners = v.standings.filter((s) => s.rank === 1);
  return (
    <div className="m-auto w-full max-w-4xl">
      <div className="panel p-[4vh_3vw] text-center">
        <p className="label text-base text-lure">{final ? "final catch" : `end of round ${v.round}`}</p>
        {final && winners.length > 0 ? (
          <h1 className="rise mt-3 font-pixel text-[min(9vh,6vw)]">🏆 {winners.map((w) => w.name).join(" & ")}</h1>
        ) : (
          <h1 className="mt-3 font-pixel text-[min(8vh,5vw)]">Round {v.round + 1} up next</h1>
        )}
        <div className="mt-[4vh] text-left text-[min(3vh,1.8vw)]">
          <StandingsList rows={v.standings} />
        </div>
      </div>
    </div>
  );
}
