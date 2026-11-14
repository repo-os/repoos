import { describe, expect, it } from "vitest";
import { formatAgentFailure } from "./agent-failure.js";
import {
  AGENT_LAST_RUN_RECENT_MS,
  buildConfiguredAgentLastRunNames,
  filterAgentLastRuns,
  type AgentLastRunRow,
} from "./agent-last-runs.js";

describe("filterAgentLastRuns", () => {
  const now = Date.parse("2026-11-15T12:00:00.000Z");
  const recentAt = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const staleAt = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const names = buildConfiguredAgentLastRunNames(["engineer", "reviewer"], ["debugger", "docs-debt"]);

  const rows: AgentLastRunRow[] = [
    { name: "engineer", status: "ok", at: recentAt, taskId: "1", reason: null },
    { name: "docs-debt", status: "errored", at: staleAt, taskId: null, reason: "old failure" },
    { name: "design", status: "errored", at: recentAt, taskId: null, reason: "not configured" },
    {
      name: "Model router (openrouter)",
      status: "errored",
      at: recentAt,
      taskId: null,
      reason: "quota",
    },
    {
      name: "Decision check (jev)",
      status: "errored",
      at: recentAt,
      taskId: null,
      reason: "timeout",
    },
  ];

  it("shows only recent configured agents by default", () => {
    const { visible, hiddenCount } = filterAgentLastRuns(rows, names, now, false);
    expect(visible.map((r) => r.name)).toEqual(["engineer"]);
    expect(hiddenCount).toBe(4);
  });

  it("reveals hidden rows when the toggle is on", () => {
    const { visible, hiddenCount } = filterAgentLastRuns(rows, names, now, true);
    expect(visible).toHaveLength(5);
    expect(hiddenCount).toBe(0);
  });

  it("uses a fourteen-day recency window", () => {
    expect(AGENT_LAST_RUN_RECENT_MS).toBe(14 * 24 * 60 * 60 * 1000);
    const borderlineAt = new Date(now - AGENT_LAST_RUN_RECENT_MS).toISOString();
    const { visible } = filterAgentLastRuns(
      [{ name: "engineer", status: "ok", at: borderlineAt, taskId: null, reason: null }],
      names,
      now,
      false,
    );
    expect(visible).toHaveLength(1);
  });
});

describe("last-runs API formatting", () => {
  it("formats a stored raw DeepInfra balance error at read time", () => {
    const stored =
      "opencode exited with code 1: Error: You need positive balance to do inference. Please add balance manually or setup top-up";
    const reason = formatAgentFailure(stored, "opencode");
    expect(reason).toContain("OpenCode is out of credit.");
    expect(reason).toContain("(CLI:");
  });
});