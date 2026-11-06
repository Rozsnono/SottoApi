/**
 * Sebességkorlátozó. `RateLimiter` interfész + memóriabeli megvalósítás (fejlesztéshez/egy példányra)
 * + Redis-kész adapter váz. Több példányos üzemhez a Redis adapter kell (lásd README).
 */
import { ApiError } from "../http";

export interface RateLimitRule {
  /** Engedélyezett kérések száma az ablakban. */
  limit: number;
  /** Ablak hossza másodpercben. */
  windowSec: number;
}
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}
export interface RateLimiter {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

/** Csúszó ablakos memóriabeli limiter. */
export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const t = this.now();
    const windowMs = rule.windowSec * 1000;
    const arr = (this.hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
    if (arr.length >= rule.limit) {
      this.hits.set(key, arr);
      const retryAfterSec = Math.max(1, Math.ceil((arr[0] + windowMs - t) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    arr.push(t);
    this.hits.set(key, arr);
    if (this.hits.size > 50_000) this.gc(t, windowMs);
    return { allowed: true, remaining: rule.limit - arr.length, retryAfterSec: 0 };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  private gc(t: number, windowMs: number): void {
    for (const [k, v] of this.hits) if (!v.some((ts) => t - ts < windowMs)) this.hits.delete(k);
  }
}

/** Redis adapter váz: nincs implementálva (nincs kötelező Redis függőség). */
export class RedisRateLimiter implements RateLimiter {
  async consume(): Promise<RateLimitResult> {
    throw new Error("RedisRateLimiter még nincs implementálva; használd az InMemoryRateLimiter-t.");
  }
  async reset(): Promise<void> {
    throw new Error("RedisRateLimiter még nincs implementálva.");
  }
}

const g = globalThis as unknown as { __sottoLimiter?: RateLimiter };
export function getRateLimiter(): RateLimiter {
  return (g.__sottoLimiter ??= new InMemoryRateLimiter());
}
/** Tesztekhez: limiter cseréje. */
export function setRateLimiter(l: RateLimiter | undefined): void {
  g.__sottoLimiter = l;
}

/** Előre definiált szabályok (MASTER_PROMPT 26.). */
export const RULES = {
  login: { limit: 10, windowSec: 15 * 60 },
  adminLogin: { limit: 5, windowSec: 15 * 60 },
  register: { limit: 10, windowSec: 60 * 60 },
  refresh: { limit: 60, windowSec: 60 },
  resetPassword: { limit: 5, windowSec: 15 * 60 },
  search: { limit: 30, windowSec: 60 },
} as const;

/** Elfogyasztja a kulcsot; túllépés esetén 429-et (`Retry-After`) dobó ApiError. */
export async function enforce(key: string, rule: RateLimitRule): Promise<void> {
  const r = await getRateLimiter().consume(key, rule);
  if (!r.allowed) {
    throw new ApiError("RATE_LIMITED", "Túl sok kérés. Próbáld újra később.", { retryAfterSec: r.retryAfterSec });
  }
}
