import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

// The Performance Agent now runs through the shared skill-guided runner, which
// shells out to a configured CLI via `runPrompt`. Mock the agent layer so tests
// never spawn a process; `extractOneShotReportText` returns the raw JSON the
// fake model "printed".
vi.mock("../../server/agents.js", () => ({
  runPrompt: vi.fn(),
  recordOneShotSession: vi.fn(),
  extractOneShotReportText: vi.fn((_cli: string, raw: string) => raw),
}));

vi.mock("../../core/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/config.js")>();
  return {
    ...actual,
    saveBuiltInAgentsConfig: vi.fn(),
  };
});

import {
  runPerformanceAgent,
  normalizePerformanceIssueType,
  PerformanceError,
} from "../../server/built-in-agents.js";
import { runPrompt } from "../../server/agents.js";

const configFor = (root: string, extra: Partial<RepoOSConfig> = {}): RepoOSConfig => ({
  root,
  ...DEFAULT_CONFIG,
  ...extra,
  builtInAgents:
    extra.builtInAgents !== undefined ? extra.builtInAgents : { performance: { enabled: true } },
});

/** Create a throwaway repo root with the given files (relative paths). */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-perf-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  mkdirSync(join(root, "work"), { recursive: true });
  return root;
}

const mockModelFindings = (findings: unknown[], fixes: unknown[] = []): void => {
  vi.mocked(runPrompt).mockResolvedValue({
    ok: true,
    output: JSON.stringify({ findings, fixes }),
    elapsedMs: 42,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizePerformanceIssueType", () => {
  it("passes the four canonical types through untouched", () => {
    for (const type of [
      "slow-function",
      "blocking-operation",
      "unbounded-growth",
      "duplicated-computation",
    ] as const) {
      expect(normalizePerformanceIssueType(type)).toBe(type);
    }
  });

  it("maps free-form model labels into a real bucket", () => {
    expect(normalizePerformanceIssueType("memory-leak")).toBe("unbounded-growth");
    expect(normalizePerformanceIssueType("nested-loops")).toBe("blocking-operation");
    expect(normalizePerformanceIssueType("redundant-work")).toBe("duplicated-computation");
    expect(normalizePerformanceIssueType("something-weird")).toBe("slow-function");
  });
});

describe("runPerformanceAgent (skill-guided)", () => {
  it("invokes the shared runner with the performance skill doc", async () => {
    const root = makeRepo({ "package.json": "{}" });
    mockModelFindings([]);

    await runPerformanceAgent(configFor(root));

    expect(runPrompt).toHaveBeenCalledOnce();
    const [agent, prompt] = vi.mocked(runPrompt).mock.calls[0];
    expect(agent).toMatchObject({ name: "performance" });
    expect(prompt).toContain("Performance review");
    expect(prompt).toContain("blocking-operation");
  });

  it("produces findings for a non-JS/TS project instead of scanning zero files", async () => {
    const root = makeRepo({
      "src/report.py":
        "def render(rows):\n    for row in rows:\n        for cell in row:\n            json.loads(cell)\n",
      "src/cache.py": "CACHE = {}\n",
      "pyproject.toml": '[project]\nname = "demo"\n',
    });
    mockModelFindings([
      {
        type: "blocking-operation",
        file: "src/report.py",
        line: 3,
        description: "Parses JSON inside a nested loop on the request path",
        severity: "high",
      },
      {
        type: "unbounded-growth",
        file: "src/cache.py",
        description: "CACHE is appended to but never evicted",
        severity: "medium",
      },
    ]);

    const result = await runPerformanceAgent(configFor(root));

    expect(result.issuesFound).toBe(2);
    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.scannedFiles).toBeGreaterThan(0);

    const tasks = readdirSync(join(root, "work"));
    expect(tasks).toHaveLength(2);
    const pythonTask = tasks.find((f) => f.includes("blocking"))!;
    expect(readFileSync(join(root, "work", pythonTask), "utf8")).toContain("src/report.py");
  });

  it("deduplicates findings into one inbox task per issue type", async () => {
    const root = makeRepo({ "src/app.go": "package main\n" });
    mockModelFindings([
      { type: "blocking-operation", file: "a.go", description: "sync I/O", severity: "high" },
      {
        type: "blocking-operation",
        file: "b.go",
        description: "mutex contention",
        severity: "low",
      },
      {
        type: "duplicated-computation",
        file: "c.go",
        description: "recompute",
        severity: "medium",
      },
    ]);

    const result = await runPerformanceAgent(configFor(root));

    expect(result.issuesFound).toBe(3);
    expect(result.created).toBe(2);
    const blockingTask = readdirSync(join(root, "work")).find((f) => f.includes("blocking"))!;
    const body = readFileSync(join(root, "work", blockingTask), "utf8");
    expect(body).toContain("sync I/O");
    expect(body).toContain("mutex contention");
  });

  it("records lastRunAt on completion", async () => {
    const root = makeRepo({ "package.json": "{}" });
    mockModelFindings([]);
    const config = configFor(root);

    await runPerformanceAgent(config);

    expect(config.builtInAgents?.performance?.lastRunAt).toBeTruthy();
  });

  it("throws a named PerformanceError when the model run fails", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runPrompt).mockResolvedValue({
      ok: false,
      error: "You have exceeded your monthly quota",
    });

    await expect(runPerformanceAgent(configFor(root))).rejects.toThrow(PerformanceError);
    await expect(runPerformanceAgent(configFor(root))).rejects.toThrow(/performance.*quota/i);
  });

  it("throws when the agent output is not valid JSON", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "no json here" });

    await expect(runPerformanceAgent(configFor(root))).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the performance agent has no saved config", async () => {
    const root = makeRepo({ "package.json": "{}" });
    const config = configFor(root, { builtInAgents: {} });

    await expect(runPerformanceAgent(config)).rejects.toThrow(/No built-in agent config/);
  });
});
