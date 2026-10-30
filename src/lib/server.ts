import "server-only";
import { NextResponse } from "next/server";
import { CATALOG, DEFAULT_LINEUP } from "@/content/catalog";
import { createEngine, GameError } from "./engine";
import { getStore } from "./store";

export const store = getStore();
export const engine = createEngine({ store, catalog: CATALOG, defaultLineup: DEFAULT_LINEUP });

const NO_STORE = { "Cache-Control": "no-store" };

/** Run a handler and turn GameErrors into JSON error responses. */
export async function respond(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof GameError) {
      return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    }
    console.error(e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500, headers: NO_STORE });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new GameError(400, "Expected a JSON body.");
  }
}
