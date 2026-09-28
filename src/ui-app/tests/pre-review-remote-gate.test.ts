import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import type { RepoOSConfig } from "../../core/types.js";
import {
  REPOOS_REMOTE_VALIDATION_DONE,
  checkEnvAfterRemoteGate,
  remotePreReviewEnabled,
  remoteValidationAlreadyAttempted,
  runRemotePreReviewGate,
  shouldRunCliRemotePreReviewGate,
  standaloneCliCanUseRemote,
  spawnedRepoosCheckArgs,
  uncommittedFilesBlockingRemoteGate,
} from "../../server/pre-review-remote-gate.js";
import { CLOSEOUT_CHECK_ARGS } from "../../core/check-plan.js";
import { readCheckRun } from "../../core/check-results-store.js";
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

  it("never falls back locally for a config error — even with fallbackToLocal (#0521 review)", async () => {
    // A `runsOn` requirement no host provides must FAIL CLEARLY: a transient
    // classification here made the gate silently run the full gate locally,
    // which is exactly the wrong-machine outcome capability routing exists to
    // prevent.
    const root = mkdtempSync(join(tmpdir(), "repoos-prrv-"));
    git(root, ["init", "-q"]);
    git(root, ["commit", "--allow-empty", "-qm", "init"]);
    const config = makeConfig(root, { enabled: true, fallbackToLocal: true });
    const validator: RemoteValidator = {
      validate: vi.fn().mockResolvedValue({
        ok: false,
        transient: false,
        configError: true,
        detail:
          "remote validation cannot run: no remote host provides macos " +
          "(configured: bee [linux]) — add a [[remoteValidation.tailscaleHosts]] row",
      }),
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
    if (out.kind === "fail") {
      expect(out.retryable).toBe(false);
      expect(out.detail).toContain("remote validation cannot run");
      expect(out.detail).toContain("[[remoteValidation.tailscaleHosts]]");
      // The remedy is a config change, not a branch change.
      expect(out.detail).toContain("remoteValidation host configuration");
      expect(out.detail).not.toContain("fix it in the feature branch");
    }
  });
});

describe("remotePreReviewEnabled", () => {
  it("is false without config", () => {
    expect(remotePreReviewEnabled({ root: "/x" } as RepoOSConfig)).toBe(false);
  });
});

describe("remoteValidationAlreadyAttempted", () => {
  it("is true when REPOOS_SKIP_TESTS or REPOOS_REMOTE_VALIDATION_DONE is set", () => {
    expect(remoteValidationAlreadyAttempted({})).toBe(false);
    expect(remoteValidationAlreadyAttempted({ REPOOS_SKIP_TESTS: "1" })).toBe(true);
    expect(remoteValidationAlreadyAttempted({ [REPOOS_REMOTE_VALIDATION_DONE]: "1" })).toBe(true);
  });
});

describe("checkEnvAfterRemoteGate", () => {
  it("marks fallback local-only without skipping tests", () => {
    expect(checkEnvAfterRemoteGate({ kind: "local-only", skipTests: false })).toEqual({
      [REPOOS_REMOTE_VALIDATION_DONE]: "1",
    });
  });

  it("sets both flags after a green remote gate", () => {
    expect(checkEnvAfterRemoteGate({ kind: "local-only", skipTests: true })).toEqual({
      [REPOOS_REMOTE_VALIDATION_DONE]: "1",
      REPOOS_SKIP_TESTS: "1",
    });
  });
});

describe("shouldRunCliRemotePreReviewGate", () => {
  const enabled = makeConfig("/tmp", { enabled: true, provider: "tailscale" });

  it("is false when remote validation is disabled", () => {
    const disabled = makeConfig("/tmp", { enabled: false });
    expect(shouldRunCliRemotePreReviewGate(disabled, {}, {})).toBe(false);
  });

  it("is false when a parent already ran remote validation", () => {
    expect(shouldRunCliRemotePreReviewGate(enabled, {}, { REPOOS_SKIP_TESTS: "1" })).toBe(false);
    expect(
      shouldRunCliRemotePreReviewGate(enabled, {}, { [REPOOS_REMOTE_VALIDATION_DONE]: "1" }),
    ).toBe(false);
  });

  it("is false with --local-tests", () => {
    expect(shouldRunCliRemotePreReviewGate(enabled, { localTestsOnly: true }, {})).toBe(false);
  });

  it("is true for a standalone CLI run with remote enabled", () => {
    expect(shouldRunCliRemotePreReviewGate(enabled, {}, {})).toBe(true);
  });

  it("is false in changed-path mode", () => {
    expect(shouldRunCliRemotePreReviewGate(enabled, { changedRef: "main" }, {})).toBe(false);
  });

  it("is false for the Hetzner provider: its VM lifecycle belongs to the server", () => {
    for (const provider of ["hetzner", undefined] as const) {
      const cfg = makeConfig("/tmp", { enabled: true, provider });
      expect(standaloneCliCanUseRemote(cfg)).toBe(false);
      expect(shouldRunCliRemotePreReviewGate(cfg, {}, {})).toBe(false);
    }
    expect(standaloneCliCanUseRemote(enabled)).toBe(true);
  });
});

describe("spawnedRepoosCheckArgs", () => {
  const enabled = makeConfig("/tmp", { enabled: true });

  it("adds --local-tests when remote is enabled but the parent skipped remote", () => {
    expect(spawnedRepoosCheckArgs(enabled, { kind: "skip" })).toEqual([
      "--local-tests",
      ...CLOSEOUT_CHECK_ARGS,
    ]);
  });

  it("uses close-out args only after the parent ran remote", () => {
    expect(spawnedRepoosCheckArgs(enabled, { kind: "local-only", skipTests: true })).toEqual(
      CLOSEOUT_CHECK_ARGS,
    );
  });

  it("leaves args unchanged when remote validation is off", () => {
    const off = makeConfig("/tmp", { enabled: false });
    expect(spawnedRepoosCheckArgs(off, { kind: "skip" })).toEqual(CLOSEOUT_CHECK_ARGS);
  });
});

describe("repoos check CLI flags", () => {
  it("parseCheckArgs --local-tests opts out of the remote block", () => {
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

describe("uncommittedFilesBlockingRemoteGate (#0520 / #0512)", () => {
  function repoWithCommit(): string {
    const root = mkdtempSync(join(tmpdir(), "repoos-remote-dirty-"));
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "T"]);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-q", "-m", "init"]);
    return root;
  }
  const relConfig = (root: string): RepoOSConfig => ({
    ...makeConfig(root, { enabled: true }),
    cacheDir: ".repoos",
    workDir: "work",
  });

  it("is empty for a clean tree, so the remote gate tests exactly what is committed", async () => {
    const root = repoWithCommit();
    expect(await uncommittedFilesBlockingRemoteGate(root, relConfig(root))).toEqual([]);
  });

  it("names uncommitted source edits, which a bundle of HEAD would silently skip", async () => {
    const root = repoWithCommit();
    writeFileSync(join(root, "src", "a.ts"), "export const a = 2;\n");
    writeFileSync(join(root, "src", "new.ts"), "export const b = 1;\n");
    const files = await uncommittedFilesBlockingRemoteGate(root, relConfig(root));
    expect(files).toContain("src/a.ts");
    expect(files).toContain("src/new.ts");
  });

  it("ignores the gate's own churn: dist/, the cache dir and the task dir", async () => {
    const root = repoWithCommit();
    for (const dir of ["dist", ".repoos", "work"]) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, "dist", "out.js"), "x");
    writeFileSync(join(root, ".repoos", "lock"), "x");
    writeFileSync(join(root, "work", "0001-x.md"), "x");
    expect(await uncommittedFilesBlockingRemoteGate(root, relConfig(root))).toEqual([]);
  });

  it("treats an unreadable checkout as blocking, never as clean", async () => {
    const files = await uncommittedFilesBlockingRemoteGate(
      join(tmpdir(), "repoos-definitely-not-a-repo-xyz"),
      relConfig(tmpdir()),
    );
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("standalone `repoos check` remote failure (#0520)", () => {
  const cli = join(__dirname, "..", "..", "..", "dist", "cli", "index.js");

  // Needs the compiled CLI; `repoos check` builds before it runs the test step,
  // so this runs in the gate. A bare `vitest` on a fresh checkout skips it.
  it.skipIf(!existsSync(cli))(
    "exits non-zero AND records the failure for the Checks surface when the runner is unusable",
    () => {
      const root = mkdtempSync(join(tmpdir(), "repoos-cli-remote-fail-"));
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "T"]);
      mkdirSync(join(root, "work"), { recursive: true });
      // Tailscale provider with no host: validate() reports a CONFIG failure
      // (no eligible host — non-retryable since #0521's review fix), which
      // fails the gate with an actionable detail either way.
      writeFileSync(
        join(root, "repoos.toml"),
        'workDir = "work"\n[remoteValidation]\nenabled = true\nprovider = "tailscale"\n' +
          '[[check.steps]]\nname = "noop"\ncommand = "true"\n',
      );
      git(root, ["add", "."]);
      git(root, ["commit", "-q", "-m", "init"]);

      const res = spawnSync(process.execPath, [cli, "check"], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, REPOOS_CHECK_CHANGED: "", REPOOS_SKIP_TESTS: "" },
      });
      expect(res.status).toBe(1);
      const run = readCheckRun(root, ".repoos");
      expect(run).not.toBeNull();
      expect(run!.passed).toBe(false);
      expect(run!.results[0]).toMatchObject({ name: "remote-validation", status: "failed" });
      expect(String(run!.results[0]!.detail)).toMatch(/tailscaleHost|remote validation/i);
    },
    60_000,
  );
});
