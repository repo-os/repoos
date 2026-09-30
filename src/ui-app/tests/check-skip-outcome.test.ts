/**
 * #0592 — the third check outcome, `skipped`. A repo whose resolved plan has
 * zero steps AND zero errors has nothing to verify: `repoos check` exits 0
 * with an actionable "no check plan configured" reminder and records a
 * `skipped` check run (never `passed`). A plan with `errors`, or a `--changed`
 * ref git cannot resolve, still exits non-zero exactly as before.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCheck } from "../../commands/check.js";
import { findRepoRoot } from "../../core/config.js";
import { checkRunSkipped, NO_CHECK_PLAN_NOTICE } from "../../core/check-skip.js";
import { readCheckRun } from "../../core/check-results-store.js";
import { getCheckStore, resetCheckStore } from "../../core/check-store.js";

/** Thrown by the stubbed process.exit so cmdCheck can stop without killing the test runner. */
class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

let logs: string[] = [];

/** An early planning-phase repo: no package.json, no go.mod, nothing inferable. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-check-skip-"));
  cleanups.push(root);
  writeFileSync(join(root, "README.md"), "# nothing to build\n");
  writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
  execFileSync("git", ["init", "-q", "-b", "main", root], { stdio: "pipe", encoding: "utf8" });
  const gitIn = (args: string[]): void =>
    void execFileSync("git", ["-C", root, ...args], {
      stdio: "pipe",
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@e",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@e",
      },
    });
  gitIn(["add", "-A"]);
  gitIn(["commit", "-qm", "init"]);
  return root;
}

const cleanups: string[] = [];
const origCwd = process.cwd();

beforeAll(() => {
  // Non-TTY output keeps `c` colours off, so captured output is plain text.
  delete process.env.NO_COLOR;
});

afterEach(() => {
  // Every runCheck() chdirs into a fixture; leaving the process there would
  // make anything resolving paths from process.cwd() (later tests, the
  // compiled-CLI parity test below) look inside a deleted tmp fixture instead
  // of this repo. Restore BEFORE cleanup, while the directory still exists.
  process.chdir(origCwd);
  logs = [];
  vi.restoreAllMocks();
  resetCheckStore();
});

afterAll(() => {
  process.chdir(origCwd);
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

/** Run cmdCheck in the fixture root, stubbing process.exit; returns its exit code. */
async function runCheck(args: string[], root: string): Promise<number | undefined> {
  logs = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...parts: unknown[]) => {
    logs.push(parts.map(String).join(" "));
  });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code: number | undefined) => {
    throw new ExitSignal(code);
  }) as never);
  try {
    process.chdir(root);
    await cmdCheck(args);
    return undefined; // fell through without exiting
  } catch (e) {
    if (e instanceof ExitSignal) return e.code;
    throw e;
  } finally {
    spy.mockRestore();
    exitSpy.mockRestore();
  }
}

describe("cmdCheck — the skipped outcome (#0592)", () => {
  it("exits 0 with the reminder and records a skipped run for a planless repo", async () => {
    const root = fixture();
    const code = await runCheck([], root);
    expect(code).toBe(0);
    const joined = logs.join("\n");
    expect(joined).toContain(NO_CHECK_PLAN_NOTICE);
    expect(joined).toContain("repoos check --print-plan");

    // Durable last-run record: skipped (and thereby never green).
    const rec = readCheckRun(root);
    expect(rec).not.toBeNull();
    expect(rec!.outcome).toBe("skipped");
    expect(rec!.passed).toBe(false);

    // The CLI must not describe it as a pass anywhere.
    expect(joined).not.toContain("All checks passed");
  });

  it("still fails on plan-level errors (malformed declared steps)", async () => {
    const root = fixture();
    writeFileSync(
      join(root, "repoos.toml"),
      [
        "[check]",
        "version = 1",
        "",
        "[[check.steps]]",
        'name = "broken"', // no kind, no command — unusable
      ].join("\n"),
    );
    const code = await runCheck([], root);
    expect(code).not.toBe(0);
    const rec = readCheckRun(root);
    // The failure path writes no run record — unchanged behaviour.
    expect(rec).toBeNull();
  });

  it("still fails on an unresolvable --changed ref, even with an empty plan", async () => {
    const root = fixture();
    const code = await runCheck(["--changed", "nosuchref"], root);
    expect(code).not.toBe(0);
    expect(logs.join("\n")).toMatch(/Changed-path mode needs a git ref/);
  });

  it("exits 0 (skip) for a resolvable --changed ref on a planless repo", async () => {
    const root = fixture();
    const code = await runCheck(["--changed", "main"], root);
    expect(code).toBe(0);
    const rec = readCheckRun(root);
    expect(rec?.outcome).toBe("skipped");
    expect(rec?.changedRef).toBe("main");
  });

  it("records the skipped run in the SQL history for the Runs tab", async () => {
    const root = fixture();
    await runCheck([], root);
    const rows = getCheckStore(root).list({ limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.outcome).toBe("skipped");
  });
});

describe("checkRunSkipped (#0592)", () => {
  it("detects the notice inside streamed check output", () => {
    expect(checkRunSkipped(`some output\n  ⚠ ${NO_CHECK_PLAN_NOTICE}\nmore`)).toBe(true);
    expect(checkRunSkipped(undefined)).toBe(false);
    expect(checkRunSkipped("")).toBe(false);
    expect(checkRunSkipped("All checks passed.")).toBe(false);
  });
});

/**
 * Guard against a regression where the compiled CLI (what the server actually
 * spawns) and the in-process path disagree. The repo root is resolved lazily
 * inside the test — `afterEach` has already restored the cwd the cmdCheck
 * tests left in a fixture — and an unbuilt dist/ produces a VISIBLE skip, not
 * a silent pass (`repoos check` builds before testing, so it runs there).
 */
describe("compiled CLI parity (#0592)", () => {
  it("`repoos check` exits 0 and prints the notice when no plan can be resolved", (ctx) => {
    const cli = join(findRepoRoot(process.cwd()), "dist", "cli", "index.js");
    if (!existsSync(cli)) return ctx.skip();
    const root = fixture();
    const out = spawnSync(process.execPath, [cli, "check"], { cwd: root, encoding: "utf8" });
    expect(out.error).toBeUndefined();
    expect(out.status).toBe(0);
    expect(`${out.stdout}`).toContain(NO_CHECK_PLAN_NOTICE);
    expect(`${out.stdout}`).toContain("repoos check --print-plan");
  }, 60_000);
});
