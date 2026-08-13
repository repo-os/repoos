import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  scanForTechDebt,
  createTechDebtTasks,
  isDueForScheduledRun,
  runTechDebtAgent,
  stripCommentsAndStrings,
  TechDebtError,
  type TechDebtIssue,
} from "../../server/built-in-agents.js";
import {
  loadConfig,
  loadBuiltInAgentsConfig,
  saveBuiltInAgentsConfig,
  sanitizeBuiltInAgents,
  DEFAULT_CONFIG,
} from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";

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
    Promise.resolve({ ok: true, json: () => Promise.resolve({ version: latest }) })) as unknown as typeof fetch;

const byType = (issues: TechDebtIssue[], type: TechDebtIssue["type"]) =>
  issues.filter((i) => i.type === type);

describe("stripCommentsAndStrings", () => {
  it("blanks line comments, block comments, and string literals", () => {
    const src = "// var a = 1\n/* var b = 2 */\nconst s = \"var c\";\nvar real = 1;\n";
    const cleaned = stripCommentsAndStrings(src);
    expect(cleaned).toContain("var real");
    expect(/var a/.test(cleaned)).toBe(false);
    expect(/var b/.test(cleaned)).toBe(false);
    expect(/var c/.test(cleaned)).toBe(false);
  });

  it("preserves length and newlines so line numbers map 1:1", () => {
    const src = "// comment\nx = \"str\";\nvar y = 2;\n";
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
      "src/a.ts": "export function orphan(): number { return 1; }\nexport function helper(): number { return 2; }\n",
      "src/b.ts": 'import { helper } from "./a.js";\nexport function use(): number { return helper(); }\n',
      "package.json": "{}",
    });
    const result = await scanForTechDebt(configFor(root), { fetchImpl: offlineFetch });
    const issues = byType(result.issues, "unused-code");
    expect(issues.map((i) => i.description)).toContain('Exported "orphan" is never referenced by any other file — consider removing it');
    expect(issues.map((i) => i.description)).not.toContain('Exported "helper" is never referenced by any other file — consider removing it');
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
    expect(issues.some((i) => i.description.includes("left-pad") && i.description.includes("latest is 3.0.0"))).toBe(true);
    expect(issues.some((i) => i.description.includes("alpha-pkg") && i.description.includes("beta"))).toBe(true);
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
        description: "Dependency \"left-pad\" is outdated: installed ^1.0.0, latest is 3.0.0",
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
    writeFileSync(join(root, "work", "0007-existing.md"), "---\nid: \"0007\"\n---\n");
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
