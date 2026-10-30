import { engine, readJson, respond } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return respond(async () => {
    const body = await readJson(req);
    return engine.joinTeam(code, String(body.name ?? ""), typeof body.token === "string" ? body.token : undefined);
  });
}
