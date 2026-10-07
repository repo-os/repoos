/**
 * #0724 — the close-out gate's scoped→full escape hatch, both halves.
 *
 * A SCOPED run that fails is not proof the branch is broken: it only says the
 * affected tests failed. The close-out re-runs the identical full suite once
 * before failing — locally (drop REPOOS_CHECK_CHANGED) and on the remote runner
 * (drop `changedRef`). The remote half matters most: the runner fails before
 * the local check ever runs, so a scoped remote failure used to fail the
 * close-out without the retry (review round 1).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import { getCheckStore, resetCheckStore } from "../../core/check-store.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
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

/** A minimal JS project with a build script (so the remote gate has a build step). */
function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-0724-remote-retry-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", scripts: { build: "echo built" } }, null, 2)}\n`,
  );
  // An explicit plan with a build step, so the remote gate is entered
  // deterministically (no reliance on stack inference in the candidate).
  writeFileSync(
    join(root, "repoos.toml"),
    ["[check]", "version = 1", "", "[[check.steps]]", 'name = "build"', 'kind = "build"', ""].join(
      "\n",
    ),
  );
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/app.ts"), "export const a = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

beforeEach(() => resetCheckStore());

describe("close-out remote scoped failure → full retry (#0724)", () => {
  it("retries the runner once without changedRef before failing the close-out", async () => {
    const { root, clean } = makeRepo();
    try {
      const taskId = "0724";
      // A green FULL remote pre-review pass recorded at the handoff-tested SHA.
      const featureWt = ensureWorktree(root, "feat/r1").path!;
      commitFile(featureWt, "src/app.ts", "export const a = 2;\n", "feature work");
      const testedSha = git(featureWt, ["rev-parse", "HEAD"]);
      // Main advances with REAL code (a different src path) → the candidate tree
      // differs from the tested tree and main's drift is not bookkeeping → scoped.
      commitFile(root, "src/other.ts", "export const o = 1;\n", "main work");

      const store = getCheckStore(root, ".repoos");
      store.record({
        taskId,
        phase: "pre-review",
        candidateSha: testedSha,
        machine: "bee",
        remote: true,
        scope: "full",
        startedAt: new Date().toISOString(),
        durationMs: 42_000,
        outcome: "pass",
      });

      const config = {
        root,
        workDir: "work",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 360_000, timeoutMsFromToml: true },
        remoteValidation: { enabled: true },
      } as RepoOSConfig;
      const coordinator = createJobCoordinator(root);

      // Fail the SCOPED runner call (changedRef set) as a real red suite; pass
      // the FULL retry (no changedRef). Local tests are skipped on the pass.
      const validatorCalls: Record<string, unknown>[] = [];
      const remoteValidator = {
        validate: vi.fn(async (opts: Record<string, unknown>) => {
          validatorCalls.push(opts);
          if (opts["changedRef"]) {
            return { ok: false, transient: false, detail: "1 scoped test failed" };
          }
          return { ok: true };
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

      coordinator.enqueue({ id: taskId, branch: "feat/r1" } as never);
      const job = coordinator.getJob(taskId)!;
      mkdirSync(join(root, "node_modules"), { recursive: true });

      const synced = await (
        orch as never as { syncCandidate: (j: unknown) => Promise<{ ok: boolean }> }
      ).syncCandidate(job);
      expect(synced.ok).toBe(true);
      coordinator.updateJob(taskId, {
        phase: "validating",
        startedAt: new Date().toISOString(),
      });

      const res = await (
        orch as never as {
          validateCandidate: (j: unknown) => Promise<{ ok: boolean; reason?: string }>;
        }
      ).validateCandidate(coordinator.getJob(taskId));

      expect(validatorCalls).toHaveLength(2);
      expect(validatorCalls[0]!["changedRef"]).toBe(testedSha);
      expect(validatorCalls[1]!["changedRef"]).toBeUndefined();
      // The retry ran the whole suite and passed, so the close-out is not
      // failed by the scoped miss.
      expect(res.ok).toBe(true);
    } finally {
      clean();
    }
  }, 60_000);

  it("still fails the close-out when the full remote retry also fails", async () => {
    const { root, clean } = makeRepo();
    try {
      const taskId = "0724b";
      const featureWt = ensureWorktree(root, "feat/r2").path!;
      commitFile(featureWt, "src/app.ts", "export const a = 2;\n", "feature work");
      const testedSha = git(featureWt, ["rev-parse", "HEAD"]);
      commitFile(root, "src/other.ts", "export const o = 1;\n", "main work");

      const store = getCheckStore(root, ".repoos");
      store.record({
        taskId,
        phase: "pre-review",
        candidateSha: testedSha,
        machine: "bee",
        remote: true,
        scope: "full",
        startedAt: new Date().toISOString(),
        durationMs: 42_000,
        outcome: "pass",
      });

      const config = {
        root,
        workDir: "work",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 360_000, timeoutMsFromToml: true },
        remoteValidation: { enabled: true },
      } as RepoOSConfig;
      const coordinator = createJobCoordinator(root);
      const validatorCalls: Record<string, unknown>[] = [];
      const remoteValidator = {
        validate: vi.fn(async (opts: Record<string, unknown>) => {
          validatorCalls.push(opts);
          // Both the scoped run and the full retry are red.
          return { ok: false, transient: false, detail: "tests failed" };
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

      coordinator.enqueue({ id: taskId, branch: "feat/r2" } as never);
      const job = coordinator.getJob(taskId)!;
      mkdirSync(join(root, "node_modules"), { recursive: true });
      await (
        orch as never as { syncCandidate: (j: unknown) => Promise<{ ok: boolean }> }
      ).syncCandidate(job);
      coordinator.updateJob(taskId, {
        phase: "validating",
        startedAt: new Date().toISOString(),
      });
      const res = await (
        orch as never as {
          validateCandidate: (j: unknown) => Promise<{ ok: boolean; reason?: string }>;
        }
      ).validateCandidate(coordinator.getJob(taskId));

      expect(validatorCalls).toHaveLength(2);
      expect(res.ok).toBe(false);
      expect(res.reason).toMatch(/tests failed/);
    } finally {
      clean();
    }
  }, 60_000);
});
