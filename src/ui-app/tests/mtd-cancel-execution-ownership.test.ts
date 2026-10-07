/**
 * #0736 — a cancelled close-out keeps executing ownership until it is terminal.
 *
 * Incident #0712 (2026-10-07): cancelling MTD while a remote-validation await
 * was still alive, then requeueing the same task, REPLACED the job record and
 * its cancel flag. The old callback still owned the execution, so it later
 * mutated the fresh queued record (startedAt null, invalid cancellation
 * identity) — the new attempt lost its state, and two close-outs could publish
 * for one task.
 *
 * The fix persists a per-attempt generation on the job record. A requeue while
 * a cancelled attempt is still executing is deferred (the cancelled record is
 * returned unchanged), and every write a run makes is scoped to the attempt it
 * started with, so a late callback from a superseded attempt is refused.
 */
import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import {
  attemptIsExecuting,
  createJobCoordinator,
  jobAttempt,
} from "../../server/integration-job.js";
import { CloseOutOrchestrator, CANCEL_REASON } from "../../server/integration-orchestrator.js";
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
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-cancel-ownership-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", scripts: { build: "echo built" } }, null, 2)}\n`,
  );
  writeFileSync(join(root, "README.md"), "# fixture\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

/** A controllable "remote-validation await" the test can hold and resolve late. */
function deferredGate() {
  let resolveGate!: (v: { ok: boolean; transient?: boolean; detail?: string }) => void;
  const promise = new Promise<{ ok: boolean; transient?: boolean; detail?: string }>((res) => {
    resolveGate = res;
  });
  return { promise, resolve: resolveGate };
}

describe("Stop MTD keeps execution ownership until terminal (#0736)", () => {
  it("enqueue while a cancelled attempt is still executing is deferred, not replaced", () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "0100", branch: "feat/t100" } as never);
      // Attempt A has started executing.
      coordinator.updateJob("0100", {
        phase: "validating",
        startedAt: new Date().toISOString(),
      });
      const attemptA = jobAttempt(coordinator.getJob("0100"));
      coordinator.requestCancel("0100");

      // Requeue while A is still executing.
      const b = coordinator.enqueue({ id: "0100", branch: "feat/t100" } as never)!;

      // B is deferred: the cancelled A record is returned unchanged, still on
      // attempt A with its cancel flag and start time intact.
      expect(b.cancelled).toBe(true);
      expect(jobAttempt(b)).toBe(attemptA);
      const onDisk = coordinator.getJob("0100")!;
      expect(onDisk.cancelled).toBe(true);
      expect(onDisk.startedAt).not.toBeNull();
      expect(jobAttempt(onDisk)).toBe(attemptA);
      // No two jobs for the task, and no phantom "queued / startedAt null".
      expect(onDisk.phase).toBe("validating");
    } finally {
      clean();
    }
  });

  it("a requeue creates a new attempt only after the cancelled run removed its record", () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "0101", branch: "feat/t101" } as never);
      coordinator.updateJob("0101", {
        phase: "validating",
        startedAt: new Date().toISOString(),
      });
      const attemptA = jobAttempt(coordinator.getJob("0101"));
      coordinator.requestCancel("0101");
      // The old run finishes and removes its own record (attempt-scoped).
      coordinator.removeJob("0101", attemptA);
      expect(coordinator.getJob("0101")).toBeNull();

      const b = coordinator.enqueue({ id: "0101", branch: "feat/t101" } as never)!;
      expect(b.cancelled).toBeFalsy();
      expect(b.phase).toBe("queued");
      expect(jobAttempt(b)).toBe(attemptA + 1);
    } finally {
      clean();
    }
  });

  it("attempt-scoped writes are refused for a superseded job", () => {
    const { root, clean } = makeRepo();
    try {
      const coordinator = createJobCoordinator(root);
      coordinator.enqueue({ id: "0102", branch: "feat/t102" } as never);
      coordinator.updateJob("0102", {
        phase: "validating",
        startedAt: new Date().toISOString(),
      });
      const attemptA = jobAttempt(coordinator.getJob("0102"));
      coordinator.requestCancel("0102");
      coordinator.removeJob("0102", attemptA);
      const b = coordinator.enqueue({ id: "0102", branch: "feat/t102" } as never)!;
      const attemptB = jobAttempt(b);

      // A late callback from attempt A tries to advance the phase and cancel.
      expect(coordinator.updateJob("0102", { phase: "publishing" }, attemptA)).toBeNull();
      expect(coordinator.requestCancel("0102", attemptA)).toBe(false);
      coordinator.removeJob("0102", attemptA);

      // B is untouched.
      const onDisk = coordinator.getJob("0102")!;
      expect(jobAttempt(onDisk)).toBe(attemptB);
      expect(onDisk.phase).toBe("queued");
      expect(onDisk.cancelled).toBeFalsy();
    } finally {
      clean();
    }
  });

  it("attemptIsExecuting treats queued and terminal attempts as replaceable", () => {
    const base = { taskId: "x", enqueuedAt: "", baseMainSha: null, branchSha: null, candidateSha: null };
    expect(
      attemptIsExecuting({ ...base, phase: "queued", startedAt: null } as never),
    ).toBe(false);
    expect(
      attemptIsExecuting({ ...base, phase: "validating", startedAt: new Date().toISOString() } as never),
    ).toBe(true);
    expect(
      attemptIsExecuting({ ...base, phase: "done", startedAt: new Date().toISOString() } as never),
    ).toBe(false);
    expect(
      attemptIsExecuting({ ...base, phase: "failed", startedAt: new Date().toISOString() } as never),
    ).toBe(false);
  });

  describe("orchestrator: a late remote-gate resolve cannot corrupt the new attempt", () => {
    it("start A, cancel A, request B, resolve/reject A late; B keeps its identity", async () => {
      const { root, clean } = makeRepo();
      try {
        const featureWt = ensureWorktree(root, "feat/own").path!;
        commitFile(featureWt, "src/app.ts", "export const a = 1;\n", "feature work");
        // Close-out reuses the primary checkout's install in the candidate.
        mkdirSync(join(root, "node_modules"), { recursive: true });

        const config = {
          root,
          workDir: "work",
          cacheDir: ".repoos",
          remoteValidation: { enabled: true },
        } as RepoOSConfig;
        const coordinator = createJobCoordinator(root);

        const gates: ReturnType<typeof deferredGate>[] = [];
        const remoteValidator = {
          validate: vi.fn(() => {
            const d = deferredGate();
            gates.push(d);
            return d.promise;
          }),
        };
        const orch = new CloseOutOrchestrator(
          config,
          coordinator,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          remoteValidator as never,
        );

        coordinator.enqueue({ id: "0200", branch: "feat/own" } as never);
        const attemptA = jobAttempt(coordinator.getJob("0200"));

        // Run A in the background: it reaches the remote gate and awaits.
        const runA = orch.processNext();

        // Wait for A to be blocked on the remote gate.
        await vi.waitFor(() => expect(gates).toHaveLength(1), { timeout: 20_000 });

        // Stop MTD while the remote await is alive.
        coordinator.requestCancel("0200");

        // Requeue the same task — deferred behind the still-executing A.
        const b = coordinator.enqueue({ id: "0200", branch: "feat/own" } as never)!;
        expect(b.cancelled).toBe(true);
        expect(jobAttempt(b)).toBe(attemptA);

        // Resolve A's remote gate LATE (as a real runner would).
        gates[0]!.resolve({ ok: false, transient: true, detail: "host went away" });

        // A must abort as a cancellation without mutating anything.
        const resA = await runA;
        expect(resA.ok).toBe(false);
        expect(resA.reason).toBe(CANCEL_REASON);

        // A removed only its OWN record; nothing was published and no phantom
        // queued record with startedAt null was left behind.
        expect(coordinator.getJob("0200")).toBeNull();
        // The task's own work is intact and still on its branch.
        expect(git(root, ["branch", "--list", "feat/own"])).toContain("feat/own");
        expect(git(featureWt, ["status", "--porcelain"])).toBe("");

        // Now a fresh attempt can start normally.
        const c = coordinator.enqueue({ id: "0200", branch: "feat/own" } as never)!;
        expect(c.cancelled).toBeFalsy();
        expect(c.phase).toBe("queued");
        expect(jobAttempt(c)).toBe(attemptA + 1);
      } finally {
        clean();
      }
    }, 30_000);

    it("a superseded run never tears down the replacement's job", async () => {
      const { root, clean } = makeRepo();
      try {
        const featureWt = ensureWorktree(root, "feat/own2").path!;
        commitFile(featureWt, "src/app.ts", "export const a = 2;\n", "feature work");
        mkdirSync(join(root, "node_modules"), { recursive: true });

        const config = {
          root,
          workDir: "work",
          cacheDir: ".repoos",
          remoteValidation: { enabled: true },
        } as RepoOSConfig;
        const coordinator = createJobCoordinator(root);

        const gates: ReturnType<typeof deferredGate>[] = [];
        const remoteValidator = {
          validate: vi.fn(() => {
            const d = deferredGate();
            gates.push(d);
            return d.promise;
          }),
        };
        const orch = new CloseOutOrchestrator(
          config,
          coordinator,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          remoteValidator as never,
        );

        coordinator.enqueue({ id: "0201", branch: "feat/own2" } as never);
        const attemptA = jobAttempt(coordinator.getJob("0201"));
        const runA = orch.processNext();
        await vi.waitFor(() => expect(gates).toHaveLength(1), { timeout: 20_000 });

        coordinator.requestCancel("0201");
        // Simulate the old run's record being dropped by A's own abort path,
        // then a replacement attempt enqueued BEFORE A's late resolve.
        coordinator.removeJob("0201", attemptA);
        const b = coordinator.enqueue({ id: "0201", branch: "feat/own2" } as never)!;
        const attemptB = jobAttempt(b);
        expect(attemptB).toBe(attemptA + 1);

        // A's remote gate resolves late; A must not record a failure or remove
        // the replacement's job.
        gates[0]!.resolve({ ok: false, transient: false, detail: "late red run" });
        const resA = await runA;
        expect(resA.ok).toBe(false);

        const survived = coordinator.getJob("0201")!;
        expect(survived).not.toBeNull();
        expect(jobAttempt(survived)).toBe(attemptB);
        expect(survived.cancelled).toBeFalsy();
        expect(survived.phase).not.toBe("failed");
      } finally {
        clean();
      }
    }, 30_000);
  });
});
