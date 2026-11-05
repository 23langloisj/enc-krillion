import { readJson, respond, who } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return respond(async () => {
    const body = await readJson(req);
    return who.vote(code, req.headers.get("x-player-token") ?? "", Number(body.index), String(body.choice ?? ""));
  });
}
