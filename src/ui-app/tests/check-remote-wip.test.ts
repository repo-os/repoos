/**
 * Engineer remote self-check WIP checkpoint + dirty-tree fallback (#0695).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      'command = "true"',
      "",
    ].join("\n"),
  );
  execFileSync("git", ["add", "repoos.toml"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-qm", "cfg"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "dirty.txt"), "x\n");
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
    process.env.REPOOS_AGENT = "1";
    process.env.REPOOS_TASK_ID = "0695";
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
});
