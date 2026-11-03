/**
 * Leaked test-helper census/reaper (#1017 phase 2).
 *
 * The safety net lives in the control plane: when a `bun run test` worker is
 * SIGKILLed its fake CLIs and preview servers reparent to pid 1, so the suite's
 * own teardown never runs. The classifier must be conservative — same uid,
 * ppid 1, >30 min old, and identified by a RepoOS test temp dir or the
 * REPOOS_TEST_HELPER tag — and must never match by process name or touch a live
 * task worktree.
 */
import { describe, expect, it } from "vitest";
import {
  classifyTestHelperProcess,
  parseTestHelperRoot,
  reapLeakedTestHelpers,
  TEST_HELPER_STALE_MS,
  type TestHelperCandidate,
  type TestHelperClassifyOptions,
  type TestHelperProcessInfo,
  type TestHelperScan,
} from "../../server/system.js";

const RUN_ROOT = "/tmp/repoos-vitest-Abc123";
const WORKTREES = "/Users/me/repoos-worktrees";

const base: TestHelperCandidate = {
  pid: 4242,
  ppid: 1,
  pgid: 4242,
  uid: 501,
  ageMs: TEST_HELPER_STALE_MS + 60_000,
  command: `node ${RUN_ROOT}/file-x/repoos-cli-api-Y/bin/opencode run --format json`,
};

function classify(
  overrides: Partial<TestHelperCandidate> = {},
  opts: Partial<TestHelperClassifyOptions> = {},
) {
  return classifyTestHelperProcess(
    { ...base, ...overrides },
    {
      uid: 501,
      now: Date.now(),
      isLiveTempRoot: () => false,
      ...opts,
    },
  );
}

describe("parseTestHelperRoot", () => {
  it("extracts the RepoOS-created run/fixture temp dir", () => {
    expect(parseTestHelperRoot(base.command)).toBe(RUN_ROOT);
    expect(parseTestHelperRoot("bun /tmp/repoos-preview-req-e2e-abc/preview-server.mjs")).toBe(
      "/tmp/repoos-preview-req-e2e-abc",
    );
    expect(parseTestHelperRoot("node /var/tmp/repoos-cli-api-Q1AeZ7/bin/opencode")).toBe(
      "/var/tmp/repoos-cli-api-Q1AeZ7",
    );
  });

  it("does not match an arbitrary repoos-named path or a partial sibling", () => {
    expect(parseTestHelperRoot("/tmp/repoos-something-else/file")).toBeNull();
    expect(parseTestHelperRoot("/tmp/not-repoos-vitest-Abc123/file")).toBeNull();
  });
});

describe("classifyTestHelperProcess", () => {
  it("reaps an orphaned helper in a stale RepoOS temp dir", () => {
    expect(classify()).toMatchObject({
      kind: "leaked",
      tempRoot: RUN_ROOT,
      reason: "orphaned test helper in a stale temp dir",
    });
  });

  it("ignores a supervised process even when it names a test temp dir", () => {
    expect(classify({ ppid: 7777 })).toMatchObject({ kind: "ignored", reason: "still supervised" });
  });

  it("never touches a different user's process", () => {
    expect(classify({ uid: 999 })).toMatchObject({ kind: "ignored", reason: "different uid" });
  });

  it("waits for the stale threshold before treating an orphan as leaked", () => {
    expect(classify({ ageMs: 5 * 60_000 })).toMatchObject({
      kind: "ignored",
      reason: "younger than the stale threshold",
    });
  });

  it("skips anything under a live task worktree", () => {
    expect(
      classify(
        { cwd: `${WORKTREES}/feat/1017` },
        {
          worktreesRoot: WORKTREES,
        },
      ),
    ).toMatchObject({ kind: "ignored", reason: "inside a live task worktree" });
  });

  it("skips a helper whose temp dir a live test run still owns", () => {
    expect(
      classify(
        {},
        {
          isLiveTempRoot: (root: string) => root === RUN_ROOT,
        },
      ),
    ).toMatchObject({ kind: "live", reason: "owned by a live test run", tempRoot: RUN_ROOT });
  });

  it("reaps a helper identified only by the REPOOS_TEST_HELPER tag", () => {
    expect(
      classify({ command: "bun -e setInterval(()=>{},1000)", helperTag: RUN_ROOT }),
    ).toMatchObject({ kind: "leaked", tempRoot: RUN_ROOT });
  });

  it("ignores an old, orphaned process with no RepoOS fixture marker", () => {
    expect(classify({ command: "sleep 1000" })).toMatchObject({
      kind: "ignored",
      reason: "not a RepoOS test helper",
    });
  });
});

describe("reapLeakedTestHelpers", () => {
  const leaked = (pid: number, pgid = pid): TestHelperProcessInfo => ({
    ...base,
    pid,
    pgid,
    kind: "leaked",
    reason: "orphaned test helper in a stale temp dir",
    tempRoot: RUN_ROOT,
  });

  it("SIGTERMs the process group, then SIGKILLs survivors", async () => {
    const calls: { pid: number; signal: string; group: boolean }[] = [];
    const alive = new Set([10, 11]);
    const scan: TestHelperScan = {
      candidates: 3,
      leaked: 2,
      processes: [
        { ...leaked(12), kind: "live", reason: "owned by a live test run" },
        leaked(10),
        leaked(11, 99),
      ],
    };
    const reaped = await reapLeakedTestHelpers({
      uid: 501,
      scan: () => scan,
      sleep: async () => {},
      signal: (pid, signal, group) => {
        calls.push({ pid, signal, group });
        if (signal === "SIGKILL") alive.delete(pid);
      },
      isAlive: (pid) => alive.has(pid),
    });

    expect(calls.slice(0, 2)).toEqual([
      { pid: 10, signal: "SIGTERM", group: true },
      { pid: 11, signal: "SIGTERM", group: false },
    ]);
    expect(calls.slice(2)).toEqual([
      { pid: 10, signal: "SIGKILL", group: true },
      { pid: 11, signal: "SIGKILL", group: false },
    ]);
    expect(reaped.map((item) => item.pid)).toEqual([10, 11]);
    expect(reaped.every((item) => !item.survived)).toBe(true);
  });

  it("does nothing when the census finds no leak", async () => {
    let signaled = false;
    const reaped = await reapLeakedTestHelpers({
      uid: 501,
      scan: () => ({ candidates: 1, leaked: 0, processes: [] }),
      signal: () => {
        signaled = true;
      },
    });
    expect(reaped).toEqual([]);
    expect(signaled).toBe(false);
  });
});
