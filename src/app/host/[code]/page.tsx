"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Countdown, ErrorNote, howLabel, Logo, StandingsList, TierBadge } from "@/components/ui";
import { hostAction, keys, primaryAction, readLocal, usePoll, useTimeLeft, writeLocal } from "@/lib/client";
import type { HostAction } from "@/lib/engine";
import { TIERS, TIER_IDS } from "@/lib/tiers";
import type { CatalogEntry, HostView, ScoredAnswer } from "@/lib/types";

export default function HostPage() {
  const { code } = useParams<{ code: string }>();
  const [hostKey, setHostKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setHostKey(readLocal(keys.host(code)));
    setChecked(true);
  }, [code]);

  const headers = useMemo(() => (hostKey ? { "x-host-key": hostKey } : null), [hostKey]);
  const { data: v, error, offset, refresh } = usePoll<HostView>(hostKey ? `/api/games/${code}?role=host` : null, headers);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = useCallback(
    async (action: HostAction) => {
      if (!hostKey) return;
      setBusy(true);
      setActionError(null);
      try {
        await hostAction(code, hostKey, action);
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [code, hostKey, refresh],
  );

  // Space = do the obvious next thing (when not typing).
  useEffect(() => {
    if (!v) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, button")) return;
      if (e.key === " ") {
        const p = primaryAction(v.phase);
        if (p) {
          e.preventDefault();
          act(p.action);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [v, act]);

  if (checked && !hostKey) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <form
          className="card flex w-full max-w-sm flex-col gap-3 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            writeLocal(keys.host(code), keyInput.trim());
            setHostKey(keyInput.trim());
          }}
        >
          <h1 className="font-display text-2xl font-bold">Host key needed</h1>
          <p className="text-sm text-mist">
            This browser didn&apos;t create game {code}. Paste the host key from the original browser (it&apos;s in
            the host page&apos;s footer), or create a new game.
          </p>
          <input className="input" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Host key" />
          <button className="btn-primary">Continue</button>
        </form>
      </main>
    );
  }

  if (!v) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6 text-mist">
        {error ? (
          <div className="flex flex-col items-center gap-3">
            <ErrorNote message={error.message} />
            {error.status === 403 && (
              <button
                className="btn-ghost"
                onClick={() => {
                  writeLocal(keys.host(code), null);
                  setHostKey(null);
                }}
              >
                Enter a different key
              </button>
            )}
          </div>
        ) : (
          "Loading…"
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Logo className="text-2xl" />
          <span className="rounded-lg bg-white/5 px-3 py-1 font-display text-xl font-bold tracking-widest text-glow">
            {v.code}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-ghost" href={`/display/${v.code}`} target="_blank">
            Open projector view ↗
          </Link>
          <Link className="btn-ghost" href={`/join?code=${v.code}`} target="_blank">
            Team join page ↗
          </Link>
        </div>
      </header>

      {v.storeKind === "memory" && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Running with in-memory storage. Fine for local testing; on Vercel, connect Upstash Redis or games will
          randomly reset. Connect the database to this project, then redeploy (new env vars only apply to new
          deployments).{" "}
          {v.redisEnvNames?.length
            ? `Redis-looking env vars this deployment can see: ${v.redisEnvNames.join(", ")} — none is a usable REST URL + token pair.`
            : "This deployment can't see any Redis env vars."}
        </p>
      )}
      {error && <ErrorNote message={`Connection: ${error.message}`} />}
      <ErrorNote message={actionError} />

      <Controls v={v} offset={offset} act={act} busy={busy} />

      {(v.phase === "question" || v.phase === "reveal") && <LiveAnswers v={v} act={act} busy={busy} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-display text-xl font-bold">Standings</h2>
          <StandingsList rows={v.standings} compact />
          <AwardForm v={v} act={act} busy={busy} />
        </section>
        <Teams v={v} act={act} busy={busy} />
      </div>

      {v.phase === "lobby" && <LineupEditor v={v} act={act} busy={busy} />}

      <footer className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-mist">
        <span>
          Shortcuts: <kbd className="rounded bg-white/10 px-1.5">Space</kbd> does the main action. If you mirror this
          laptop to the projector, open the projector view in this browser — Space and P work there too.
        </span>
        <details>
          <summary className="cursor-pointer">Host key / reset</summary>
          <div className="mt-2 flex flex-col gap-2">
            <code className="rounded bg-abyss px-2 py-1 text-xs break-all">{hostKey}</code>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => confirm("Reset the game to the lobby? Scores are wiped; teams stay.") && act({ type: "reset", keepTeams: true })}
            >
              Reset to lobby (keep teams)
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => confirm("Reset and remove every team?") && act({ type: "reset" })}
            >
              Reset everything
            </button>
          </div>
        </details>
      </footer>
    </main>
  );
}

type Act = (a: HostAction) => Promise<void>;

function Controls({ v, offset, act, busy }: { v: HostView; offset: number; act: Act; busy: boolean }) {
  const left = useTimeLeft(v.deadline, v.pausedRemaining, offset);
  const primary = primaryAction(v.phase);
  const next = v.lineup[v.index + 1];
  const paused = v.phase === "question" && v.deadline === null;

  let status: React.ReactNode;
  switch (v.phase) {
    case "lobby":
      status = (
        <>
          Waiting in the lobby · {v.teamCount} team{v.teamCount === 1 ? "" : "s"} · first up: “{v.lineup[0]?.prompt}”
        </>
      );
      break;
    case "question":
      status = v.locked ? "All answers in (or time's up) — reveal when ready." : `${v.submittedCount}/${v.teamCount} locked in`;
      break;
    case "reveal":
      status = next ? `Up next: “${next.prompt}”` : "That was the last category.";
      break;
    case "roundEnd":
      status = `Round ${v.round} done. Round ${v.round + 1} opens with “${next?.prompt}”.`;
      break;
    case "final":
      status = "Game over! 🎉";
  }

  return (
    <section className="card flex flex-col gap-4 p-5 md:flex-row md:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-xs tracking-widest text-mist uppercase">
          {v.phase === "lobby"
            ? `${v.total} categories · ${v.rounds} rounds`
            : `Round ${v.round} of ${v.rounds} · Category ${v.index + 1} of ${v.total}`}
        </p>
        {v.prompt && <h1 className="mt-1 font-display text-3xl font-bold">{v.prompt}</h1>}
        <p className="mt-1 text-mist">{status}</p>
      </div>
      {v.phase === "question" && <Countdown ms={left} total={v.answerSeconds} paused={paused} />}
      <div className="flex flex-wrap gap-2 md:max-w-sm md:justify-end">
        {v.phase === "question" && (
          <>
            <button className="btn-ghost" disabled={busy} onClick={() => act({ type: paused ? "resume" : "pause" })}>
              {paused ? "Resume" : "Pause"}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => act({ type: "addTime", seconds: 10 })}>
              +10s
            </button>
            <button className="btn-ghost" disabled={busy || v.locked} onClick={() => act({ type: "endTimer" })}>
              End timer
            </button>
          </>
        )}
        {(v.phase === "question" || v.phase === "reveal") && (
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => confirm("Replay this category from scratch? Its answers are wiped.") && act({ type: "redo" })}
          >
            Replay category
          </button>
        )}
        {primary && (
          <button className="btn-primary px-6 py-3 text-lg" disabled={busy} onClick={() => act(primary.action)}>
            {primary.label} →
          </button>
        )}
      </div>
    </section>
  );
}

function LiveAnswers({ v, act, busy }: { v: HostView; act: Act; busy: boolean }) {
  const [remember, setRemember] = useState(true);
  const unknown = v.live.filter((a) => a.answer && (a.how === "none" || a.how === "typo"));
  return (
    <section className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">
          Answers <span className="text-sm font-normal text-mist">(only you can see these until the reveal)</span>
        </h2>
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Save my approvals to the answer bank
        </label>
      </div>
      {unknown.length > 0 && (
        <p className="mb-3 text-sm text-amber-200">
          {unknown.length} answer{unknown.length === 1 ? "" : "s"} need a look — unrecognized or typo-corrected.
        </p>
      )}
      <div className="flex flex-col divide-y divide-white/5">
        {v.live.map((a) => (
          <AnswerRow key={a.teamId} a={a} index={v.index} remember={remember} act={act} busy={busy} />
        ))}
        {v.live.length === 0 && <p className="text-mist">No teams yet.</p>}
      </div>
    </section>
  );
}

function AnswerRow({ a, index, remember, act, busy }: { a: ScoredAnswer; index: number; remember: boolean; act: Act; busy: boolean }) {
  const flagged = a.answer && (a.how === "none" || a.how === "typo");
  return (
    <div className={`flex flex-col gap-2 py-3 lg:flex-row lg:items-center ${flagged ? "rounded-lg bg-amber-500/5 px-2" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-mist">{a.teamName}</p>
        <p className="font-semibold">
          {a.answer ?? <span className="text-mist italic">waiting…</span>}
          {a.canonical && a.canonical !== a.answer && a.how !== "override" && (
            <span className="ml-2 text-sm text-mist">→ {a.canonical}</span>
          )}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-mist">
          {a.answer && <TierBadge tier={a.tier} />}
          <span>{a.points} pts</span>
          {howLabel(a) && <span>· {howLabel(a)}</span>}
          {a.ambiguous && <span className="text-amber-200">· close to {a.ambiguous.join(" / ")}</span>}
        </div>
      </div>
      {a.answer && (
        <div className="flex flex-wrap gap-1">
          {TIER_IDS.map((t) => (
            <button
              key={t}
              disabled={busy}
              title={`${TIERS[t].label} (${TIERS[t].points})`}
              className={`rounded-md border px-2 py-1 text-xs ${a.how === "override" && a.tier === t ? "border-glow bg-glow/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
              onClick={() => act({ type: "override", index, teamId: a.teamId, tier: t, remember })}
            >
              {TIERS[t].points}
            </button>
          ))}
          <button
            disabled={busy}
            className={`rounded-md border px-2 py-1 text-xs ${a.how === "override" && a.tier === null ? "border-red-400 bg-red-500/20" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
            onClick={() => act({ type: "override", index, teamId: a.teamId, tier: null })}
            title="Mark wrong (0)"
          >
            ✗ 0
          </button>
          {a.how === "override" && (
            <button disabled={busy} className="rounded-md px-2 py-1 text-xs text-mist underline" onClick={() => act({ type: "clearOverride", index, teamId: a.teamId })}>
              undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AwardForm({ v, act, busy }: { v: HostView; act: Act; busy: boolean }) {
  const [teamId, setTeamId] = useState("");
  const [points, setPoints] = useState("10");
  const [note, setNote] = useState("");
  if (!v.teamsFull.length) return null;
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm text-mist">Award or deduct points manually</summary>
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!teamId) return;
          act({ type: "award", teamId, points: Number(points), note });
          setNote("");
        }}
      >
        <select className="input w-auto flex-1" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Team…</option>
          {v.teamsFull.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input className="input w-24" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
        <input className="input flex-1" placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn-ghost" disabled={busy || !teamId}>
          Apply
        </button>
      </form>
      {v.awards.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {v.awards.map((aw) => (
            <li key={aw.id} className="flex items-center justify-between gap-2 rounded bg-white/5 px-3 py-1.5">
              <span>
                {v.teamsFull.find((t) => t.id === aw.teamId)?.name ?? "?"}: {aw.points > 0 ? "+" : ""}
                {aw.points} {aw.note && <span className="text-mist">— {aw.note}</span>}
              </span>
              <button className="text-xs text-mist underline" onClick={() => act({ type: "removeAward", id: aw.id })}>
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function Teams({ v, act, busy }: { v: HostView; act: Act; busy: boolean }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Teams ({v.teamsFull.length})</h2>
        <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => act({ type: "addBots", count: 2 })}>
          + 2 test bots
        </button>
      </div>
      <ul className="space-y-1.5">
        {v.teamsFull.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="truncate">{t.name}</span>
            <button
              className="text-xs text-mist underline"
              disabled={busy}
              onClick={() => confirm(`Remove ${t.name}? They'd have to rejoin.`) && act({ type: "kick", teamId: t.id })}
            >
              remove
            </button>
          </li>
        ))}
        {!v.teamsFull.length && <li className="text-mist">Nobody yet — share the code on the projector.</li>}
      </ul>
      <p className="mt-3 text-xs text-mist">Bots answer automatically each category (sometimes wrong) so you can rehearse.</p>
    </section>
  );
}

function LineupEditor({ v, act, busy }: { v: HostView; act: Act; busy: boolean }) {
  const ids = v.lineup.map((l) => l.id);
  const rounds = Math.ceil(ids.length / v.perRound);
  const byTag = useMemo(() => {
    const m = new Map<string, CatalogEntry[]>();
    for (const c of v.catalog) m.set(c.tag, [...(m.get(c.tag) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => (a === "Bible" ? -1 : b === "Bible" ? 1 : a.localeCompare(b)));
  }, [v.catalog]);

  const setSlot = (i: number, id: string) => {
    const next = [...ids];
    next[i] = id;
    act({ type: "setLineup", lineup: next });
  };

  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Lineup</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-mist">
            Seconds per category
            <select
              className="input w-auto py-1.5"
              value={v.answerSeconds}
              onChange={(e) => act({ type: "settings", answerSeconds: Number(e.target.value) })}
            >
              {[15, 20, 25, 30, 40, 60].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => act({ type: "shuffleLineup" })}>
            Shuffle (~half Bible)
          </button>
          <button className="btn-ghost px-3 py-1.5 text-sm" disabled={busy} onClick={() => act({ type: "defaultLineup" })}>
            Default
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: rounds }, (_, r) => (
          <div key={r}>
            <h3 className="mb-2 text-sm font-semibold tracking-widest text-mist uppercase">Round {r + 1}</h3>
            <ol className="space-y-1.5">
              {ids.slice(r * v.perRound, (r + 1) * v.perRound).map((id, j) => {
                const i = r * v.perRound + j;
                return (
                  <li key={i}>
                    <select className="input py-2 text-sm" value={id} disabled={busy} onChange={(e) => setSlot(i, e.target.value)}>
                      {byTag.map(([tag, cats]) => (
                        <optgroup key={tag} label={tag}>
                          {cats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.prompt} ({c.count}){ids.includes(c.id) && c.id !== id ? " ·used" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-mist">
        The number after each prompt is how many accepted answers it has. Edit answers and tiers in
        src/content/categories/*.json.
      </p>
    </section>
  );
}
