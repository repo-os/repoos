/**
 * #0989 — each RepoOS agent spawn gets an isolated TMPDIR under the repo cache,
 * cleaned up when the run ends; boot sweeps orphans from a crashed server.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_RUN_TMP_DIRNAME,
  agentRunTmpRoot,
  prepareAgentRunTmpdir,
  removeAgentRunTmpdir,
  sweepStaleAgentRunTmpdirs,
} from "../../core/agent-run-tmpdir.js";
import { runPrompt } from "../../server/agents.js";
import type { Agent } from "../../core/types.js";

const roots: string[] = [];

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe("agent-run tmpdir core (#0989)", () => {
  it("removes a prepared directory on cleanup", () => {
    const repo = tempRoot("repoos-art-core-");
    const handle = prepareAgentRunTmpdir(repo, ".repoos", "run-a");
    expect(existsSync(handle.dir)).toBe(true);
    handle.cleanup();
    expect(existsSync(handle.dir)).toBe(false);
  });

  it("sweep drops orphans but preserves active run ids", () => {
    const repo = tempRoot("repoos-art-sweep-");
    prepareAgentRunTmpdir(repo, ".repoos", "keep-me");
    prepareAgentRunTmpdir(repo, ".repoos", "drop-me");
    const removed = sweepStaleAgentRunTmpdirs(repo, ".repoos", { preserveRunIds: ["keep-me"] });
    expect(removed).toBe(1);
    expect(existsSync(join(agentRunTmpRoot(repo, ".repoos"), "keep-me"))).toBe(true);
    expect(existsSync(join(agentRunTmpRoot(repo, ".repoos"), "drop-me"))).toBe(false);
  });

  it("removeAgentRunTmpdir is idempotent", () => {
    const repo = tempRoot("repoos-art-rm-");
    prepareAgentRunTmpdir(repo, ".repoos", "gone");
    removeAgentRunTmpdir(repo, ".repoos", "gone");
    removeAgentRunTmpdir(repo, ".repoos", "gone");
    expect(existsSync(join(agentRunTmpRoot(repo, ".repoos"), "gone"))).toBe(false);
  });
});

describe("runPrompt isolated TMPDIR (#0989)", () => {
  it("does not leave new files in the host tmpdir after a one-shot run", async () => {
    const repo = tempRoot("repoos-art-prompt-");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    const stubDir = tempRoot("repoos-art-stub-");
    const script = join(stubDir, "write-tmp.js");
    writeFileSync(
      script,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "const dir = process.env.TMPDIR;",
        "fs.writeFileSync(path.join(dir, 'agent-leak-test.txt'), 'x');",
        "process.stdout.write('ok\\n');",
      ].join("\n"),
      "utf8",
    );

    const hostTmp = tmpdir();
    const before = new Set(readdirSync(hostTmp));
    const agent: Agent = { name: "probe", cli: "opencode", model: "default", enabled: true };
    const result = await runPrompt(agent, "ping", {
      cwd: repo,
      repoRoot: repo,
      cacheDir: ".repoos",
      timeoutMs: 10_000,
      command: { cmd: process.execPath, args: [script] },
    });
    expect(result.ok).toBe(true);
    const after = readdirSync(hostTmp);
    const newOnHost = after.filter((name) => !before.has(name));
    expect(newOnHost.some((n) => n.includes("agent-leak-test"))).toBe(false);
    expect(existsSync(join(agentRunTmpRoot(repo, ".repoos")))).toBe(false);
  });

  it("passes TMPDIR under agent-run-tmp to the child", async () => {
    const repo = tempRoot("repoos-art-env-");
    const stubDir = tempRoot("repoos-art-stub2-");
    const script = join(stubDir, "echo-tmp.js");
    writeFileSync(script, "process.stdout.write(process.env.TMPDIR + '\\n');", "utf8");
    const agent: Agent = { name: "probe", cli: "opencode", model: "default", enabled: true };
    const result = await runPrompt(agent, "ping", {
      cwd: repo,
      repoRoot: repo,
      cacheDir: ".repoos",
      runId: "fixed-run-id",
      timeoutMs: 10_000,
      command: { cmd: process.execPath, args: [script] },
    });
    expect(result.ok).toBe(true);
    const expected = join(agentRunTmpRoot(repo, ".repoos"), "fixed-run-id");
    expect(result.output?.trim()).toBe(expected);
    expect(existsSync(expected)).toBe(false);
  });
});

describe("CTO monitor idle skip contract (#0989)", () => {
  it("documents agent-run tmp under the cache dir name", () => {
    expect(AGENT_RUN_TMP_DIRNAME).toBe("agent-run-tmp");
  });
});
