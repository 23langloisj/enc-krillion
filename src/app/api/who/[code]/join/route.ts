import { readJson, respond, who } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return respond(async () => {
    const body = await readJson(req);
    const token = typeof body.token === "string" ? body.token : undefined;
    return who.join(code, String(body.name ?? ""), String(body.fact ?? ""), token);
  });
}
