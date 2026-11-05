// "Who Said That?!" — an icebreaker. Everyone joins with a name and a fun fact;
// each question shows one fact and four people, and everyone else guesses
// whose it is. Same shape as the Krillion engine: server-authoritative,
// deadline timestamps, one vote per player via HSETNX, results frozen at reveal.

import { randomBytes, randomInt } from "node:crypto";
import { GameError, normalizeCode } from "./engine";
import type { Store } from "./store";

const TTL = 60 * 60 * 24 * 3;
const GRACE_MS = 1500;
const MAX_PLAYERS = 80;
const MAX_FACT = 160;
const OPTIONS = 4;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export type WhoPhase = "lobby" | "question" | "reveal" | "board" | "final";

export interface WhoPlayer {
  id: string;
  name: string;
  token: string;
  fact: string;
  /** Host chose not to use this fact. The player still plays. */
  skip: boolean;
  bot?: boolean;
  joinedAt: number;
}

export interface WhoOption {
  id: string;
  name: string;
}

interface Question {
  subjectId: string;
  fact: string;
  options: WhoOption[];
  startedAt: number;
}

export interface WhoResult {
  subjectId: string;
  subjectName: string;
  /** option id -> votes */
  counts: Record<string, number>;
  voters: number;
  /** players who guessed right */
  right: string[];
}

interface Vote {
  choice: string;
  at: number;
}

export interface WhoMeta {
  code: string;
  hostKey: string;
  createdAt: number;
  phase: WhoPhase;
  index: number;
  /** Questions planned for this game (fixed at start; may shrink if facts run out). */
  total: number;
  questionSeconds: number;
  boardEvery: number;
  deadline: number | null;
  revealedAt: number | null;
  questions: Question[];
  results: Record<number, WhoResult>;
}

export interface WhoStanding {
  id: string;
  name: string;
  score: number;
  rank: number;
  /** Got the most recently revealed question right. */
  last: boolean;
}

export interface WhoPublicView {
  code: string;
  serverNow: number;
  phase: WhoPhase;
  index: number;
  total: number;
  questionSeconds: number;
  boardEvery: number;
  deadline: number | null;
  locked: boolean;
  revealedAt: number | null;
  playerCount: number;
  /** Lobby only: names (never facts) for the projector. */
  names: string[];
  /** Usable facts so far, so the host knows how many questions are possible. */
  factCount: number;
  question: { fact: string; options: WhoOption[] } | null;
  votedCount: number;
  voterCount: number;
  result: WhoResult | null;
  standings: WhoStanding[];
}

export interface WhoPlayerView extends WhoPublicView {
  role: "player";
  me: {
    id: string;
    name: string;
    fact: string;
    vote: string | null;
    /** The current question is this player's fact (they sit it out). */
    isSubject: boolean;
    correct: boolean | null;
    score: number;
    rank: number;
  };
}

export interface WhoHostView extends WhoPublicView {
  role: "host";
  players: { id: string; name: string; fact: string; skip: boolean; bot: boolean; used: boolean }[];
  /** Current question's answer, host-only, so they can watch it play out. */
  subjectId: string | null;
  liveCounts: Record<string, number>;
}

export type WhoAction =
  | { type: "start"; count?: number }
  | { type: "reveal" }
  | { type: "next" }
  | { type: "endTimer" }
  | { type: "addTime"; seconds: number }
  | { type: "swapQuestion" }
  | { type: "skipFact"; playerId: string; skip: boolean }
  | { type: "settings"; questionSeconds?: number; count?: number }
  | { type: "kick"; playerId: string }
  | { type: "addBots"; count: number }
  | { type: "reset" };

const k = {
  meta: (code: string) => `w:${code}:meta`,
  players: (code: string) => `w:${code}:players`,
  votes: (code: string, i: number) => `w:${code}:votes:${i}`,
};

const token = () => randomBytes(16).toString("hex");
const clean = (s: string, max: number) => s.trim().replace(/\s+/g, " ").slice(0, max);

const BOT_FACTS = [
  "I once got chased by a goose across a parking lot.",
  "I can recite every book of the Bible in under 20 seconds.",
  "I have never seen a single Star Wars movie.",
  "I accidentally joined the wrong club for a whole semester.",
  "I was in a commercial when I was six.",
  "I've broken the same arm three times.",
  "I can solve a Rubik's cube in under a minute.",
  "I got locked inside a library overnight.",
];

export interface WhoDeps {
  store: Store;
  now?: () => number;
  random?: () => number;
}

export function createWhoEngine({ store, now = Date.now, random = Math.random }: WhoDeps) {
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];
  function shuffle<T>(list: T[]): T[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  async function loadMeta(rawCode: string): Promise<WhoMeta> {
    const raw = await store.get(k.meta(normalizeCode(rawCode)));
    if (!raw) throw new GameError(404, "No game with that code.");
    return JSON.parse(raw);
  }
  const saveMeta = (meta: WhoMeta) => store.set(k.meta(meta.code), JSON.stringify(meta), TTL);

  async function loadPlayers(code: string): Promise<WhoPlayer[]> {
    const raw = await store.hgetall(k.players(code));
    return Object.values(raw)
      .map((v) => JSON.parse(v) as WhoPlayer)
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  }
  const savePlayer = (code: string, p: WhoPlayer) => store.hset(k.players(code), p.id, JSON.stringify(p), TTL);

  async function loadVotes(code: string, index: number): Promise<Record<string, Vote>> {
    if (index < 0) return {};
    const raw = await store.hgetall(k.votes(code, index));
    return Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, JSON.parse(v)]));
  }

  const usable = (players: WhoPlayer[]) => players.filter((p) => p.fact && !p.skip);

  /** Votes that count right now: on time, from a current player who isn't the subject, for a real option. */
  function countedVotes(q: Question, votes: Record<string, Vote>, players: WhoPlayer[]) {
    const t = now();
    const ids = new Set(players.map((p) => p.id));
    const opts = new Set(q.options.map((o) => o.id));
    return Object.entries(votes).filter(
      ([id, v]) => v.at <= t && ids.has(id) && id !== q.subjectId && opts.has(v.choice),
    );
  }

  function tally(q: Question, votes: Record<string, Vote>, players: WhoPlayer[]): WhoResult {
    const counted = countedVotes(q, votes, players);
    const counts = Object.fromEntries(q.options.map((o) => [o.id, 0]));
    for (const [, v] of counted) counts[v.choice]++;
    return {
      subjectId: q.subjectId,
      subjectName: q.options.find((o) => o.id === q.subjectId)?.name ?? "?",
      counts,
      voters: counted.length,
      right: counted.filter(([, v]) => v.choice === q.subjectId).map(([id]) => id),
    };
  }

  function standings(meta: WhoMeta, players: WhoPlayer[]): WhoStanding[] {
    const scores = new Map(players.map((p) => [p.id, 0]));
    for (const r of Object.values(meta.results)) for (const id of r.right) if (scores.has(id)) scores.set(id, scores.get(id)! + 1);
    const lastRight = new Set(meta.results[meta.index]?.right ?? []);
    const rows = players
      .map((p) => ({ id: p.id, name: p.name, score: scores.get(p.id)!, rank: 0, last: lastRight.has(p.id) }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1));
    return rows;
  }

  // ---------- lifecycle ----------

  async function createGame() {
    let code = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      if (!(await store.get(k.meta(code)))) break;
    }
    const meta: WhoMeta = {
      code,
      hostKey: token(),
      createdAt: now(),
      phase: "lobby",
      index: -1,
      total: 10,
      questionSeconds: 20,
      boardEvery: 3,
      deadline: null,
      revealedAt: null,
      questions: [],
      results: {},
    };
    await saveMeta(meta);
    return { code, hostKey: meta.hostKey };
  }

  async function join(rawCode: string, rawName: string, rawFact: string, existingToken?: string) {
    const meta = await loadMeta(rawCode);
    const players = await loadPlayers(meta.code);
    const fact = clean(rawFact, MAX_FACT);
    const mine = existingToken ? players.find((p) => p.token === existingToken) : undefined;
    if (mine) {
      // Same phone again: let them fix their fact while we're still in the lobby.
      if (fact && meta.phase === "lobby" && fact !== mine.fact) await savePlayer(meta.code, { ...mine, fact });
      return { playerId: mine.id, token: mine.token, name: mine.name, code: meta.code };
    }
    const name = clean(rawName, 24);
    if (!name) throw new GameError(400, "Enter your name.");
    if (fact.length < 8) throw new GameError(400, "Give us a real fun fact — at least a few words.");
    if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError(409, `Someone already joined as “${name}”. Add your last initial?`);
    }
    if (players.length >= MAX_PLAYERS) throw new GameError(409, "This game is full.");
    const p: WhoPlayer = { id: token().slice(0, 10), name, token: token(), fact, skip: false, joinedAt: now() };
    await savePlayer(meta.code, p);
    return { playerId: p.id, token: p.token, name: p.name, code: meta.code };
  }

  async function vote(rawCode: string, playerToken: string, index: number, choice: string) {
    const meta = await loadMeta(rawCode);
    const players = await loadPlayers(meta.code);
    const me = players.find((p) => p.token === playerToken);
    if (!me) throw new GameError(403, "You're not in this game anymore. Rejoin to keep playing.");
    const q = meta.questions[index];
    if (meta.phase !== "question" || meta.index !== index || !q) throw new GameError(409, "This question is closed.");
    if (meta.deadline !== null && now() > meta.deadline + GRACE_MS) throw new GameError(409, "Time's up!");
    if (q.subjectId === me.id) throw new GameError(409, "This one's about you — no voting! 🤐");
    if (!q.options.some((o) => o.id === choice)) throw new GameError(400, "Pick one of the four names.");
    const wrote = await store.hsetnx(k.votes(meta.code, index), me.id, JSON.stringify({ choice, at: now() }), TTL);
    if (!wrote) throw new GameError(409, "You already locked in a guess.");
    return { ok: true, choice };
  }

  /** Put up question `index` with a random fact nobody has seen yet. Returns false if none are left. */
  async function startQuestion(meta: WhoMeta, index: number, players: WhoPlayer[]) {
    const used = new Set(meta.questions.slice(0, index).map((q) => q.subjectId));
    const pool = usable(players).filter((p) => !used.has(p.id));
    if (pool.length === 0 || players.length < 2) return false;
    const subject = pick(pool);
    const others = shuffle(players.filter((p) => p.id !== subject.id)).slice(0, OPTIONS - 1);
    const t = now();
    meta.questions[index] = {
      subjectId: subject.id,
      fact: subject.fact,
      options: shuffle([subject, ...others]).map((p) => ({ id: p.id, name: p.name })),
      startedAt: t,
    };
    meta.questions.length = index + 1;
    meta.phase = "question";
    meta.index = index;
    meta.deadline = t + meta.questionSeconds * 1000;
    meta.revealedAt = null;
    await store.del(k.votes(meta.code, index));
    await botVotes(meta, index, players);
    return true;
  }

  async function botVotes(meta: WhoMeta, index: number, players: WhoPlayer[]) {
    const q = meta.questions[index];
    for (const bot of players.filter((p) => p.bot && p.id !== q.subjectId)) {
      const choice = random() < 0.4 ? q.subjectId : pick(q.options).id;
      const at = q.startedAt + 1500 + Math.floor(random() * (meta.questionSeconds - 4) * 1000);
      await store.hset(k.votes(meta.code, index), bot.id, JSON.stringify({ choice, at }), TTL);
    }
  }

  function finish(meta: WhoMeta) {
    meta.phase = "final";
    meta.deadline = null;
    meta.total = Math.max(meta.index + 1, 0);
  }

  async function host(rawCode: string, hostKey: string, action: WhoAction) {
    const meta = await loadMeta(rawCode);
    if (!hostKey || hostKey !== meta.hostKey) throw new GameError(403, "Host key doesn't match.");
    const players = await loadPlayers(meta.code);
    const t = now();

    switch (action.type) {
      case "start": {
        if (meta.phase !== "lobby") throw new GameError(409, "The game already started.");
        if (players.length < 2) throw new GameError(409, "Need at least 2 players.");
        const facts = usable(players).length;
        if (facts === 0) throw new GameError(409, "No facts to play with yet.");
        meta.total = Math.min(clampInt(action.count ?? meta.total, 1, 50), facts);
        await startQuestion(meta, 0, players);
        break;
      }
      case "endTimer":
        if (meta.phase === "question") meta.deadline = t;
        break;
      case "addTime":
        if (meta.phase === "question" && meta.deadline !== null) {
          meta.deadline = Math.max(meta.deadline, t) + clampInt(action.seconds, 1, 120) * 1000;
        }
        break;
      case "swapQuestion": {
        // A fact slipped through that shouldn't be up there: retire it and draw another.
        if (meta.phase !== "question") throw new GameError(409, "Only while a question is up.");
        const subject = players.find((p) => p.id === meta.questions[meta.index]?.subjectId);
        if (subject) await savePlayer(meta.code, { ...subject, skip: true });
        const fresh = players.map((p) => (p.id === subject?.id ? { ...p, skip: true } : p));
        if (!(await startQuestion(meta, meta.index, fresh))) throw new GameError(409, "No other facts left to swap in.");
        break;
      }
      case "reveal": {
        if (meta.phase !== "question") throw new GameError(409, "Nothing to reveal right now.");
        const q = meta.questions[meta.index];
        meta.results[meta.index] = tally(q, await loadVotes(meta.code, meta.index), players);
        meta.phase = "reveal";
        meta.deadline = null;
        meta.revealedAt = t;
        break;
      }
      case "next": {
        if (meta.phase === "reveal") {
          const done = meta.index + 1;
          if (done >= meta.total) finish(meta);
          else if (done % meta.boardEvery === 0) meta.phase = "board";
          else if (!(await startQuestion(meta, done, players))) finish(meta);
        } else if (meta.phase === "board") {
          if (!(await startQuestion(meta, meta.index + 1, players))) finish(meta);
        } else {
          throw new GameError(409, meta.phase === "question" ? "Reveal this one first." : "Nothing next.");
        }
        break;
      }
      case "skipFact": {
        const p = players.find((pl) => pl.id === action.playerId);
        if (!p) throw new GameError(404, "No such player.");
        await savePlayer(meta.code, { ...p, skip: !!action.skip });
        return { ok: true };
      }
      case "settings":
        if (action.questionSeconds !== undefined) meta.questionSeconds = clampInt(action.questionSeconds, 5, 90);
        if (action.count !== undefined && meta.phase === "lobby") meta.total = clampInt(action.count, 1, 50);
        break;
      case "kick":
        await store.hdel(k.players(meta.code), action.playerId);
        return { ok: true };
      case "addBots": {
        const n = clampInt(action.count, 1, 10);
        for (let i = 0; i < n; i++) {
          const id = token().slice(0, 10);
          const name = `🤖 Bot ${players.length + i + 1}`;
          await savePlayer(meta.code, { id, name, token: token(), fact: BOT_FACTS[(players.length + i) % BOT_FACTS.length], skip: false, bot: true, joinedAt: t + i });
        }
        return { ok: true };
      }
      case "reset":
        for (let i = 0; i < meta.questions.length; i++) await store.del(k.votes(meta.code, i));
        Object.assign(meta, { phase: "lobby", index: -1, deadline: null, revealedAt: null, questions: [], results: {} });
        break;
      default:
        throw new GameError(400, "Unknown action.");
    }
    await saveMeta(meta);
    return { ok: true };
  }

  // ---------- views ----------

  async function publicView(meta: WhoMeta, players: WhoPlayer[]) {
    const t = now();
    const q = meta.phase === "question" || meta.phase === "reveal" ? meta.questions[meta.index] : undefined;
    const votes = q ? await loadVotes(meta.code, meta.index) : {};
    const counted = q ? countedVotes(q, votes, players) : [];
    const voterCount = q ? players.filter((p) => p.id !== q.subjectId).length : 0;
    const view: WhoPublicView = {
      code: meta.code,
      serverNow: t,
      phase: meta.phase,
      index: meta.index,
      total: meta.total,
      questionSeconds: meta.questionSeconds,
      boardEvery: meta.boardEvery,
      deadline: meta.deadline,
      locked:
        meta.phase === "question" &&
        ((meta.deadline !== null && t >= meta.deadline) || (voterCount > 0 && counted.length >= voterCount)),
      revealedAt: meta.revealedAt,
      playerCount: players.length,
      names: meta.phase === "lobby" ? players.map((p) => p.name) : [],
      factCount: usable(players).length,
      question: q ? { fact: q.fact, options: q.options } : null,
      votedCount: counted.length,
      voterCount,
      result: meta.phase === "reveal" ? (meta.results[meta.index] ?? null) : null,
      standings: standings(meta, players),
    };
    return { view, votes, q, counted };
  }

  async function playerView(rawCode: string, playerToken: string): Promise<WhoPlayerView> {
    const meta = await loadMeta(rawCode);
    const players = await loadPlayers(meta.code);
    const me = players.find((p) => p.token === playerToken);
    if (!me) throw new GameError(403, "You're not in this game. Join again to play.");
    const { view, votes, q } = await publicView(meta, players);
    const row = view.standings.find((s) => s.id === me.id)!;
    const isSubject = !!q && q.subjectId === me.id;
    return {
      ...view,
      role: "player",
      me: {
        id: me.id,
        name: me.name,
        fact: me.fact,
        vote: votes[me.id]?.choice ?? null,
        isSubject,
        correct: view.result && !isSubject ? view.result.right.includes(me.id) : null,
        score: row.score,
        rank: row.rank,
      },
    };
  }

  async function displayView(rawCode: string) {
    const meta = await loadMeta(rawCode);
    const { view } = await publicView(meta, await loadPlayers(meta.code));
    return { ...view, role: "display" as const };
  }

  async function hostView(rawCode: string, hostKey: string): Promise<WhoHostView> {
    const meta = await loadMeta(rawCode);
    if (!hostKey || hostKey !== meta.hostKey) throw new GameError(403, "Host key doesn't match.");
    const players = await loadPlayers(meta.code);
    const { view, q, counted } = await publicView(meta, players);
    const used = new Set(meta.questions.map((qq) => qq.subjectId));
    const liveCounts: Record<string, number> = Object.fromEntries((q?.options ?? []).map((o) => [o.id, 0]));
    for (const [, v] of counted) liveCounts[v.choice]++;
    return {
      ...view,
      role: "host",
      players: players.map((p) => ({ id: p.id, name: p.name, fact: p.fact, skip: p.skip, bot: !!p.bot, used: used.has(p.id) })),
      subjectId: q?.subjectId ?? null,
      liveCounts,
    };
  }

  return { createGame, join, vote, host, playerView, displayView, hostView };
}

export type WhoEngine = ReturnType<typeof createWhoEngine>;

function clampInt(n: unknown, lo: number, hi: number) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}
