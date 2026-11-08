/**
 * #1059 — CLI path classification for the docs/bookkeeping check shortcut.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCheck } from "../../commands/check.js";
import { DOCS_ONLY_SKIP_REASON } from "../../core/check-docs-only.js";

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
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@e",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@e",
};

function git(root: string, args: string[]): void {
  execFileSync("git", ["-C", root, ...args], { stdio: "pipe", encoding: "utf8", env: gitEnv });
}

const PLANFUL_TOML = `[check]
version = 1

[[check.steps]]
name = "format"
kind = "format"

[[check.steps]]
name = "full-suite"
command = "false"
required = true
`;

function planfulRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-check-docs-cli-"));
  cleanups.push(root);
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"fixture","private":true}\n');
  writeFileSync(join(root, "repoos.toml"), `workDir = "work"\n${PLANFUL_TOML}`);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "init"]);
  return root;
}

async function runCheck(args: string[], root: string): Promise<number | undefined> {
  logs = [];
  const savedEnv: Record<string, string | undefined> = {
    REPOOS_CHECK_STORE_ROOT: process.env.REPOOS_CHECK_STORE_ROOT,
    REPOOS_CHECK_PHASE: process.env.REPOOS_CHECK_PHASE,
    REPOOS_CHECK_TASK_ID: process.env.REPOOS_CHECK_TASK_ID,
    REPOOS_TASK_ID: process.env.REPOOS_TASK_ID,
    REPOOS_CHECK_CHANGED: process.env.REPOOS_CHECK_CHANGED,
  };
  delete process.env.REPOOS_CHECK_STORE_ROOT;
  delete process.env.REPOOS_CHECK_PHASE;
  delete process.env.REPOOS_CHECK_TASK_ID;
  delete process.env.REPOOS_TASK_ID;
  delete process.env.REPOOS_CHECK_CHANGED;
  const spy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    logs.push(parts.map(String).join(" "));
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number | undefined) => {
    throw new ExitSignal(code);
  }) as never);
  try {
    process.chdir(root);
    await cmdCheck(args);
    return undefined;
  } catch (e) {
    if (e instanceof ExitSignal) return e.code;
    throw e;
  } finally {
    spy.mockRestore();
    exitSpy.mockRestore();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("cmdCheck docs/bookkeeping shortcut (#1059)", () => {
  it("runs the full plan when the changed ref cannot be resolved", async () => {
    const root = planfulRepo();
    const code = await runCheck(["--changed", "nosuchref"], root);
    const joined = logs.join("\n");
    expect(joined).toMatch(/Could not compute changed paths/);
    expect(joined).not.toContain(DOCS_ONLY_SKIP_REASON);
    expect(code).toBe(1);
  });

  it("classifies a work-only diff and skips the full suite", async () => {
    const root = planfulRepo();
    git(root, ["checkout", "-q", "-b", "docs"]);
    writeFileSync(join(root, "work", "note.md"), "# bookkeeping\n");
    git(root, ["add", "work/note.md"]);
    git(root, ["commit", "-qm", "bookkeeping"]);
    const code = await runCheck(["--changed", "main"], root);
    const joined = logs.join("\n");
    expect(joined).toContain(DOCS_ONLY_SKIP_REASON);
    expect(code).toBe(0);
    expect(joined).toMatch(/full-suite.*skipped/);
    expect(joined).not.toMatch(/✗\s+full-suite/);
  });
});
