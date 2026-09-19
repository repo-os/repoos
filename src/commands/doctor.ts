/**
 * `repoos doctor [--json]` — human and machine rendering of the readiness
 * preflight built in `src/core/doctor.ts`.
 *
 * The command adds no diagnostic logic of its own: it runs the engine, prints
 * it, and sets the exit code (non-zero when any finding is a `fail`, so it is
 * usable in scripts). `--json` emits the same `DoctorReport` the UI and the
 * support bundle (#0453) consume.
 */
import { readBuildMeta } from "../core/build.js";
import {
  doctorRemediations,
  DOCTOR_CATEGORIES,
  runDoctor,
  type DoctorFinding,
  type DoctorReport,
} from "../core/doctor.js";
import { c } from "../cli/colors.js";

const ICON: Record<DoctorFinding["severity"], string> = { pass: "✔", warn: "⚠", fail: "✗" };

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

/** `repoos doctor [--json]` */
export async function cmdDoctor(argv: string[]): Promise<void> {
  const asJson = argv.includes("--json");
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
