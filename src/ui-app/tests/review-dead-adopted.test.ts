import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents.js";
import * as orphanEngineers from "../../server/orphan-engineers.js";

// An adopted review whose process dies after the server re-attached it has no
// ChildProcess `close` event. Only `reconcileDeadAgents()` can observe the
// death, so it must finalize the review and drop its entry, or the review
// registration that reads that entry stays live forever (#1083).

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A real AgentRunner that has adopted one review whose process is alive. */
async function adoptLiveReview(onReviewDone: (sessionKey: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-dead-adopted-"));
  roots.push(root);
  const cacheDir = ".repoos";
  const cache = join(root, cacheDir);
  mkdirSync(join(cache, "agent-logs"), { recursive: true });
  writeFileSync(
    join(cache, "agents.json"),
    JSON.stringify({
      entries: [
        {
          taskId: "review:0001",
          pid: process.pid,
          workdir: root,
          branch: "",
          runId: "r1",
          kind: "review",
          reviewKind: "run",
        },
      ],
    }),
  );
  writeFileSync(join(cache, "agent-logs", "review:0001.out.log"), "partial output\n");
  vi.spyOn(orphanEngineers, "verifyRecordedHarnessPid").mockResolvedValue(true);

  const runner = new AgentRunner(
    {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir,
      pressureGuard: { enabled: false },
    } as any,
    () => {},
    { onReviewDone },
  );
  await runner.adoptRunningAgents();
  return runner;
}

describe("dead adopted review reaping (#1083)", () => {
  it("finalizes a review whose adopted process died without a close event", async () => {
    let done: string | null = null;
    const runner = await adoptLiveReview((sessionKey) => {
      done = sessionKey;
    });
    try {
      expect(runner.isRunning("review:0001")).toBe(true);

      // The reviewer dies with no close event. Point the adopted entry at a
      // PID that cannot be alive, as an OS-level exit would leave it.
      const entry = runner["entries"].get("review:0001") as
        | { adoptedPid?: number; processGroupLeader?: number }
        | undefined;
      expect(entry).toBeDefined();
      entry!.adoptedPid = 999_999_999;
      entry!.processGroupLeader = 999_999_999;

      // The next liveness query reconciles, so `isRunning` itself reaps it.
      const deadline = Date.now() + 5000;
      while (done === null && Date.now() < deadline) {
        runner.reconcileDeadAgents();
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(done).toBe("review:0001");
      expect(runner.isRunning("review:0001")).toBe(false);
    } finally {
      runner.dispose();
    }
  });

  it("does not count a finalizing review entry as live, and abandons it on request", async () => {
    const runner = await adoptLiveReview(() => {});
    try {
      expect(runner.reviewProcessLive("review:0001")).toBe(true);

      // A finalize that has begun (its child exited) keeps the entry in place
      // while it settles. That entry must not read as a live reviewer.
      const entry = runner["entries"].get("review:0001") as { finalizing?: boolean };
      entry.finalizing = true;
      expect(runner.reviewProcessLive("review:0001")).toBe(false);
      expect(runner.isRunning("review:0001")).toBe(true);

      expect(runner.abandonFinalizing("review:0001")).toBe(true);
      expect(runner.isRunning("review:0001")).toBe(false);
      expect(runner.abandonFinalizing("review:0001")).toBe(false);
    } finally {
      runner.dispose();
    }
  });

  it("never abandons a review entry that is not finalizing", async () => {
    const runner = await adoptLiveReview(() => {});
    try {
      expect(runner.abandonFinalizing("review:0001")).toBe(false);
      expect(runner.isRunning("review:0001")).toBe(true);
    } finally {
      runner.dispose();
    }
  });
});
