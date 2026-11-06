import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "@/lib/ratelimit";

describe("InMemoryRateLimiter", () => {
  it("a limit felett letilt és Retry-After-t ad, az ablak lejártával újra enged", async () => {
    let now = 1_000_000;
    const l = new InMemoryRateLimiter(() => now);
    const rule = { limit: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) expect((await l.consume("k", rule)).allowed).toBe(true);
    const blocked = await l.consume("k", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    now += 61_000;
    expect((await l.consume("k", rule)).allowed).toBe(true);
  });
  it("a kulcsok függetlenek, a reset nullázza", async () => {
    const l = new InMemoryRateLimiter();
    const rule = { limit: 1, windowSec: 60 };
    expect((await l.consume("a", rule)).allowed).toBe(true);
    expect((await l.consume("b", rule)).allowed).toBe(true);
    expect((await l.consume("a", rule)).allowed).toBe(false);
    await l.reset("a");
    expect((await l.consume("a", rule)).allowed).toBe(true);
  });
});
