// Rarity tiers, named after Krillion's. Points are fixed per tier; which answers
// land in which tier is an editorial call made in the category packs
// (src/content/categories).

export const TIER_IDS = ["plankton", "schooler", "rare", "deepcut", "krillion"] as const;
export type TierId = (typeof TIER_IDS)[number];

export interface Tier {
  id: TierId;
  label: string;
  points: number;
  blurb: string;
}

export const TIERS: Record<TierId, Tier> = {
  plankton: { id: "plankton", label: "Plankton", points: 10, blurb: "Everyone said it" },
  schooler: { id: "schooler", label: "Schooler", points: 30, blurb: "Plenty of others thought of it" },
  rare: { id: "rare", label: "Rare", points: 60, blurb: "Not many got this" },
  deepcut: { id: "deepcut", label: "Deep Cut", points: 85, blurb: "Seriously obscure" },
  krillion: { id: "krillion", label: "One in a Krillion", points: 100, blurb: "The hidden gem" },
};

export function isTierId(value: unknown): value is TierId {
  return typeof value === "string" && (TIER_IDS as readonly string[]).includes(value);
}

export function tierPoints(tier: TierId | null): number {
  return tier ? TIERS[tier].points : 0;
}
