"use client";

import { useParams } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Dial } from "@/components/ocean";
import { Leaderboard, OPTION_STYLE, pct, WhoLogo } from "@/components/who";
import { readLocal, usePoll, useTimeLeft } from "@/lib/client";
import { STORY_SECONDS, whoHost, whoKeys, whoPrimary } from "@/lib/who-client";
import type { WhoPublicView } from "@/lib/who";

type DisplayView = WhoPublicView & { role: "display" };

// Projector. Never shows a fact before its question, or the answer before reveal.
export default function WhoDisplayPage() {
  const { code } = useParams<{ code: string }>();
  const { data: v, error, offset, refresh } = usePoll<DisplayView>(`/api/who/${code}?role=display`, null);
  useHostKeys(code, v, refresh);

  return (
    <main className="flex h-dvh flex-col overflow-hidden px-[3vw] py-[3vh]">
      {v && v.phase !== "lobby" && (
        <div className="mb-[2vh] flex items-center justify-between text-[min(2.2vh,1.4vw)] text-mist">
          <WhoLogo className="text-[min(3.4vh,2.2vw)] text-foam" />
          <span>
            join: {hostLabel()} · code <b className="text-foam">{v.code}</b>
          </span>
        </div>
      )}
      {!v ? (
        <div className="m-auto font-display text-3xl">{error?.message ?? "Connecting…"}</div>
      ) : (
        <>
          {v.phase === "lobby" && <Lobby v={v} />}
          {v.phase === "question" && <Question v={v} offset={offset} />}
          {v.phase === "reveal" && <Reveal v={v} offset={offset} />}
          {(v.phase === "board" || v.phase === "final") && <Board v={v} />}
        </>
      )}
    </main>
  );
}

function hostLabel() {
  return typeof window === "undefined" ? "" : `${window.location.host}/who/join`;
}

/** If this browser is also the host (mirrored projector), Space / Enter / → advances. */
function useHostKeys(code: string, v: DisplayView | null, refresh: () => void) {
  useEffect(() => {
    const hostKey = readLocal(whoKeys.host(code));
    if (!hostKey || !v) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter" && e.key !== "ArrowRight") return;
      const p = whoPrimary(v);
      if (!p) return;
      e.preventDefault();
      whoHost(code, hostKey, p.action).then(refresh, refresh);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, v, refresh]);
}

function Lobby({ v }: { v: DisplayView }) {
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = `${window.location.origin}/who/join?code=${v.code}`;
    setUrl(u);
    QRCode.toString(u, { type: "svg", margin: 1, color: { dark: "#0a1222", light: "#ffffff" } }).then(setQr);
  }, [v.code]);

  return (
    <div className="m-auto flex w-full max-w-6xl flex-col items-center gap-[4vh]">
      <WhoLogo className="text-[min(10vh,6vw)]" />
      <div className="card flex w-full items-center gap-[4vw] p-[3vw]">
        <div className="w-[min(32vh,24vw)] shrink-0 rounded-xl bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="min-w-0">
          <p className="text-[min(2.6vh,1.6vw)] font-semibold tracking-[0.25em] text-glow uppercase">scan to join</p>
          <p className="mt-2 font-display text-[min(18vh,11vw)] leading-none font-extrabold tracking-[0.1em]">{v.code}</p>
          <p className="mt-3 text-[min(3vh,1.9vw)] text-mist">
            or go to {url.replace(/^https?:\/\//, "").replace(/\?.*/, "")}
          </p>
          <p className="mt-4 text-[min(3.4vh,2.1vw)] font-semibold">
            Enter your name and one surprising fact about yourself.
          </p>
        </div>
      </div>
      <p className="text-[min(3vh,1.9vw)] text-mist">
        <b className="text-foam">{v.playerCount}</b> player{v.playerCount === 1 ? "" : "s"} in
      </p>
      <div className="flex max-h-[22vh] flex-wrap justify-center gap-2 overflow-hidden">
        {v.names.map((n) => (
          <span key={n} className="rise rounded-full bg-white/10 px-4 py-1.5 text-[min(2.6vh,1.6vw)] font-semibold">
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

function Header({ v }: { v: DisplayView }) {
  return (
    <div className="card p-[3vh_3vw] text-center">
      <p className="text-[min(2.4vh,1.5vw)] font-semibold tracking-[0.25em] text-mist uppercase">
        question {v.index + 1} of {v.total} · who said…
      </p>
      <h1 key={v.index} className="rise mt-[1.5vh] font-display text-[min(7vh,4.4vw)] leading-tight font-extrabold">
        “{v.question!.fact}”
      </h1>
    </div>
  );
}

function Question({ v, offset }: { v: DisplayView; offset: number }) {
  const left = useTimeLeft(v.deadline, null, offset);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[3vh]">
      <Header v={v} />
      <div className="flex min-h-0 flex-1 gap-[3vw]">
        <div className="grid flex-1 grid-cols-2 gap-[2vh]">
          {v.question!.options.map((o, i) => (
            <div
              key={o.id}
              className="flex items-center gap-[2vw] rounded-2xl px-[2vw] text-white shadow-[0_6px_0_rgb(0_0_0/0.35)]"
              style={{ background: OPTION_STYLE[i].bg }}
            >
              <span className="text-[min(7vh,4vw)]">{OPTION_STYLE[i].shape}</span>
              <span className="font-display text-[min(6vh,3.6vw)] font-extrabold">{o.name}</span>
            </div>
          ))}
        </div>
        <div className="flex w-[16vw] shrink-0 flex-col items-center justify-center gap-[3vh]">
          <Dial ms={left} total={v.questionSeconds} size={170} />
          <p className="text-center text-[min(3vh,1.9vw)] text-mist">
            <b className="font-display text-[min(6vh,3.6vw)] text-foam">{v.votedCount}</b>
            <br />
            of {v.voterCount} guessed
          </p>
        </div>
      </div>
    </div>
  );
}

function Reveal({ v, offset }: { v: DisplayView; offset: number }) {
  const r = v.result!;
  const max = Math.max(1, ...Object.values(r.counts));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[3vh]">
      <Header v={v} />
      <div className="flex min-h-0 flex-1 gap-[3vw]">
        <div className="grid flex-1 grid-cols-2 gap-[2vh]">
          {v.question!.options.map((o, i) => {
            const n = r.counts[o.id] ?? 0;
            const win = o.id === r.subjectId;
            return (
              <div
                key={o.id}
                className={`relative flex flex-col justify-center overflow-hidden rounded-2xl px-[2vw] text-white shadow-[0_6px_0_rgb(0_0_0/0.35)] ${
                  win ? "who-win ring-[6px] ring-white" : "who-lose"
                }`}
                style={{ background: OPTION_STYLE[i].bg }}
              >
                <div className="flex items-center gap-[1.5vw]">
                  <span className="text-[min(5vh,3vw)]">{win ? "✓" : OPTION_STYLE[i].shape}</span>
                  <span className="min-w-0 flex-1 truncate font-display text-[min(5.5vh,3.3vw)] font-extrabold">{o.name}</span>
                  <span className="font-display text-[min(5.5vh,3.3vw)] font-extrabold tabular-nums">{pct(n, r.voters)}%</span>
                </div>
                <div className="mt-[1.2vh] h-[1.6vh] rounded-full bg-black/25">
                  <div className="fill h-full rounded-full bg-white/85" style={{ width: `${(n / max) * 100}%` }} />
                </div>
                <p className="mt-[0.8vh] text-[min(2.2vh,1.4vw)] text-white/80">
                  {n} vote{n === 1 ? "" : "s"}
                </p>
              </div>
            );
          })}
        </div>
        <Story v={v} offset={offset} />
      </div>
    </div>
  );
}

/** "It was Rachel!" plus a gentle story-time countdown. */
function Story({ v, offset }: { v: DisplayView; offset: number }) {
  const r = v.result!;
  const storyEnd = (v.revealedAt ?? 0) + 1600 + STORY_SECONDS * 1000;
  const left = useTimeLeft(storyEnd, null, offset);
  return (
    <div className="after-bars card flex w-[22vw] shrink-0 flex-col items-center justify-center gap-[2vh] p-[2vw] text-center">
      <p className="text-[min(2.4vh,1.5vw)] font-semibold tracking-[0.25em] text-mist uppercase">it was…</p>
      <p className="font-display text-[min(7vh,4.2vw)] leading-tight font-extrabold text-glow">{r.subjectName}!</p>
      <p className="text-[min(2.6vh,1.6vw)] text-mist">
        {r.right.length} of {r.voters} guessed right
      </p>
      <div className="mt-[2vh] text-[min(6vh,3.6vw)]">🎤</div>
      <p className="text-[min(2.8vh,1.7vw)] font-semibold">Story time!</p>
      <Dial ms={left} total={STORY_SECONDS} size={90} />
    </div>
  );
}

function Board({ v }: { v: DisplayView }) {
  const final = v.phase === "final";
  const winners = v.standings.filter((s) => s.rank === 1 && s.score > 0);
  return (
    <div className="m-auto w-full max-w-4xl">
      <div className="card p-[4vh_3vw]">
        <p className="text-center text-[min(2.6vh,1.6vw)] font-semibold tracking-[0.25em] text-mist uppercase">
          {final ? "final results" : `leaderboard · ${v.index + 1} of ${v.total} done`}
        </p>
        {final && winners.length > 0 && (
          <h1 className="rise mt-3 text-center font-display text-[min(8vh,5vw)] font-extrabold">
            🏆 {winners.map((w) => w.name).join(" & ")}
          </h1>
        )}
        <div className="mt-[3vh]">
          <Leaderboard rows={v.standings} limit={final ? 10 : 8} big />
        </div>
      </div>
    </div>
  );
}
