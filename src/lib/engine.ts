// Game engine. The server is the only authority on timing, submissions and
// scores; clients just poll views built here.

import { randomBytes, randomInt } from "node:crypto";
import { answerKey, matchAnswer, type BankAddition, type Category } from "./categories";
import { normalizeKey } from "./normalize";
import type { Store } from "./store";
import { isTierId, tierPoints, type TierId } from "./tiers";
import type {
  Award,
  CatalogEntry,
  DisplayView,
  GameMeta,
  HostView,
  PublicView,
  QuestionResult,
  ScoredAnswer,
  Standing,
  Submission,
  Team,
  TeamView,
} from "./types";

const TTL = 60 * 60 * 24 * 3; // games live for 3 days
const GRACE_MS = 1500; // network slack after the buzzer
const MAX_TEAMS = 12;
const MAX_ANSWER = 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface EngineDeps {
  store: Store;
  catalog: Map<string, Category>;
  defaultLineup: string[];
  now?: () => number;
  random?: () => number;
}

export type HostAction =
  | { type: "start" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "addTime"; seconds: number }
  | { type: "endTimer" }
  | { type: "redo" }
  | { type: "reveal" }
  | { type: "showKey"; show: boolean }
  | { type: "next" }
  | { type: "override"; index: number; teamId: string; tier: TierId | null; remember?: boolean }
  | { type: "clearOverride"; index: number; teamId: string }
  | { type: "award"; teamId: string; points: number; note?: string }
  | { type: "removeAward"; id: string }
  | { type: "setLineup"; lineup: string[] }
  | { type: "shuffleLineup" }
  | { type: "defaultLineup" }
  | { type: "settings"; answerSeconds?: number; perRound?: number }
  | { type: "kick"; teamId: string }
  | { type: "addBots"; count: number }
  | { type: "reset"; keepTeams?: boolean };

const k = {
  meta: (code: string) => `g:${code}:meta`,
  teams: (code: string) => `g:${code}:teams`,
  subs: (code: string, i: number) => `g:${code}:subs:${i}`,
  bank: (categoryId: string) => `bank:${categoryId}`,
};

const token = () => randomBytes(16).toString("hex");

export function createEngine(deps: EngineDeps) {
  const { store, catalog } = deps;
  const now = deps.now ?? Date.now;
  const random = deps.random ?? Math.random;

  // ---------- loading ----------

  async function loadMeta(code: string): Promise<GameMeta> {
    const raw = await store.get(k.meta(normalizeCode(code)));
    if (!raw) throw new GameError(404, "No game with that code.");
    return JSON.parse(raw) as GameMeta;
  }

  async function saveMeta(meta: GameMeta) {
    await store.set(k.meta(meta.code), JSON.stringify(meta), TTL);
  }

  async function loadTeams(code: string): Promise<Team[]> {
    const raw = await store.hgetall(k.teams(code));
    return Object.values(raw)
      .map((v) => JSON.parse(v) as Team)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  async function loadSubs(code: string, index: number): Promise<Record<string, Submission>> {
    if (index < 0) return {};
    const raw = await store.hgetall(k.subs(code, index));
    return Object.fromEntries(Object.entries(raw).map(([id, v]) => [id, JSON.parse(v)]));
  }

  async function loadAdditions(categoryId: string): Promise<BankAddition[]> {
    const raw = await store.hgetall(k.bank(categoryId));
    return Object.values(raw).map((v) => JSON.parse(v) as BankAddition);
  }

  function category(id: string): Category {
    const c = catalog.get(id);
    if (!c) throw new GameError(500, `Unknown category "${id}".`);
    return c;
  }

  // ---------- scoring ----------

  function scoreOne(
    meta: GameMeta,
    index: number,
    team: Team,
    sub: Submission | undefined,
    cat: Category,
    additions: BankAddition[],
  ): ScoredAnswer {
    const base = { teamId: team.id, teamName: team.name, answer: sub?.answer ?? null };
    const override = meta.overrides[`${index}:${team.id}`];
    if (override) {
      return {
        ...base,
        canonical: sub?.answer ?? null,
        tier: override.tier,
        points: tierPoints(override.tier),
        how: "override",
      };
    }
    if (!sub) return { ...base, canonical: null, tier: null, points: 0, how: "missing" };
    const m = matchAnswer(cat, sub.answer, additions);
    return {
      ...base,
      canonical: m.answer?.canonical ?? null,
      tier: m.answer?.tier ?? null,
      points: tierPoints(m.answer?.tier ?? null),
      how: m.how,
      ambiguous: m.ambiguous,
    };
  }

  async function scoreQuestion(meta: GameMeta, index: number, teams: Team[]): Promise<QuestionResult> {
    const cat = category(meta.lineup[index]);
    const [subs, additions] = await Promise.all([loadSubs(meta.code, index), loadAdditions(cat.id)]);
    const t = now();
    const answers = teams.map((team) => {
      const sub = subs[team.id];
      return scoreOne(meta, index, team, sub && sub.at <= t ? sub : undefined, cat, additions);
    });
    return { index, categoryId: cat.id, prompt: cat.prompt, answers };
  }

  function standings(meta: GameMeta, teams: Team[]): Standing[] {
    const totals = new Map<string, number>(teams.map((t) => [t.id, 0]));
    for (let i = 0; i <= meta.revealedUpTo; i++) {
      for (const a of meta.results[i]?.answers ?? []) {
        if (totals.has(a.teamId)) totals.set(a.teamId, totals.get(a.teamId)! + a.points);
      }
    }
    for (const aw of meta.awards) {
      if (totals.has(aw.teamId)) totals.set(aw.teamId, totals.get(aw.teamId)! + aw.points);
    }
    const last = meta.results[meta.revealedUpTo]?.answers ?? [];
    const rows = teams
      .map((t) => ({
        teamId: t.id,
        name: t.name,
        total: totals.get(t.id) ?? 0,
        lastPoints: last.find((a) => a.teamId === t.id)?.points ?? 0,
        rank: 0,
      }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    rows.forEach((r, i) => {
      r.rank = i > 0 && rows[i - 1].total === r.total ? rows[i - 1].rank : i + 1;
    });
    return rows;
  }

  // ---------- lifecycle ----------

  async function createGame(opts: { lineup?: string[]; answerSeconds?: number } = {}) {
    let code = "";
    for (let attempt = 0; attempt < 20; attempt++) {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      if (!(await store.get(k.meta(code)))) break;
    }
    const lineup = validLineup(opts.lineup ?? deps.defaultLineup);
    const meta: GameMeta = {
      code,
      hostKey: token(),
      createdAt: now(),
      lineup,
      perRound: 7,
      answerSeconds: clamp(opts.answerSeconds ?? 25, 5, 120),
      phase: "lobby",
      index: -1,
      startedAt: null,
      deadline: null,
      pausedRemaining: null,
      revealedUpTo: -1,
      results: {},
      overrides: {},
      awards: [],
    };
    await saveMeta(meta);
    return { code, hostKey: meta.hostKey };
  }

  function validLineup(lineup: string[]): string[] {
    const ids = lineup.filter((id) => catalog.has(id));
    if (ids.length === 0) throw new GameError(400, "Lineup needs at least one known category.");
    return ids.slice(0, 50);
  }

  async function joinTeam(rawCode: string, rawName: string, existingToken?: string) {
    const meta = await loadMeta(rawCode);
    const teams = await loadTeams(meta.code);
    if (existingToken) {
      const mine = teams.find((t) => t.token === existingToken);
      if (mine) return { teamId: mine.id, token: mine.token, name: mine.name, code: meta.code };
    }
    const name = rawName.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!name) throw new GameError(400, "Pick a team name.");
    if (teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      throw new GameError(409, "That team name is taken — if it's yours, rejoin from the same phone.");
    }
    if (teams.length >= MAX_TEAMS) throw new GameError(409, "This game is full.");
    const team: Team = { id: token().slice(0, 10), name, token: token(), joinedAt: now() };
    await store.hset(k.teams(meta.code), team.id, JSON.stringify(team), TTL);
    return { teamId: team.id, token: team.token, name: team.name, code: meta.code };
  }

  async function submit(rawCode: string, teamToken: string, index: number, rawAnswer: string) {
    const meta = await loadMeta(rawCode);
    const teams = await loadTeams(meta.code);
    const team = teams.find((t) => t.token === teamToken);
    if (!team) throw new GameError(403, "Your team isn't in this game anymore. Rejoin to keep playing.");
    if (meta.phase !== "question" || meta.index !== index) {
      throw new GameError(409, "This category is closed.");
    }
    if (meta.deadline === null) throw new GameError(409, "The game is paused.");
    if (now() > meta.deadline + GRACE_MS) throw new GameError(409, "Time's up!");
    const answer = rawAnswer.trim().replace(/\s+/g, " ").slice(0, MAX_ANSWER);
    if (!answer) throw new GameError(400, "Type an answer first.");
    const sub: Submission = { teamId: team.id, answer, at: now() };
    const wrote = await store.hsetnx(k.subs(meta.code, index), team.id, JSON.stringify(sub), TTL);
    if (!wrote) throw new GameError(409, "Your team already locked in an answer.");
    return { ok: true, answer };
  }

  function requireHost(meta: GameMeta, hostKey: string) {
    if (!hostKey || hostKey !== meta.hostKey) throw new GameError(403, "Host key doesn't match.");
  }

  async function startQuestion(meta: GameMeta, index: number, teams: Team[]) {
    const t = now();
    meta.phase = "question";
    meta.index = index;
    meta.startedAt = t;
    meta.deadline = t + meta.answerSeconds * 1000;
    meta.pausedRemaining = null;
    meta.showKey = false;
    await scheduleBots(meta, index, teams);
  }

  async function scheduleBots(meta: GameMeta, index: number, teams: Team[]) {
    const bots = teams.filter((t) => t.bot);
    if (!bots.length) return;
    const cat = category(meta.lineup[index]);
    const windowMs = Math.max(1000, meta.answerSeconds * 1000 - 3000);
    await Promise.all(
      bots.map((bot) => {
        const roll = random();
        if (roll < 0.1) return null; // bot forgot to answer
        const pick = cat.answers[Math.floor(random() * cat.answers.length)];
        let answer = pick.canonical;
        if (roll > 0.85) answer = "Something made up";
        else if (roll > 0.7 && answer.length > 5) answer = answer.slice(0, -2) + answer.slice(-1); // typo
        const sub: Submission = { teamId: bot.id, answer, at: (meta.startedAt ?? now()) + 1000 + random() * windowMs };
        return store.hsetnx(k.subs(meta.code, index), bot.id, JSON.stringify(sub), TTL);
      }),
    );
  }

  async function host(rawCode: string, hostKey: string, action: HostAction) {
    const meta = await loadMeta(rawCode);
    requireHost(meta, hostKey);
    const teams = await loadTeams(meta.code);
    const last = meta.lineup.length - 1;
    const t = now();

    switch (action.type) {
      case "start":
        if (meta.phase !== "lobby") throw new GameError(409, "Game already started.");
        await startQuestion(meta, 0, teams);
        break;

      case "pause":
        if (meta.phase !== "question" || meta.deadline === null) break;
        meta.pausedRemaining = Math.max(0, meta.deadline - t);
        meta.deadline = null;
        break;

      case "resume":
        if (meta.phase !== "question" || meta.pausedRemaining === null) break;
        meta.deadline = t + meta.pausedRemaining;
        meta.pausedRemaining = null;
        break;

      case "addTime": {
        if (meta.phase !== "question") break;
        const ms = clamp(action.seconds, 1, 120) * 1000;
        if (meta.deadline === null) meta.pausedRemaining = (meta.pausedRemaining ?? 0) + ms;
        else meta.deadline = Math.max(meta.deadline, t) + ms;
        break;
      }

      case "endTimer":
        if (meta.phase !== "question") break;
        meta.deadline = t;
        meta.pausedRemaining = null;
        break;

      case "redo":
        if (meta.phase !== "question" && meta.phase !== "reveal") break;
        await store.del(k.subs(meta.code, meta.index));
        for (const key of Object.keys(meta.overrides)) {
          if (key.startsWith(`${meta.index}:`)) delete meta.overrides[key];
        }
        delete meta.results[meta.index];
        meta.revealedUpTo = Math.min(meta.revealedUpTo, meta.index - 1);
        await startQuestion(meta, meta.index, teams);
        break;

      case "reveal":
        if (meta.phase !== "question") throw new GameError(409, "Nothing to reveal right now.");
        meta.deadline = Math.min(meta.deadline ?? t, t);
        meta.pausedRemaining = null;
        meta.results[meta.index] = await scoreQuestion(meta, meta.index, teams);
        meta.revealedUpTo = Math.max(meta.revealedUpTo, meta.index);
        meta.phase = "reveal";
        break;

      case "showKey":
        if (meta.phase !== "reveal") throw new GameError(409, "The answer key opens after a reveal.");
        meta.showKey = action.show;
        break;

      case "next":
        if (meta.phase === "reveal") {
          if (meta.index >= last) meta.phase = "final";
          else if ((meta.index + 1) % meta.perRound === 0) meta.phase = "roundEnd";
          else await startQuestion(meta, meta.index + 1, teams);
        } else if (meta.phase === "roundEnd") {
          await startQuestion(meta, meta.index + 1, teams);
        } else {
          throw new GameError(409, "Reveal this category before moving on.");
        }
        break;

      case "override": {
        const { index, teamId } = action;
        if (!teams.some((tm) => tm.id === teamId)) throw new GameError(404, "No such team.");
        if (index < 0 || index > meta.index) throw new GameError(400, "That category hasn't been played.");
        if (action.tier !== null && !isTierId(action.tier)) throw new GameError(400, "Unknown tier.");
        meta.overrides[`${index}:${teamId}`] = { tier: action.tier };
        if (action.remember && action.tier) {
          const sub = (await loadSubs(meta.code, index))[teamId];
          const catId = meta.lineup[index];
          if (sub) {
            const key = normalizeKey(sub.answer, { stripPrefixes: category(catId).stripPrefixes });
            const addition: BankAddition = { answer: sub.answer, tier: action.tier };
            await store.hset(k.bank(catId), key, JSON.stringify(addition));
          }
        }
        if (meta.results[index]) meta.results[index] = await scoreQuestion(meta, index, teams);
        break;
      }

      case "clearOverride":
        delete meta.overrides[`${action.index}:${action.teamId}`];
        if (meta.results[action.index]) {
          meta.results[action.index] = await scoreQuestion(meta, action.index, teams);
        }
        break;

      case "award": {
        if (!teams.some((tm) => tm.id === action.teamId)) throw new GameError(404, "No such team.");
        const points = Math.round(clamp(action.points, -500, 500));
        const award: Award = { id: token().slice(0, 8), teamId: action.teamId, points, note: (action.note ?? "").slice(0, 60) };
        meta.awards.push(award);
        break;
      }

      case "removeAward":
        meta.awards = meta.awards.filter((a) => a.id !== action.id);
        break;

      case "setLineup":
        requireLobby(meta);
        meta.lineup = validLineup(action.lineup);
        break;

      case "shuffleLineup":
        requireLobby(meta);
        meta.lineup = shuffledLineup(deps.defaultLineup.length || 21);
        break;

      case "defaultLineup":
        requireLobby(meta);
        meta.lineup = validLineup(deps.defaultLineup);
        break;

      case "settings":
        requireLobby(meta);
        if (action.answerSeconds !== undefined) meta.answerSeconds = clamp(action.answerSeconds, 5, 120);
        if (action.perRound !== undefined) meta.perRound = clamp(Math.round(action.perRound), 1, 25);
        break;

      case "kick":
        await store.hdel(k.teams(meta.code), action.teamId);
        break;

      case "addBots": {
        const n = clamp(action.count, 1, MAX_TEAMS - teams.length);
        const names = ["Sons of Thunder", "Lot's Wife's Salt", "The Mustard Seeds", "Ninevites", "Loaves & Fishes", "Burning Bushes"];
        for (let i = 0; i < n; i++) {
          const taken = new Set(teams.map((tm) => tm.name));
          const name = names.find((nm) => !taken.has(`🤖 ${nm}`)) ?? `Bot ${teams.length + 1}`;
          const bot: Team = { id: token().slice(0, 10), name: `🤖 ${name}`, token: token(), bot: true, joinedAt: t + i };
          teams.push(bot);
          await store.hset(k.teams(meta.code), bot.id, JSON.stringify(bot), TTL);
        }
        if (meta.phase === "question") await scheduleBots(meta, meta.index, teams);
        break;
      }

      case "reset":
        await store.del(...meta.lineup.map((_, i) => k.subs(meta.code, i)));
        if (!action.keepTeams) await store.del(k.teams(meta.code));
        else for (const tm of teams.filter((x) => x.bot)) await store.hdel(k.teams(meta.code), tm.id);
        Object.assign(meta, {
          phase: "lobby",
          index: -1,
          startedAt: null,
          deadline: null,
          pausedRemaining: null,
          revealedUpTo: -1,
          results: {},
          overrides: {},
          awards: [],
        } satisfies Partial<GameMeta>);
        break;
    }

    await saveMeta(meta);
    return { ok: true };
  }

  function requireLobby(meta: GameMeta) {
    if (meta.phase !== "lobby") throw new GameError(409, "You can only change the lineup before the game starts.");
  }

  /** Random lineup that keeps roughly half the categories from the Bible. */
  function shuffledLineup(size: number): string[] {
    const shuffle = <T,>(xs: T[]) => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const all = [...catalog.values()];
    const bible = shuffle(all.filter((c) => c.tag === "Bible").map((c) => c.id));
    const other = shuffle(all.filter((c) => c.tag !== "Bible").map((c) => c.id));
    const wantBible = Math.min(bible.length, Math.ceil(size / 2));
    const picked = [...bible.slice(0, wantBible), ...other.slice(0, size - wantBible)];
    return shuffle(picked.length < size ? [...picked, ...bible.slice(wantBible)].slice(0, size) : picked);
  }

  // ---------- views ----------

  async function publicView(meta: GameMeta, teams: Team[]) {
    const t = now();
    const inPlay = meta.phase === "question" || meta.phase === "reveal";
    const subs = inPlay ? await loadSubs(meta.code, meta.index) : {};
    const teamIds = new Set(teams.map((tm) => tm.id));
    const submittedCount = Object.values(subs).filter((s) => s.at <= t && teamIds.has(s.teamId)).length;
    const cat = inPlay ? category(meta.lineup[meta.index]) : null;
    const allIn = teams.length > 0 && submittedCount >= teams.length;
    const revealed = meta.phase === "reveal" && cat;
    const view: PublicView = {
      code: meta.code,
      serverNow: t,
      phase: meta.phase,
      index: meta.index,
      total: meta.lineup.length,
      perRound: meta.perRound,
      round: meta.index < 0 ? 1 : Math.floor(meta.index / meta.perRound) + 1,
      rounds: Math.ceil(meta.lineup.length / meta.perRound),
      answerSeconds: meta.answerSeconds,
      prompt: cat?.prompt ?? null,
      tag: cat?.tag ?? null,
      deadline: meta.deadline,
      pausedRemaining: meta.pausedRemaining,
      locked: meta.phase === "question" && ((meta.deadline !== null && t >= meta.deadline) || allIn),
      teamCount: teams.length,
      submittedCount,
      teams: teams.map((tm) => ({ id: tm.id, name: tm.name })),
      reveal: meta.phase === "reveal" ? (meta.results[meta.index] ?? null) : null,
      answerKey: revealed ? answerKey(cat, await loadAdditions(cat.id)) : null,
      showKey: !!revealed && !!meta.showKey,
      standings: standings(meta, teams),
      awards: meta.awards,
    };
    return { view, subs };
  }

  async function teamView(rawCode: string, teamToken: string): Promise<TeamView> {
    const meta = await loadMeta(rawCode);
    const teams = await loadTeams(meta.code);
    const me = teams.find((tm) => tm.token === teamToken);
    if (!me) throw new GameError(403, "Your team isn't in this game. Rejoin to keep playing.");
    const { view, subs } = await publicView(meta, teams);
    const mine = subs[me.id];
    return {
      ...view,
      role: "team",
      me: {
        id: me.id,
        name: me.name,
        submitted: mine?.answer ?? null,
        result: view.reveal?.answers.find((a) => a.teamId === me.id) ?? null,
      },
    };
  }

  async function displayView(rawCode: string): Promise<DisplayView> {
    const meta = await loadMeta(rawCode);
    const teams = await loadTeams(meta.code);
    const { view } = await publicView(meta, teams);
    return { ...view, role: "display" };
  }

  async function hostView(rawCode: string, hostKey: string, storeKind: "redis" | "memory"): Promise<HostView> {
    const meta = await loadMeta(rawCode);
    requireHost(meta, hostKey);
    const teams = await loadTeams(meta.code);
    const { view } = await publicView(meta, teams);
    const inPlay = meta.phase === "question" || meta.phase === "reveal";
    const live = inPlay
      ? (meta.phase === "reveal" ? meta.results[meta.index] : await scoreQuestion(meta, meta.index, teams))?.answers ?? []
      : [];
    const catalogList: CatalogEntry[] = [...catalog.values()].map((c) => ({
      id: c.id,
      prompt: c.prompt,
      tag: c.tag,
      count: c.answers.length,
    }));
    return {
      ...view,
      role: "host",
      storeKind,
      lineup: meta.lineup.map((id) => ({ id, prompt: category(id).prompt, tag: category(id).tag })),
      catalog: catalogList,
      live,
      teamsFull: teams.map((tm) => ({ id: tm.id, name: tm.name, bot: !!tm.bot })),
    };
  }

  return { createGame, joinTeam, submit, host, teamView, displayView, hostView };
}

export type Engine = ReturnType<typeof createEngine>;

export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}
