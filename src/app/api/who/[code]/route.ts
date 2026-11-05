import { GameError } from "@/lib/engine";
import { respond, who } from "@/lib/server";

export const dynamic = "force-dynamic";

// GET ?role=display | ?role=player (x-player-token header) | ?role=host (x-host-key header)
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const role = new URL(req.url).searchParams.get("role");
  return respond(async () => {
    if (role === "display") return who.displayView(code);
    if (role === "player") return who.playerView(code, req.headers.get("x-player-token") ?? "");
    if (role === "host") return who.hostView(code, req.headers.get("x-host-key") ?? "");
    throw new GameError(400, "Unknown role.");
  });
}
