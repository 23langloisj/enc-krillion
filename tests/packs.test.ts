import { describe, expect, it } from "vitest";
import { buildCategory, type CategoryPack } from "@/lib/categories";
import { CATALOG, DEFAULT_LINEUP } from "@/content/catalog";
import { PACKS } from "@/content/packs";

describe("category packs", () => {
  it("have unique ids", () => {
    const ids = PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PACKS.map((p) => [p.id, p] as [string, CategoryPack]))("%s builds without alias collisions", (_, pack) => {
    const cat = buildCategory(pack);
    expect(cat.answers.length).toBeGreaterThan(0);
    const canon = cat.answers.map((a) => a.canonical.toLowerCase());
    expect(new Set(canon).size, "duplicate canonical answers").toBe(canon.length);
    if (pack.expectedCount !== undefined) expect(cat.answers.length).toBe(pack.expectedCount);
  });

  it("default lineup is 3 rounds of 7 known categories with Bible in every round", () => {
    expect(DEFAULT_LINEUP).toHaveLength(21);
    for (const id of DEFAULT_LINEUP) expect(CATALOG.has(id), id).toBe(true);
    expect(new Set(DEFAULT_LINEUP).size).toBe(21);
    for (let r = 0; r < 3; r++) {
      const round = DEFAULT_LINEUP.slice(r * 7, r * 7 + 7);
      expect(round.some((id) => CATALOG.get(id)!.tag === "Bible")).toBe(true);
    }
  });
});
