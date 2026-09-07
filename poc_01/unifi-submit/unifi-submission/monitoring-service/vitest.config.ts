import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files run one at a time, not in parallel.
    //
    // Several suites share one Postgres database and TRUNCATE it between
    // tests to start from a known state. Run in parallel, api.test.ts's
    // TRUNCATE would wipe rows the life-cycle suite had just registered
    // through the running service — producing a failure that looks like
    // "the device never reached down" but is really one suite deleting
    // another's data mid-run.
    //
    // The alternative (a separate database per suite) is the better
    // answer at larger scale, but it adds setup for whoever runs this
    // next, and the whole suite completes in ~10s serially. Noted as a
    // change worth making if the suite grows.
    fileParallelism: false,

    // The life-cycle suite spawns real processes and waits on real poll
    // intervals; the default 5s timeout is too tight for that.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
