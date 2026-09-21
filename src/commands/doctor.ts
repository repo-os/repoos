/**
 * `repoos doctor [--json] [--probe <cli>] [--yes]` — human and machine
 * rendering of the readiness preflight built in `src/core/doctor.ts`.
 *
 * The command adds no diagnostic logic of its own: it runs the engine, prints
 * it, and sets the exit code (non-zero when any finding is a `fail`, so it is
 * usable in scripts). `--json` emits the same `DoctorReport` the UI and the
 * support bundle (#0453) consume.
 *
 * `--probe <cli>` runs the live adapter contract suite for that harness
 * (`src/core/agent-contract.ts`) instead of the static report. It is opt-in
 * and may use provider credentials/tokens, so it warns, asks for confirmation
 * on a TTY (or requires `--yes` headless), runs in an isolated temp fixture,
 * and cleans up.
 */
import { readBuildMeta } from "../core/build.js";
import { runAdapterContract } from "../core/agent-contract.js";
import {
  doctorRemediations,
  DOCTOR_CATEGORIES,
  runDoctor,
  type DoctorFinding,
  type DoctorReport,
} from "../core/doctor.js";
import { c } from "../cli/colors.js";

const ICON: Record<DoctorFinding["severity"], string> = { pass: "✔", warn: "⚠", fail: "✗" };

export interface DoctorCliArgs {
  json: boolean;
  yes: boolean;
  /** Value passed to `--probe`, or null when the flag is absent. */
  probe: string | null;
  /** True when `--probe` was given without a value (or before another flag). */
  probeMissingValue: boolean;
}

/**
 * Parse `repoos doctor`'s argument list. Kept pure and exported so the probe
 * arming rules (`--probe` needs a value; `--probe --yes` is a usage error) are
 * unit-tested rather than only exercised through a live run.
 */
export function parseDoctorArgs(argv: string[]): DoctorCliArgs {
  const json = argv.includes("--json");
  const yes = argv.includes("--yes");
  const probeArg = argv.indexOf("--probe");
  if (probeArg === -1) return { json, yes, probe: null, probeMissingValue: false };
  const value = argv[probeArg + 1];
  if (!value || value.startsWith("--")) {
    return { json, yes, probe: null, probeMissingValue: true };
  }
  return { json, yes, probe: value, probeMissingValue: false };
}

function severityColor(severity: DoctorFinding["severity"], text: string): string {
  if (severity === "pass") return c.green(text);
  if (severity === "warn") return c.yellow(text);
  return c.red(text);
}

export function renderDoctor(report: DoctorReport): void {
  console.log("");
  console.log("  " + c.bold(c.cyan("RepoOS doctor")) + c.dim(" — " + report.project.name));
  console.log(c.dim("  " + report.project.root));
  if (report.project.fromWorktree) {
    console.log(c.dim("  (linked worktree — project-wide checks report the main checkout)"));
  }

  for (const category of DOCTOR_CATEGORIES) {
    const rows = report.findings.filter((f) => f.category === category);
    if (rows.length === 0) continue;
    console.log("");
    console.log("  " + c.bold(category));
    for (const f of rows) {
      console.log(
        "    " +
          severityColor(f.severity, ICON[f.severity]) +
          " " +
          f.title +
          c.dim("  (" + f.id + ")"),
      );
      console.log("      " + c.dim(f.detail));
    }
  }

  const s = report.summary;
  const parts = [c.green(`${s.pass} pass`)];
  if (s.warn) parts.push(c.yellow(`${s.warn} warn`));
  if (s.fail) parts.push(c.red(`${s.fail} fail`));
  console.log("");
  console.log("  " + parts.join(c.dim(" · ")));

  const fixes = doctorRemediations(report);
  if (fixes.length) {
    console.log("");
    console.log("  " + c.bold("Next steps"));
    for (const fix of fixes) console.log("    " + c.cyan("→") + " " + fix);
  }
  console.log("");
}

/** `repoos doctor [--json] [--probe <cli>] [--yes]` */
export async function cmdDoctor(argv: string[]): Promise<void> {
  const { json: asJson, yes, probe: probeCli, probeMissingValue } = parseDoctorArgs(argv);
  if (probeMissingValue) {
    console.error(c.red("  repoos doctor --probe needs a harness id, e.g. `--probe opencode`."));
    process.exitCode = 1;
    return;
  }
  if (probeCli) {
    await cmdProbe(probeCli, { asJson, yes });
    return;
  }
  try {
    const report = await runDoctor({ version: readBuildMeta().version });
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      renderDoctor(report);
    }
    if (report.summary.fail > 0) process.exitCode = 1;
  } catch (e) {
    console.error(c.red("  repoos doctor failed: ") + (e as Error).message);
    process.exitCode = 1;
  }
}

/**
 * Live adapter-contract probe (`repoos doctor --probe <cli>`). Opt-in: warns
 * that provider credentials/tokens may be spent, confirms on a TTY (or demands
 * `--yes` headless), runs every seam in an isolated temp fixture, and reports
 * the honest result. A passed probe is the evidence a maintainer records in
 * `src/core/agent-compatibility.json` (verifiedAt + verificationSource).
 */
async function cmdProbe(cli: string, opts: { asJson: boolean; yes: boolean }): Promise<void> {
  const WARNING = [
    "",
    c.yellow(c.bold("⚠ Live compatibility probe")),
    "    This runs the installed harness in an isolated temporary directory,",
    "    exercising version, help, model listing, a headless one-shot, event",
    "    parsing, permission/auto mode, session continuation, and cancellation.",
    "    It may use your provider credentials and spend tokens: the one-shot,",
    "    resume, and cancellation seams each start a real harness run. It never",
    "    reads task files, prompts, or project content, and the temporary fixture",
    "    is removed when done.",
    "",
  ].join("\n");

  if (!opts.yes) {
    if (!process.stdin.isTTY) {
      console.error(c.red("  repoos doctor --probe requires --yes when stdin is not a terminal."));
      console.error(c.dim("    repoos doctor --probe " + cli + " --yes"));
      process.exitCode = 1;
      return;
    }
    const { createInterface } = await import("node:readline");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log(WARNING);
    const answer = await new Promise<string>((resolve) => {
      rl.question(c.bold(`  Run the live ${cli} compatibility probe? [y/N] `), resolve);
    });
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log(c.dim("  Probe cancelled."));
      return;
    }
  } else if (!opts.asJson) {
    console.log(WARNING);
  }

  try {
    const result = await runAdapterContract({ cli, mode: "live" });
    if (opts.asJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("");
      console.log(
        "  " +
          c.bold(c.cyan("Adapter contract probe")) +
          c.dim(" — " + result.cli) +
          c.dim(" (" + result.binary + ")"),
      );
      for (const cap of result.capabilities) {
        const icon = cap.ok ? c.green("✔") : c.red("✗");
        console.log("    " + icon + " " + cap.label + c.dim("  (" + cap.id + ")"));
        console.log("      " + c.dim(cap.detail));
      }
      const verdict = result.passed
        ? c.green(`PASSED — ${result.capabilities.length}/${result.capabilities.length} seams`)
        : c.red(
            `FAILED — ${result.capabilities.filter((cap) => cap.ok).length}/${result.capabilities.length} seams`,
          );
      console.log("");
      console.log("  " + verdict + c.dim(`  (${Math.round(result.durationMs / 1000)}s)`));
      if (result.passed && result.evidence) {
        console.log("");
        console.log("  " + c.bold("Record evidence in the manifest"));
        console.log("    " + c.dim(result.evidence));
      }
      console.log("");
    }
    if (!result.passed) process.exitCode = 1;
  } catch (e) {
    console.error(c.red("  repoos doctor --probe failed: ") + (e as Error).message);
    process.exitCode = 1;
  }
}
