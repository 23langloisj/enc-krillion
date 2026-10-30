import type { MatchHow } from "./categories";
import type { TierId } from "./tiers";

export type Phase = "lobby" | "question" | "reveal" | "roundEnd" | "final";

export interface Override {
  tier: TierId | null; // null = mark invalid (0 points)
}

export interface Award {
  id: string;
  teamId: string;
  points: number;
  note: string;
}

export interface GameMeta {
  code: string;
  hostKey: string;
  createdAt: number;
  lineup: string[];
  perRound: number;
  answerSeconds: number;
  phase: Phase;
  index: number; // current question, -1 in lobby
  startedAt: number | null;
  deadline: number | null; // null while paused
  pausedRemaining: number | null;
  revealedUpTo: number;
  results: Record<number, QuestionResult>; // frozen at reveal time
  overrides: Record<string, Override>; // `${index}:${teamId}`
  awards: Award[];
}

export interface Team {
  id: string;
  name: string;
  token: string;
  bot?: boolean;
  joinedAt: number;
}

export interface Submission {
  teamId: string;
  answer: string;
  at: number;
}

export interface ScoredAnswer {
  teamId: string;
  teamName: string;
  answer: string | null;
  canonical: string | null;
  tier: TierId | null;
  points: number;
  how: MatchHow | "override" | "missing";
  ambiguous?: string[];
}

export interface QuestionResult {
  index: number;
  categoryId: string;
  prompt: string;
  answers: ScoredAnswer[];
}

export interface Standing {
  teamId: string;
  name: string;
  total: number;
  rank: number;
  lastPoints: number;
}

/** Fields every viewer (team, projector, host) gets. Never contains answer banks. */
export interface PublicView {
  code: string;
  serverNow: number;
  phase: Phase;
  index: number;
  total: number;
  perRound: number;
  round: number;
  rounds: number;
  answerSeconds: number;
  prompt: string | null;
  tag: string | null;
  deadline: number | null;
  pausedRemaining: number | null;
  locked: boolean;
  teamCount: number;
  submittedCount: number;
  teams: { id: string; name: string }[];
  reveal: QuestionResult | null;
  standings: Standing[];
  awards: Award[];
}

export interface TeamView extends PublicView {
  role: "team";
  me: { id: string; name: string; submitted: string | null; result: ScoredAnswer | null };
}

export interface DisplayView extends PublicView {
  role: "display";
}

export interface CatalogEntry {
  id: string;
  prompt: string;
  tag: string;
  count: number;
}

export interface HostView extends PublicView {
  role: "host";
  storeKind: "redis" | "memory";
  lineup: { id: string; prompt: string; tag: string }[];
  catalog: CatalogEntry[];
  live: ScoredAnswer[]; // current question, scored, host-only
  teamsFull: { id: string; name: string; bot: boolean }[];
}
