import { CATALOG, DEFAULT_LINEUP } from "@/content/catalog";
import { answerKey, matchAnswer, type BankAddition } from "@/lib/categories";
import { GameError } from "@/lib/engine";
import { readJson, respond, store } from "@/lib/server";
import { tierPoints } from "@/lib/tiers";

export const dynamic = "force-dynamic";

const PER_ROUND = 7;

// Solo mode: no game state at all. GET lists a round's prompts; POST scores
// one answer and, alongside the score, returns that prompt's full answer key.

export function GET(req: Request) {
  return respond(async () => {
    const round = Number(new URL(req.url).searchParams.get("round") ?? 1);
    const rounds = Math.ceil(DEFAULT_LINEUP.length / PER_ROUND);
    if (!Number.isInteger(round) || round < 1 || round > rounds) throw new GameError(400, "No such round.");
    const ids = DEFAULT_LINEUP.slice((round - 1) * PER_ROUND, round * PER_ROUND);
    return {
      round,
      rounds,
      serverNow: Date.now(),
      prompts: ids.map((id) => {
        const c = CATALOG.get(id)!;
        return { id: c.id, prompt: c.prompt, tag: c.tag };
      }),
    };
  });
}

export function POST(req: Request) {
  return respond(async () => {
    const body = await readJson(req);
    const cat = CATALOG.get(String(body.categoryId ?? ""));
    if (!cat) throw new GameError(404, "Unknown category.");
    const answer = String(body.answer ?? "").trim().slice(0, 60);
    const additions = Object.values(await store.hgetall(`bank:${cat.id}`)).map((v) => JSON.parse(v) as BankAddition);
    const m = answer ? matchAnswer(cat, answer, additions) : { how: "none" as const, answer: null };
    return {
      answer: answer || null,
      canonical: m.answer?.canonical ?? null,
      tier: m.answer?.tier ?? null,
      points: tierPoints(m.answer?.tier ?? null),
      how: answer ? m.how : "missing",
      answerKey: answerKey(cat, additions),
    };
  });
}
