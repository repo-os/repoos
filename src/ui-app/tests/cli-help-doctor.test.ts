/**
 * `repoos help` / `repoos doctor` layout (#0591). Every printed line must stay
 * within the terminal width at 60, 80 and 140 columns — no hanging indent may
 * be broken by the terminal's own wrap — and doctor must collapse passing
 * checks unless `--verbose`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { commandUsage, printCommandHelp, renderHelp } from "../../cli/help.js";
import { visibleWidth } from "../../cli/layout.js";
import { formatDoctor } from "../../commands/doctor.js";
import type { DoctorReport } from "../../core/doctor.js";

const WIDTHS = [60, 80, 140];
const LONG_DETAIL =
  "A deliberately long explanation that must wrap under its own check title rather than " +
  "spilling back to column zero and breaking the hanging indent of the report.";

const report: DoctorReport = {
  schemaVersion: 1,
  generatedAt: "2026-09-30T00:00:00Z",
  project: {
    root: "/tmp/a/very/long/project/root/path/that/will/definitely/need/to/wrap/at/wide/but/sixty",
    name: "demo-project",
    fromWorktree: false,
  },
  tool: { name: "repoos", version: "1.2.3" },
  summary: { pass: 2, warn: 1, fail: 1, total: 4 },
  findings: [
    {
      id: "identity.project-root",
      category: "identity",
      severity: "pass",
      title: "Project root resolves",
      detail: "The root was found and looks healthy. " + LONG_DETAIL,
      remediation: null,
    },
    {
      id: "config.toml-syntax",
      category: "config",
      severity: "fail",
      title: "repoos.toml has a syntax error",
      detail: "The TOML could not be parsed. " + LONG_DETAIL,
      remediation: "Fix the syntax error in repoos.toml, then re-run `repoos doctor`.",
    },
    {
      id: "runtime.check-tools",
      category: "runtime",
      severity: "warn",
      title: "Check tools incomplete",
      detail: "Some check tools are missing. " + LONG_DETAIL,
      remediation: "Install bun from https://bun.sh so every check step can run.",
    },
    {
      id: "gate.plan",
      category: "gate",
      severity: "pass",
      title: "Check plan configured",
      detail: "A meaningful plan is declared. " + LONG_DETAIL,
      remediation: null,
    },
  ],
};

function maxWidth(s: string): number {
  return Math.max(...s.split("\n").map(visibleWidth));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderHelp", () => {
  it("stays within the width at 60, 80 and 140", () => {
    for (const width of WIDTHS) {
      expect(maxWidth(renderHelp(width))).toBeLessThanOrEqual(width);
    }
  });

  it("groups commands under headings with the command name only in the left column", () => {
    const out = renderHelp(140);
    for (const heading of ["Setup", "Tasks", "Health", "Server"]) {
      expect(out).toContain(heading);
    }
    // The full usage now lives behind `repoos <cmd> --help`, not in the table.
    expect(out).not.toContain("doctor [--json] [--verbose]");
    expect(out).not.toContain("check [--profile");
    expect(out).toContain("repoos <command> --help");
  });

  it("prints flags on a dim line under the description", () => {
    const out = renderHelp(140);
    expect(out).toContain("--json · --verbose · --probe <cli>");
  });
});

describe("commandUsage / printCommandHelp", () => {
  it("returns the full usage line for a known command", () => {
    expect(commandUsage("doctor")).toBe(
      "doctor [--json] [--verbose] [--probe <cli>] [--binary <path>]",
    );
    expect(commandUsage("nope")).toBeNull();
  });

  it("prints the usage, description and flags", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    expect(printCommandHelp("doctor", 80)).toBe(true);
    const out = lines.join("\n");
    expect(out).toContain("repoos doctor [--json] [--verbose]");
    expect(out).toContain("Readiness preflight");
    expect(out).toContain("flags:");
    expect(maxWidth(out)).toBeLessThanOrEqual(80);
  });
});

describe("formatDoctor", () => {
  it("stays within the width at 60, 80 and 140", () => {
    for (const width of WIDTHS) {
      expect(maxWidth(formatDoctor(report, { width }))).toBeLessThanOrEqual(width);
    }
  });

  it("collapses passing checks by default and points at --verbose", () => {
    const out = formatDoctor(report, { width: 80 });
    expect(out).toContain("repoos.toml has a syntax error");
    expect(out).toContain("Check tools incomplete");
    expect(out).not.toContain("Project root resolves");
    expect(out).not.toContain("Check plan configured");
    expect(out).toContain("2 passing checks hidden");
    expect(out).toContain("repoos doctor --verbose");
  });

  it("shows every check with verbose and drops the hidden hint", () => {
    const out = formatDoctor(report, { width: 80, verbose: true });
    expect(out).toContain("Project root resolves");
    expect(out).toContain("Check plan configured");
    expect(out).not.toContain("passing check");
  });

  it("lists failures before warnings in the next steps", () => {
    const out = formatDoctor(report, { width: 80 });
    const failAt = out.indexOf("Fix the syntax error");
    const warnAt = out.indexOf("Install bun");
    expect(failAt).toBeGreaterThan(-1);
    expect(warnAt).toBeGreaterThan(-1);
    expect(failAt).toBeLessThan(warnAt);
  });

  it("keeps the check id on the detail line when a title is very long", () => {
    const narrow = formatDoctor(report, { width: 60 });
    // The failure title is long; its id must still appear, and on no line may
    // the text spill past the width.
    expect(narrow).toContain("config.toml-syntax");
    expect(maxWidth(narrow)).toBeLessThanOrEqual(60);
  });
});
