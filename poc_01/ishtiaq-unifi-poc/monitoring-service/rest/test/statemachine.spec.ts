import { describe, expect, it } from "vitest";
import { transition } from "../src/domain/stateMachine";
import type { DeviceStatus } from "../../../datasource-module/domain/types";

describe("Step 6: State Machine", () => {
  it("resets a suspect device to reachable on success", () => {
    const result = transition({
      currentStatus: "suspect" as DeviceStatus,
      consecutiveFailures: 2,
      checkSucceeded: true,
    });
    expect(result).toEqual({ status: "reachable", consecutiveFailures: 0 });
  });

  it("transitions from reachable to suspect on first failure", () => {
    const result = transition({
      currentStatus: "reachable" as DeviceStatus,
      consecutiveFailures: 0,
      checkSucceeded: false,
    });
    expect(result).toEqual({ status: "suspect", consecutiveFailures: 1 });
  });

  it("stays suspect if failures are below the down threshold", () => {
    const result = transition({
      currentStatus: "suspect" as DeviceStatus,
      consecutiveFailures: 1,
      checkSucceeded: false,
    });
    expect(result).toEqual({ status: "suspect", consecutiveFailures: 2 });
  });

  it("transitions to down when hitting the threshold", () => {
    const result = transition({
      currentStatus: "suspect" as DeviceStatus,
      consecutiveFailures: 2,
      checkSucceeded: false,
    });
    expect(result).toEqual({ status: "down", consecutiveFailures: 3 });
  });

  it("stays down and increments failures once already down", () => {
    const result = transition({
      currentStatus: "down" as DeviceStatus,
      consecutiveFailures: 5,
      checkSucceeded: false,
    });
    expect(result).toEqual({ status: "down", consecutiveFailures: 6 });
  });

  it("respects a custom configuration threshold", () => {
    const result = transition({
      currentStatus: "suspect" as DeviceStatus,
      consecutiveFailures: 4,
      checkSucceeded: false,
      config: { failureThreshold: 10 },
    });
    // Should still be suspect because threshold is 10, and failures are only at 5
    expect(result).toEqual({ status: "suspect", consecutiveFailures: 5 });
  });
});
