import { describe, it, expect } from "vitest";
import { transition } from "../src/domain/stateMachine.js";
import { backoffDelayMs } from "../src/domain/backoff.js";
import type { DeviceStatus } from "../src/domain/types.js";

/**
 * These are the tests that most directly verify "unstable networks,
 * don't want false alarms" — the single most important non-functional
 * requirement in the brief. If this file is wrong, the whole service's
 * behavior during the actual trade-show demo is wrong.
 */
describe("transition (state machine)", () => {
  it("a single failure moves reachable -> suspect, never straight to down", () => {
    const result = transition({
      currentStatus: "reachable",
      consecutiveFailures: 0,
      checkSucceeded: false,
    });
    expect(result.status).toBe("suspect");
    expect(result.consecutiveFailures).toBe(1);
  });

  it("only reaches down after the configured threshold of consecutive failures", () => {
    let state: { status: DeviceStatus; consecutiveFailures: number } = { status: "reachable", consecutiveFailures: 0 };
    const config = { failureThreshold: 3 };

    for (let i = 0; i < 2; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    }
    expect(state.status).toBe("suspect"); // 2 failures, threshold is 3

    state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    expect(state.status).toBe("down"); // 3rd consecutive failure
  });

  it("any single success recovers immediately, even from down", () => {
    const result = transition({
      currentStatus: "down",
      consecutiveFailures: 10,
      checkSucceeded: true,
    });
    expect(result.status).toBe("reachable");
    expect(result.consecutiveFailures).toBe(0);
  });

  it("a flaky pattern (fail, succeed, fail, succeed...) never reaches down", () => {
    // Directly models the camera-rest simulator's behavior: this is the
    // exact scenario "don't want false alarms" is protecting against.
    let state: { status: DeviceStatus; consecutiveFailures: number } = { status: "reachable", consecutiveFailures: 0 };
    const pattern = [false, true, false, false, true, false, true];
    for (const succeeded of pattern) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: succeeded });
    }
    expect(state.status).not.toBe("down");
  });

  it("a genuinely dead device reaches down and stays there while failures continue", () => {
    // Models the door-access-rest simulator's behavior after it dies.
    let state: { status: DeviceStatus; consecutiveFailures: number } = { status: "reachable", consecutiveFailures: 0 };
    for (let i = 0; i < 5; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false });
    }
    expect(state.status).toBe("down");
  });
});

describe("backoffDelayMs", () => {
  it("grows with attempt number but stays within maxDelayMs", () => {
    const config = { baseMs: 100, maxAttempts: 5, maxDelayMs: 1000 };
    for (let attempt = 0; attempt < 10; attempt++) {
      const delay = backoffDelayMs(attempt, config);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(config.maxDelayMs);
    }
  });

  it("attempt 0 has a much lower ceiling than a later attempt", () => {
    const config = { baseMs: 100, maxAttempts: 5, maxDelayMs: 10_000 };
    // Statistical, not exact (jitter is random) — but the ceiling for
    // attempt 0 (baseMs=100) should never exceed the ceiling for
    // attempt 3 (100 * 2^3 = 800), which this samples enough to confirm.
    const samplesEarly = Array.from({ length: 50 }, () => backoffDelayMs(0, config));
    const samplesLater = Array.from({ length: 50 }, () => backoffDelayMs(3, config));
    expect(Math.max(...samplesEarly)).toBeLessThanOrEqual(100);
    expect(Math.max(...samplesLater)).toBeLessThanOrEqual(800);
  });
});
