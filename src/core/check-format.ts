/**
 * The format FIXER behind `repoos check --fix` and handoff auto-format (#0651).
 *
 * A format-only violation used to burn a whole handoff round-trip: the check
 * reported `fmt:check` was not clean, the engineer fixed it and re-ran the
 * whole gate. The plan already declares the format step (`kind = "format"`,
 * or a raw `command` with an explicit `fix`), so this module resolves the same
 * plan and runs each fixer before the gate — never a RepoOS-shaped command.
 *
 * The conventions, in order:
 *  - an explicit `fix = "..."` on the step wins;
 *  - a `kind = "format"` step falls back to the package.json `fmt` script —
 *    the conventional counterpart of the `fmt:check` it runs;
 *  - a raw `command` step has no fixer and is left alone.
 *
 * Close-out deliberately never calls this: the merge gate must keep failing an
 * unformatted committed tree, so only `--fix` / handoff opt in.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveCheckPlan, type CheckPlan, type CheckStep } from "./check-plan.js";
import { detectRepoMarkers, runCommand, stepCwd } from "./check-runner.js";
import { preferBunForDevTasks } from "./runtime.js";
import type { RepoOSConfig } from "./types.js";

export interface FormatFixReport {
  /** Fix commands that ran, in order. */
  commands: string[];
  /** Fixers that exited non-zero, with their captured output. */
  failures: Array<{ command: string; output: string }>;
}

/** The `fmt` script in `cwd`'s package.json, or null when there is none. */
function fmtScript(cwd: string): string | null {
  try {
    const raw = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    return raw.scripts?.fmt ?? null;
  } catch {
    return null;
  }
}

/**
 * The command that fixes what `step` checks, or null when the step has no
 * fixer. An explicit `fix` always wins; otherwise only a `kind = "format"`
 * step is auto-fixable, via the package.json `fmt` script.
 */
export function formatFixCommand(step: CheckStep, repoRoot: string): string | null {
  if (step.fix) return step.fix;
  if (step.kind !== "format") return null;
  const cwd = stepCwd(repoRoot, step) ?? repoRoot;
  if (!existsSync(join(cwd, "package.json"))) return null;
  if (!fmtScript(cwd)) return null;
  const runner = preferBunForDevTasks(cwd) ? "bun" : "npm";
  return `${runner} run fmt`;
}

/**
 * Resolve the repo's plan and run every format step's fixer. Fail-soft by
 * contract: a fixer that fails is reported, never thrown — the following
 * `repoos check` is what decides whether the tree is clean.
 */
export async function runFormatFixes(
  repoRoot: string,
  cfg: RepoOSConfig,
  timeoutMs = 120_000,
): Promise<FormatFixReport> {
  const report: FormatFixReport = { commands: [], failures: [] };
  if (!cfg.check) return report;
  let plan: CheckPlan;
  try {
    plan = resolveCheckPlan({
      check: cfg.check,
      markers: detectRepoMarkers(repoRoot),
      bunRunner: preferBunForDevTasks(repoRoot),
    });
  } catch {
    return report;
  }
  for (const step of plan.steps) {
    const command = formatFixCommand(step, repoRoot);
    if (!command) continue;
    const cwd = stepCwd(repoRoot, step) ?? repoRoot;
    report.commands.push(command);
    const res = await runCommand({ command, cwd, timeoutMs, echo: false });
    if (res.status !== "passed") {
      report.failures.push({ command, output: res.output });
    }
  }
  return report;
}
