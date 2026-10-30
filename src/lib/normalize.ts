// Answer normalization. The same function is applied to player input and to
// every canonical answer / alias in the packs, so the two always agree.

const LEADING_ARTICLES = ["the", "a", "an"];

export interface NormalizeOptions {
  /** Extra leading words/phrases to drop, e.g. ["mount", "plague of"]. */
  stripPrefixes?: string[];
}

/** Lowercase, strip accents/punctuation, collapse spaces. Keeps word breaks. */
export function cleanWords(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/♀/g, " female ")
    .replace(/♂/g, " male ")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripLeading(words: string, prefixes: string[]): string {
  let out = words;
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prefixes) {
      if (out.startsWith(p + " ") && out.length > p.length + 1) {
        out = out.slice(p.length + 1);
        changed = true;
      }
    }
  }
  return out;
}

/**
 * The lookup key: cleaned, leading articles + category prefixes removed, and
 * all spaces dropped so "Pidge otto" and "Salt Lakecity" still match.
 */
export function normalizeKey(raw: string, opts: NormalizeOptions = {}): string {
  const prefixes = [...LEADING_ARTICLES, ...(opts.stripPrefixes ?? []).map(cleanWords)];
  // Longest first so "the plague of" beats "the".
  prefixes.sort((a, b) => b.length - a.length);
  return stripLeading(cleanWords(raw), prefixes).replace(/ /g, "");
}

const ORDINALS: Record<string, string[]> = {
  "1": ["first", "1st", "i"],
  "2": ["second", "2nd", "ii"],
  "3": ["third", "3rd", "iii"],
};

/** "1 Samuel" -> ["First Samuel", "1st Samuel", "I Samuel"]. */
export function numberedVariants(canonical: string): string[] {
  const m = /^([123])\s+(.+)$/.exec(canonical.trim());
  if (!m) return [];
  return ORDINALS[m[1]].map((word) => `${word} ${m[2]}`);
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transpositions). */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

/** How many typos we forgive for a key of this length. Short words get none. */
export function typoAllowance(key: string): number {
  if (key.length >= 8) return 2;
  if (key.length >= 5) return 1;
  return 0;
}
