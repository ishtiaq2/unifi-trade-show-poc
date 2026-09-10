// monitoring-service/rest/test/stateMachine.spec.ts

import { describe, expect, it } from "vitest";
import { transition, DEFAULT_CONFIG, type TransitionInput } from "../src/domain/stateMachine";
import type { DeviceStatus } from "../../datasource-module/domain/types";

/**
 * This is the highest-stakes test file in the whole project. Every
 * other module's job is plumbing — get data from A to B correctly.
 * This file's job is deciding what "down" even means, and that
 * decision is the direct answer to the brief's explicit warning about
 * false alarms. If this file is wrong, the system is wrong regardless
 * of how correct everything else is.
 */

function start(status: DeviceStatus = "reachable", failures = 0): TransitionInput {
  return { currentStatus: status, consecutiveFailures: failures, checkSucceeded: true };
}

describe("transition — basic rules", () => {
  it("reachable + success stays reachable, failures stay 0", () => {
    const result = transition({ ...start("reachable", 0), checkSucceeded: true });
    expect(result).toEqual({ status: "reachable", consecutiveFailures: 0 });
  });

  it("reachable + a single failure moves to suspect, never straight to down", () => {
    const result = transition({ ...start("reachable", 0), checkSucceeded: false });
    expect(result.status).toBe("suspect");
    expect(result.consecutiveFailures).toBe(1);
  });

  it("suspect + another failure, still under threshold, stays suspect", () => {
    const result = transition({ ...start("suspect", 1), checkSucceeded: false });
    expect(result.status).toBe("suspect");
    expect(result.consecutiveFailures).toBe(2);
  });

  it("suspect + a failure that reaches the threshold becomes down", () => {
    // DEFAULT_CONFIG.failureThreshold is 3 — the 3rd consecutive failure.
    const result = transition({ ...start("suspect", 2), checkSucceeded: false });
    expect(result.status).toBe("down");
    expect(result.consecutiveFailures).toBe(3);
  });

  it("down + another failure stays down, count keeps climbing", () => {
    const result = transition({ ...start("down", 7), checkSucceeded: false });
    expect(result.status).toBe("down");
    expect(result.consecutiveFailures).toBe(8);
  });
});

describe("transition — recovery is immediate from any state", () => {
  it("suspect + success recovers to reachable immediately, not gradually", () => {
    const result = transition({ ...start("suspect", 2), checkSucceeded: true });
    expect(result).toEqual({ status: "reachable", consecutiveFailures: 0 });
  });

  it("down + success recovers to reachable immediately, even after many failures", () => {
    const result = transition({ ...start("down", 50), checkSucceeded: true });
    expect(result).toEqual({ status: "reachable", consecutiveFailures: 0 });
  });

  it("this asymmetry is deliberate: reaching down takes 3 failures, but leaving takes 1 success", () => {
    let state = { status: "reachable" as DeviceStatus, consecutiveFailures: 0 };
    const config = DEFAULT_CONFIG;

    // 3 consecutive failures to go from reachable all the way to down.
    for (let i = 0; i < 3; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    }
    expect(state.status).toBe("down");

    // exactly 1 success undoes all of it.
    state = transition({ ...state, currentStatus: state.status, checkSucceeded: true, config });
    expect(state).toEqual({ status: "reachable", consecutiveFailures: 0 });
  });
});

describe("transition — the false-alarm guarantee, directly", () => {
  it("a flaky-but-recovering pattern never reaches down, no matter how long it runs", () => {
    // Simulates camera-rest: intermittent failures, never two-in-a-row
    // reaching the threshold. This is the exact scenario the brief
    // warns about — an unstable link is not a broken device.
    let state = { status: "reachable" as DeviceStatus, consecutiveFailures: 0 };
    const pattern = [false, true, false, false, true, false, true, false, true, true, false];

    for (let cycle = 0; cycle < 50; cycle++) {
      for (const checkSucceeded of pattern) {
        state = transition({ ...state, currentStatus: state.status, checkSucceeded });
        expect(state.status).not.toBe("down");
      }
    }
  });

  it("a genuinely dead device DOES reach down — false-alarm avoidance isn't false-negative avoidance", () => {
    // The necessary counterpart to the test above: "never report down"
    // would be trivially true for a service that never reports
    // anything. Real, sustained failure must still be detected.
    let state = { status: "reachable" as DeviceStatus, consecutiveFailures: 0 };
    for (let i = 0; i < DEFAULT_CONFIG.failureThreshold; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false });
    }
    expect(state.status).toBe("down");
  });

  it("cannot skip suspect on the way to down with the default threshold", () => {
    let state = { status: "reachable" as DeviceStatus, consecutiveFailures: 0 };
    const seen: DeviceStatus[] = [state.status];
    for (let i = 0; i < 3; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false });
      seen.push(state.status);
    }
    expect(seen).toEqual(["reachable", "suspect", "suspect", "down"]);
  });
});

describe("transition — configurable threshold", () => {
  it("a lower threshold reaches down sooner", () => {
    const config = { failureThreshold: 1 };
    // With threshold 1, "suspect" is mathematically unreachable — the
    // very first failure already meets the threshold. Worth knowing
    // this explicitly rather than discovering it by surprise: a
    // threshold of 1 means "no false-alarm protection at all".
    const result = transition({ ...start("reachable", 0), checkSucceeded: false, config });
    expect(result.status).toBe("down");
  });

  it("a higher threshold takes longer to reach down", () => {
    const config = { failureThreshold: 10 };
    let state = { status: "reachable" as DeviceStatus, consecutiveFailures: 0 };
    for (let i = 0; i < 9; i++) {
      state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
      expect(state.status).toBe("suspect");
    }
    state = transition({ ...state, currentStatus: state.status, checkSucceeded: false, config });
    expect(state.status).toBe("down");
  });

  it("omitting config falls back to DEFAULT_CONFIG (threshold 3), not undefined behavior", () => {
    const withDefault = transition({ currentStatus: "suspect", consecutiveFailures: 2, checkSucceeded: false });
    const withExplicitDefault = transition({
      currentStatus: "suspect",
      consecutiveFailures: 2,
      checkSucceeded: false,
      config: DEFAULT_CONFIG,
    });
    expect(withDefault).toEqual(withExplicitDefault);
    expect(withDefault.status).toBe("down");
  });
});

describe("transition — purity (no I/O, no hidden state, no side effects)", () => {
  it("calling it twice with identical input produces identical output", () => {
    const input: TransitionInput = { currentStatus: "suspect", consecutiveFailures: 1, checkSucceeded: false };
    const a = transition(input);
    const b = transition(input);
    expect(a).toEqual(b);
  });

  it("does not mutate its input", () => {
    const input: TransitionInput = { currentStatus: "reachable", consecutiveFailures: 0, checkSucceeded: false };
    const snapshot = { ...input };
    transition(input);
    expect(input).toEqual(snapshot);
  });
});
