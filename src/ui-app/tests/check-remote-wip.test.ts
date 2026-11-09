/**
 * Engineer remote self-check WIP checkpoint + dirty-tree fallback (#0695).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCheck } from "../../commands/check.js";
import * as engineerRemote from "../../server/engineer-remote-self-check.js";
import { commitWipCheckpointForRemoteGate } from "../../server/engineer-remote-self-check.js";
import * as preReview from "../../server/pre-review-remote-gate.js";
import type { RepoOSConfig } from "../../core/types.js";
import {
  VALIDATE_INJECTED_ENV_KEYS,
  clearValidateInjectedEnv,
} from "./setup/validate-injected-env.js";

class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

const cleanups: string[] = [];
const origCwd = process.cwd();
let logs: string[] = [];

afterEach(() => {
  process.chdir(origCwd);
  logs = [];
  vi.restoreAllMocks();
  for (const d of cleanups.splice(0)) rmSync(d, { recursive: true, force: true });
});

function gitInit(root: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "f.txt"), "1\n");
  execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: root, stdio: "ignore" });
}

function relConfig(root: string): RepoOSConfig {
  return { root, cacheDir: ".repoos", workDir: "work" } as RepoOSConfig;
}

/**
 * Fixture for the managed WIP fallback: remote validation enabled, one noop
 * step, and one uncommitted file so the CLI has to decide what to do about it.
 *
 * The pressure guard is off because this test is about the WIP-checkpoint
 * decision, not local scheduling; left at its default the guard holds the
 * check on a loaded machine until pressure eases, which never happens inside
 * a test.
 */
function remoteWipFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-wip-fail-"));
  cleanups.push(root);
  gitInit(root);
  writeFileSync(
    join(root, "repoos.toml"),
    [
      'workDir = "work"',
      "[remoteValidation]",
      "enabled = true",
      "provider = tailscale",
      "engineerSelfCheckRemote = true",
      "[pressureGuard]",
      "enabled = false",
      "[[check.steps]]",
      'name = "noop"',
      'command = "test -f .repoos/check-gate-locks/0695.json"',
      "",
    ].join("\n"),
  );
  execFileSync("git", ["add", "repoos.toml"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "cfg"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "dirty.txt"), "x\n");
  return root;
}

function unmanagedTaskCheckFixture(command = "test -f .repoos/check-gate-locks/0695.json"): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-unmanaged-task-check-"));
  cleanups.push(root);
  gitInit(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "initial\n");
  execFileSync("git", ["add", "src/app.ts"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "source fixture"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["branch", "-m", "feat/0695"], { cwd: root, stdio: "ignore" });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(root, "work", "0695-task.md"),
    "---\nid: '0695'\nbranch: feat/0695\n---\nTask fixture.\n",
  );
  writeFileSync(
    join(root, "repoos.toml"),
    [
      'workDir = "work"',
      "[pressureGuard]",
      "enabled = false",
      "[[check.steps]]",
      'name = "gate-lock"',
      `command = ${JSON.stringify(command)}`,
      "",
    ].join("\n"),
  );
  execFileSync("git", ["add", "repoos.toml", "work/0695-task.md"], {
    cwd: root,
    stdio: "ignore",
  });
  execFileSync("git", ["commit", "-qm", "task fixture"], { cwd: root, stdio: "ignore" });
  return root;
}

describe("commitWipCheckpointForRemoteGate (#0695)", () => {
  it("stages and commits dirty task work so HEAD matches the tree", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-wip-"));
    cleanups.push(root);
    gitInit(root);
    writeFileSync(join(root, "src.txt"), "edit\n");
    const err = await commitWipCheckpointForRemoteGate(root, relConfig(root), "0695");
    expect(err).toBeNull();
    const subject = execFileSync("git", ["log", "-1", "--format=%s"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    expect(subject).toContain("0695");
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })).toBe(
      "",
    );
  });
});

describe("managed engineer dirty-tree fallback (#0695)", () => {
  async function runManagedCheck(
    root: string,
    managed = true,
  ): Promise<{ code: number | undefined; logs: string }> {
    logs = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      logs.push(parts.map(String).join(" "));
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number | undefined) => {
      throw new ExitSignal(code);
    }) as never);
    const saved = new Map<string, string | undefined>();
    for (const key of [
      ...VALIDATE_INJECTED_ENV_KEYS,
      "REPOOS_AGENT",
      "REPOOS_TASK_ID",
      "REPOOS_CHECK_STORE_ROOT",
      "REPOOS_SKIP_TESTS",
      "REPOOS_REMOTE_VALIDATION_DONE",
    ]) {
      saved.set(key, process.env[key]);
    }
    // A runner exports REPOOS_ROOT and the browser-capture set for the project
    // under test. Left set, the fixture's task id is foreign (#0870) and the
    // managed WIP path is skipped, or the check offloads browser steps and
    // never reaches the checkpoint warning (#0905).
    clearValidateInjectedEnv();
    if (managed) {
      process.env.REPOOS_AGENT = "1";
      process.env.REPOOS_TASK_ID = "0695";
    } else {
      delete process.env.REPOOS_AGENT;
      delete process.env.REPOOS_TASK_ID;
    }
    delete process.env.REPOOS_CHECK_STORE_ROOT;
    delete process.env.REPOOS_SKIP_TESTS;
    delete process.env.REPOOS_REMOTE_VALIDATION_DONE;
    try {
      process.chdir(root);
      await cmdCheck([]);
      return { code: 0, logs: logs.join("\n") };
    } catch (e) {
      if (e instanceof ExitSignal) return { code: e.code, logs: logs.join("\n") };
      throw e;
    } finally {
      logSpy.mockRestore();
      exitSpy.mockRestore();
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  it("warns and runs locally when a WIP checkpoint cannot be created", async () => {
    const root = remoteWipFixture();
    vi.spyOn(preReview, "shouldRunCliRemotePreReviewGate").mockReturnValue(true);
    vi.spyOn(engineerRemote, "commitWipCheckpointForRemoteGate").mockResolvedValue(
      "mock staging failure",
    );
    const { logs: out } = await runManagedCheck(root);
    expect(out).toMatch(/could not commit a WIP checkpoint/i);
    expect(out).toMatch(/full local gate/i);
  });

  it("is unaffected by the browser-capture env a remote runner injects (#0905)", async () => {
    // Exactly what validate.sh passes into the repoos-ci container when
    // browserCaptureMode is runner-only/offloaded.
    const offloadEnv = {
      REPOOS_OFFLOAD_BROWSER_STEPS: "1",
      REPOOS_BROWSER_CAPTURE_MODE: "shots",
      REPOOS_BROWSER_CAPTURE_TASK: "0905",
      REPOOS_BROWSER_CAPTURE_BRANCH: "feat/check-remote-wip-test-breaks-when-the-ga",
      REPOOS_BROWSER_CAPTURE_ENTRY: "{}",
      REPOOS_BROWSER_CAPTURE_CANONICAL: "{}",
    };
    Object.assign(process.env, offloadEnv);
    try {
      const root = remoteWipFixture();
      vi.spyOn(preReview, "shouldRunCliRemotePreReviewGate").mockReturnValue(true);
      vi.spyOn(engineerRemote, "commitWipCheckpointForRemoteGate").mockResolvedValue(
        "mock staging failure",
      );
      const { logs: out } = await runManagedCheck(root);
      expect(out).toMatch(/could not commit a WIP checkpoint/i);
      // The unmanaged branch's message: taking it means the runner's env leaked
      // past the test and changed the path it asserts on.
      expect(out).not.toMatch(/the remote gate tests committed HEAD only/i);
      // Saved and restored, not silently dropped for later files.
      for (const [k, v] of Object.entries(offloadEnv)) expect(process.env[k]).toBe(v);
    } finally {
      for (const key of Object.keys(offloadEnv)) delete process.env[key];
    }
  });

  it("keeps the managed remote self-check lock through the local check plan (#1061)", async () => {
    const root = remoteWipFixture();
    vi.spyOn(preReview, "shouldRunCliRemotePreReviewGate").mockReturnValue(true);
    vi.spyOn(engineerRemote, "commitWipCheckpointForRemoteGate").mockResolvedValue(null);
    vi.spyOn(engineerRemote, "runEngineerRemoteSelfCheckGate").mockResolvedValue({
      kind: "local-only",
      skipTests: true,
    });
    const { code } = await runManagedCheck(root);
    expect(code).toBe(0);
    expect(existsSync(join(root, ".repoos", "check-gate-locks", "0695.json"))).toBe(false);
  });

  it("holds a lock during a direct CLI check in an unmanaged task worktree (#1061)", async () => {
    const root = unmanagedTaskCheckFixture();
    const { code, logs: out } = await runManagedCheck(root, false);
    expect(code).toBe(0);
    expect(out).toContain("gate-lock");
    expect(existsSync(join(root, ".repoos", "check-gate-locks", "0695.json"))).toBe(false);
  });

  it("fails a direct task self-check when a source commit lands during the plan (#1061)", async () => {
    const root = unmanagedTaskCheckFixture(
      "chmod u+w src/app.ts && printf changed >> src/app.ts && git add src/app.ts && git commit -m 'source changed during check'",
    );
    const { code, logs: out } = await runManagedCheck(root, false);
    expect(code).toBe(1);
    expect(out).toContain("worktree-drift");
    expect(out).toContain("source changed during check");
    expect(out).toContain("src/app.ts");
    expect(out).toContain("1 check(s) failed");
    expect(existsSync(join(root, ".repoos", "check-gate-locks", "0695.json"))).toBe(false);
  }, 30_000);

  it("fails a direct task check when tracked source is edited without a commit (#1061)", async () => {
    const root = unmanagedTaskCheckFixture("chmod u+w src/app.ts && printf changed >> src/app.ts");
    const { code, logs: out } = await runManagedCheck(root, false);
    expect(code).toBe(1);
    expect(out).toContain("Tracked source files changed in the working tree during the check");
    expect(out).toContain("src/app.ts");
    expect(out).not.toContain("All checks passed");
  }, 30_000);

  it("detects a source file changed again when it was already dirty at check start (#1061)", async () => {
    const root = unmanagedTaskCheckFixture(
      "chmod u+w src/app.ts && printf second-edit >> src/app.ts",
    );
    writeFileSync(join(root, "src", "app.ts"), "already dirty\n");
    const { code, logs: out } = await runManagedCheck(root, false);
    expect(code).toBe(1);
    expect(out).toContain("Tracked source files changed in the working tree during the check");
    expect(out).toContain("src/app.ts");
    expect(out).not.toContain("All checks passed");
  }, 30_000);

  it("allows a bookkeeping-only tracked edit during a direct task check (#1061)", async () => {
    const root = unmanagedTaskCheckFixture("printf bookkeeping >> work/0695-task.md");
    const { code, logs: out } = await runManagedCheck(root, false);
    expect(code).toBe(0);
    expect(out).toContain("All checks passed");
  }, 30_000);
});
