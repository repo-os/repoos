/**
 * #0870 — a check run records into the project that owns the worktree it ran
 * in, never into another checkout reached through an inherited
 * REPOOS_CHECK_STORE_ROOT / REPOOS_TASK_ID / REPOOS_ROOT.
 *
 * Two temporary projects with different layouts: A is RepoOS-like (root
 * `.repoos`, root `work/`), B is nested like LightingAI (`repoos/.repoos`,
 * `repoos/work`). Running B's check from B's linked worktree while every
 * routing env var points at A must touch only B's cache.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { cmdCheck } from "../../commands/check.js";
import {
  getCheckStore,
  resetCheckStore,
  resolveCheckRunAttribution,
  resolveCheckStoreRoot,
} from "../../core/check-store.js";

/** Thrown by the stubbed process.exit so cmdCheck can stop without killing the runner. */
class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

const dirs: string[] = [];
const origCwd = process.cwd();
let logs: string[] = [];

afterEach(() => {
  process.chdir(origCwd);
  logs = [];
  vi.restoreAllMocks();
  resetCheckStore();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

beforeAll(() => delete process.env.NO_COLOR);
afterAll(() => {
  process.chdir(origCwd);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    },
  });
}

interface Fixture {
  main: string;
  worktree: string;
  branch: string;
}

/**
 * A committed project plus (optionally) a linked worktree for `branch`.
 * `cacheDir`/`workDir` mirror the two real layouts: the caller picks root or
 * nested paths.
 */
function project(opts: {
  cacheDir: string;
  workDir: string;
  taskId: string;
  branch: string;
  worktree: boolean;
}): Fixture {
  const raw = mkdtempSync(join(tmpdir(), "repoos-0870-"));
  dirs.push(raw);
  const main = raw;
  writeFileSync(join(main, "README.md"), "# fixture\n");
  writeFileSync(
    join(main, "repoos.toml"),
    `workDir = "${opts.workDir}"\ncacheDir = "${opts.cacheDir}"\n`,
  );
  mkdirSync(join(main, opts.workDir), { recursive: true });
  writeFileSync(
    join(main, opts.workDir, `${opts.taskId}-task.md`),
    `---\nid: "${opts.taskId}"\ntitle: Fixture\nbranch: ${opts.branch}\n---\n`,
  );
  git(main, ["init", "-q", "-b", "main"]);
  git(main, ["config", "user.email", "t@example.com"]);
  git(main, ["config", "user.name", "T"]);
  git(main, ["add", "-A"]);
  git(main, ["commit", "-qm", "init"]);
  if (!opts.worktree)
    return { main: realpathSync(main), worktree: realpathSync(main), branch: opts.branch };
  const worktree = join(main, "..", `${basename(main)}-wt`);
  dirs.push(worktree);
  git(main, ["worktree", "add", "-q", worktree, "-b", opts.branch]);
  return { main: realpathSync(main), worktree: realpathSync(worktree), branch: opts.branch };
}

/** Project A: RepoOS-like root layout. */
function foreignProject(): Fixture {
  return project({
    cacheDir: ".repoos",
    workDir: "work",
    taskId: "0861",
    branch: "feat/foreign",
    worktree: false,
  });
}

/** Project B: nested layout like LightingAI. */
function ownProject(): Fixture {
  return project({
    cacheDir: "repoos/.repoos",
    workDir: "repoos/work",
    taskId: "0870",
    branch: "feat/own",
    worktree: true,
  });
}

const foreignEnv = (foreign: Fixture): Record<string, string> => ({
  REPOOS_CHECK_STORE_ROOT: foreign.main,
  REPOOS_CHECK_TASK_ID: "0861",
  REPOOS_CHECK_PHASE: "pre-review",
  REPOOS_TASK_ID: "0861",
  REPOOS_AGENT: "1",
  REPOOS_ROOT: foreign.main,
});

describe("check store root derives from the worktree's project (#0870)", () => {
  it("ignores a REPOOS_CHECK_STORE_ROOT from another project and warns once", () => {
    const foreign = foreignProject();
    const own = ownProject();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = resolveCheckStoreRoot(own.worktree, foreignEnv(foreign));
    expect(root).toBe(own.main);
    expect(err).toHaveBeenCalledWith(expect.stringContaining("different project"));
    expect(err).toHaveBeenCalledWith(expect.stringContaining(foreign.main));
  });

  it("accepts a same-project hint but still resolves to the project main checkout", () => {
    const own = ownProject();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveCheckStoreRoot(own.worktree, { REPOOS_CHECK_STORE_ROOT: own.main })).toBe(
      own.main,
    );
    // A sibling worktree in the same project is also normalised to main.
    expect(resolveCheckStoreRoot(own.worktree, { REPOOS_CHECK_STORE_ROOT: own.worktree })).toBe(
      own.main,
    );
    expect(err).not.toHaveBeenCalled();
  });

  it("ignores a foreign task id / REPOOS_ROOT instead of attributing the row to it", () => {
    const foreign = foreignProject();
    const own = ownProject();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(resolveCheckRunAttribution(foreignEnv(foreign), own.main, "repoos/work")).toEqual({
      taskId: null,
      phase: "pre-review",
    });
    expect(err).toHaveBeenCalledWith(expect.stringContaining("does not belong to this project"));

    // A task id that DOES exist here is still rejected when REPOOS_ROOT names
    // another project: the whole inherited context belongs to that other run.
    expect(
      resolveCheckRunAttribution(
        {
          REPOOS_CHECK_TASK_ID: "0870",
          REPOOS_CHECK_PHASE: "pre-review",
          REPOOS_ROOT: foreign.main,
        },
        own.main,
        "repoos/work",
      ),
    ).toEqual({ taskId: null, phase: "pre-review" });
  });

  it("keeps a task id that really belongs to this project", () => {
    const own = ownProject();
    expect(
      resolveCheckRunAttribution(
        { REPOOS_CHECK_TASK_ID: "0870", REPOOS_CHECK_PHASE: "pre-review" },
        own.main,
        "repoos/work",
      ),
    ).toEqual({ taskId: "0870", phase: "pre-review" });
  });
});

describe("cmdCheck writes only into the owning project (#0870)", () => {
  async function runCheck(root: string, env: Record<string, string>): Promise<number | undefined> {
    logs = [];
    const saved: Record<string, string | undefined> = {};
    for (const key of Object.keys(env)) {
      saved[key] = process.env[key];
      process.env[key] = env[key];
    }
    saved.REPOOS_CHECK_CHANGED = process.env.REPOOS_CHECK_CHANGED;
    delete process.env.REPOOS_CHECK_CHANGED;

    const logSpy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
      logs.push(parts.map(String).join(" "));
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number | undefined) => {
      throw new ExitSignal(code);
    }) as never);
    process.chdir(root);
    try {
      await cmdCheck([]);
      return undefined;
    } catch (e) {
      if (e instanceof ExitSignal) return e.code;
      throw e;
    } finally {
      logSpy.mockRestore();
      errSpy.mockRestore();
      exitSpy.mockRestore();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      for (const key of Object.keys(env)) {
        if (!(key in saved)) delete process.env[key];
      }
    }
  }

  it("a nested-layout worktree run ignores the foreign checkout's env entirely", async () => {
    const foreign = foreignProject();
    const own = ownProject();
    const code = await runCheck(own.worktree, foreignEnv(foreign));
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("No check plan configured");

    // The foreign checkout gained nothing — not even the nested cache path its
    // own relative cacheDir would have produced there.
    expect(existsSync(join(foreign.main, ".repoos", "checks.db"))).toBe(false);
    expect(existsSync(join(foreign.main, "repoos", ".repoos"))).toBe(false);

    // The owning project's nested cache gained exactly one task-less row:
    // the inherited RepoOS task id must not leak into the LightingAI project.
    const db = join(own.main, "repoos", ".repoos", "checks.db");
    expect(existsSync(db)).toBe(true);
    const rows = getCheckStore(own.main, "repoos/.repoos").list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      taskId: null,
      phase: "pre-review",
      outcome: "skipped",
    });
  }, 60_000);
});
