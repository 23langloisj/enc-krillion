// Rarity tiers. Points are fixed per tier; which answers land in which tier is
// an editorial call made in the category packs (src/content/categories).

export const TIER_IDS = ["minnow", "sardine", "bass", "marlin", "greatfish", "leviathan"] as const;
export type TierId = (typeof TIER_IDS)[number];

export interface Tier {
  id: TierId;
  label: string;
  points: number;
  blurb: string;
}

export const TIERS: Record<TierId, Tier> = {
  minnow: { id: "minnow", label: "Minnow", points: 10, blurb: "Everyone said it" },
  sardine: { id: "sardine", label: "Sardine", points: 25, blurb: "Pretty common" },
  bass: { id: "bass", label: "Bass", points: 40, blurb: "Solid pull" },
  marlin: { id: "marlin", label: "Marlin", points: 60, blurb: "Rare catch" },
  greatfish: { id: "greatfish", label: "Great Fish", points: 80, blurb: "Jonah-level deep" },
  leviathan: { id: "leviathan", label: "Leviathan", points: 100, blurb: "Can you draw it out with a hook?" },
};

export function isTierId(value: unknown): value is TierId {
  return typeof value === "string" && (TIER_IDS as readonly string[]).includes(value);
}

export function tierPoints(tier: TierId | null): number {
  return tier ? TIERS[tier].points : 0;
}
