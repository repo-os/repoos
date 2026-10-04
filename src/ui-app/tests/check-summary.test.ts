/**
 * #0651 — the failed-steps summary at the end of every `repoos check`.
 *
 * The gate is routinely piped through `tail`/`grep` (and analized across 234
 * engineer sessions: 130 ran it more than once, a third failed). The summary is
 * printed last, names every gating failure, and gives the one command that
 * reruns each step, so an agent never has to re-run the whole gate to find out
 * what broke. It is deliberately after the terminal `N check(s) failed.` line
 * so `parseCheckResults` stops before it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCheck } from "../../commands/check.js";
import { resetCheckStore } from "../../core/check-store.js";

/** Thrown by the stubbed process.exit so cmdCheck can stop without killing the test runner. */
class ExitSignal extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${code}`);
  }
}

let logs: string[] = [];
const cleanups: string[] = [];
const origCwd = process.cwd();

beforeAll(() => {
  delete process.env.NO_COLOR;
});

afterEach(() => {
  process.chdir(origCwd);
  logs = [];
  vi.restoreAllMocks();
  resetCheckStore();
});

afterAll(() => {
  process.chdir(origCwd);
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

/** A minimal repo declaring the given steps, with a git root so history writes resolve. */
function fixture(steps: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-check-summary-"));
  cleanups.push(root);
  writeFileSync(join(root, "repoos.toml"), ["[check]", "version = 1", "", steps].join("\n"));
  execFileSync("git", ["init", "-q", "-b", "main", root], { stdio: "pipe" });
  return root;
}

async function runCheck(args: string[], root: string): Promise<number | undefined> {
  logs = [];
  const savedEnv: Record<string, string | undefined> = {
    REPOOS_CHECK_STORE_ROOT: process.env.REPOOS_CHECK_STORE_ROOT,
    REPOOS_CHECK_CHANGED: process.env.REPOOS_CHECK_CHANGED,
  };
  delete process.env.REPOOS_CHECK_STORE_ROOT;
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

/** The summary is the tail of the output; `tail -20` must always contain it. */
function summary(): string {
  const joined = logs.join("\n");
  const at = joined.indexOf("── Failed steps ──");
  return at === -1 ? "" : joined.slice(at);
}

describe("cmdCheck — the failed-steps summary (#0651)", () => {
  it("pass: ends with the summary and says none failed", async () => {
    const root = fixture(
      '[[check.steps]]\nname = "build"\ncommand = "true"\n\n[[check.steps]]\nname = "tests"\ncommand = "true"\n',
    );
    const code = await runCheck([], root);
    expect(code).toBe(0);
    const tail = summary();
    expect(tail).toMatch(/── Failed steps ──/);
    expect(tail).toMatch(/✔ none/);
  });

  it("single failure: names the step and its exact rerun command", async () => {
    const root = fixture(
      '[[check.steps]]\nname = "build"\ncommand = "true"\n\n[[check.steps]]\nname = "tests"\ncommand = "false"\n',
    );
    const code = await runCheck([], root);
    expect(code).toBe(1);
    const tail = summary();
    expect(tail).toMatch(/✗ tests/);
    expect(tail).toContain("repoos check --step tests");
    expect(tail).not.toMatch(/build —/);
  });

  it("multi-fail: lists every failed step, each with its own rerun command", async () => {
    const root = fixture(
      '[[check.steps]]\nname = "build"\ncommand = "false"\n\n[[check.steps]]\nname = "lint"\ncommand = "false"\n',
    );
    const code = await runCheck([], root);
    expect(code).toBe(1);
    const tail = summary();
    expect(tail).toMatch(/✗ build/);
    expect(tail).toMatch(/✗ lint/);
    expect(tail).toContain("repoos check --step build");
    expect(tail).toContain("repoos check --step lint");
  });

  it("preserves the profile on the rerun command so a full-only step is reproducible", async () => {
    const root = fixture(
      '[[check.steps]]\nname = "integration"\ncommand = "false"\nprofiles = ["full"]\n',
    );
    const code = await runCheck(["--profile", "full"], root);
    expect(code).toBe(1);
    expect(summary()).toContain("repoos check --profile full --step integration");
  });

  it("names the fixer alongside the rerun for a failing step that declares one (#0651)", async () => {
    const root = fixture(
      '[[check.steps]]\nname = "check-fmt:check"\ncommand = "false"\nfix = "bun run fmt"\n',
    );
    const code = await runCheck([], root);
    expect(code).toBe(1);
    const tail = summary();
    expect(tail).toContain("fix: bun run fmt");
    expect(tail).toContain("rerun: repoos check --step check-fmt:check");
  });

  it("a --step that names nothing is a typo, not a silent pass", async () => {
    const root = fixture('[[check.steps]]\nname = "tests"\ncommand = "true"\n');
    const code = await runCheck(["--step", "nope"], root);
    expect(code).toBe(1);
    expect(logs.join("\n")).toMatch(/--step names no step in this plan: nope/);
  });

  it("the summary is the tail of the output — `tail -20` contains it", async () => {
    const root = fixture('[[check.steps]]\nname = "tests"\ncommand = "false"\n');
    await runCheck([], root);
    const lastLines = logs.slice(-20).join("\n");
    expect(lastLines).toContain("── Failed steps ──");
    expect(lastLines).toContain("repoos check --step tests");
  });
});
