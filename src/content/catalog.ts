import "server-only";
import { buildCategory, type Category } from "@/lib/categories";
import lineupFile from "./lineup.json";
import { PACKS } from "./packs";

export const CATALOG: Map<string, Category> = new Map(PACKS.map((p) => [p.id, buildCategory(p)]));
export const DEFAULT_LINEUP: string[] = lineupFile.lineup;
