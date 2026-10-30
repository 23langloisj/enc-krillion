// Category packs: loading, indexing, and answer matching.
// Pack format is documented in src/content/categories/README.md.

import { TIERS, TIER_IDS, isTierId, type TierId } from "./tiers";
import { editDistance, normalizeKey, numberedVariants, typoAllowance } from "./normalize";

export interface CategoryPack {
  id: string;
  prompt: string;
  tag: string;
  source?: string;
  /** If set, tests assert the pack has exactly this many answers. */
  expectedCount?: number;
  stripPrefixes?: string[];
  /** tier -> list of "Canonical|alias|alias" strings */
  answers: Partial<Record<TierId, string[]>>;
}

export interface Answer {
  canonical: string;
  aliases: string[];
  tier: TierId;
}

export interface Category {
  id: string;
  prompt: string;
  tag: string;
  stripPrefixes: string[];
  answers: Answer[];
  /** normalized key -> answer */
  index: Map<string, Answer>;
}

export interface BankAddition {
  answer: string;
  tier: TierId;
}

export type MatchHow = "exact" | "typo" | "added" | "none";

export interface MatchResult {
  how: MatchHow;
  answer: Answer | null;
  /** Set when a typo was close to two different answers and we refused to guess. */
  ambiguous?: string[];
}

export class PackError extends Error {}

export function buildCategory(pack: CategoryPack): Category {
  const stripPrefixes = pack.stripPrefixes ?? [];
  const answers: Answer[] = [];
  const index = new Map<string, Answer>();

  for (const [tierKey, entries] of Object.entries(pack.answers)) {
    if (!isTierId(tierKey)) throw new PackError(`${pack.id}: unknown tier "${tierKey}"`);
    for (const entry of entries ?? []) {
      const [canonical, ...rest] = entry.split("|").map((s) => s.trim()).filter(Boolean);
      if (!canonical) throw new PackError(`${pack.id}: empty answer in ${tierKey}`);
      const answer: Answer = { canonical, aliases: rest, tier: tierKey };
      answers.push(answer);
      for (const form of [canonical, ...rest, ...numberedVariants(canonical)]) {
        const key = normalizeKey(form, { stripPrefixes });
        if (!key) continue;
        const existing = index.get(key);
        if (existing && existing !== answer) {
          throw new PackError(
            `${pack.id}: "${form}" collides with "${existing.canonical}" (key "${key}")`,
          );
        }
        index.set(key, answer);
      }
    }
  }
  return { id: pack.id, prompt: pack.prompt, tag: pack.tag, stripPrefixes, answers, index };
}

/**
 * Match a player's answer. Exact (normalized) matches win. Otherwise we allow a
 * small number of typos, but only when exactly one answer is that close —
 * never a guess between two candidates.
 */
export function matchAnswer(
  category: Category,
  raw: string,
  additions: BankAddition[] = [],
): MatchResult {
  const key = normalizeKey(raw, { stripPrefixes: category.stripPrefixes });
  if (!key) return { how: "none", answer: null };

  const exact = category.index.get(key);
  if (exact) return { how: "exact", answer: exact };

  for (const add of additions) {
    if (normalizeKey(add.answer, { stripPrefixes: category.stripPrefixes }) === key) {
      return { how: "added", answer: { canonical: add.answer, aliases: [], tier: add.tier } };
    }
  }

  const allowance = typoAllowance(key);
  if (allowance === 0) return { how: "none", answer: null };

  let best = allowance + 1;
  let winners = new Set<Answer>();
  for (const [candidateKey, answer] of category.index) {
    // Don't let a long typo snap onto a short key: "cat" is not a typo of "catalonia".
    if (typoAllowance(candidateKey) === 0) continue;
    const d = editDistance(key, candidateKey, allowance);
    if (d > allowance) continue;
    if (d < best) {
      best = d;
      winners = new Set([answer]);
    } else if (d === best) {
      winners.add(answer);
    }
  }
  if (winners.size === 1) return { how: "typo", answer: [...winners][0] };
  if (winners.size > 1) {
    return { how: "none", answer: null, ambiguous: [...winners].map((a) => a.canonical) };
  }
  return { how: "none", answer: null };
}

export function tierCounts(category: Category): Record<TierId, number> {
  const counts = Object.fromEntries(TIER_IDS.map((t) => [t, 0])) as Record<TierId, number>;
  for (const a of category.answers) counts[a.tier]++;
  return counts;
}

export function maxPoints(category: Category): number {
  return Math.max(0, ...category.answers.map((a) => TIERS[a.tier].points));
}
