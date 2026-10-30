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
    return ((await this.redis.hgetall<Record<string, string>>(key)) ?? {}) as Record<string, string>;
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

export function getStore(): Store {
  if (globalForStore.__encStore) return globalForStore.__encStore;
  // Vercel's Upstash integration injects KV_* names; Upstash's own docs use UPSTASH_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  const store: Store =
    url && token
      ? new RedisStore(
          new Redis({ url, token, automaticDeserialization: false, enableAutoPipelining: true }),
        )
      : new MemoryStore();
  globalForStore.__encStore = store;
  return store;
}

export function setStoreForTests(store: Store) {
  globalForStore.__encStore = store;
}
