import { GameError } from "@/lib/engine";
import type { WhoAction } from "@/lib/who";
import { readJson, respond, who } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return respond(async () => {
    const body = await readJson(req);
    if (typeof body.type !== "string") throw new GameError(400, "Missing action type.");
    return who.host(code, req.headers.get("x-host-key") ?? "", body as unknown as WhoAction);
  });
}
