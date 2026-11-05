import { GameError } from "@/lib/engine";
import { readJson, respond, who } from "@/lib/server";

export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return respond(async () => {
    const body = await readJson(req);
    const required = process.env.HOST_PASSWORD;
    if (required && body.password !== required) throw new GameError(403, "Wrong host password.");
    return who.createGame();
  });
}
