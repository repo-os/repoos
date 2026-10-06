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
    const saved = {
      REPOOS_AGENT: process.env.REPOOS_AGENT,
      REPOOS_TASK_ID: process.env.REPOOS_TASK_ID,
      REPOOS_CHECK_STORE_ROOT: process.env.REPOOS_CHECK_STORE_ROOT,
      REPOOS_SKIP_TESTS: process.env.REPOOS_SKIP_TESTS,
      REPOOS_REMOTE_VALIDATION_DONE: process.env.REPOOS_REMOTE_VALIDATION_DONE,
    };
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
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  it("warns and runs locally when a WIP checkpoint cannot be created", async () => {
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
        "[[check.steps]]",
        'name = "noop"',
        'command = "true"',
        "",
      ].join("\n"),
    );
    execFileSync("git", ["add", "repoos.toml"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-qm", "cfg"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, "dirty.txt"), "x\n");
    vi.spyOn(preReview, "shouldRunCliRemotePreReviewGate").mockReturnValue(true);
    vi.spyOn(engineerRemote, "commitWipCheckpointForRemoteGate").mockResolvedValue(
      "mock staging failure",
    );
    const { logs: out } = await runManagedCheck(root);
    expect(out).toMatch(/could not commit a WIP checkpoint/i);
    expect(out).toMatch(/full local gate/i);
  });
});
