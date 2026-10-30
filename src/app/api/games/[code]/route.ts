import { GameError } from "@/lib/engine";
import { engine, respond, store } from "@/lib/server";
import { redisEnvNames } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET ?role=display | ?role=team (x-team-token header) | ?role=host (x-host-key header)
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const role = new URL(req.url).searchParams.get("role");
  return respond(async () => {
    if (role === "display") return engine.displayView(code);
    if (role === "team") return engine.teamView(code, req.headers.get("x-team-token") ?? "");
    if (role === "host") {
      const view = await engine.hostView(code, req.headers.get("x-host-key") ?? "", store.kind);
      return store.kind === "memory" ? { ...view, redisEnvNames: redisEnvNames(process.env) } : view;
    }
    throw new GameError(400, "Unknown role.");
  });
}
