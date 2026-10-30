import { describe, expect, it } from "vitest";
import { matchAnswer } from "@/lib/categories";
import { editDistance, normalizeKey } from "@/lib/normalize";
import { CATALOG } from "@/content/catalog";

const cat = (id: string) => CATALOG.get(id)!;
const match = (id: string, raw: string) => matchAnswer(cat(id), raw);

describe("normalizeKey", () => {
  it("ignores case, punctuation, accents and spaces", () => {
    expect(normalizeKey("  Mr. Mime ")).toBe("mrmime");
    expect(normalizeKey("Pokémon")).toBe("pokemon");
    expect(normalizeKey("Farfetch'd")).toBe("farfetchd");
    expect(normalizeKey("Salt  Lake-City")).toBe("saltlakecity");
  });

  it("drops leading articles and configured prefixes", () => {
    expect(normalizeKey("The Incredibles")).toBe("incredibles");
    expect(normalizeKey("the plague of frogs", { stripPrefixes: ["plague of"] })).toBe("frogs");
    expect(normalizeKey("Mount Sinai", { stripPrefixes: ["mount"] })).toBe("sinai");
  });

  it("keeps a lone word even if it equals a prefix", () => {
    expect(normalizeKey("The")).toBe("the");
  });

  it("turns gender symbols into words", () => {
    expect(normalizeKey("Nidoran♀")).toBe("nidoranfemale");
  });
});

describe("editDistance", () => {
  it("counts transpositions as one edit", () => {
    expect(editDistance("obadiah", "obadaih")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("matchAnswer", () => {
  it("matches canonicals and aliases exactly", () => {
    expect(match("bible-books", "genesis")).toMatchObject({ how: "exact", answer: { canonical: "Genesis", tier: "minnow" } });
    expect(match("bible-books", "Song of Songs").answer?.canonical).toBe("Song of Solomon");
    expect(match("apostles", "Nathanael").answer?.canonical).toBe("Bartholomew");
  });

  it("accepts spelled-out numbered books", () => {
    for (const s of ["1 Samuel", "First Samuel", "1st samuel", "I Samuel", "1samuel"]) {
      expect(match("bible-books", s).answer?.canonical, s).toBe("1 Samuel");
    }
    expect(match("bible-books", "III John").answer?.canonical).toBe("3 John");
  });

  it("forgives a small typo on longer words", () => {
    expect(match("bible-books", "Habbakuk")).toMatchObject({ how: "typo", answer: { canonical: "Habakkuk" } });
    expect(match("pokemon-gen1", "Charmandar")).toMatchObject({ how: "typo", answer: { canonical: "Charmander" } });
  });

  it("does not fuzz short words", () => {
    expect(match("bible-books", "Jon").answer).toBeNull();
    expect(match("pokemon-gen1", "Mow").answer).toBeNull();
  });

  it("refuses to guess between two close answers", () => {
    // "nigr" is too short to fuzz; "nigera" is one edit from both Niger and Nigeria.
    const m = match("africa", "Nigera");
    expect(m.answer).toBeNull();
    expect(m.ambiguous?.sort()).toEqual(["Niger", "Nigeria"]);
  });

  it("rejects answers that aren't in the bank", () => {
    expect(match("bible-books", "Hezekiah").answer).toBeNull();
    expect(match("apostles", "Paul").answer).toBeNull();
    expect(match("bible-books", "").how).toBe("none");
  });

  it("uses category prefixes", () => {
    expect(match("plagues", "the plague of frogs").answer?.canonical).toBe("Frogs");
    expect(match("i-am", "I am the bread of life").answer?.canonical).toBe("Bread of Life");
    expect(match("mountains", "Mt. Carmel").answer?.canonical).toBe("Carmel");
  });

  it("honors host-approved bank additions", () => {
    const m = matchAnswer(cat("apostles"), "paul", [{ answer: "Paul", tier: "marlin" }]);
    expect(m).toMatchObject({ how: "added", answer: { tier: "marlin" } });
  });
});
