import { INTEGRATION_STAGES } from "../../src/types";

// Seeded live-run states for the Checks page (#1247). Pure data: the browser
// fixture seeds its store from `liveRunSeed`, and the WebKit test mocks the
// matching API responses from the same object, so the two never drift.
// Nothing here starts a real check run; every value is a synthetic fixture.

export const LIVE_RUN_STATES = ["running", "queued", "stalled", "failed"] as const;
export type LiveRunState = (typeof LIVE_RUN_STATES)[number];

/** One unbroken token, the case a box with no wrap rule cannot fit. */
export const LONG_MACHINE = `studio${"x".repeat(140)}`;
/** A long failure path with no spaces, the case that widens a box with no wrap rule. */
export const LONG_ERROR_PATH = `/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-checks-page-live-run-view-and-ca/node_modules/.cache/${"x".repeat(120)}`;

function minutesAgo(minutes: number, now: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

export interface LiveRunSeed {
  activeRuns: Array<Record<string, unknown>>;
  slots: {
    holders: Array<Record<string, unknown>>;
    queue: Array<{ taskId: string; position: number; since: string }>;
  };
  integration: Record<string, unknown>;
  testRun: {
    running: boolean;
    startedAt: string | null;
    finishedAt: string | null;
    code: number | null;
    output: string;
  };
}

function testOutput(lines: number): string {
  const rows = Array.from(
    { length: lines },
    (_, i) =>
      `PASS src/ui-app/tests/${"deeply-nested-directory-".repeat(5)}case-${i}.test.ts (${i + 1} tests)`,
  );
  return rows.join("\n");
}

/** Build the seed for one live-run state, relative to `now` (ms epoch). */
export function liveRunSeed(state: string | null, now = Date.now()): LiveRunSeed {
  const stage = INTEGRATION_STAGES[1];
  const idleTestRun = { running: false, startedAt: null, finishedAt: null, code: null, output: "" };
  switch (state) {
    case "queued":
      return {
        activeRuns: [],
        slots: {
          holders: [{ slot: 0, ageMs: 0, heartbeatAgeMs: 0, wedged: false, dead: false }],
          queue: [
            { taskId: "1201", position: 1, since: minutesAgo(2, now) },
            { taskId: "1202", position: 2, since: minutesAgo(1, now) },
          ],
        },
        integration: {
          empty: false,
          active: {
            taskId: "1190",
            stage,
            failed: false,
            startedAt: minutesAgo(4, now),
            lastProgressAt: minutesAgo(0, now),
            phase: "validating",
            phaseStartedAt: minutesAgo(1, now),
            phaseElapsedMs: 60_000,
          },
          queue: ["1201", "1202"],
          queueDetail: [
            {
              taskId: "1201",
              position: 1,
              enqueuedAt: minutesAgo(2, now),
              waitedMs: 120_000,
              blockerTaskId: "1190",
              blockerPhase: "validating",
              blockerElapsedMs: 60_000,
            },
            {
              taskId: "1202",
              position: 2,
              enqueuedAt: minutesAgo(1, now),
              waitedMs: 60_000,
              blockerTaskId: "1201",
              blockerPhase: "queued",
              blockerElapsedMs: null,
            },
          ],
        },
        testRun: idleTestRun,
      };
    case "stalled":
      return {
        activeRuns: [
          {
            id: "run-stalled",
            taskId: "1190",
            kind: "close-out",
            startedAt: minutesAgo(9, now),
            finishedAt: null,
            durationMs: null,
            running: true,
            passed: null,
            code: null,
            output: "",
            scope: "full",
            machine: "mini",
            stepsDone: null,
            stepsTotal: null,
            stepName: null,
            lastProgressAt: minutesAgo(7, now),
          },
        ],
        slots: {
          holders: [
            {
              slot: 0,
              pid: 5150,
              ageMs: 9 * 60_000,
              heartbeatAgeMs: 7 * 60_000,
              wedged: true,
              dead: false,
              meta: { taskId: "1190" },
            },
          ],
          queue: [],
        },
        integration: {
          empty: false,
          active: {
            taskId: "1190",
            stage,
            failed: false,
            startedAt: minutesAgo(9, now),
            lastProgressAt: minutesAgo(7, now),
            phase: "validating",
            phaseStartedAt: minutesAgo(9, now),
            phaseElapsedMs: 9 * 60_000,
          },
          queue: [],
          queueDetail: [],
        },
        testRun: idleTestRun,
      };
    case "failed":
      return {
        activeRuns: [],
        slots: { holders: [{ slot: 0, ageMs: 0, heartbeatAgeMs: 0, wedged: false, dead: false }], queue: [] },
        integration: {
          empty: false,
          active: {
            taskId: "1190",
            stage,
            failed: true,
            error: `Build failed in ${LONG_ERROR_PATH}\nerror TS2345: argument mismatch`,
            startedAt: minutesAgo(5, now),
            lastProgressAt: minutesAgo(4, now),
          },
          queue: [],
          queueDetail: [],
        },
        testRun: {
          running: false,
          startedAt: minutesAgo(6, now),
          finishedAt: minutesAgo(5, now),
          code: 1,
          output: testOutput(60),
        },
      };
    default:
      // "running": one handoff check mid-run, a held slot, a queued close-out
      // and a test suite still streaming output.
      return {
        activeRuns: [
          {
            id: "run-live",
            taskId: "1190",
            kind: "handoff-finalize",
            startedAt: minutesAgo(3, now),
            finishedAt: null,
            durationMs: null,
            running: true,
            passed: null,
            code: null,
            output: "",
            scope: "full",
            machine: LONG_MACHINE,
            stepsDone: 3,
            stepsTotal: 6,
            currentStep: 3,
            stepName: "tests",
            testsDone: 40,
            testsTotal: 120,
            attempt: 2,
            attemptReason: "slot reclaimed after a dead holder",
            lastProgressAt: minutesAgo(0, now),
          },
        ],
        slots: {
          holders: [
            {
              slot: 0,
              pid: 4242,
              ageMs: 3 * 60_000,
              heartbeatAgeMs: 900,
              wedged: false,
              dead: false,
              meta: { taskId: "1190" },
            },
          ],
          queue: [{ taskId: "1201", position: 1, since: minutesAgo(1, now) }],
        },
        integration: {
          empty: false,
          active: {
            taskId: "1190",
            stage,
            failed: false,
            startedAt: minutesAgo(4, now),
            lastProgressAt: minutesAgo(0, now),
            phase: "validating",
            phaseStartedAt: minutesAgo(1, now),
            phaseElapsedMs: 60_000,
          },
          queue: ["1201"],
          queueDetail: [
            {
              taskId: "1201",
              position: 1,
              enqueuedAt: minutesAgo(1, now),
              waitedMs: 60_000,
              blockerTaskId: "1190",
              blockerPhase: "validating",
              blockerElapsedMs: 60_000,
            },
          ],
        },
        testRun: {
          running: true,
          startedAt: minutesAgo(2, now),
          finishedAt: null,
          code: null,
          output: testOutput(160),
        },
      };
  }
}
