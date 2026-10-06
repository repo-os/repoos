/**
 * #0573 — configurable close-out (MTD) pipeline timeout.
 *
 * A hung or pathologically slow close-out must always terminate with a
 * retryable `failed` job (stable, grep-friendly reason, task stays `review`,
 * feature branch untouched), distinct from a user cancel (#0459), which never
 * produces a failure badge. The budget is one wall clock per attempt —
 * `startedAt + closeOut.timeoutMs` — that retries and drift resyncs spend, not
 * reset, and `timeoutMs = 0` preserves the unbounded pre-#0573 behaviour.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree, worktreePathForBranch } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import {
  CloseOutOrchestrator,
  CANCEL_REASON,
  TIMEOUT_REASON_PREFIX,
  closeOutDeadline,
  closeOutTimeoutMs,
  closeOutTimeoutReason,
  formatCloseOutBudget,
  runProcess,
} from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commitFile(dir: string, name: string, content: string, msg: string): void {
  const full = join(dir, name);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-timeout-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

/** An orchestrator with counting shadows for the phases a test must not reach. */
function makeOrchestrator(root: string, closeOut?: { timeoutMs: number }) {
  const config = {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    ...(closeOut
      ? { closeOut: { ...closeOut, timeoutMsFromToml: true as const } }
      : {}),
  } as RepoOSConfig;
  const coordinator = createJobCoordinator(root);
  const orch = new CloseOutOrchestrator(config, coordinator);
  const calls = { sync: 0, validate: 0, publish: 0 };
  (orch as never as Record<string, unknown>).validateCandidate = async () => {
    calls.validate++;
    return { ok: true, candidateSha: "abc123" };
  };
  (orch as never as Record<string, unknown>).publishCandidate = async () => {
    calls.publish++;
    return { ok: true };
  };
  return { orch, coordinator, calls, config };
}

/** `startedAt`/deadline arithmetic is what decides "expired"; pin it. */
const AGED = (ms: number): string => new Date(Date.now() - ms).toISOString();

describe("close-out pipeline budget helpers (#0573)", () => {
  it("defaults to 10 minutes adaptive, honours 0 = disabled, and reads explicit config", () => {
    expect(closeOutTimeoutMs({} as never)).toBe(600_000);
    expect(
      closeOutTimeoutMs({ closeOut: { timeoutMs: 0, timeoutMsFromToml: true } } as never),
    ).toBe(0);
    expect(
      closeOutTimeoutMs({ closeOut: { timeoutMs: 900_000, timeoutMsFromToml: true } } as never),
    ).toBe(900_000);
  });

  it("derives the deadline from startedAt + timeoutMs, or none when disabled", () => {
    const startedAt = "2026-09-28T10:00:00.000Z";
    expect(closeOutDeadline({} as never, startedAt)).toBe(Date.parse(startedAt) + 600_000);
    expect(
      closeOutDeadline({ closeOut: { timeoutMs: 0, timeoutMsFromToml: true } } as never, startedAt),
    ).toBeNull();
    // Not left `queued` yet → no clock, exactly as before #0573.
    expect(closeOutDeadline({} as never, null)).toBeNull();
    expect(closeOutDeadline({} as never, undefined)).toBeNull();
    expect(closeOutDeadline({} as never, "not-a-date")).toBeNull();
  });

  it("records a stable, grep-friendly reason naming the budget", () => {
    expect(closeOutTimeoutReason(360_000)).toBe(
      "close-out timed out after 6m — increase closeOut.timeoutMs or retry when the runner is less loaded",
    );
    expect(closeOutTimeoutReason(360_000)).toContain(TIMEOUT_REASON_PREFIX);
    expect(formatCloseOutBudget(180_000)).toBe("3m");
    expect(formatCloseOutBudget(90_000)).toBe("90s");
    expect(formatCloseOutBudget(3_600_000)).toBe("1h");
  });
});

describe("pipeline timeout enforcement (#0573)", () => {
  it("fails an expired job at the entry checkpoint and tears down the candidate", async () => {
    const { root, clean } = makeRepo();
    try {
      const featureWt = ensureWorktree(root, "feat/t1").path!;
      commitFile(featureWt, "src/new.ts", "export const n = 1;\n", "feature work");

      const { orch, coordinator, calls } = makeOrchestrator(root);
      coordinator.enqueue({ id: "0601", branch: "feat/t1" } as never);
      // Materialize the throwaway candidate the timeout must clean up.
      const synced = await (
        orch as never as {
          syncCandidate: (j: unknown) => Promise<{ ok: boolean }>;
        }
      ).syncCandidate(coordinator.getJob("0601"));
      expect(synced.ok).toBe(true);
      // Simulate a run whose adaptive 10-minute budget (startedAt 10 minutes ago) is spent.
      coordinator.updateJob("0601", { phase: "syncing", startedAt: AGED(600_000) });

      const res = await orch.processNext();

      expect(res.ok).toBe(false);
      expect(res.reason).toBe(
        "close-out timed out after 10m — increase closeOut.timeoutMs or retry when the runner is less loaded",
      );
      // A normal failed-job record (NOT a silent cancel-style removal) …
      const job = coordinator.getJob("0601");
      expect(job?.phase).toBe("failed");
      expect(job?.failedPhase).toBe("syncing");
      expect(job?.reason).toContain(TIMEOUT_REASON_PREFIX);
      // … with the candidate torn down and the task's own work untouched.
      expect(worktreePathForBranch(root, "repoos/integrate/0601")).toBeNull();
      expect(worktreePathForBranch(root, "feat/t1")).toBe(featureWt);
      expect(git(root, ["branch", "--list", "feat/t1"])).toContain("feat/t1");
      // No further phase work ran: the checkpoint fired before the gate.
      expect(calls.validate).toBe(0);
      expect(calls.publish).toBe(0);
    } finally {
      clean();
    }
  }, 20_000);

  it("spends the validating retry against the same budget — no clock reset", async () => {
    const { root, clean } = makeRepo();
    try {
      const { orch, coordinator, calls } = makeOrchestrator(root, { timeoutMs: 1_500 });
      coordinator.enqueue({ id: "0602", branch: "feat/t2" } as never);
      // 100ms spent of 1500ms → the gate below runs past the remaining 1400ms.
      coordinator.updateJob("0602", {
        phase: "validating",
        startedAt: AGED(100),
      });
      const originalStartedAt = coordinator.getJob("0602")!.startedAt;
      (orch as never as Record<string, unknown>).validateCandidate = async () => {
        calls.validate++;
        await new Promise((r) => setTimeout(r, 1_800));
        return { ok: false, reason: "check failed: waitFor timed out" };
      };

      const res = await orch.processNext();

      expect(res.ok).toBe(false);
      expect(calls.validate).toBe(1); // the #0216 retry never started
      const job = coordinator.getJob("0602");
      expect(job?.phase).toBe("failed");
      expect(job?.reason).toContain(TIMEOUT_REASON_PREFIX);
      // The budget is one clock per attempt — a timeout must not rewrite it.
      expect(job?.startedAt).toBe(originalStartedAt);
      expect(calls.publish).toBe(0);
    } finally {
      clean();
    }
  }, 20_000);

  it("closeOut.timeoutMs = 0 disables the ceiling entirely", async () => {
    const { root, clean } = makeRepo();
    try {
      const { orch, coordinator, calls } = makeOrchestrator(root, { timeoutMs: 0 });
      coordinator.enqueue({ id: "0603", branch: "feat/t3" } as never);
      // Ten minutes "elapsed" — with no ceiling the job must run to completion.
      coordinator.updateJob("0603", { phase: "validating", startedAt: AGED(600_000) });

      const res = await orch.processNext();

      expect(res.ok).toBe(true);
      expect(calls.validate).toBe(1);
      expect(calls.publish).toBe(1);
      const job = coordinator.getJob("0603");
      expect(job?.phase).toBe("done");
      expect(job?.reason).toBeUndefined();
    } finally {
      clean();
    }
  }, 15_000);

  it("a user cancel still wins over an expired budget — dropped, never failed", async () => {
    const { root, clean } = makeRepo();
    try {
      const featureWt = ensureWorktree(root, "feat/t4").path!;
      commitFile(featureWt, "src/new.ts", "export const n = 4;\n", "feature work");

      const { orch, coordinator } = makeOrchestrator(root);
      coordinator.enqueue({ id: "0604", branch: "feat/t4" } as never);
      coordinator.updateJob("0604", { phase: "validating", startedAt: AGED(600_000) });
      coordinator.requestCancel("0604");

      const res = await orch.processNext();

      // Cancel is checked before the budget everywhere: no failure badge.
      expect(res.ok).toBe(false);
      expect(res.reason).toBe(CANCEL_REASON);
      expect(coordinator.getJob("0604")).toBeNull();
      expect(worktreePathForBranch(root, "feat/t4")).toBe(featureWt);
    } finally {
      clean();
    }
  }, 15_000);

  it("caps a child process at the pipeline deadline, not its own step timeout", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-mtd-runcap-"));
    try {
      const started = Date.now();
      // Step timeout says 60s; the pipeline deadline says ~250ms — the child
      // must die at the deadline, so a 10-minute check can't outlive a
      // 6-minute budget.
      const res = await runProcess("sleep", ["10"], {
        cwd: root,
        timeout: 60_000,
        deadlineAt: started + 250,
      });
      const elapsed = Date.now() - started;
      expect(res.timedOut).toBe(true);
      expect(res.status).not.toBe(0);
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(5_000);
    } finally {
      rmFixture(root);
    }
  }, 15_000);
});
