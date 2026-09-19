import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { DEFAULT_CONFIG } from "../../core/config.js";

// The Design Agent now runs through the shared skill-guided runner, which
// shells out to a configured CLI via `runPrompt`. Mock the agent layer so tests
// never spawn a process; `extractOneShotReportText` returns the raw JSON the
// fake model "printed".
vi.mock("../../server/agents.js", () => ({
  runPrompt: vi.fn(),
  recordOneShotSession: vi.fn(),
  extractOneShotReportText: vi.fn((_cli: string, raw: string) => raw),
}));

import { runDesignAgent, DesignError } from "../../server/built-in-agents.js";
import { runPrompt } from "../../server/agents.js";

const configFor = (root: string, extra: Partial<RepoOSConfig> = {}): RepoOSConfig => ({
  root,
  ...DEFAULT_CONFIG,
  ...extra,
  builtInAgents:
    extra.builtInAgents !== undefined ? extra.builtInAgents : { design: { enabled: true } },
});

/** Create a throwaway repo root with the given files (relative paths). */
function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-design-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const mockModelFindings = (findings: unknown[], fixes: unknown[] = []): void => {
  vi.mocked(runPrompt).mockResolvedValue({
    ok: true,
    output: JSON.stringify({ findings, fixes }),
    elapsedMs: 17,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDesignAgent (skill-guided)", () => {
  it("reviews whatever UI the repo actually has, with no hardcoded path or framework", async () => {
    const root = makeRepo({
      "package.json": JSON.stringify({ name: "demo", dependencies: { react: "^18.0.0" } }),
      "src/components/Card.jsx": "export const Card = () => <div className='card' />;\n",
    });
    mockModelFindings([
      {
        type: "ui-bug",
        file: "src/components/Card.jsx",
        line: 1,
        description: "Card uses fixed widths and overflows on narrow viewports",
        evidence: "Fixed width bypasses the responsive layout",
        recommendation: "Use a responsive grid",
        severity: "medium",
      },
    ]);

    const result = await runDesignAgent(configFor(root));

    expect(runPrompt).toHaveBeenCalledOnce();
    const [, prompt] = vi.mocked(runPrompt).mock.calls[0];
    // The skill doc must not re-introduce the old RepoOS-only path.
    expect(prompt).not.toContain("src/ui-app");
    expect(prompt).toContain("no-ui-detected");
    expect(result.findingsFound).toBe(1);
    expect(readFileSync(join(root, result.runDoc!), "utf8")).toContain("src/components/Card.jsx");
  });

  it("finds this repo's own Vue UI from its structure rather than a hardcoded path", async () => {
    const root = makeRepo({
      "package.json": JSON.stringify({ name: "repoos", dependencies: { vue: "^3.4.0" } }),
      "src/ui-app/src/views/Home.vue": "<template><main>Home</main></template>\n",
    });
    mockModelFindings([
      {
        type: "design-recommendation",
        file: "src/ui-app/src/views/Home.vue",
        line: 1,
        description: "Home view lacks an empty state",
        evidence: "Users see a blank screen when there is no data",
        recommendation: "Add an empty state with a call to action",
        severity: "low",
      },
    ]);

    const result = await runDesignAgent(configFor(root));

    const [, prompt] = vi.mocked(runPrompt).mock.calls[0];
    // The bounded repo context the agent sees includes the real tree, so it can
    // locate the UI itself — the path is discovered, not assumed.
    expect(prompt).toContain("ui-app/");
    expect(result.findingsFound).toBe(1);
    expect(readFileSync(join(root, result.runDoc!), "utf8")).toContain(
      "src/ui-app/src/views/Home.vue",
    );
  });

  it("reports 'no web UI detected' instead of a misleading zero for a non-UI project", async () => {
    const root = makeRepo({
      "go.mod": "module demo\n",
      "main.go": "package main\n\nfunc main() {}\n",
    });
    mockModelFindings([
      {
        type: "no-ui-detected",
        description: "No front-end framework dependency and no HTML/CSS/JS UI sources were found",
        severity: "low",
      },
    ]);

    const result = await runDesignAgent(configFor(root));

    expect(result.findingsFound).toBe(0);
    // The runner reports how many files it walked, never the old misleading 0.
    expect(result.scannedFiles).toBeGreaterThan(0);
    const content = readFileSync(join(root, result.runDoc!), "utf8");
    expect(content).toContain("No web UI detected in this repository");
    expect(content).toContain("ran clean");
  });

  it("records lastRunAt on completion", async () => {
    const root = makeRepo({ "package.json": "{}" });
    mockModelFindings([]);
    const config = configFor(root);

    await runDesignAgent(config);

    expect(config.builtInAgents?.design?.lastRunAt).toBeTruthy();
  });

  it("throws a named DesignError when the model run fails", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runPrompt).mockResolvedValue({
      ok: false,
      error: "You have exceeded your monthly quota",
    });

    await expect(runDesignAgent(configFor(root))).rejects.toThrow(DesignError);
    await expect(runDesignAgent(configFor(root))).rejects.toThrow(/design.*quota/i);
  });

  it("throws when the agent output is not valid JSON", async () => {
    const root = makeRepo({ "package.json": "{}" });
    vi.mocked(runPrompt).mockResolvedValue({ ok: true, output: "no json here" });

    await expect(runDesignAgent(configFor(root))).rejects.toThrow(/not valid JSON/);
  });

  it("throws when the design agent has no saved config", async () => {
    const root = makeRepo({ "package.json": "{}" });
    const config = configFor(root, { builtInAgents: {} });

    await expect(runDesignAgent(config)).rejects.toThrow(/No built-in agent config/);
  });
});
