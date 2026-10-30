import { engine, readJson, respond } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return respond(async () => {
    const body = await readJson(req);
    return engine.submit(code, req.headers.get("x-team-token") ?? "", Number(body.index), String(body.answer ?? ""));
  });
}
