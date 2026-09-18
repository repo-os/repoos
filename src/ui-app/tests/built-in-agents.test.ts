import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  scanForTechDebt,
  createTechDebtTasks,
  isDueForScheduledRun,
  runTechDebtAgent,
  createPerformanceTasks,
  stripCommentsAndStrings,
  scanForDesignIssues,
  generateDesignReport,
  runDesignAgent,
  normalizeDesignFindingCategory,
  scanForDocsDebt,
  applyDocsDebtFixes,
  createDocsDebtTask,
  runDocsDebtAgent,
  runBuiltInAgent,
  MAX_TRIVIAL_FIXES_PER_RUN,
  TechDebtError,
  PerformanceError,
  DesignError,
  DocsDebtError,
  normalizeTechDebtIssueType,
  normalizeArchitectureIssueType,
  type TechDebtIssue,
  type PerformanceIssue,
  type DesignScanResult,
} from "../../server/built-in-agents.js";
import {
  loadConfig,
  loadBuiltInAgentsConfig,
  saveBuiltInAgentsConfig,
  sanitizeBuiltInAgents,
  DEFAULT_CONFIG,
} from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";

// The Docs Debt Agent is skill-guided now: it calls the shared runner, which
// shells out to an LLM. Mock the runner so these tests exercise the mapping
// (agent output -> findings/TrivialFixes -> task) deterministically.
vi.mock("../../server/built-in-agent-runner.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../server/built-in-agent-runner.js")>();
  return { ...actual, runSkillGuidedAgent: vi.fn() };
});

import {
  runSkillGuidedAgent,
  type SkillGuidedRunResult,
} from "../../server/built-in-agent-runner.js";

/** Build a runner result with sensible defaults for the fields a test omits. */
function runnerResult(partial: Partial<SkillGuidedRunResult>): SkillGuidedRunResult {
  return {
    ok: true,
    findings: [],
    fixes: [],
    report: "",
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

const configFor = (root: string, extra: Partial<RepoOSConfig> = {}): RepoOSConfig => ({
  root,
  ...DEFAULT_CONFIG,
  ...extra,
});

/** Create a throwaway repo root with the given files (relative paths). */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-techdebt-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const offlineFetch = (() => {
  throw new Error("network disabled in test");
}) as unknown as typeof fetch;

const latestFetch = (latest: string): typeof fetch =>
  (() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ version: latest }),
    })) as unknown as typeof fetch;

const byType = (issues: TechDebtIssue[], type: TechDebtIssue["type"]) =>
  issues.filter((i) => i.type === type);

describe("stripCommentsAndStrings", () => {
  it("blanks line comments, block comments, and string literals", () => {
    const src = '// var a = 1\n/* var b = 2 */\nconst s = "var c";\nvar real = 1;\n';
    const cleaned = stripCommentsAndStrings(src);
    expect(cleaned).toContain("var real");
    expect(/var a/.test(cleaned)).toBe(false);
    expect(/var b/.test(cleaned)).toBe(false);
    expect(/var c/.test(cleaned)).toBe(false);
  });

  it("preserves length and newlines so line numbers map 1:1", () => {
    const src = '// comment\nx = "str";\nvar y = 2;\n';
    const cleaned = stripCommentsAndStrings(src);
    expect(cleaned.length).toBe(src.length);
    expect(cleaned.split("\n").length).toBe(src.split("\n").length);
  });
});

describe("scanForTechDebt", () => {
  it("flags only real 'var' declarations, not comments or strings", async () => {
    const root = makeRepo({
      "src/a.ts": [
        "// var commented = 1;",
        'const s = "var in a string";',
        "/* var in a block */",
        "var real = 1;",
        "export const ok = real;",
      ].join("\n"),
      "package.json": "{}",
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    const issues = byType(result.issues, "deprecated-api");
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(4);
    expect(issues[0].file).toBe("src/a.ts");
  });

  it("flags files over 500 lines as high-complexity", async () => {
    const body = Array.from({ length: 520 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const root = makeRepo({ "src/big.ts": body, "package.json": "{}" });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    expect(byType(result.issues, "high-complexity").length).toBeGreaterThan(0);
  });

  it("detects identical blocks duplicated across files", async () => {
    const block = (name: string) =>
      [
        `export function ${name}(): void {`,
        "  const a = 1;",
        "  const b = 2;",
        "  const c = 3;",
        "  const d = 4;",
        "  const e = 5;",
        "  void a; void b; void c; void d; void e;",
        "}",
      ].join("\n");
    const root = makeRepo({
      "src/one.ts": block("one"),
      "src/two.ts": block("two"),
      "package.json": "{}",
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    const issues = byType(result.issues, "code-duplication");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].file).toMatch(/^src\/(one|two)\.ts$/);
  });

  it("does not flag a block that only appears in one file", async () => {
    const root = makeRepo({
      "src/only.ts": [
        "export function only(): void {",
        "  const a = 1;",
        "  const b = 2;",
        "  const c = 3;",
        "  const d = 4;",
        "  const e = 5;",
        "}",
      ].join("\n"),
      "package.json": "{}",
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    expect(byType(result.issues, "code-duplication")).toHaveLength(0);
  });

  it("flags exported symbols never referenced elsewhere as unused", async () => {
    const root = makeRepo({
      "src/a.ts":
        "export function orphan(): number { return 1; }\nexport function helper(): number { return 2; }\n",
      "src/b.ts":
        'import { helper } from "./a.js";\nexport function use(): number { return helper(); }\n',
      "package.json": "{}",
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    const issues = byType(result.issues, "unused-code");
    expect(issues.map((i) => i.description)).toContain(
      'Exported "orphan" is never referenced by any other file — consider removing it',
    );
    expect(issues.map((i) => i.description)).not.toContain(
      'Exported "helper" is never referenced by any other file — consider removing it',
    );
  });

  it("skips node_modules and dist", async () => {
    const root = makeRepo({
      "node_modules/pkg/index.ts": "var inDeps = 1;\n",
      "dist/bundle.ts": "var inDist = 1;\n",
      "src/clean.ts": "export const clean = true;\n",
      "package.json": "{}",
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    expect(result.scannedFiles).toBe(1);
    expect(result.issues.some((i) => i.file.includes("node_modules"))).toBe(false);
    expect(result.issues.some((i) => i.file.includes("dist/"))).toBe(false);
  });

  it("flags pre-release pins and registry-behind versions as outdated", async () => {
    const root = makeRepo({
      "package.json": JSON.stringify({
        dependencies: { "left-pad": "^1.0.0", "alpha-pkg": "3.0.0-beta" },
        devDependencies: {},
      }),
    });
    const result = await scanForTechDebt(configFor(root), {
      fetchImpl: latestFetch("3.0.0"),
    });
    const issues = byType(result.issues, "outdated-dependency");
    expect(
      issues.some(
        (i) => i.description.includes("left-pad") && i.description.includes("latest is 3.0.0"),
      ),
    ).toBe(true);
    expect(
      issues.some((i) => i.description.includes("alpha-pkg") && i.description.includes("beta")),
    ).toBe(true);
    expect(result.checkedDependencies).toBeGreaterThan(0);
  });

  it("survives a fully offline registry without crashing", async () => {
    const root = makeRepo({
      "package.json": JSON.stringify({ dependencies: { "left-pad": "^1.0.0" } }),
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    expect(result.checkedDependencies).toBe(0);
    expect(byType(result.issues, "outdated-dependency")).toHaveLength(0);
  });
});

describe("createTechDebtTasks", () => {
  it("creates one task per issue type with a JSON-quoted title", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    const issues: TechDebtIssue[] = [
      {
        type: "outdated-dependency",
        file: "package.json",
        description: 'Dependency "left-pad" is outdated: installed ^1.0.0, latest is 3.0.0',
        severity: "medium",
      },
      {
        type: "code-duplication",
        file: "src/one.ts",
        line: 3,
        description: "Identical 6-line block also found in `src/two.ts`:4",
        severity: "low",
      },
    ];
    const result = await createTechDebtTasks(configFor(root), issues);
    expect(result).toEqual({ created: 2, failed: 0, errors: [] });

    const files = readdirSync(join(root, "work"));
    expect(files).toHaveLength(2);
    const depTask = files.find((f) => f.includes("outdated"))!;
    const content = readFileSync(join(root, "work", depTask), "utf8");
    expect(content).toContain('title: "Update outdated dependencies"');
    expect(content).toContain('id: "0001"');
    expect(content).toContain("left-pad");
  });

  it("assigns sequential ids past existing tasks", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    writeFileSync(join(root, "work", "0007-existing.md"), '---\nid: "0007"\n---\n');
    const issues: TechDebtIssue[] = [
      {
        type: "high-complexity",
        file: "src/big.ts",
        description: "File has 900 lines of code",
        severity: "medium",
      },
    ];
    const result = await createTechDebtTasks(configFor(root), issues);
    expect(result.created).toBe(1);
    const files = readdirSync(join(root, "work"));
    expect(files.some((f) => f.startsWith("0008-"))).toBe(true);
  });

  it("throws a clear error when the work dir does not exist", async () => {
    const root = makeRepo({});
    const issues: TechDebtIssue[] = [
      { type: "deprecated-api", file: "src/a.ts", description: "uses var", severity: "low" },
    ];
    await expect(createTechDebtTasks(configFor(root), issues)).rejects.toThrow(TechDebtError);
    await expect(createTechDebtTasks(configFor(root), issues)).rejects.toThrow(/does not exist/);
  });

  it("does nothing and reports zero for an empty issue list", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    const result = await createTechDebtTasks(configFor(root), []);
    expect(result).toEqual({ created: 0, failed: 0, errors: [] });
    expect(readdirSync(join(root, "work"))).toHaveLength(0);
  });
});

describe("isDueForScheduledRun", () => {
  const now = new Date("2026-08-13T12:00:00Z");

  it("never auto-runs manual-only or disabled agents", () => {
    expect(isDueForScheduledRun(undefined, now)).toBe(false);
    expect(isDueForScheduledRun({ enabled: true, schedule: "manual" }, now)).toBe(false);
    expect(isDueForScheduledRun({ enabled: false, schedule: "daily" }, now)).toBe(false);
  });

  it("an enabled scheduled agent that never ran is due", () => {
    expect(isDueForScheduledRun({ enabled: true, schedule: "daily" }, now)).toBe(true);
    expect(isDueForScheduledRun({ enabled: true, schedule: "weekly" }, now)).toBe(true);
  });

  it("daily runs once per calendar day", () => {
    expect(
      isDueForScheduledRun(
        { enabled: true, schedule: "daily", lastRunAt: "2026-08-13T06:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isDueForScheduledRun(
        { enabled: true, schedule: "daily", lastRunAt: "2026-08-12T06:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("weekly runs once a week", () => {
    expect(
      isDueForScheduledRun(
        { enabled: true, schedule: "weekly", lastRunAt: "2026-08-11T06:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isDueForScheduledRun(
        { enabled: true, schedule: "weekly", lastRunAt: "2026-08-05T06:00:00Z" },
        now,
      ),
    ).toBe(true);
  });

  it("treats a corrupt lastRunAt as never-run", () => {
    expect(
      isDueForScheduledRun({ enabled: true, schedule: "daily", lastRunAt: "not-a-date" }, now),
    ).toBe(true);
  });
});

describe("built-in agent state persistence", () => {
  it("sanitizes incoming records, dropping invalid entries and fields", () => {
    const clean = sanitizeBuiltInAgents({
      "tech-debt": {
        enabled: true,
        schedule: "daily",
        lastRunAt: "2026-08-13T00:00:00Z",
        bogus: "dropped",
      },
      "no-schedule": { enabled: true },
      "bad-schedule": { enabled: true, schedule: "hourly" },
      "not-object": 42,
    });
    expect(clean).toEqual({
      "tech-debt": { enabled: true, schedule: "daily", lastRunAt: "2026-08-13T00:00:00Z" },
      "no-schedule": { enabled: true },
      "bad-schedule": { enabled: true },
    });
  });

  it("round-trips through the sidecar file and into loadConfig", () => {
    const root = makeRepo({});
    const state: RepoOSConfig["builtInAgents"] = {
      "tech-debt": { enabled: true, schedule: "weekly" },
    };
    saveBuiltInAgentsConfig(root, state);
    expect(loadBuiltInAgentsConfig(root)).toEqual(state);
    expect(loadConfig(root).builtInAgents).toEqual(state);
  });

  it("returns undefined when no sidecar exists and {} for a corrupt one", () => {
    const root = makeRepo({});
    expect(loadBuiltInAgentsConfig(root)).toBeUndefined();
    mkdirSync(join(root, ".repoos"), { recursive: true });
    writeFileSync(join(root, ".repoos", "built-in-agents.json"), "not json{");
    expect(loadBuiltInAgentsConfig(root)).toEqual({});
  });
});

describe("runTechDebtAgent", () => {
  it("runs the full pipeline and records lastRunAt", async () => {
    const root = makeRepo({
      "src/a.ts": "var legacy = 1;\nexport const fine = 2;\n",
      "package.json": "{}",
    });
    mkdirSync(join(root, "work"));
    const config = configFor(root);

    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        findings: [
          {
            type: "deprecated-api",
            file: "src/a.ts",
            line: 1,
            description: "File uses 'var' declarations — modernize to 'const' or 'let'",
            severity: "low",
          },
          {
            type: "unused-code",
            file: "src/a.ts",
            line: 2,
            description: "Exported 'fine' is never referenced by any other file",
            severity: "low",
          },
        ],
      }),
    );

    const result = await runTechDebtAgent(config, { fetchImpl: offlineFetch });

    expect(result.issuesFound).toBeGreaterThan(0);
    expect(result.created).toBeGreaterThan(0);
    expect(result.failed).toBe(0);

    const persisted = loadBuiltInAgentsConfig(root);
    expect(persisted?.["tech-debt"]?.lastRunAt).toBeTruthy();
    expect(config.builtInAgents?.["tech-debt"]?.lastRunAt).toBeTruthy();

    const files = readdirSync(join(root, "work"));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("normalizeTechDebtIssueType", () => {
  it("passes through canonical types unchanged", () => {
    const types = [
      "outdated-dependency",
      "code-duplication",
      "high-complexity",
      "unused-code",
      "deprecated-api",
    ] as const;
    for (const type of types) {
      expect(normalizeTechDebtIssueType(type)).toBe(type);
    }
  });

  it("buckets a non-canonical label by keyword instead of always defaulting to unused-code", () => {
    expect(normalizeTechDebtIssueType("stale-dependency")).toBe("outdated-dependency");
    expect(normalizeTechDebtIssueType("copy-paste")).toBe("code-duplication");
    expect(normalizeTechDebtIssueType("cyclomatic-complexity")).toBe("high-complexity");
    expect(normalizeTechDebtIssueType("legacy-api-usage")).toBe("deprecated-api");
    expect(normalizeTechDebtIssueType("something-weird")).toBe("unused-code");
  });
});

describe("createPerformanceTasks", () => {
  it("creates one task per issue type with a JSON-quoted title", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    const issues: PerformanceIssue[] = [
      {
        type: "blocking-operation",
        file: "src/sync.ts",
        line: 5,
        description: "Synchronous file read blocks the event loop",
        severity: "high",
      },
      {
        type: "duplicated-computation",
        file: "src/loop.ts",
        line: 10,
        description: "Expensive operation inside loop",
        severity: "medium",
      },
    ];
    const result = await createPerformanceTasks(configFor(root), issues);
    expect(result).toEqual({ created: 2, failed: 0, errors: [] });

    const files = readdirSync(join(root, "work"));
    expect(files).toHaveLength(2);
    const blockingTask = files.find((f) => f.includes("blocking"))!;
    const content = readFileSync(join(root, "work", blockingTask), "utf8");
    expect(content).toContain('title: "Fix blocking operations"');
    expect(content).toContain("created_by: performance-agent");
  });

  it("throws a clear error when the work dir does not exist", async () => {
    const root = makeRepo({});
    const issues: PerformanceIssue[] = [
      {
        type: "slow-function",
        file: "src/big.ts",
        description: "Function is too long",
        severity: "medium",
      },
    ];
    await expect(createPerformanceTasks(configFor(root), issues)).rejects.toThrow(PerformanceError);
    await expect(createPerformanceTasks(configFor(root), issues)).rejects.toThrow(/does not exist/);
  });

  it("does nothing and reports zero for an empty issue list", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    const result = await createPerformanceTasks(configFor(root), []);
    expect(result).toEqual({ created: 0, failed: 0, errors: [] });
    expect(readdirSync(join(root, "work"))).toHaveLength(0);
  });
});

describe("scanForDesignIssues (skill-guided)", () => {
  it("converts runner findings into design findings and reports the files reviewed", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        scannedFiles: 7,
        findings: [
          {
            type: "ui-bug",
            file: "src/components/Card.tsx",
            line: 12,
            description: "Card overflows its container on narrow viewports",
            evidence: "Fixed widths break the layout at small sizes",
            recommendation: "Use a responsive grid",
            severity: "medium",
          },
          {
            type: "something-weird",
            file: "src/components/Card.tsx",
            description: "Inconsistent spacing between cards",
            severity: "low",
          },
        ],
      }),
    );

    const result = await scanForDesignIssues(configFor(root));

    expect(runSkillGuidedAgent).toHaveBeenCalledOnce();
    const [agentName, , skillDoc] = vi.mocked(runSkillGuidedAgent).mock.calls[0];
    expect(agentName).toBe("design");
    expect(skillDoc).toContain("UI/UX design review");
    expect(result.scannedFiles).toBe(7);
    expect(result.noUiDetected).toBe(false);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({
      category: "ui-bug",
      file: "src/components/Card.tsx",
      line: 12,
      rationale: "Fixed widths break the layout at small sizes",
    });
    expect(result.findings[1].category).toBe("design-recommendation");
  });

  it("normalizes free-form model categories into real buckets", () => {
    expect(normalizeDesignFindingCategory("ui-bug")).toBe("ui-bug");
    expect(normalizeDesignFindingCategory("accessibility-issue")).toBe("ux-friction");
    expect(normalizeDesignFindingCategory("keyboard-trap")).toBe("ux-friction");
    expect(normalizeDesignFindingCategory("layout-overflow")).toBe("ui-bug");
    expect(normalizeDesignFindingCategory("polish")).toBe("design-recommendation");
  });

  it("reports 'no web UI detected' clearly instead of a silent zero", async () => {
    const root = makeRepo({ "src/cli.ts": "export const a = 1;" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        scannedFiles: 3,
        findings: [
          {
            type: "no-ui-detected",
            description: "No front-end framework dependency and no HTML/CSS sources",
            severity: "low",
          },
        ],
      }),
    );

    const result = await scanForDesignIssues(configFor(root));

    expect(result.noUiDetected).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.scannedFiles).toBe(3);
    expect(result.insights.join(" ")).toMatch(/No web UI detected/);
  });

  it("throws a named DesignError when the model run fails", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({ ok: false, error: "connector quota exceeded" }),
    );

    await expect(scanForDesignIssues(configFor(root))).rejects.toThrow(DesignError);
    await expect(scanForDesignIssues(configFor(root))).rejects.toThrow(/quota/i);
  });

  it("caps findings per category so a verbose model run can't flood the report", async () => {
    // Regression: the old deterministic scan capped findings per category at
    // 8; the skill-guided migration dropped that guardrail, so a rambling
    // model could return an unbounded number of findings straight into the
    // report and the created task.
    const root = makeRepo({ "package.json": "{}" });
    const manyUiBugs = Array.from({ length: 40 }, (_, i) => ({
      type: "ui-bug",
      file: `src/components/Card${i}.tsx`,
      description: `Issue number ${i}`,
      severity: "low" as const,
    }));
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({ scannedFiles: 40, findings: manyUiBugs }),
    );

    const result = await scanForDesignIssues(configFor(root));

    expect(result.findings).toHaveLength(25);
    expect(result.findings.every((f) => f.category === "ui-bug")).toBe(true);
  });
});

describe("generateDesignReport", () => {
  it("writes a timestamped markdown report with the Design_report_YYYY-MM-DD-HHMM name", async () => {
    const root = makeRepo({});
    const scan: DesignScanResult = {
      scannedFiles: 5,
      insights: ["Reviewed the repository for web UI sources; 5 files were included."],
      findings: [
        {
          category: "ui-bug",
          file: "src/components/Card.tsx",
          line: 12,
          description: "Card overflows its container",
          rationale: "Fixed widths break narrow layouts",
          recommendation: "Use a responsive grid",
          severity: "medium",
        },
      ],
    };
    const { reportPath, fileName } = await generateDesignReport(configFor(root), scan);
    expect(fileName).toMatch(/^Design_report_\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
    expect(reportPath).toContain(join("docs", "agents", "Design"));
    const content = readFileSync(reportPath, "utf8");
    expect(content).toContain("# UI/UX Design Review Report");
    expect(content).toContain("UI Bugs");
    expect(content).toContain("Card overflows its container");
  });

  it("produces a readable report with no findings when the UI is clean", async () => {
    const root = makeRepo({});
    const scan: DesignScanResult = { scannedFiles: 9, insights: [], findings: [] };
    const { reportPath } = await generateDesignReport(configFor(root), scan);
    const content = readFileSync(reportPath, "utf8");
    expect(content).toContain("No significant UI/UX issues detected");
    expect(content).toContain("Web UI Detected**: Yes");
  });

  it("says plainly when no web UI was detected", async () => {
    const root = makeRepo({});
    const scan: DesignScanResult = {
      scannedFiles: 3,
      insights: ["No web UI detected in this repository"],
      findings: [],
      noUiDetected: true,
    };
    const { reportPath } = await generateDesignReport(configFor(root), scan);
    const content = readFileSync(reportPath, "utf8");
    expect(content).toContain("No web UI detected in this repository");
    expect(content).toContain("Web UI Detected**: No");
    expect(content).not.toContain("No significant UI/UX issues detected");
  });
});

describe("runDesignAgent", () => {
  it("runs the pipeline, writes the report, and records lastRunAt", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        scannedFiles: 4,
        findings: [
          {
            type: "ux-friction",
            file: "src/App.tsx",
            line: 3,
            description: "Icon-only button has no accessible name",
            evidence: "Screen readers announce nothing",
            recommendation: "Add aria-label",
            severity: "medium",
          },
        ],
      }),
    );

    const config = configFor(root, { builtInAgents: { design: { enabled: true } } });
    const result = await runDesignAgent(config);

    expect(result.findingsFound).toBe(1);
    expect(result.scannedFiles).toBe(4);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(0);

    expect(result.fileName).toMatch(/^Design_report_\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
    expect(readFileSync(result.reportPath, "utf8")).toContain("UX Friction");

    const persisted = loadBuiltInAgentsConfig(root);
    expect(persisted?.["design"]?.lastRunAt).toBeTruthy();
    expect(config.builtInAgents?.["design"]?.lastRunAt).toBeTruthy();
  });
});

describe("scanForDocsDebt", () => {
  it("maps an agent finding into a needs-human finding with its claim and evidence", async () => {
    const root = makeRepo({ "docs/guide.md": "# Guide\n" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        findings: [
          {
            type: "missing-symbol",
            file: "docs/guide.md",
            line: 7,
            description: "`ensureFreshBuild()` no longer exists",
            claim: "ensureFreshBuild()",
            evidence: "no declaration or reference to it exists in the repo",
            severity: "medium",
            recommendation: "Remove or replace the stale reference.",
          },
        ],
      }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.error).toBeUndefined();
    expect(result.needsHuman).toHaveLength(1);
    expect(result.needsHuman[0]).toMatchObject({
      kind: "missing-symbol",
      doc: "docs/guide.md",
      line: 7,
      claim: "ensureFreshBuild()",
      evidence: "no declaration or reference to it exists in the repo",
      severity: "medium",
    });
  });

  it("accepts a proposed fix only after it clears the deterministic auto-fix gate", async () => {
    const root = makeRepo({
      "docs/guide.md": "See src/old/util.ts for helpers.\n",
      "src/new/util.ts": "export const util = 1;\n",
    });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        fixes: [
          {
            doc: "docs/guide.md",
            oldText: "src/old/util.ts",
            newText: "src/new/util.ts",
            evidence: "file was renamed",
          },
        ],
      }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.trivialFixes).toHaveLength(1);
    expect(result.trivialFixes[0]).toMatchObject({
      kind: "renamed-path",
      doc: "docs/guide.md",
      from: "src/old/util.ts",
      to: "src/new/util.ts",
    });
    expect(result.needsHuman).toHaveLength(0);
  });

  it("downgrades a fix whose replacement the repo does not contain to a finding", async () => {
    const root = makeRepo({ "docs/guide.md": "See src/old/util.ts for helpers.\n" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        fixes: [
          {
            doc: "docs/guide.md",
            oldText: "src/old/util.ts",
            newText: "src/invented/nothing.ts",
            evidence: "a guess",
          },
        ],
      }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.trivialFixes).toHaveLength(0);
    expect(result.needsHuman).toHaveLength(1);
    expect(result.needsHuman[0].evidence).toContain("auto-fix");
  });

  it("downgrades a fix whose old text is not in the doc (stale claim)", async () => {
    const root = makeRepo({
      "docs/guide.md": "Nothing stale here.\n",
      "src/new/util.ts": "export const util = 1;\n",
    });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        fixes: [
          {
            doc: "docs/guide.md",
            oldText: "src/old/util.ts",
            newText: "src/new/util.ts",
            evidence: "renamed",
          },
        ],
      }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.trivialFixes).toHaveLength(0);
    expect(result.needsHuman).toHaveLength(1);
  });

  it("never treats a non-doc path as an auto-fix target, even when the gate would pass", async () => {
    const root = makeRepo({
      "package.json": '{"note":"oldDep"}\n',
      "src/new/dep.ts": "export const newDep = 1;\n",
    });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        fixes: [
          {
            doc: "package.json",
            oldText: "oldDep",
            newText: "src/new/dep.ts",
            evidence: "a guess",
          },
        ],
      }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.trivialFixes).toHaveLength(0);
    expect(result.needsHuman).toHaveLength(1);
  });

  it("downgrades a fix whose old text appears more than once in the doc", async () => {
    const root = makeRepo({
      "docs/guide.md": "See src/old/util.ts and src/old/util.ts again.\n",
      "src/new/util.ts": "export const util = 1;\n",
    });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        fixes: [
          {
            doc: "docs/guide.md",
            oldText: "src/old/util.ts",
            newText: "src/new/util.ts",
            evidence: "renamed",
          },
        ],
      }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.trivialFixes).toHaveLength(0);
    expect(result.needsHuman).toHaveLength(1);
  });

  it("surfaces a runner failure instead of pretending the docs are clean", async () => {
    const root = makeRepo({ "AGENTS.md": "# Docs\n" });
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({ ok: false, error: `Built-in agent "docs-debt": run failed — quota exceeded` }),
    );

    const result = await scanForDocsDebt(configFor(root));

    expect(result.error).toContain("quota exceeded");
    expect(result.needsHuman).toHaveLength(0);
    expect(result.trivialFixes).toHaveLength(0);
  });

  it("ships a skill doc that generalizes past this repo's layout and third-party vocabulary", () => {
    const skillPath = join(process.cwd(), "docs/agents/skills/docs-debt.md");
    expect(existsSync(skillPath)).toBe(true);
    const doc = readFileSync(skillPath, "utf8");
    expect(doc).toMatch(/third-party/i);
    expect(doc).toMatch(/source|layout|assume/i);
  });
});

describe("createDocsDebtTask", () => {
  it("bundles every needs-human finding into exactly one task", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    const result = await createDocsDebtTask(configFor(root), [
      {
        kind: "missing-symbol",
        doc: "docs/a.md",
        line: 4,
        claim: "scanForGhost",
        evidence: "not declared under src/",
        severity: "medium",
      },
      {
        kind: "false-constraint",
        doc: "AGENTS.md",
        line: 9,
        claim: "zero runtime dependencies",
        evidence: "package.json declares 1: mermaid",
        severity: "high",
      },
      {
        kind: "missing-path",
        doc: "docs/b.md",
        line: 2,
        claim: "src/gone.ts",
        evidence: "does not exist",
        severity: "medium",
      },
    ]);
    expect(result).toEqual({ created: 1, failed: 0, errors: [], taskId: "0001" });

    const files = readdirSync(join(root, "work"));
    expect(files).toHaveLength(1);
    const content = readFileSync(join(root, "work", files[0]), "utf8");
    expect(content).toContain("docs-debt");
    expect(content).toContain("created_by: docs-debt-agent");
    expect(content).toContain("scanForGhost");
    expect(content).toContain("zero runtime dependencies");
    expect(content).toContain("src/gone.ts");
  });

  it("creates no task for zero findings", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    const result = await createDocsDebtTask(configFor(root), []);
    expect(result).toEqual({ created: 0, failed: 0, errors: [], taskId: null });
    expect(readdirSync(join(root, "work"))).toHaveLength(0);
  });

  it("renders a finding with no file path without a malformed doc line", async () => {
    const root = makeRepo({});
    mkdirSync(join(root, "work"));
    await createDocsDebtTask(configFor(root), [
      {
        kind: "missing-symbol",
        doc: "",
        line: 1,
        claim: "ghost",
        evidence: "not declared anywhere",
        severity: "low",
      },
    ]);
    const files = readdirSync(join(root, "work"));
    const content = readFileSync(join(root, "work", files[0]), "utf8");
    expect(content).toContain("not specified");
    expect(content).not.toContain("``:1");
  });

  it("throws a clear error when the work dir does not exist", async () => {
    const root = makeRepo({});
    await expect(
      createDocsDebtTask(configFor(root), [
        {
          kind: "missing-path",
          doc: "docs/a.md",
          line: 1,
          claim: "src/gone.ts",
          evidence: "missing",
          severity: "medium",
        },
      ]),
    ).rejects.toThrow(DocsDebtError);
    await expect(
      createDocsDebtTask(configFor(root), [
        {
          kind: "missing-path",
          doc: "docs/a.md",
          line: 1,
          claim: "src/gone.ts",
          evidence: "missing",
          severity: "medium",
        },
      ]),
    ).rejects.toThrow(/does not exist/);
  });
});

describe("applyDocsDebtFixes", () => {
  it("replaces the stale text and records the applied change", async () => {
    const root = makeRepo({
      "docs/guide.md": "See src/old/util.ts for helpers.\n",
      "src/new/util.ts": "export const util = 1;\n",
    });
    const result = await applyDocsDebtFixes(configFor(root), [
      {
        kind: "renamed-path",
        doc: "docs/guide.md",
        line: 1,
        from: "src/old/util.ts",
        to: "src/new/util.ts",
        evidence: "file was renamed",
      },
    ]);
    expect(result).toMatchObject({ applied: 1, skipped: 0 });
    expect(result.fixed).toEqual([
      { doc: "docs/guide.md", from: "src/old/util.ts", to: "src/new/util.ts" },
    ]);
    expect(readFileSync(join(root, "docs/guide.md"), "utf8")).toContain("src/new/util.ts");
  });

  it("refuses an ungated fix even when called directly", async () => {
    const root = makeRepo({ "docs/guide.md": "See src/old/util.ts for helpers.\n" });
    const result = await applyDocsDebtFixes(configFor(root), [
      {
        kind: "renamed-path",
        doc: "docs/guide.md",
        line: 1,
        from: "src/old/util.ts",
        to: "src/invented/nothing.ts",
        evidence: "a guess",
      },
    ]);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(readFileSync(join(root, "docs/guide.md"), "utf8")).toContain("src/old/util.ts");
  });

  it("refuses a fix targeting a non-doc file", async () => {
    const root = makeRepo({
      "package.json": '{"note":"oldDep"}\n',
      "src/new/dep.ts": "export const newDep = 1;\n",
    });
    const result = await applyDocsDebtFixes(configFor(root), [
      {
        kind: "renamed-path",
        doc: "package.json",
        line: 1,
        from: "oldDep",
        to: "src/new/dep.ts",
        evidence: "a guess",
      },
    ]);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain("oldDep");
  });

  it("caps how many fixes land in one run and reports the rest as skipped", async () => {
    const files: Record<string, string> = {};
    const total = MAX_TRIVIAL_FIXES_PER_RUN + 2;
    const fixes = [];
    for (let i = 0; i < total; i++) {
      files[`docs/d${i}.md`] = `See src/old/a${i}.ts.\n`;
      files[`src/new/a${i}.ts`] = "export const x = 1;\n";
      fixes.push({
        kind: "renamed-path" as const,
        doc: `docs/d${i}.md`,
        line: 1,
        from: `src/old/a${i}.ts`,
        to: `src/new/a${i}.ts`,
        evidence: "file was renamed",
      });
    }
    const root = makeRepo(files);

    const result = await applyDocsDebtFixes(configFor(root), fixes);

    expect(result.applied).toBe(MAX_TRIVIAL_FIXES_PER_RUN);
    expect(result.skipped).toBe(total - MAX_TRIVIAL_FIXES_PER_RUN);
    expect(result.fixed).toHaveLength(MAX_TRIVIAL_FIXES_PER_RUN);

    const updated = Object.keys(files)
      .filter((f) => f.startsWith("docs/"))
      .filter((f) => readFileSync(join(root, f), "utf8").includes("src/new/"));
    expect(updated).toHaveLength(MAX_TRIVIAL_FIXES_PER_RUN);
  });
});

describe("runDocsDebtAgent", () => {
  it("applies gated fixes, files one task, and exposes taskId + autoFixed", async () => {
    const root = makeRepo({
      "docs/guide.md": "See src/old/util.ts for helpers.\n",
      "src/new/util.ts": "export const util = 1;\n",
    });
    mkdirSync(join(root, "work"));
    const config = configFor(root);

    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({
        findings: [
          {
            type: "missing-symbol",
            file: "docs/guide.md",
            line: 2,
            description: "`ghost()` is gone",
            claim: "ghost()",
            evidence: "not declared anywhere in the repo",
            severity: "medium",
          },
        ],
        fixes: [
          {
            doc: "docs/guide.md",
            oldText: "src/old/util.ts",
            newText: "src/new/util.ts",
            evidence: "file was renamed",
          },
        ],
      }),
    );

    const result = await runDocsDebtAgent(config);

    expect(result.trivialFixesApplied).toBe(1);
    expect(result.findingsFound).toBe(1);
    expect(result.taskCreated).toBe(1);
    expect(result.taskId).toBe("0001");
    expect(result.autoFixed).toEqual([
      { doc: "docs/guide.md", from: "src/old/util.ts", to: "src/new/util.ts" },
    ]);
    expect(result.failed).toBe(0);

    const files = readdirSync(join(root, "work"));
    expect(files).toHaveLength(1);
    expect(readFileSync(join(root, "work", files[0]), "utf8")).toContain("ghost()");

    expect(readFileSync(join(root, "docs/guide.md"), "utf8")).toContain("src/new/util.ts");
    const persisted = loadBuiltInAgentsConfig(root);
    expect(persisted?.["docs-debt"]?.lastRunAt).toBeTruthy();
    expect(config.builtInAgents?.["docs-debt"]?.lastRunAt).toBeTruthy();
  });

  it("applies the per-run cap and downgrades the overflow into the task", async () => {
    const files: Record<string, string> = {};
    const total = MAX_TRIVIAL_FIXES_PER_RUN + 2;
    const fixes = [];
    for (let i = 0; i < total; i++) {
      files[`docs/d${i}.md`] = `See src/old/a${i}.ts.\n`;
      files[`src/new/a${i}.ts`] = "export const x = 1;\n";
      fixes.push({
        doc: `docs/d${i}.md`,
        oldText: `src/old/a${i}.ts`,
        newText: `src/new/a${i}.ts`,
        evidence: "file was renamed",
      });
    }
    const root = makeRepo(files);
    mkdirSync(join(root, "work"));

    vi.mocked(runSkillGuidedAgent).mockResolvedValue(runnerResult({ fixes }));

    const result = await runDocsDebtAgent(configFor(root));

    expect(result.trivialFixesApplied).toBe(MAX_TRIVIAL_FIXES_PER_RUN);
    expect(result.findingsFound).toBe(total - MAX_TRIVIAL_FIXES_PER_RUN);
    expect(result.autoFixed).toHaveLength(MAX_TRIVIAL_FIXES_PER_RUN);
    expect(result.taskCreated).toBe(1);
  });

  it("creates no task when the run finds nothing needing a human", async () => {
    const root = makeRepo({
      "package.json": "{}",
      "AGENTS.md": "# Docs\n\nEverything here is true.\n",
    });
    mkdirSync(join(root, "work"));
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(runnerResult({}));

    const result = await runDocsDebtAgent(configFor(root));

    expect(result.findingsFound).toBe(0);
    expect(result.taskCreated).toBe(0);
    expect(result.taskId).toBeNull();
    expect(result.autoFixed).toEqual([]);
    expect(readdirSync(join(root, "work"))).toHaveLength(0);
  });

  it("is reachable through the runBuiltInAgent dispatcher", async () => {
    const root = makeRepo({ "AGENTS.md": "# Docs\n" });
    mkdirSync(join(root, "work"));
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(runnerResult({}));

    const result = await runBuiltInAgent("docs-debt", configFor(root));

    expect(result).not.toBeNull();
    expect(result && "scannedDocs" in result ? result.scannedDocs : -1).toBe(1);
  });

  it("surfaces a failed agent run instead of reporting clean docs", async () => {
    const root = makeRepo({ "AGENTS.md": "# Docs\n" });
    mkdirSync(join(root, "work"));
    vi.mocked(runSkillGuidedAgent).mockResolvedValue(
      runnerResult({ ok: false, error: `Built-in agent "docs-debt": run failed — quota exceeded` }),
    );

    const result = await runDocsDebtAgent(configFor(root));

    expect(result.error).toContain("quota exceeded");
    expect(result.taskCreated).toBe(0);
    expect(result.findingsFound).toBe(0);
  });
});

describe("normalizeArchitectureIssueType", () => {
  it("passes through canonical types unchanged", () => {
    const types = [
      "layer-violation",
      "tight-coupling",
      "missing-abstraction",
      "over-engineering",
      "scalability-risk",
    ] as const;
    for (const type of types) {
      expect(normalizeArchitectureIssueType(type)).toBe(type);
    }
  });

  it("buckets over-abstraction as over-engineering, not missing-abstraction", () => {
    // Regression: "over-abstraction" contains the substring "abstraction",
    // which used to match missing-abstraction's keyword check before
    // over-engineering's own check ever ran, misfiling it into the opposite
    // category.
    expect(normalizeArchitectureIssueType("over-abstraction")).toBe("over-engineering");
    expect(normalizeArchitectureIssueType("over abstraction")).toBe("over-engineering");
  });

  it("still buckets plain abstraction gaps as missing-abstraction", () => {
    expect(normalizeArchitectureIssueType("no-abstraction-for-shared-logic")).toBe(
      "missing-abstraction",
    );
    expect(normalizeArchitectureIssueType("duplicated-logic")).toBe("missing-abstraction");
  });

  it("falls back to scalability-risk for an unrecognized label", () => {
    expect(normalizeArchitectureIssueType("something-weird")).toBe("scalability-risk");
  });
});
