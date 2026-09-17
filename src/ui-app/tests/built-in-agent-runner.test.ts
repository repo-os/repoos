import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

// Mock runPrompt and recordOneShotSession before importing the module under test
vi.mock("../../server/agents.js", () => ({
  runPrompt: vi.fn(),
  recordOneShotSession: vi.fn(),
  extractOneShotReportText: vi.fn((_cli: string, raw: string) => raw),
}));

// Mock saveBuiltInAgentsConfig
vi.mock("../../core/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/config.js")>();
  return {
    ...actual,
    saveBuiltInAgentsConfig: vi.fn(),
  };
});

import {
  runSkillGuidedAgent,
  gatherRepoContext,
  saveLastRunAt,
} from "../../server/built-in-agent-runner.js";
import { runPrompt, recordOneShotSession } from "../../server/agents.js";
import { saveBuiltInAgentsConfig } from "../../core/config.js";

const configFor = (root: string, extra: Partial<RepoOSConfig> = {}): RepoOSConfig => ({
  root,
  ...DEFAULT_CONFIG,
  ...extra,
});

/** Create a throwaway repo root with the given files (relative paths). */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-runner-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gatherRepoContext", () => {
  it("includes top-level directory structure", () => {
    const root = makeRepo({
      "package.json": '{"name": "test"}',
      "src/index.ts": "export const x = 1;",
    });
    const ctx = gatherRepoContext(root);
    expect(ctx).toContain("Top-level structure");
    expect(ctx).toContain("src");
    expect(ctx).toContain("package.json");
  });

  it("includes package.json summary", () => {
    const root = makeRepo({
      "package.json": '{"name": "my-app", "scripts": {"build": "tsc"}}',
    });
    const ctx = gatherRepoContext(root);
    expect(ctx).toContain("package.json");
    expect(ctx).toContain("my-app");
    expect(ctx).toContain("build");
  });
});

describe("runSkillGuidedAgent", () => {
  it("returns error when no built-in agent config exists", async () => {
    const root = makeRepo({});
    const config = configFor(root, { builtInAgents: {} });
    const result = await runSkillGuidedAgent("tech-debt", config, "You are the tech debt agent.");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("No built-in agent config");
  });

  it("returns error when agent is disabled", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: false } },
    });
    const result = await runSkillGuidedAgent("tech-debt", config, "You are the tech debt agent.");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("disabled");
  });

  it("invokes runPrompt with the correct agent shape", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: {
        "tech-debt": { enabled: true, cli: "opencode", model: "gpt-4o" },
      },
    });

    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"findings": [], "fixes": []}',
      elapsedMs: 1000,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });

    await runSkillGuidedAgent("tech-debt", config, "Scan for tech debt.");

    expect(runPrompt).toHaveBeenCalledOnce();
    const [agent, prompt] = vi.mocked(runPrompt).mock.calls[0];
    expect(agent).toMatchObject({
      name: "tech-debt",
      cli: "opencode",
      model: "gpt-4o",
      enabled: true,
    });
    expect(prompt).toContain("tech-debt agent");
    expect(prompt).toContain("Scan for tech debt.");
  });

  it("parses findings from LLM JSON response", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    const findings = [
      {
        type: "outdated-dependency",
        file: "package.json",
        description: "lodash is outdated",
        severity: "high",
      },
    ];
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: JSON.stringify({ findings, fixes: [] }),
      elapsedMs: 500,
    });

    const result = await runSkillGuidedAgent("tech-debt", config, "Scan.");
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("outdated-dependency");
    expect(result.findings[0].severity).toBe("high");
  });

  it("parses fixes from LLM JSON response", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "docs-debt": { enabled: true } },
    });

    const fixes = [
      {
        doc: "docs/guide.md",
        oldText: "src/old.ts",
        newText: "src/new.ts",
        evidence: "File was renamed",
      },
    ];
    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: JSON.stringify({ findings: [], fixes }),
      elapsedMs: 500,
    });

    const result = await runSkillGuidedAgent("docs-debt", config, "Scan.");
    expect(result.ok).toBe(true);
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0].doc).toBe("docs/guide.md");
  });

  it("handles JSON wrapped in markdown fences", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output:
        '```json\n{"findings": [{"type": "test", "description": "ok", "severity": "low"}], "fixes": []}\n```',
      elapsedMs: 500,
    });

    const result = await runSkillGuidedAgent("tech-debt", config, "Scan.");
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
  });

  it("falls back to single finding when JSON parse fails", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: "I found some issues but cannot format them as JSON.",
      elapsedMs: 500,
    });

    const result = await runSkillGuidedAgent("tech-debt", config, "Scan.");
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("agent-report");
    expect(result.findings[0].description).toContain("I found some issues");
  });

  it("returns error when runPrompt fails", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    vi.mocked(runPrompt).mockResolvedValue({
      ok: false,
      error: "agent timed out",
    });

    const result = await runSkillGuidedAgent("tech-debt", config, "Scan.");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tech-debt");
    expect(result.error).toContain("timed out");
  });

  it("returns error when runPrompt throws", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    vi.mocked(runPrompt).mockRejectedValue(new Error("spawn failed"));

    const result = await runSkillGuidedAgent("tech-debt", config, "Scan.");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("tech-debt");
    expect(result.error).toContain("spawn failed");
  });

  it("records usage via recordOneShotSession", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: {
        "tech-debt": { enabled: true, cli: "opencode", model: "gpt-4o" },
      },
    });

    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"findings": [], "fixes": []}',
      elapsedMs: 1000,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      costUsd: 0.002,
    });

    await runSkillGuidedAgent("tech-debt", config, "Scan.");

    expect(recordOneShotSession).toHaveBeenCalledOnce();
    const [repoRoot, agent, result, opts] = vi.mocked(recordOneShotSession).mock.calls[0];
    expect(repoRoot).toBe(root);
    expect(agent).toMatchObject({ name: "tech-debt" });
    expect(result.ok).toBe(true);
    expect(opts.sessionType).toBe("built-in:tech-debt");
    expect(opts.taskId).toBeNull();
  });

  it("includes token usage in result", async () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    vi.mocked(runPrompt).mockResolvedValue({
      ok: true,
      output: '{"findings": [], "fixes": []}',
      elapsedMs: 1234,
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      costUsd: 0.005,
    });

    const result = await runSkillGuidedAgent("tech-debt", config, "Scan.");
    expect(result.elapsedMs).toBe(1234);
    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(100);
    expect(result.totalTokens).toBe(300);
    expect(result.costUsd).toBe(0.005);
  });
});

describe("saveLastRunAt", () => {
  it("updates the builtInAgents config with a timestamp", () => {
    const root = makeRepo({});
    const config = configFor(root, {
      builtInAgents: { "tech-debt": { enabled: true } },
    });

    saveLastRunAt(root, "tech-debt", config);

    expect(saveBuiltInAgentsConfig).toHaveBeenCalledOnce();
    expect(config.builtInAgents?.["tech-debt"]?.lastRunAt).toBeTruthy();
  });
});
