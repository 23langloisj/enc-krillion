// Fact limits for "Who Said That?!", shared by the server engine and the
// join/lobby forms (this file must stay free of server-only imports).

export const MIN_FACT = 8;
export const MAX_FACT = 160;
export const MAX_FACTS = 3;

/** Why the facts can't be submitted yet, or null if they're good to go. */
export function factsProblem(facts: string[]): string | null {
  const filled = facts.map((f) => f.trim()).filter(Boolean);
  if (filled.length === 0) return "Add at least one fun fact.";
  if (filled.some((f) => f.length < MIN_FACT)) return `Each fact needs at least ${MIN_FACT} characters — give us a few words.`;
  return null;
}
