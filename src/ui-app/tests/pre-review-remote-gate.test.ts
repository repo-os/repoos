import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import type { RepoOSConfig } from "../../core/types.js";
import {
  remotePreReviewEnabled,
  runRemotePreReviewGate,
} from "../../server/pre-review-remote-gate.js";
import type { RemoteValidator } from "../../server/remote-validation.js";
import { parseCheckArgs } from "../../commands/check.js";
import { scheduleCheckFailureRetry } from "../../server/handoff.js";
import type { Task } from "../../core/types.js";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function makeConfig(root: string, remote: RepoOSConfig["remoteValidation"]): RepoOSConfig {
  return {
    root,
    cacheDir: join(root, ".repoos"),
    workDir: join(root, "work"),
    inputsDir: join(root, "inputs"),
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "ai",
    remoteValidation: remote,
  };
}

describe("runRemotePreReviewGate", () => {
  it("skips when remote validation is disabled", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-prrv-"));
    git(root, ["init", "-q"]);
    const config = makeConfig(root, { enabled: false });
    const validate = vi.fn();
    const validator: RemoteValidator = {
      validate,
      reconcile: vi.fn(),
      dispose: vi.fn(),
      logPath: () => "",
    };
    const out = await runRemotePreReviewGate({
      config,
      remoteValidator: validator,
      worktreePath: root,
      taskId: "0520",
    });
    expect(out).toEqual({ kind: "skip" });
    expect(validate).not.toHaveBeenCalled();
  });

  it("calls validate with worktree path and HEAD sha, then skips local tests on success", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-prrv-"));
    git(root, ["init", "-q"]);
    writeFileSync(join(root, "f.txt"), "x");
    git(root, ["add", "f.txt"]);
    git(root, ["commit", "-qm", "init"]);
    const sha = git(root, ["rev-parse", "HEAD"]);
    const config = makeConfig(root, { enabled: true, fallbackToLocal: false });
    const validate = vi.fn().mockResolvedValue({ ok: true });
    const validator: RemoteValidator = {
      validate,
      reconcile: vi.fn(),
      dispose: vi.fn(),
      logPath: (id) => join(root, ".repoos", "logs", "remote-validation", `${id}.log`),
    };
    const out = await runRemotePreReviewGate({
      config,
      remoteValidator: validator,
      worktreePath: root,
      taskId: "0520",
    });
    expect(out).toEqual({ kind: "local-only", skipTests: true });
    expect(validate).toHaveBeenCalledWith({
      taskId: "0520",
      worktreePath: root,
      candidateSha: sha,
      onChunk: undefined,
    });
  });

  it("treats a red remote gate as non-retryable", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-prrv-"));
    git(root, ["init", "-q"]);
    git(root, ["commit", "--allow-empty", "-qm", "init"]);
    const config = makeConfig(root, { enabled: true });
    const validator: RemoteValidator = {
      validate: vi.fn().mockResolvedValue({ ok: false, transient: false, detail: "tests failed" }),
      reconcile: vi.fn(),
      dispose: vi.fn(),
      logPath: () => "",
    };
    const out = await runRemotePreReviewGate({
      config,
      remoteValidator: validator,
      worktreePath: root,
      taskId: "0520",
    });
    expect(out.kind).toBe("fail");
    if (out.kind === "fail") expect(out.retryable).toBe(false);
  });

  it("treats an unreachable runner as retryable when fallbackToLocal is false", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-prrv-"));
    git(root, ["init", "-q"]);
    git(root, ["commit", "--allow-empty", "-qm", "init"]);
    const config = makeConfig(root, { enabled: true, fallbackToLocal: false });
    const validator: RemoteValidator = {
      validate: vi.fn().mockResolvedValue({ ok: false, transient: true, detail: "ssh down" }),
      reconcile: vi.fn(),
      dispose: vi.fn(),
      logPath: () => "",
    };
    const out = await runRemotePreReviewGate({
      config,
      remoteValidator: validator,
      worktreePath: root,
      taskId: "0520",
    });
    expect(out.kind).toBe("fail");
    if (out.kind === "fail") expect(out.retryable).toBe(true);
  });

  it("falls back to full local tests when unreachable and fallbackToLocal is true", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-prrv-"));
    git(root, ["init", "-q"]);
    git(root, ["commit", "--allow-empty", "-qm", "init"]);
    const config = makeConfig(root, { enabled: true, fallbackToLocal: true });
    const validator: RemoteValidator = {
      validate: vi.fn().mockResolvedValue({ ok: false, transient: true }),
      reconcile: vi.fn(),
      dispose: vi.fn(),
      logPath: () => "",
    };
    const out = await runRemotePreReviewGate({
      config,
      remoteValidator: validator,
      worktreePath: root,
      taskId: "0520",
    });
    expect(out).toEqual({ kind: "local-only", skipTests: false });
  });
});

describe("remotePreReviewEnabled", () => {
  it("is false without config", () => {
    expect(remotePreReviewEnabled({ root: "/x" } as RepoOSConfig)).toBe(false);
  });
});

describe("repoos check with remote validation disabled", () => {
  it("parseCheckArgs --local-tests does not imply remote is on", () => {
    expect(parseCheckArgs(["--local-tests", "--changed", "main"])).toEqual({
      localTestsOnly: true,
      changed: "main",
    });
  });
});

describe("scheduleCheckFailureRetry", () => {
  it("does not auto-retry when checkRetryable is false", () => {
    const persist = vi.fn();
    const runner = { persistHandoffFailure: persist, send: vi.fn() } as never;
    const task = { id: "1", absPath: "/t", extra: {} } as Task;
    const scheduled = scheduleCheckFailureRetry(
      { root: "/r" } as RepoOSConfig,
      task,
      { ok: false, step: "check", detail: "remote validation failed", checkRetryable: false },
      runner,
    );
    expect(scheduled).toBe(false);
    expect(persist).toHaveBeenCalled();
  });
});
