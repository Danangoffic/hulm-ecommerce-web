import { describe, it, expect, beforeEach, vi } from "vitest";

// We need to reset the module between tests so the in-memory store is fresh
describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows the first request", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    const result = checkRateLimit("ip-fresh-1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it("decrements remaining on each call", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    const ip = "ip-decrement";
    checkRateLimit(ip); // 1
    checkRateLimit(ip); // 2
    const result = checkRateLimit(ip); // 3
    expect(result.remaining).toBe(7);
  });

  it("blocks after MAX_REQUESTS (10) calls", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    const ip = "ip-block";
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    const result = checkRateLimit(ip);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("different IPs have independent counters", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    for (let i = 0; i < 10; i++) checkRateLimit("ip-a");
    const resultA = checkRateLimit("ip-a");
    const resultB = checkRateLimit("ip-b");
    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("resets after the window expires", async () => {
    vi.useFakeTimers();
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    const ip = "ip-reset";
    for (let i = 0; i < 10; i++) checkRateLimit(ip);
    expect(checkRateLimit(ip).allowed).toBe(false);

    // Advance past the 15-minute window
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(checkRateLimit(ip).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("returns a resetAt timestamp in the future", async () => {
    const { checkRateLimit } = await import("@/lib/auth/rate-limit");
    const result = checkRateLimit("ip-future");
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});
