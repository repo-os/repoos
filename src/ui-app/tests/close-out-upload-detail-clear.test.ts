/**
 * #0782 review (round 2) — a FAILED upload must not leave "uploading…"
 * lingering on the card.
 *
 * The upload heartbeat sets an in-stage detail line; a landed upload clears
 * it via `onUploadComplete`. A failed upload never fires that signal, so the
 * orchestrator clears the line when the remote gate settles instead — this
 * drives `validateCandidate` with a mock validator that emits heartbeats and
 * then fails without completing, and asserts the detail stream ends with a
 * clear (`null`).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { ensureWorktree } from "../../core/git.js";
import { resetCheckStore } from "../../core/check-store.js";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import type { RepoOSConfig } from "../../core/types";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commitFile(dir: string, name: string, content: string, msg: string): void {
  const full = join(dir, name);
  writeFileSync(full, content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

/** A minimal JS project with a build script (so the remote gate has a build step). */
function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-0782-clear-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture", scripts: { build: "echo built" } }, null, 2)}\n`,
  );
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

describe("failed upload clears the card detail (#0782)", () => {
  it("ends the detail stream with null when the upload never lands", async () => {
    const { root, clean } = makeRepo();
    try {
      const taskId = "0782";
      const featureWt = ensureWorktree(root, "feat/u1").path!;
      commitFile(featureWt, "src/app.ts", "export const a = 2;\n", "feature work");

      const config = {
        root,
        workDir: "work",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 360_000, timeoutMsFromToml: true },
        remoteValidation: { enabled: true },
      } as RepoOSConfig;
      const coordinator = createJobCoordinator(root);

      // Heartbeats fire while the bytes move, then the transfer fails WITHOUT
      // onUploadComplete — the exact shape of the review's edge case.
      const remoteValidator = {
        validate: vi.fn(async (opts: Record<string, unknown>) => {
          const progress = opts["onUploadProgress"] as
            | ((info: { bundleBytes: number; elapsedSecs: number; attempt: number }) => void)
            | undefined;
          expect(typeof progress, "gate forwards the heartbeat").toBe("function");
          progress?.({ bundleBytes: 27 * 1024 * 1024, elapsedSecs: 5, attempt: 1 });
          progress?.({ bundleBytes: 27 * 1024 * 1024, elapsedSecs: 10, attempt: 1 });
          expect(opts["onUploadComplete"], "gate forwards completion").toBeTypeOf("function");
          // …but the upload fails, so completion never fires.
          return { ok: false, transient: true, detail: "ssh upload failed: Broken pipe" };
        }),
      };
      const uploadEvents: (string | null)[] = [];
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
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        (id: string, detail: string | null) => {
          expect(id).toBe(taskId);
          uploadEvents.push(detail);
        },
      );

      coordinator.enqueue({ id: taskId, branch: "feat/u1" } as never);
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

      expect(res.ok).toBe(false);
      // Two heartbeat lines, then the settle-clear — the card never keeps
      // showing "uploading…" after the failure.
      expect(uploadEvents.length).toBeGreaterThanOrEqual(3);
      expect(uploadEvents[uploadEvents.length - 1]).toBeNull();
      expect(
        uploadEvents
          .slice(0, -1)
          .every((d) => typeof d === "string" && d.includes("uploading bundle")),
      ).toBe(true);
    } finally {
      clean();
    }
  }, 60_000);
});
