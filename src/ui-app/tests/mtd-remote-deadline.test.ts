/**
 * #0573 spec 4 — the pipeline's remaining budget reaches the remote gate.
 *
 * `runRemotePreReviewGate` for close-out used to pass no `deadlineAt`
 * (`remote-host-pool.test.ts` documented that), so a run could sit in the
 * host-pool queue or on a stuck SSH session indefinitely — the sharp edge
 * behind a task stuck >23 minutes on the check step. The orchestrator now
 * passes `startedAt + closeOut.timeoutMs`, and passes nothing when the
 * ceiling is disabled (`closeOut.timeoutMs = 0`).
 */
import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types";

/** The params the orchestrator handed to the (wrapped) remote gate. */
const gate = vi.hoisted(() => ({ params: null as Record<string, unknown> | null }));

vi.mock("../../server/pre-review-remote-gate.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/pre-review-remote-gate.js")>();
  return {
    ...actual,
    runRemotePreReviewGate: vi.fn((params: Parameters<typeof actual.runRemotePreReviewGate>[0]) => {
      gate.params = params as unknown as Record<string, unknown>;
      // Call through: the real gate forwards `deadlineAt` to the validator.
      return actual.runRemotePreReviewGate(params);
    }),
  };
});

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

/** A minimal JS project: package.json (build marker) + a feature change. */
function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-mtd-remote-deadline-"));
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

/**
 * Drive `validateCandidate` far enough to reach the remote gate on a candidate
 * whose merged diff has a real build step, and capture what the gate received.
 */
async function runGateWithBudget(timeoutMs: number) {
  const { root, clean } = makeRepo();
  try {
    const featureWt = ensureWorktree(root, "feat/r1").path!;
    commitFile(featureWt, "src/app.ts", "export const a = 1;\n", "feature work");

    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      closeOut: { timeoutMs, timeoutMsFromToml: true },
      remoteValidation: { enabled: true },
    } as RepoOSConfig;
    const coordinator = createJobCoordinator(root);
    const validatorCalls: Record<string, unknown>[] = [];
    const remoteValidator = {
      validate: vi.fn(async (opts: Record<string, unknown>) => {
        validatorCalls.push(opts);
        return { ok: false, transient: true, detail: "no usable remote host" };
      }),
    };
    const orch = new CloseOutOrchestrator(
      config,
      coordinator,
      undefined, // repoLock
      undefined, // rootLock
      undefined, // getTask
      undefined, // onProgress
      undefined, // logger
      undefined, // onMergeConflict
      undefined, // onCloseOutGateFailure
      remoteValidator as never,
    );

    coordinator.enqueue({ id: "0701", branch: "feat/r1" } as never);
    const job = coordinator.getJob("0701")!;
    // Materialize the candidate and record baseMainSha, as syncing does.
    const synced = await (
      orch as never as {
        syncCandidate: (j: unknown) => Promise<{ ok: boolean }>;
      }
    ).syncCandidate(job);
    expect(synced.ok).toBe(true);
    const startedAt = new Date().toISOString();
    coordinator.updateJob("0701", { phase: "validating", startedAt });

    gate.params = null;
    const res = await (
      orch as never as {
        validateCandidate: (j: unknown) => Promise<{ ok: boolean; retryable?: boolean }>;
      }
    ).validateCandidate(coordinator.getJob("0701"));

    return { res, startedAt, gateParams: gate.params, validatorCalls };
  } finally {
    clean();
  }
}

describe("close-out remote gate receives the pipeline deadline (#0573)", () => {
  it("passes startedAt + closeOut.timeoutMs when a budget is configured", async () => {
    const { res, startedAt, gateParams, validatorCalls } = await runGateWithBudget(360_000);

    expect(gateParams).not.toBeNull();
    expect(gateParams!["deadlineAt"]).toBe(Date.parse(startedAt) + 360_000);
    expect(gateParams!["phase"]).toBe("close-out");
    // …and it reaches the validator itself, so the host-pool queue wait and a
    // stuck SSH session are bounded by the same clock (#0521 path).
    expect(validatorCalls).toHaveLength(1);
    expect(validatorCalls[0]!["deadlineAt"]).toBe(Date.parse(startedAt) + 360_000);
    // The transient remote failure still flows through as a retryable gate
    // failure — the deadline addition changes nothing else.
    expect(res.ok).toBe(false);
    expect(res.retryable).toBe(true);
  }, 30_000);

  it("passes no deadline when closeOut.timeoutMs = 0 (ceiling disabled)", async () => {
    const { gateParams, validatorCalls } = await runGateWithBudget(0);

    expect(gateParams).not.toBeNull();
    expect(gateParams!["deadlineAt"]).toBeUndefined();
    expect(validatorCalls[0]!["deadlineAt"]).toBeUndefined();
  }, 30_000);
});
