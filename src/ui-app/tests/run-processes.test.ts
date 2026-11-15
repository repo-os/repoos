/**
 * Unit rules for the run-process reaper (#1134): PID-tree, worktree-cwd and
 * env-marker tracking, TEARD/KILL sequencing, and the bounded test-helper
 * run-root sweep. The live-process integration test lives in
 * `run-process-teardown.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import {
  findEscapedTurnProcesses,
  findOrphanedRunProcesses,
  markerBelongsToRepo,
  markerRunId,
  markerTaskId,
  parseCpuTimeMs,
  parseElapsedMs,
  parseProcessRows,
  pathInside,
  processTreePids,
  reapRunProcesses,
  turnMarker,
  type ProcessRow,
} from "../../core/run-processes.js";
import { collectOrphanedRunRoots, type ProcessEntry } from "./helpers.js";

const REPO = "/Users/me/repoos";
const WORKTREES = "/Users/me/repoos-worktrees";
const UID = 501;

function row(overrides: Partial<ProcessRow> & { pid: number }): ProcessRow {
  return {
    ppid: 1,
    pgid: overrides.pid,
    uid: UID,
    ageMs: 60_000,
    cpuTimeMs: 5_000,
    cpuPercent: 3,
    command: "node vitest run",
    ...overrides,
  };
}

describe("ps parsing", () => {
  it("parses elapsed and fractional CPU times from macOS", () => {
    expect(parseElapsedMs("05:29")).toBe(329_000);
    expect(parseElapsedMs("1-02:03:04")).toBe((86_400 + 2 * 3_600 + 3 * 60 + 4) * 1_000);
    expect(parseCpuTimeMs("243:06.08")).toBeCloseTo(243 * 60_000 + 6_080, -1);
    expect(parseCpuTimeMs("00:01:02")).toBe(62_000);
    expect(parseCpuTimeMs("2-00:00:01")).toBe((2 * 86_400 + 1) * 1_000);
  });

  it("parses a ps row with spaces in the command", () => {
    const rows = parseProcessRows(
      "  4242     1  4242   501       10:00    01:02.50   12.3 node vitest run --config vite.config.ts\n",
    );
    expect(rows).toEqual([
      {
        pid: 4242,
        ppid: 1,
        pgid: 4242,
        uid: 501,
        ageMs: 600_000,
        cpuTimeMs: 62_500,
        cpuPercent: 12.3,
        command: "node vitest run --config vite.config.ts",
      },
    ]);
  });
});

describe("run markers", () => {
  it("scopes a marker to the checkout that minted it", () => {
    const marker = turnMarker(REPO, "1134", "run-abc");
    expect(markerBelongsToRepo(marker, REPO)).toBe(true);
    expect(markerBelongsToRepo(marker, "/Users/me/other-repo")).toBe(false);
    expect(markerTaskId(marker)).toBe("1134");
    expect(markerRunId(marker)).toBe("run-abc");
  });

  it("does not treat an unrelated env value as a repo marker", () => {
    expect(markerBelongsToRepo("repoos-turn:deadbeefdead:1:x", REPO)).toBe(false);
    expect(markerBelongsToRepo("not-a-marker", REPO)).toBe(false);
  });
});

describe("processTreePids", () => {
  it("walks grandchildren and ignores siblings outside the roots", () => {
    const rows = [
      row({ pid: 100, ppid: 1, pgid: 100 }),
      row({ pid: 101, ppid: 100, pgid: 101 }),
      row({ pid: 102, ppid: 101, pgid: 102 }),
      row({ pid: 200, ppid: 1, pgid: 200 }),
    ];
    expect([...processTreePids(rows, [100])].sort()).toEqual([100, 101, 102]);
  });
});

describe("pathInside", () => {
  it("respects path boundaries", () => {
    expect(pathInside("/w/feat/1134", "/w/feat/1134/src")).toBe(true);
    expect(pathInside("/w/feat/1134", "/w/feat/11340/src")).toBe(false);
    expect(pathInside("/w/feat/1134", "/w/feat/1134")).toBe(true);
  });
});

describe("findOrphanedRunProcesses", () => {
  const marker = turnMarker(REPO, "1134", "run-abc");

  function classify(
    rows: ProcessRow[],
    opts: Partial<Parameters<typeof findOrphanedRunProcesses>[1]> = {},
  ) {
    return findOrphanedRunProcesses(rows, {
      uid: UID,
      repoRoot: REPO,
      worktreesRoot: WORKTREES,
      minAgeMs: 5_000,
      cwdByPid: new Map(),
      markerByPid: new Map(),
      ...opts,
    });
  }

  it("finds a reparented process whose cwd is inside a managed worktree", () => {
    const found = classify([row({ pid: 4242 })], {
      cwdByPid: new Map([[4242, join(WORKTREES, "feat/1134/src")]]),
      taskIdForWorkdir: () => "1134",
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      pid: 4242,
      taskId: "1134",
      workdir: join(WORKTREES, "feat/1134/src"),
      matchedBy: "worktree-cwd",
    });
  });

  it("finds an orphan that only carries this repo's run marker", () => {
    const found = classify([row({ pid: 4242 })], {
      markerByPid: new Map([[4242, marker]]),
      cwdByPid: new Map([[4242, "/tmp"]]),
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ pid: 4242, taskId: "1134", matchedBy: "run-marker" });
  });

  it("never touches another checkout's marker", () => {
    const foreign = turnMarker("/Users/me/other-repo", "99", "run-x");
    expect(
      classify([row({ pid: 4242 })], {
        markerByPid: new Map([[4242, foreign]]),
        cwdByPid: new Map([[4242, "/tmp"]]),
      }),
    ).toEqual([]);
  });

  it("ignores supervised, young, foreign-uid and out-of-worktree processes", () => {
    expect(
      classify([row({ pid: 1_000, ppid: 77 })], {
        cwdByPid: new Map([[1_000, join(WORKTREES, "feat/1")]]),
      }),
    ).toEqual([]);
    expect(
      classify([row({ pid: 1_001, ageMs: 1_000 })], {
        cwdByPid: new Map([[1_001, join(WORKTREES, "feat/1")]]),
      }),
    ).toEqual([]);
    expect(
      classify([row({ pid: 1_002, uid: 999 })], {
        cwdByPid: new Map([[1_002, join(WORKTREES, "feat/1")]]),
      }),
    ).toEqual([]);
    expect(
      classify([row({ pid: 1_003 })], {
        cwdByPid: new Map([[1_003, "/Applications/SomeHelper"]]),
      }),
    ).toEqual([]);
  });

  it("spares a process in a live turn's tree or worktree", () => {
    const rows = [
      row({ pid: 500, ppid: 1, ageMs: 60_000 }),
      row({ pid: 501, ppid: 500 }),
      row({ pid: 600, ppid: 1, ageMs: 60_000 }),
    ];
    expect(
      classify(rows, {
        liveTurns: [{ taskId: "1134", leaderPid: 500, workdir: join(WORKTREES, "feat/1134") }],
        cwdByPid: new Map([
          [501, join(WORKTREES, "feat/1134/src")],
          [600, join(WORKTREES, "feat/9999")],
        ]),
      }).map((process) => process.pid),
    ).toEqual([600]);
  });

  it("spares a live turn's marker", () => {
    expect(
      classify([row({ pid: 4242 })], {
        markerByPid: new Map([[4242, marker]]),
        cwdByPid: new Map([[4242, "/tmp"]]),
        liveTurns: [{ taskId: "1134", leaderPid: 77, marker }],
      }),
    ).toEqual([]);
  });
});

describe("findEscapedTurnProcesses", () => {
  const marker = turnMarker(REPO, "1134", "run-abc");

  function escaped(
    rows: ProcessRow[],
    opts: Partial<Parameters<typeof findEscapedTurnProcesses>[1]>,
  ) {
    return findEscapedTurnProcesses(rows, {
      repoRoot: REPO,
      cwdByPid: new Map(),
      markerByPid: new Map(),
      ...opts,
    });
  }

  it("finds a setsid grandchild by the PID tree even outside the turn group", () => {
    const rows = [row({ pid: 100, ppid: 1, pgid: 100 }), row({ pid: 101, ppid: 100, pgid: 101 })];
    const found = escaped(rows, { leaderPid: 100 });
    expect(found.map((process) => process.pid)).toContain(101);
    expect(found.find((process) => process.pid === 101)?.matchedBy).toBe("turn-tree");
  });

  it("finds a reparented grandchild by the turn's worktree cwd", () => {
    const rows = [row({ pid: 300, ppid: 1 })];
    const found = escaped(rows, {
      workdir: join(WORKTREES, "feat/1134"),
      cwdByPid: new Map([[300, join(WORKTREES, "feat/1134/src/ui-app")]]),
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ pid: 300, matchedBy: "worktree-cwd" });
  });

  it("finds a reparented grandchild by this run's marker", () => {
    const rows = [row({ pid: 301, ppid: 1 })];
    const found = escaped(rows, {
      marker,
      markerByPid: new Map([[301, marker]]),
      cwdByPid: new Map([[301, "/tmp"]]),
    });
    expect(found).toHaveLength(1);
    expect(found[0].matchedBy).toBe("run-marker");
  });

  it("does not claim a sibling process in another worktree", () => {
    const rows = [row({ pid: 400, ppid: 1 })];
    expect(
      escaped(rows, {
        workdir: join(WORKTREES, "feat/1134"),
        marker: "repoos-turn:aaaaaaaaaaaa:1134:run-other",
        cwdByPid: new Map([[400, join(WORKTREES, "feat/9999")]]),
        markerByPid: new Map([[400, "repoos-turn:aaaaaaaaaaaa:9999:run-x"]]),
      }),
    ).toEqual([]);
  });

  it("spares an older process in the worktree that predates the turn", () => {
    const rows = [row({ pid: 401, ppid: 1, ageMs: 4 * 60 * 60_000 })];
    expect(
      escaped(rows, {
        workdir: join(WORKTREES, "feat/1134"),
        maxCwdAgeMs: 60 * 60_000,
        cwdByPid: new Map([[401, join(WORKTREES, "feat/1134/src")]]),
      }),
    ).toEqual([]);
  });

  it("never signals itself or PID 1", () => {
    const rows = [row({ pid: 1, ppid: 0 }), row({ pid: process.pid, ppid: 1 })];
    expect(escaped(rows, { workdir: "/" })).toEqual([]);
  });
});

describe("reapRunProcesses", () => {
  it("sends TERM, then KILL only to survivors, by exact pid", async () => {
    const signals: Array<[number, string]> = [];
    let alive = new Set([200, 201]);
    const result = await reapRunProcesses([200, 201, 201, 1, process.pid], {
      graceMs: 1,
      sleep: async () => {},
      signal: (pid, signal) => signals.push([pid, signal]),
      rows: () =>
        [...alive].map((pid) => row({ pid, ppid: 1, command: pid === 200 ? "vitest" : "node" })),
    });
    // 201 "ignored" SIGTERM; KILL gets it next. 200 is still reported as
    // killed because the injected rows never change until KILL is recorded.
    expect(signals.filter(([, signal]) => signal === "SIGTERM").map(([pid]) => pid)).toEqual([
      200, 201,
    ]);
    expect(signals.filter(([, signal]) => signal === "SIGKILL").map(([pid]) => pid)).toEqual([
      200, 201,
    ]);
    alive = new Set();
    expect(result.found).toEqual([200, 201]);
    expect(result.killed).toEqual([200, 201]);
  });

  it("stops escalating once TERM removed the process", async () => {
    const signals: Array<[number, string]> = [];
    const result = await reapRunProcesses([200], {
      graceMs: 1,
      sleep: async () => {},
      signal: (pid, signal) => signals.push([pid, signal]),
      rows: () => [],
    });
    expect(signals).toEqual([[200, "SIGTERM"]]);
    expect(result.killed).toEqual([]);
    expect(result.survivors).toEqual([]);
  });
});

describe("collectOrphanedRunRoots (bounded #1134)", () => {
  // Random suffix: a real leaked run root from another suite must never make
  // this test pass or fail by accident.
  const ROOT = `/tmp/repoos-vitest-Nope1134${Math.random().toString(36).slice(2, 10)}`;

  function entry(overrides: Partial<ProcessEntry>): ProcessEntry {
    return {
      pid: 5000,
      pgid: 5000,
      command: `node ${ROOT}/helper.js`,
      ageMs: 30 * 60_000,
      ...overrides,
    };
  }

  it("matches only run roots that no longer exist", () => {
    const scan = collectOrphanedRunRoots(0, {
      entries: [entry({})],
      now: () => 0,
      deadlineMs: 10_000,
    });
    expect(scan.roots).toEqual([ROOT]);
    expect(scan.truncated).toBe(false);
  });

  it("stops at the deadline instead of walking every process", () => {
    let now = 0;
    const entries = Array.from({ length: 1_000 }, (_, index) =>
      entry({ pid: 5_000 + index, ageMs: 30 * 60_000 }),
    );
    const scan = collectOrphanedRunRoots(0, {
      entries,
      now: () => {
        now += 2_000;
        return now;
      },
      deadlineMs: 1,
    });
    expect(scan.truncated).toBe(true);
    expect(scan.examined).toBeLessThan(entries.length);
  });

  it("skips agent-prompt-sized command lines and caps collected roots", () => {
    const huge = collectOrphanedRunRoots(0, {
      entries: [entry({ command: `x${" /tmp/repoos-vitest-Abc123".repeat(1_000)}` })],
      now: () => 0,
    });
    expect(huge.roots).toEqual([]);

    const capped = collectOrphanedRunRoots(0, {
      entries: Array.from({ length: 5 }, (_, index) =>
        entry({
          pid: 6_000 + index,
          command: `node /tmp/repoos-vitest-Abc${index}/helper.js`,
        }),
      ),
      now: () => 0,
      maxRoots: 2,
    });
    expect(capped.roots).toHaveLength(2);
    expect(capped.truncated).toBe(true);
  });
});

describe("reaper never pattern-kills", () => {
  it("uses exact pids only", async () => {
    const signal = vi.fn();
    await reapRunProcesses([700], {
      graceMs: 1,
      sleep: async () => {},
      signal,
      rows: () => [],
    });
    expect(signal).toHaveBeenCalledWith(700, "SIGTERM");
    expect(signal.mock.calls.every(([pid]) => typeof pid === "number" && pid > 1)).toBe(true);
  });
});
