import { GameError } from "@/lib/engine";
import { engine, readJson, respond } from "@/lib/server";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return respond(async () => {
    const body = await readJson(req);
    const required = process.env.HOST_PASSWORD;
    if (required && body.password !== required) throw new GameError(403, "Wrong host password.");
    return engine.createGame();
  });
}
