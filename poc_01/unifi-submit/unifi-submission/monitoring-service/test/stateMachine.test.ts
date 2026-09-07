import { describe, expect, it } from "vitest";
import { transition } from "../src/domain/stateMachine";
import { backoffDelayMs } from "../src/domain/backoff";
import type { DeviceStatus } from "../src/domain/types";

/**
 * The most important test file here. It verifies the brief's explicit
 * warning — "some devices are behind unstable networks... we don't want
 * false alarms" — at the level where that behaviour is actually decided.
 *
 * Pure functions, no database, no network: these run in milliseconds and
 * can be exhaustive, which is exactly what you want for logic whose
 * failure mode is embarrassing the company in front of a customer.
 */
describe("transition", () => {
  const start = (): { status: DeviceStatus; consecutiveFailures: number } => ({
    status: "reachable",
    consecutiveFailures: 0,
  });

  it("moves reachable → suspect on a single failure, never straight to down", () => {
    const result = transition({ ...start(), currentStatus: "reachable", checkSucceeded: false });
    expect(result.status).toBe("suspect");
    expect(result.consecutiveFailures).toBe(1);
  });

  it("reaches down only once failures hit the configured threshold", () => {
    const config = { failureThreshold: 3 };
    let state = start();

    state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    expect(state.status).toBe("suspect");

    state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    expect(state.status).toBe("suspect");

    state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    expect(state.status).toBe("down");
  });

  it("respects a custom threshold", () => {
    const config = { failureThreshold: 5 };
    let state = start();
    for (let i = 0; i < 4; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    }
    expect(state.status).toBe("suspect");

    state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    expect(state.status).toBe("down");
  });

  it("recovers immediately on a single success, even from down", () => {
    const result = transition({
      currentStatus: "down",
      consecutiveFailures: 99,
      checkSucceeded: true,
    });
    expect(result.status).toBe("reachable");
    expect(result.consecutiveFailures).toBe(0);
  });

  it("never reports down for a flaky-but-recovering device", () => {
    // Models camera-rest: an unstable link, not a broken device. This is
    // the false alarm the brief explicitly warns against.
    let state = start();
    const pattern = [false, true, false, false, true, false, true, false, true];
    for (const checkSucceeded of pattern) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded });
    }
    expect(state.status).not.toBe("down");
  });

  it("does report down for a device that genuinely dies", () => {
    // Models door-access-rest. Without this, "never falsely report down"
    // would be satisfiable by a service that never reports anything.
    let state = start();
    for (let i = 0; i < 6; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false });
    }
    expect(state.status).toBe("down");
  });
});

describe("backoffDelayMs", () => {
  const config = { baseMs: 100, maxAttempts: 5, maxDelayMs: 1_000 };

  it("never returns a negative delay or exceeds the cap", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      for (let sample = 0; sample < 25; sample++) {
        const delay = backoffDelayMs(attempt, config);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
      }
    }
  });

  it("raises its ceiling exponentially with attempt number", () => {
    // Jitter makes individual values random, so assert on the ceiling
    // across many samples rather than on any single draw.
    const early = Array.from({ length: 200 }, () => backoffDelayMs(0, config));
    const later = Array.from({ length: 200 }, () => backoffDelayMs(3, config));
    expect(Math.max(...early)).toBeLessThanOrEqual(100);
    expect(Math.max(...later)).toBeLessThanOrEqual(800);
    expect(Math.max(...later)).toBeGreaterThan(Math.max(...early));
  });
});
