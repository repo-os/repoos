/**
 * 0216 — the close-out gate retries once before failing, and classifies the
 * failure it ends up reporting.
 *
 * A false gate failure is expensive: the branch is green but the task strands
 * in review, and the reason alone cannot tell the user whether their code broke
 * or the machine was busy. The retry supplies that signal — a real defect
 * reproduces with the same reason, contention lands somewhere else.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator, tailLine } from "../../server/integration-orchestrator.js";

describe("close-out gate retry (0216)", () => {
  let repo: string;

  beforeEach(() => {
    repo = join(tmpdir(), `repoos-gate-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    mkdirSync(repo, { recursive: true });
    const git = `git -C ${repo}`;
    execSync(`${git} init`, { stdio: "ignore" });
    execSync(`${git} config user.email "t@e.com"`, { stdio: "ignore" });
    execSync(`${git} config user.name "T"`, { stdio: "ignore" });
    writeFileSync(join(repo, "README.md"), "# t\n");
    execSync(`${git} add README.md`, { stdio: "ignore" });
    execSync(`${git} commit -m init`, { stdio: "ignore" });
  });

  afterEach(() => {
    try {
      rmSync(repo, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("stores ANSI-free, whole-line command diagnostics", () => {
    const reason = tailLine(
      "noise\n\u001b[31m+ Received\u001b[39m\n\u001b[32m- 1\u001b[39m\n\u001b[31m+ 2\u001b[39m\n",
      "\u001b[36m ❯ tests/handoff.test.ts:221:73\u001b[39m\nerror: script failed\n",
    );

    expect(reason).toContain("+ Received");
    expect(reason).toContain("tests/handoff.test.ts:221:73");
    expect(reason).not.toContain("\u001b[");
  });

  /** An orchestrator whose sync/validate/publish steps are stubbed. */
  function orchestrator(
    validateResults: { ok: boolean; reason?: string; candidateSha?: string; retryable?: boolean }[],
  ) {
    const coordinator = createJobCoordinator(repo);
    coordinator.enqueue({ id: "0001", branch: "feat/x" } as never);
    coordinator.updateJob("0001", { phase: "validating" });
    const orch = new CloseOutOrchestrator({ root: repo } as never, coordinator);
    const calls: number[] = [];
    // Private methods; shadowed on the instance so the phase machine is exercised.
    (orch as never as Record<string, unknown>).validateCandidate = async () => {
      calls.push(1);
      return validateResults[calls.length - 1] ?? { ok: false, reason: "exhausted" };
    };
    (orch as never as Record<string, unknown>).publishCandidate = async () => ({ ok: true });
    (orch as never as Record<string, unknown>).cleanupCandidate = async () => undefined;
    return { orch, coordinator, calls };
  }

  it("retries once, so a single transient failure does not fail the job", async () => {
    const { orch, coordinator, calls } = orchestrator([
      { ok: false, reason: "check failed: waitFor timed out" },
      { ok: true, candidateSha: "abc123" },
    ]);
    await orch.processNext();
    expect(calls).toHaveLength(2);
    expect(coordinator.getJob("0001")?.phase).not.toBe("failed");
  });

  it("does not retry when the gate passes first time", async () => {
    const { orch, calls } = orchestrator([{ ok: true, candidateSha: "abc123" }]);
    await orch.processNext();
    expect(calls).toHaveLength(1);
  });

  it("calls an identically-reproducing failure a real one", async () => {
    const same = "check failed: TypeError: Cannot read properties of undefined";
    const { orch, coordinator } = orchestrator([
      { ok: false, reason: same },
      { ok: false, reason: same },
    ]);
    const res = await orch.processNext();
    expect(res.ok).toBe(false);
    const reason = coordinator.getJob("0001")?.reason ?? "";
    expect(reason).toContain("reproduced identically on retry");
    expect(reason).toContain("real failure");
    expect(reason).not.toContain("first attempt failed differently");
  });

  it("flags two different failures as infrastructure, not a regression", async () => {
    const { orch, coordinator } = orchestrator([
      { ok: false, reason: "check failed: watcher.test.ts timed out" },
      { ok: false, reason: "check failed: repo-store.test.ts localStorage" },
    ]);
    const res = await orch.processNext();
    expect(res.ok).toBe(false);
    const reason = coordinator.getJob("0001")?.reason ?? "";
    expect(reason).toContain("first attempt failed differently");
    expect(reason).toContain("machine load");
    expect(reason).not.toContain("reproduced identically");
  });

  it("does not retry a merge conflict — it is the same conflict every time", async () => {
    const { orch, coordinator, calls } = orchestrator([
      {
        ok: false,
        retryable: false,
        reason:
          "merge conflict in src/server/done.ts — resolve it in the feature branch's own worktree (merge main into the branch), then retry",
      },
    ]);
    const res = await orch.processNext();
    expect(res.ok).toBe(false);
    expect(calls).toHaveLength(1); // no second gate cycle spent proving the point
    const reason = coordinator.getJob("0001")?.reason ?? "";
    expect(reason).toContain("merge conflict");
    expect(reason).toContain("feature branch's own worktree");
    expect(reason).not.toContain("reproduced identically");
  });

  it("caps at two attempts — the gate must never loop", async () => {
    const { orch, calls } = orchestrator([
      { ok: false, reason: "a" },
      { ok: false, reason: "b" },
      { ok: false, reason: "c" },
    ]);
    await orch.processNext();
    expect(calls).toHaveLength(2);
  });
});
