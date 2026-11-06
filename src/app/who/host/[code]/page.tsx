"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dial } from "@/components/ocean";
import { ErrorNote } from "@/components/ui";
import { Leaderboard, OPTION_STYLE, WhoLogo } from "@/components/who";
import { readLocal, usePoll, useTimeLeft, writeLocal } from "@/lib/client";
import { whoHost, whoKeys, whoPrimary } from "@/lib/who-client";
import type { WhoAction, WhoHostView } from "@/lib/who";

type Act = (a: WhoAction) => Promise<void>;

export default function WhoHostPage() {
  const { code } = useParams<{ code: string }>();
  const [hostKey, setHostKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => setHostKey(readLocal(whoKeys.host(code))), [code]);

  const headers = useMemo(() => (hostKey ? { "x-host-key": hostKey } : null), [hostKey]);
  const { data: v, error, offset, refresh } = usePoll<WhoHostView>(hostKey ? `/api/who/${code}?role=host` : null, headers);

  const act: Act = useCallback(
    async (a) => {
      if (!hostKey) return;
      setBusy(true);
      setActionError(null);
      try {
        await whoHost(code, hostKey, a);
        refresh();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [code, hostKey, refresh],
  );

  // Space = the big button.
  useEffect(() => {
    if (!v) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== " ") return;
      const p = whoPrimary(v);
      if (!p) return;
      e.preventDefault();
      act(p.action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v, act]);

  if (!hostKey || error?.status === 403) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-4">
        <WhoLogo className="text-center text-3xl" />
        <p className="text-center text-mist">Enter the host key for game {code} to run it from this device.</p>
        <input className="input" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Host key" />
        <button
          className="btn-primary"
          onClick={() => {
            writeLocal(whoKeys.host(code), keyInput.trim());
            setHostKey(keyInput.trim());
          }}
        >
          Continue
        </button>
        {error?.status === 403 && <ErrorNote message="That key doesn't match this game." />}
      </main>
    );
  }

  if (!v) return <main className="p-6 text-mist">{error ? error.message : "Loading…"}</main>;

  const joinUrl = typeof window === "undefined" ? "/who/join" : `${window.location.host}/who/join`;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <WhoLogo className="text-2xl" />
          <span className="text-xs tracking-widest text-mist uppercase">host remote</span>
        </div>
        <Link className="btn-primary px-3 py-2 text-sm" href={`/who/display/${v.code}`} target="_blank">
          Open projector view ↗
        </Link>
      </header>

      {error && <ErrorNote message={`Connection: ${error.message}`} />}
      <ErrorNote message={actionError} />

      {v.phase === "lobby" && (
        <section className="card p-5 text-center">
          <p className="text-sm text-mist">Put the projector view on the big screen — it shows the QR code. Or people go to</p>
          <p className="mt-2 font-mono text-lg">
            {joinUrl} · code <span className="font-semibold tracking-widest text-glow">{v.code}</span>
          </p>
          <p className="mt-2 text-sm text-mist">Facts stay hidden from the room until their question comes up.</p>
        </section>
      )}

      <Controls v={v} offset={offset} act={act} busy={busy} />

      {v.phase === "question" && <LiveQuestion v={v} />}

      {(v.phase === "reveal" || v.phase === "board" || v.phase === "final") && (
        <section className="card p-5">
          <h2 className="mb-3 font-display text-lg font-bold">Leaderboard</h2>
          <Leaderboard rows={v.standings} limit={10} />
        </section>
      )}

      <Facts v={v} act={act} busy={busy} />

      <details className="card p-5">
        <summary className="cursor-pointer font-display text-lg font-bold">Tools</summary>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-mist">
          <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => act({ type: "addBots", count: 4 })}>
            + 4 test bots
          </button>
          <button
            className="btn-danger px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => confirm("Back to the lobby? Scores are wiped; players and facts stay.") && act({ type: "reset" })}
          >
            Reset to lobby
          </button>
          <span className="flex-1 text-right">
            <kbd className="rounded bg-white/10 px-1.5">Space</kbd> = big button
          </span>
        </div>
        <p className="mt-3 text-xs break-all text-mist">Host key (to run this game from another device): {hostKey}</p>
      </details>
    </main>
  );
}

function Controls({ v, offset, act, busy }: { v: WhoHostView; offset: number; act: Act; busy: boolean }) {
  const left = useTimeLeft(v.deadline, null, offset);
  const primary = whoPrimary(v);
  const usable = v.factCount;
  // null = one question per usable fact (the default); a number caps it.
  const [cap, setCap] = useState<number | null>(null);
  const planned = cap ? Math.min(cap, usable) : usable;
  // ~25s on top of the timer for the reveal and story time.
  const minutes = Math.max(1, Math.round((planned * (v.questionSeconds + 25)) / 60));

  let status: React.ReactNode;
  switch (v.phase) {
    case "lobby":
      status = `${v.playerCount} player${v.playerCount === 1 ? "" : "s"} · ${usable} usable fact${usable === 1 ? "" : "s"} · ${planned} question${planned === 1 ? "" : "s"}, about ${minutes} min`;
      break;
    case "question":
      status = v.locked ? "Everyone's in (or time's up) — reveal when ready." : `${v.votedCount}/${v.voterCount} guessed`;
      break;
    case "reveal":
      status = `It was ${v.result?.subjectName}. Give them a moment to tell the story 🎤`;
      break;
    case "board":
      status = "Leaderboard's up.";
      break;
    case "final":
      status = "Game over! 🎉";
  }

  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-widest text-mist uppercase">
            {v.phase === "lobby" ? "lobby" : `question ${Math.min(v.index + 1, v.total)} of ${v.total}`}
          </p>
          {v.question && v.phase !== "board" && <h1 className="mt-1 font-display text-xl leading-snug font-bold">“{v.question.fact}”</h1>}
          <p className="mt-1 text-mist">{status}</p>
        </div>
        {v.phase === "question" && <Dial ms={left} total={v.questionSeconds} size={64} />}
      </div>

      {v.phase === "lobby" && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-mist">
          <label className="flex items-center gap-2">
            Questions
            <select
              className="input w-auto px-2 py-1.5"
              value={cap ?? "all"}
              onChange={(e) => setCap(e.target.value === "all" ? null : Number(e.target.value))}
            >
              <option value="all">One per fact ({usable})</option>
              {[5, 10, 15, 20, 30]
                .filter((n) => n < usable)
                .map((n) => (
                  <option key={n} value={n}>
                    Cap at {n}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Seconds each
            <select
              className="input w-24 px-2 py-1.5"
              value={v.questionSeconds}
              onChange={(e) => act({ type: "settings", questionSeconds: Number(e.target.value) })}
            >
              {[15, 20, 30, 45].map((s) => (
                <option key={s} value={s}>
                  {s}s
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {primary && (
        <button
          className="btn-primary w-full py-4 text-xl"
          disabled={busy}
          onClick={() => act(v.phase === "lobby" ? { type: "start", count: cap ?? undefined } : primary.action)}
        >
          {primary.label} →
        </button>
      )}

      {v.phase === "question" && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-mist">
          <button className="underline-offset-4 hover:text-foam hover:underline disabled:opacity-40" disabled={busy} onClick={() => act({ type: "addTime", seconds: 10 })}>
            +10 seconds
          </button>
          <button className="underline-offset-4 hover:text-foam hover:underline disabled:opacity-40" disabled={busy || v.locked} onClick={() => act({ type: "endTimer" })}>
            End timer now
          </button>
          <button
            className="underline-offset-4 hover:text-foam hover:underline disabled:opacity-40"
            disabled={busy}
            onClick={() => confirm("Skip this fact and show a different one?") && act({ type: "swapQuestion" })}
          >
            Swap this fact
          </button>
        </div>
      )}
    </section>
  );
}

/** Host-only: who the answer is and how the votes are going. */
function LiveQuestion({ v }: { v: WhoHostView }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 font-display text-lg font-bold">
        Live votes <span className="text-sm font-normal text-mist">· only you can see this</span>
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {v.question!.options.map((o, i) => (
          <div
            key={o.id}
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-white ${o.id === v.subjectId ? "ring-2 ring-white" : ""}`}
            style={{ background: OPTION_STYLE[i].bg }}
          >
            <span>{OPTION_STYLE[i].shape}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {o.name}
              {o.id === v.subjectId ? " ✓" : ""}
            </span>
            <span className="font-display font-bold tabular-nums">{v.liveCounts[o.id] ?? 0}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Facts({ v, act, busy }: { v: WhoHostView; act: Act; busy: boolean }) {
  const open = v.phase === "lobby";
  return (
    <details className="card p-5" open={open}>
      <summary className="cursor-pointer font-display text-lg font-bold">
        Players &amp; facts <span className="text-sm font-normal text-mist">({v.players.length} · tap Skip on any you don&apos;t want shown)</span>
      </summary>
      <ul className="mt-4 flex flex-col divide-y divide-white/5">
        {v.players.length === 0 && <li className="py-2 text-mist">Nobody yet — they&apos;ll pop up here as they scan in.</li>}
        {v.players.map((p) => (
          <li key={p.id} className="py-3">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 font-semibold">
                {p.name}
                <span className="ml-2 text-xs font-normal text-mist">
                  {p.facts.length} fact{p.facts.length === 1 ? "" : "s"}
                </span>
              </p>
              <button
                className="shrink-0 px-1 py-1 text-xs text-mist hover:text-red-300"
                disabled={busy}
                onClick={() => confirm(`Remove ${p.name} from the game?`) && act({ type: "kick", playerId: p.id })}
              >
                Remove
              </button>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {p.facts.map((f, i) => (
                <li key={i} className={`flex items-start gap-3 pl-3 ${f.skip ? "opacity-45" : ""}`}>
                  <p className="min-w-0 flex-1 text-sm text-mist">
                    “{f.text}”
                    {f.used && <span className="ml-2 text-xs text-glow">asked</span>}
                    {f.skip && <span className="ml-2 text-xs">skipped</span>}
                  </p>
                  {!f.used && (
                    <button
                      className="btn-ghost shrink-0 px-2.5 py-1 text-xs"
                      disabled={busy}
                      onClick={() => act({ type: "skipFact", playerId: p.id, factIndex: i, skip: !f.skip })}
                    >
                      {f.skip ? "Use" : "Skip"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </details>
  );
}
