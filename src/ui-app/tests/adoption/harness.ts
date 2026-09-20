/**
 * Harness for the polyglot adoption matrix (#0452).
 *
 * Two jobs:
 *
 * 1. Label every failure with `[fixture=<id> phase=<phase>]` so a red test names
 *    exactly which fixture and lifecycle phase regressed — the acceptance
 *    criterion "a regression is attributable to a named fixture/scenario".
 * 2. On failure, retain a redacted diagnostic artifact (JSON) so a CI run can
 *    upload something more useful than a truncated stack. Redaction is
 *    belt-and-suspenders: the fixtures are synthetic and secret-free (a test
 *    enforces that), but temporary absolute paths and any secret-shaped text
 *    are still minimized before anything is written.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { AdoptionFixture } from "./fixtures.js";
import { fixtureFilePaths } from "./fixtures.js";

/** Where retained diagnostics land. CI sets this to a directory it uploads. */
export const DIAGNOSTIC_DIR_ENV = "REPOOS_ADOPTION_DIAGNOSTICS_DIR";

export interface MatrixDiagnostic {
  fixture: string;
  phase: string;
  stack: string;
  intent: string;
  /** Toolchain the fixture declares, for reproducing the failure. */
  toolchain: string[];
  /** What the scenario expected to hold, when the caller supplied it. */
  expected: string | null;
  /** The failure message, redacted. */
  error: string;
  /** Redacted stack tail, enough to locate the assertion. */
  stackTrace: string;
  /** Repo-relative fixture files, so a reader knows what the project was. */
  files: string[];
  recordedAt: string;
  redactionVersion: 1;
}

const REDACTION_VERSION = 1;

/** Replace a literal occurrence of `from` (all separators) with `to`. */
function replaceAll(text: string, from: string, to: string): string {
  if (!from) return text;
  let out = "";
  let index = 0;
  while (true) {
    const found = text.indexOf(from, index);
    if (found === -1) {
      out += text.slice(index);
      return out;
    }
    out += text.slice(index, found) + to;
    index = found + from.length;
  }
}

/**
 * Minimize paths and stamp out secret-shaped text. Ordered so the most specific
 * replacement (a fixture root) wins over the broad one (the temp dir).
 */
export function redactDiagnostic(text: string, root?: string): string {
  let out = text;
  const paths = new Set<string>();
  if (root) {
    paths.add(root);
    try {
      // git reports realpaths; macOS /var is really /private/var.
      paths.add(realpathSync(root));
    } catch {
      /* realpath unavailable — the literal path still gets replaced */
    }
    paths.add(`${root}-worktrees`);
    paths.add(root.replace(/\\/g, "/"));
    paths.add(root.replace(/\//g, "\\"));
  }
  for (const p of [...paths].sort((a, b) => b.length - a.length)) {
    out = replaceAll(out, p, "<fixture>");
  }
  out = replaceAll(out, tmpdir(), "<tmp>");
  out = replaceAll(out, tmpdir().replace(/\\/g, "/"), "<tmp>");
  out = replaceAll(out, homedir(), "<home>");
  // Secret-shaped assignments: keep the key, drop the value.
  out = out.replace(
    /((?:api[_-]?key|secret|token|password|passwd|authorization|bearer)\s*[=:]\s*)[^\s,;]+/gi,
    "$1<redacted>",
  );
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer <redacted>");
  return out;
}

/** Resolve (and create) the directory retained diagnostics are written to. */
export function diagnosticDir(): string {
  const dir = process.env[DIAGNOSTIC_DIR_ENV]?.trim() || join(tmpdir(), "repoos-adoption-matrix");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A stable, filesystem-safe name for one fixture/phase pair. */
function diagnosticFileName(fixture: string, phase: string): string {
  const safe = `${fixture}-${phase}`.replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${safe}.json`;
}

/**
 * Persist a redacted diagnostic. Never throws — a failure to write an artifact
 * must not itself fail the test run.
 */
export function recordDiagnostic(diag: MatrixDiagnostic): string | null {
  try {
    const path = join(diagnosticDir(), diagnosticFileName(diag.fixture, diag.phase));
    writeFileSync(path, `${JSON.stringify(diag, null, 2)}\n`);
    return path;
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function stackTail(err: unknown): string {
  if (!(err instanceof Error) || !err.stack) return "";
  return err.stack.split("\n").slice(0, 8).join("\n");
}

export interface RunPhaseOptions {
  /** Fixture root, so absolute paths in the message can be minimized. */
  root?: string;
  /** What the scenario expected, recorded in the artifact. */
  expected?: string;
}

/**
 * Run one lifecycle phase for one fixture.
 *
 * The test name already carries the fixture and phase (see the test files);
 * this wrapper makes the *failure message* carry them too, and records the
 * diagnostic artifact, so a CI log and the uploaded JSON both point at the
 * same named scenario.
 */
export async function runPhase(
  fixture: AdoptionFixture,
  phase: string,
  body: () => void | Promise<void>,
  opts: RunPhaseOptions = {},
): Promise<void> {
  try {
    await body();
  } catch (err) {
    const diagnostic: MatrixDiagnostic = {
      fixture: fixture.id,
      phase,
      stack: fixture.stack,
      intent: fixture.intent,
      toolchain: fixture.toolchain,
      expected: opts.expected ?? null,
      error: redactDiagnostic(errorMessage(err), opts.root),
      stackTrace: redactDiagnostic(stackTail(err), opts.root),
      files: fixtureFilePaths(fixture.id),
      recordedAt: new Date().toISOString(),
      redactionVersion: REDACTION_VERSION,
    };
    const artifact = recordDiagnostic(diagnostic);
    const where = artifact ? ` — diagnostic: ${redactDiagnostic(artifact, opts.root)}` : "";
    throw new Error(`[fixture=${fixture.id} phase=${phase}] ${diagnostic.error}${where}`, {
      cause: err,
    });
  }
}

/** A fresh temp directory for one fixture, named after its prefix. */
export function newFixtureDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Remove a fixture root and the `<root>-worktrees` sibling ensureWorktree makes. */
export function removeFixtureDir(root: string): void {
  rmSync(root, { recursive: true, force: true });
  rmSync(`${root}-worktrees`, { recursive: true, force: true });
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/**
 * Turn a materialized fixture into a real Git repository with one commit, so
 * the worktree/lifecycle scenario exercises the same starting point `repoos
 * init` assumes. Identity is set locally so a machine without a global Git
 * identity (a clean CI runner) still works.
 */
export function initGitRepo(root: string, message = "fixture: initial commit"): void {
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@repoos.test"]);
  git(root, ["config", "user.name", "RepoOS Fixture"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
}

/** The fixture root resolved through any symlinks (macOS /var -> /private/var). */
export function realRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}
