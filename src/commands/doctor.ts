/**
 * `repoos doctor [--json] [--verbose] [--probe <cli>] [--yes]` — human and
 * machine rendering of the readiness preflight built in `src/core/doctor.ts`.
 *
 * The command adds no diagnostic logic of its own: it runs the engine, prints
 * it, and sets the exit code (non-zero when any finding is a `fail`, so it is
 * usable in scripts). The default human report collapses passing checks (see
 * `formatDoctor`); `--json` emits the unchanged, complete `DoctorReport` the UI
 * and the support bundle (#0453) consume.
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
import { termWidth, visibleWidth, wrap } from "../cli/layout.js";

const ICON: Record<DoctorFinding["severity"], string> = { pass: "✔", warn: "⚠", fail: "✗" };

export interface DoctorCliArgs {
  json: boolean;
  /** Show every check, including passing ones (default: collapse passes). */
  verbose: boolean;
  yes: boolean;
  /** Value passed to `--probe`, or null when the flag is absent. */
  probe: string | null;
  /** True when `--probe` was given without a value (or before another flag). */
  probeMissingValue: boolean;
  /** Explicit binary path for the probe — bypasses PATH resolution. */
  binary: string | null;
}

/**
 * Parse `repoos doctor`'s argument list. Kept pure and exported so the probe
 * arming rules (`--probe` needs a value; `--probe --yes` is a usage error) are
 * unit-tested rather than only exercised through a live run.
 */
export function parseDoctorArgs(argv: string[]): DoctorCliArgs {
  const json = argv.includes("--json");
  const verbose = argv.includes("--verbose");
  const yes = argv.includes("--yes");
  const binaryIdx = argv.indexOf("--binary");
  const binary = binaryIdx !== -1 ? (argv[binaryIdx + 1] ?? null) : null;
  const probeArg = argv.indexOf("--probe");
  if (probeArg === -1) {
    return { json, verbose, yes, probe: null, probeMissingValue: false, binary };
  }
  const value = argv[probeArg + 1];
  if (!value || value.startsWith("--")) {
    return { json, verbose, yes, probe: null, probeMissingValue: true, binary };
  }
  return { json, verbose, yes, probe: value, probeMissingValue: false, binary };
}

function severityColor(severity: DoctorFinding["severity"], text: string): string {
  if (severity === "pass") return c.green(text);
  if (severity === "warn") return c.yellow(text);
  return c.red(text);
}

const SEVERITY_RANK: Record<DoctorFinding["severity"], number> = { fail: 0, warn: 1, pass: 2 };

export interface DoctorRenderOptions {
  /** Show passing checks too; by default only warnings/failures are listed. */
  verbose?: boolean;
  /** Layout width (default `termWidth()`), for tests at fixed widths. */
  width?: number;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * One finding: the title line with the stable id right-aligned — or, when the
 * title leaves no room, the id on its own line so it can't push a long title
 * out — followed by the detail wrapped with a hanging indent.
 */
function formatFinding(f: DoctorFinding, width: number): string[] {
  const pre = "    " + severityColor(f.severity, ICON[f.severity]) + " ";
  const id = c.dim(f.id);
  const inner = width - visibleWidth(pre);
  const titleW = visibleWidth(f.title);
  const idW = visibleWidth(f.id);
  const out: string[] = [];
  if (titleW + 2 + idW <= inner) {
    out.push(pre + f.title + " ".repeat(inner - titleW - idW) + id);
  } else {
    out.push(...wrap(f.title, Math.max(1, inner), pre).split("\n"));
    out.push("      " + id);
  }
  out.push(...wrap(c.dim(f.detail), Math.max(1, width - 6), "      ").split("\n"));
  return out;
}

/**
 * The human `repoos doctor` report as a string. Pure (width and verbosity are
 * parameters), so tests can assert on it at fixed widths. Passing checks are
 * collapsed unless `verbose`; the summary and next steps use the serve
 * banner's warning-block shape, with failures listed first. The report ends
 * with the `--verbose` hint.
 *
 * Deviation from the "serve/status/doctor share `kv`" note: serve and status
 * are label/value listings and use `kv`, but a doctor finding is a severity
 * icon plus a right-aligned id plus a multi-line dim detail, and its summary is
 * a one-line count — neither is a two-column table. They share the underlying
 * width-aware primitive (`wrap`/`visibleWidth`) directly instead.
 */
export function formatDoctor(report: DoctorReport, opts: DoctorRenderOptions = {}): string {
  const width = opts.width ?? termWidth();
  const verbose = opts.verbose ?? false;
  const lines: string[] = [
    "",
    ...wrap(
      `${c.bold(c.cyan("RepoOS doctor"))} ${c.dim("— " + report.project.name)}`,
      Math.max(1, width - 2),
      "  ",
    ).split("\n"),
    ...wrap(c.dim(report.project.root), Math.max(1, width - 2), "  ").split("\n"),
  ];
  if (report.project.fromWorktree) {
    lines.push(
      ...wrap(
        c.dim("(linked worktree — project-wide checks report the main checkout)"),
        Math.max(1, width - 2),
        "  ",
      ).split("\n"),
    );
  }

  // Collapse passes by default so the one failure isn't buried under ~25 green
  // lines; `--verbose` restores the full checklist.
  const shown = report.findings.filter((f) => verbose || f.severity !== "pass");
  const hidden = report.findings.length - shown.length;
  for (const category of DOCTOR_CATEGORIES) {
    const rows = shown
      .filter((f) => f.category === category)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    if (rows.length === 0) continue;
    lines.push("");
    lines.push("  " + c.bold(titleCase(category)));
    for (const f of rows) lines.push(...formatFinding(f, width));
  }

  const s = report.summary;
  const parts: string[] = [];
  if (s.fail) parts.push(c.red(`${s.fail} fail`));
  if (s.warn) parts.push(c.yellow(`${s.warn} warn`));
  if (s.pass) parts.push(c.green(`${s.pass} pass`));
  const worst = s.fail ? "fail" : s.warn ? "warn" : "pass";
  const marker = worst === "fail" ? c.red("✗") : worst === "warn" ? c.yellow("▲") : c.green("✔");
  lines.push("");
  lines.push("  " + marker + " " + c.bold(parts.join(c.dim(" · "))));

  const fixes = doctorRemediations({
    ...report,
    findings: [...report.findings].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    ),
  });
  if (fixes.length) {
    lines.push("");
    lines.push("  " + c.yellow("▲") + " " + c.bold("Next steps"));
    for (const fix of fixes) {
      const wrapped = wrap(fix, Math.max(1, width - 6), "").split("\n");
      lines.push("    " + c.cyan("→") + " " + wrapped[0]);
      for (let i = 1; i < wrapped.length; i++) lines.push("      " + wrapped[i]);
    }
  }

  // Per spec, end with the pointer to `--verbose` rather than burying it above
  // the summary and next steps.
  if (hidden > 0) {
    lines.push("");
    lines.push(
      ...wrap(
        c.dim(`… ${hidden} passing check${hidden === 1 ? "" : "s"} hidden — run `) +
          c.cyan("repoos doctor --verbose") +
          c.dim(" to show every check"),
        Math.max(1, width - 2),
        "  ",
      ).split("\n"),
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderDoctor(report: DoctorReport, opts: DoctorRenderOptions = {}): void {
  console.log(formatDoctor(report, opts));
}

/** `repoos doctor [--json] [--verbose] [--probe <cli>] [--yes]` */
export async function cmdDoctor(argv: string[]): Promise<void> {
  const {
    json: asJson,
    yes,
    probe: probeCli,
    probeMissingValue,
    binary,
    verbose,
  } = parseDoctorArgs(argv);
  if (probeMissingValue) {
    console.error(c.red("  repoos doctor --probe needs a harness id, e.g. `--probe opencode`."));
    process.exitCode = 1;
    return;
  }
  if (probeCli) {
    await cmdProbe(probeCli, { asJson, yes, binary });
    return;
  }
  try {
    const report = await runDoctor({ version: readBuildMeta().version });
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      renderDoctor(report, { verbose });
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
async function cmdProbe(
  cli: string,
  opts: { asJson: boolean; yes: boolean; binary: string | null },
): Promise<void> {
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
    const result = await runAdapterContract({
      cli,
      mode: "live",
      ...(opts.binary ? { bin: opts.binary } : {}),
    });
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
