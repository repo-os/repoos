/**
 * Board-agent safety (#0677).
 *
 * Two field-report failures are covered here:
 *  1. A free-model CTO wrote a junk file into the main checkout (a
 *     shell-redirect typo), which blocked Move to done. Board roles must not
 *     dirty main: where the CLI has a read-only mode they run with it, and
 *     `runBoardAgent` quarantines anything a run still creates.
 *  2. The CTO failed with `opencode exited with code 1: no stderr output` while
 *     the real cause — `Error: Model unavailable: ...` — sat on stdout. The
 *     failure reason must surface that line.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent } from "../../core/types";
import {
  oneShotFailureDetail,
  readOnlyCommand,
  runBoardAgent,
  runPrompt,
} from "../../server/agents";

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

/** Create a git repo with one committed file so `git status` has a baseline. */
function initRepo(): string {
  const root = tempRoot("repoos-board-agent-");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  writeFileSync(join(root, "README.md"), "# fixture\n", "utf8");
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: root });
  return root;
}

/** A tiny CLI script run through the current runtime, with a fixed body. */
function writeScript(name: string, body: string): { cmd: string; args: string[] } {
  const dir = tempRoot("repoos-board-stub-");
  const script = join(dir, name);
  writeFileSync(script, body, "utf8");
  return { cmd: process.execPath, args: [script] };
}

const AGENT: Agent = { name: "cto", cli: "opencode", model: "default", enabled: true };

/** Recursively list files under `dir` as paths relative to it. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, prefix: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(d, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(dir, "");
  return out;
}

describe("board-agent safety — stray-file quarantine (#0677)", () => {
  it("a board-agent run that writes a file does not leave main dirty", async () => {
    const root = initRepo();
    // The stub imitates the CTO's shell-redirect typo: it writes an untracked
    // file into the checkout it was pointed at.
    const command = writeScript(
      "stray.js",
      `require("node:fs").writeFileSync("Nothing to report", "junk");\nprocess.stdout.write("Nothing to report\\n");\n`,
    );
    const outcome = await runBoardAgent(AGENT, "monitor", {
      cwd: root,
      cacheDir: ".repoos",
      timeoutMs: 10_000,
      command,
    });

    expect(outcome.result.ok).toBe(true);
    expect(outcome.quarantined).toContain("Nothing to report");
    // The stray file is gone from the checkout...
    expect(existsSync(join(root, "Nothing to report"))).toBe(false);
    // ...so `git status` is clean again, which is what unblocks Move to done.
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
    expect(status.trim()).toBe("");
    // ...and it was moved (and thus reported), not silently deleted.
    const moved = listFiles(join(root, ".repoos", "quarantine"));
    expect(moved.some((p) => p.endsWith("Nothing to report"))).toBe(true);
  });

  it("leaves a user's pre-existing dirty file untouched", async () => {
    const root = initRepo();
    // A user's own in-progress untracked file exists BEFORE the run.
    writeFileSync(join(root, "my-notes.txt"), "pre-existing\n", "utf8");
    const command = writeScript(
      "stray.js",
      `require("node:fs").writeFileSync("Nothing to report", "junk");\nprocess.stdout.write("ok\\n");\n`,
    );
    const outcome = await runBoardAgent(AGENT, "monitor", {
      cwd: root,
      cacheDir: ".repoos",
      timeoutMs: 10_000,
      command,
    });
    expect(outcome.quarantined).toEqual(["Nothing to report"]);
    // The user's file is exactly where they left it.
    expect(existsSync(join(root, "my-notes.txt"))).toBe(true);
  });

  it("reports an empty quarantine when the run writes nothing", async () => {
    const root = initRepo();
    const command = writeScript("clean.js", `process.stdout.write("Nothing to report\\n");\n`);
    const outcome = await runBoardAgent(AGENT, "monitor", {
      cwd: root,
      cacheDir: ".repoos",
      timeoutMs: 10_000,
      command,
    });
    expect(outcome.quarantined).toEqual([]);
    expect(existsSync(join(root, ".repoos", "quarantine"))).toBe(false);
  });
});

describe("board-agent read-only commands (#0677)", () => {
  it("opencode runs without --auto so gated writes cannot go through", () => {
    const { cmd, args } = readOnlyCommand(AGENT, "monitor", "/repo");
    expect(cmd).toBe("opencode");
    expect(args).toContain("run");
    expect(args).not.toContain("--auto");
  });

  it("cursor runs without --force", () => {
    const { args } = readOnlyCommand({ ...AGENT, cli: "cursor" }, "monitor", "/repo");
    expect(args).not.toContain("--force");
  });

  it("claude code runs without --dangerously-skip-permissions", () => {
    const { args } = readOnlyCommand({ ...AGENT, cli: "claude code" }, "monitor", "/repo");
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("pi restricts its tools to read", () => {
    const { args } = readOnlyCommand({ ...AGENT, cli: "pi" }, "monitor", "/repo");
    expect(args).toContain("--tools");
    expect(args[args.indexOf("--tools") + 1]).toBe("read");
  });
});

describe("board-agent failure reason from stdout (#0677)", () => {
  it("prefers a stderr line when present", () => {
    expect(oneShotFailureDetail("boom: bad key", "stdout noise")).toBe("boom: bad key");
  });

  it("falls back to an error line on stdout when stderr is empty", () => {
    const stdout = [
      "some narration",
      "Error: Model unavailable: opencode/mimo-v2.6-flash-free",
      "more narration",
    ].join("\n");
    expect(oneShotFailureDetail("", stdout)).toBe(
      "Error: Model unavailable: opencode/mimo-v2.6-flash-free",
    );
  });

  it("reads a structured event's error field", () => {
    const stdout = `{"type":"step_finish"}\n{"error":{"message":"Model unavailable: x"}}`;
    expect(oneShotFailureDetail("", stdout)).toBe("Model unavailable: x");
  });

  it("a stub CLI exiting 1 with empty stderr stores the stdout error as the reason", async () => {
    const root = tempRoot("repoos-board-fail-");
    const command = writeScript(
      "fail.js",
      `process.stdout.write("Error: Model unavailable: opencode/mimo-v2.6-flash-free\\n");\nprocess.exit(1);\n`,
    );
    const result = await runPrompt(AGENT, "boo", { cwd: root, timeoutMs: 10_000, command });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("exited with code 1");
    expect(result.error).toContain("Model unavailable: opencode/mimo-v2.6-flash-free");
    expect(result.error).not.toContain("no stderr output");
  });

  it("a stub that exits 1 with no output at all still explains itself", async () => {
    const root = tempRoot("repoos-board-empty-");
    const command = writeScript("silent.js", `process.exit(1);\n`);
    const result = await runPrompt(AGENT, "boo", { cwd: root, timeoutMs: 10_000, command });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no stderr output");
  });
});
