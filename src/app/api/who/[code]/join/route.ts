import { readJson, respond, who } from "@/lib/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return respond(async () => {
    const body = await readJson(req);
    const token = typeof body.token === "string" ? body.token : undefined;
    // `facts` (array) is current; a single `fact` string still works for older clients.
    const facts = Array.isArray(body.facts) ? body.facts.map(String) : body.fact ? [String(body.fact)] : [];
    return who.join(code, String(body.name ?? ""), facts, token);
  });
}
