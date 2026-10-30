// Storage. Upstash Redis in production (works on Vercel's serverless runtime),
// an in-memory map for local dev and tests. Everything is strings; callers
// JSON-encode.

import { Redis } from "@upstash/redis";

export interface Store {
  readonly kind: "redis" | "memory";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, field: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Set only if the field doesn't exist. Returns true if it was written. */
  hsetnx(key: string, field: string, value: string, ttlSeconds?: number): Promise<boolean>;
  hdel(key: string, field: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private strings = new Map<string, string>();
  private hashes = new Map<string, Map<string, string>>();

  async get(key: string) {
    return this.strings.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.strings.set(key, value);
  }
  async hgetall(key: string) {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  private hash(key: string) {
    let h = this.hashes.get(key);
    if (!h) this.hashes.set(key, (h = new Map()));
    return h;
  }
  async hset(key: string, field: string, value: string) {
    this.hash(key).set(field, value);
  }
  async hsetnx(key: string, field: string, value: string) {
    const h = this.hash(key);
    if (h.has(field)) return false;
    h.set(field, value);
    return true;
  }
  async hdel(key: string, field: string) {
    this.hashes.get(key)?.delete(field);
  }
  async del(...keys: string[]) {
    for (const k of keys) {
      this.strings.delete(k);
      this.hashes.delete(k);
    }
  }
}

/** Normalize an HGETALL reply (flat array, object, or null) into a record of strings. */
export function hashReply(reply: unknown): Record<string, string> {
  if (!reply) return {};
  if (Array.isArray(reply)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < reply.length; i += 2) out[String(reply[i])] = String(reply[i + 1]);
    return out;
  }
  if (typeof reply === "object") {
    return Object.fromEntries(
      Object.entries(reply).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
    );
  }
  return {};
}

class RedisStore implements Store {
  readonly kind = "redis" as const;
  constructor(private redis: Redis) {}

  async get(key: string) {
    return (await this.redis.get<string>(key)) ?? null;
  }
  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) await this.redis.set(key, value, { ex: ttlSeconds });
    else await this.redis.set(key, value);
  }
  async hgetall(key: string) {
    // With automaticDeserialization off, Upstash hands back HGETALL's raw
    // reply: a flat [field, value, field, value, ...] array, not an object.
    return hashReply(await this.redis.hgetall(key));
  }
  async hset(key: string, field: string, value: string, ttlSeconds?: number) {
    await this.redis.hset(key, { [field]: value });
    if (ttlSeconds) await this.redis.expire(key, ttlSeconds);
  }
  async hsetnx(key: string, field: string, value: string, ttlSeconds?: number) {
    const wrote = (await this.redis.hsetnx(key, field, value)) === 1;
    if (wrote && ttlSeconds) await this.redis.expire(key, ttlSeconds);
    return wrote;
  }
  async hdel(key: string, field: string) {
    await this.redis.hdel(key, field);
  }
  async del(...keys: string[]) {
    if (keys.length) await this.redis.del(...keys);
  }
}

const globalForStore = globalThis as unknown as { __encStore?: Store };

// Upstash's own docs use UPSTASH_REDIS_REST_*; Vercel's integration injects
// <PREFIX>_REST_API_* where the prefix defaults to KV but can be customized.
const URL_SUFFIXES = [
  ["_REDIS_REST_URL", "_REDIS_REST_TOKEN"],
  ["_REST_API_URL", "_REST_API_TOKEN"],
] as const;

export function findRedisEnv(env: Record<string, string | undefined>) {
  const preferred = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"];
  const names = Object.keys(env).sort((a, b) => {
    const pa = preferred.indexOf(a);
    const pb = preferred.indexOf(b);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.localeCompare(b);
  });
  for (const name of names) {
    for (const [urlSuffix, tokenSuffix] of URL_SUFFIXES) {
      if (!name.endsWith(urlSuffix)) continue;
      const tokenName = name.slice(0, -urlSuffix.length) + tokenSuffix;
      const url = env[name];
      const token = env[tokenName];
      if (url?.startsWith("https://") && token) return { url, token, urlName: name, tokenName };
    }
  }
  return null;
}

/** Names (never values) of env vars that look Redis-related, for the host-page hint. */
export function redisEnvNames(env: Record<string, string | undefined>) {
  return Object.keys(env)
    .filter((k) => /REDIS|^KV_|_REST_API_/.test(k))
    .sort();
}

export function getStore(): Store {
  if (globalForStore.__encStore) return globalForStore.__encStore;
  const found = findRedisEnv(process.env);
  const store: Store = found
    ? new RedisStore(
        new Redis({ url: found.url, token: found.token, automaticDeserialization: false, enableAutoPipelining: true }),
      )
    : new MemoryStore();
  globalForStore.__encStore = store;
  return store;
}

export function setStoreForTests(store: Store) {
  globalForStore.__encStore = store;
}
