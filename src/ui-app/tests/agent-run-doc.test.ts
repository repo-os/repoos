import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_RUN_DOC_HISTORY,
  agentRunDocDir,
  formatDuration,
  pruneAgentRunDocs,
  renderAgentRunDoc,
  runDocSummary,
  runDocTimestamp,
  writeAgentRunDoc,
  type AgentRunFinding,
} from "../../server/agent-run-doc.js";

const mkRoot = (): string => mkdtempSync(join(tmpdir(), "repoos-run-doc-"));

const finding = (partial: Partial<AgentRunFinding> = {}): AgentRunFinding => ({
  type: "outdated-dependency",
  file: "package.json",
  description: 'Dependency "left-pad" is outdated: installed ^1.0.0, latest is 3.0.0',
  severity: "high",
  ...partial,
});

describe("runDocTimestamp", () => {
  it("is filename-safe and still sorts chronologically", () => {
    const stamp = runDocTimestamp(new Date("2026-09-19T11:07:11.123Z"));
    expect(stamp).toBe("2026-09-19T11-07-11Z");
    expect(stamp).not.toContain(":");
    const later = runDocTimestamp(new Date("2026-09-20T01:02:03.000Z"));
    expect(stamp < later).toBe(true);
  });
});

describe("formatDuration", () => {
  it("reads as plain English for the durations a run actually takes", () => {
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(4200)).toBe("4.2s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(undefined)).toBe("unknown");
  });
});

describe("runDocSummary", () => {
  it("says 'ran clean' when there were no findings", () => {
    expect(runDocSummary(0, null)).toBe("ran clean");
  });

  it("counts findings and the single task they became", () => {
    expect(runDocSummary(1, "0455")).toBe("1 finding — 1 task created");
    expect(runDocSummary(3, "0455")).toBe("3 findings — 1 task created");
  });

  it("does not imply the board was updated when no task was filed", () => {
    expect(runDocSummary(3, null)).toBe("3 findings — no task created");
  });
});

describe("renderAgentRunDoc", () => {
  it("records the run's identity, cost, findings and verdict", () => {
    const doc = renderAgentRunDoc({
      root: "/repo",
      agent: "tech-debt",
      label: "Tech Debt Agent",
      startedAt: "2026-09-19T11:07:11Z",
      durationMs: 4200,
      totalTokens: 12_345,
      costUsd: 0.0123,
      scannedFiles: 128,
      taskId: "0455",
      findings: [finding({ evidence: "registry says 3.0.0", recommendation: "Upgrade it." })],
    });

    expect(doc).toContain("# Tech Debt Agent run — 2026-09-19T11:07:11Z");
    expect(doc).toContain("- **Agent**: tech-debt");
    expect(doc).toContain("- **Duration**: 4.2s");
    expect(doc).toContain("- **Tokens**: 12,345 (cost $0.0123)");
    expect(doc).toContain("- **Files reviewed**: 128");
    expect(doc).toContain("- **Task created**: #0455");
    expect(doc).toContain("1 finding — 1 task created");
    expect(doc).toContain("### 1. outdated-dependency · high");
    expect(doc).toContain("- **File**: `package.json`");
    expect(doc).toContain("- **Evidence**: registry says 3.0.0");
    expect(doc).toContain("- **Recommendation**: Upgrade it.");
  });

  it("keeps a zero-finding run readable rather than empty", () => {
    const doc = renderAgentRunDoc({
      root: "/repo",
      agent: "design",
      startedAt: "2026-09-19T11:07:11Z",
      findings: [],
      notes: ["No web UI detected in this repository."],
    });

    expect(doc).toContain("ran clean");
    expect(doc).not.toContain("## Findings");
    expect(doc).toContain("- No web UI detected in this repository.");
  });
});

describe("writeAgentRunDoc", () => {
  it("writes the doc under docs/agent-runs/<agent>/ and reports its repo-relative path", () => {
    const root = mkRoot();
    const result = writeAgentRunDoc({
      root,
      agent: "performance",
      startedAt: "2026-09-19T11:07:11Z",
      findings: [finding()],
      now: new Date("2026-09-19T11:07:11Z"),
    });

    expect(result.path).toBe("docs/agent-runs/performance/2026-09-19T11-07-11Z.md");
    expect(result.absPath).toBe(join(root, "docs/agent-runs/performance/2026-09-19T11-07-11Z.md"));
    expect(result.findingsCount).toBe(1);
    expect(existsSync(result.absPath)).toBe(true);
    expect(readFileSync(result.absPath, "utf8")).toContain("1 finding — no task created");
  });

  it("uses the configured docs directory instead of creating a root docs folder", () => {
    const root = mkRoot();
    const result = writeAgentRunDoc({
      root,
      docsDir: "repoos/docs",
      agent: "performance",
      startedAt: "2026-09-19T11:07:11Z",
      findings: [],
      now: new Date("2026-09-19T11:07:11Z"),
    });

    expect(result.path).toBe("repoos/docs/agent-runs/performance/2026-09-19T11-07-11Z.md");
    expect(existsSync(join(root, "docs"))).toBe(false);
    expect(existsSync(result.absPath)).toBe(true);
  });

  it("never overwrites an earlier run doc from the same second", () => {
    const root = mkRoot();
    const now = new Date("2026-09-19T11:07:11Z");
    const first = writeAgentRunDoc({
      root,
      agent: "design",
      startedAt: now.toISOString(),
      findings: [],
      now,
    });
    const second = writeAgentRunDoc({
      root,
      agent: "design",
      startedAt: now.toISOString(),
      findings: [],
      now,
    });

    expect(first.fileName).not.toBe(second.fileName);
    const docs = readdirSync(join(root, agentRunDocDir("design")));
    expect(docs).toHaveLength(2);
  });
});

describe("pruneAgentRunDocs", () => {
  it("keeps only the newest 10 run docs for an agent", () => {
    const root = mkRoot();
    const dir = join(root, agentRunDocDir("architect"));
    mkdirSync(dir, { recursive: true });
    // Filenames are sortable timestamps, so writing N of them is the same as
    // running the agent N times.
    for (let i = 1; i <= 12; i++) {
      writeFileSync(join(dir, `2026-09-${String(i).padStart(2, "0")}T10-00-00Z.md`), "# run\n");
    }
    expect(readdirSync(dir)).toHaveLength(12);

    const pruned = pruneAgentRunDocs(root, "architect");

    expect(pruned).toBe(2);
    const left = readdirSync(dir).sort();
    expect(left).toHaveLength(AGENT_RUN_DOC_HISTORY);
    expect(left[0]).toBe("2026-09-03T10-00-00Z.md");
    expect(left[left.length - 1]).toBe("2026-09-12T10-00-00Z.md");
  });

  it("leaves another agent's run docs alone and survives a missing directory", () => {
    const root = mkRoot();
    const designDir = join(root, agentRunDocDir("design"));
    mkdirSync(designDir, { recursive: true });
    writeFileSync(join(designDir, "2026-09-01T10-00-00Z.md"), "# run\n");

    expect(pruneAgentRunDocs(root, "architect")).toBe(0);
    expect(readdirSync(designDir)).toHaveLength(1);
  });
});
