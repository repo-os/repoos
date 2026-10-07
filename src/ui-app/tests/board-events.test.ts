/**
 * #0728 — board event contract projections.
 */
import { describe, expect, it } from "vitest";
import { projectBoardWatchEvent } from "../../server/board-events.js";
import type { RepoEvent } from "../../server/live-index.js";
import type { Task } from "../../core/types.js";

describe("projectBoardWatchEvent", () => {
  it("maps task status changes with task id, cause, and evidence", () => {
    const raw: RepoEvent = {
      type: "task.updated",
      at: "2026-10-07T10:00:00.000Z",
      task: {
        id: "0728",
        title: "t",
        status: "review",
        priority: "p1",
        type: "feature",
        assignee: "ai",
        needsInput: false,
        needsMerge: false,
        isArchived: false,
        area: "server",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        absPath: "/tmp/work/0728.md",
        path: "work/0728.md",
      } as Task,
      prev: { status: "active" },
    };
    const ev = projectBoardWatchEvent(raw);
    expect(ev).not.toBeNull();
    expect(ev!.taskId).toBe("0728");
    expect(ev!.cause).toContain("active");
    expect(ev!.cause).toContain("review");
    expect(ev!.evidence.task).toBe("/work?task=0728");
    expect(ev!.evidence.attention).toBe("/api/attention");
  });

  it("maps close-out outcomes with reason as cause", () => {
    const raw: RepoEvent = {
      type: "close-out.outcome",
      at: "2026-10-07T10:00:00.000Z",
      outcome: {
        taskId: "0042",
        outcome: "failed",
        finishedAt: "2026-10-07T09:59:00.000Z",
        reason: "validation failed: oxfmt",
      },
    };
    const ev = projectBoardWatchEvent(raw)!;
    expect(ev.taskId).toBe("0042");
    expect(ev.cause).toContain("oxfmt");
  });

  it("maps agent.exited with exit metadata", () => {
    const raw: RepoEvent = {
      type: "agent.exited",
      id: "0099",
      at: "2026-10-07T10:00:00.000Z",
      exitCode: 1,
      cause: "model unavailable",
      logPath: ".repoos/agent-logs/run.out.log",
    };
    const ev = projectBoardWatchEvent(raw)!;
    expect(ev.taskId).toBe("0099");
    expect(ev.cause).toBe("model unavailable");
    expect(ev.evidence.logPath).toContain("agent-logs");
  });

  it("maps stalled agent.stats to a hang alert", () => {
    const raw: RepoEvent = {
      type: "agent.stats",
      id: "0011",
      at: "2026-10-07T10:00:00.000Z",
      stats: {
        stalled: true,
        accumulatedMs: 120_000,
        lastOutputAt: "2026-10-07T09:58:00.000Z",
        turnStartedAt: "2026-10-07T09:58:00.000Z",
        tokens: 0,
        costUsd: null,
      },
    };
    const ev = projectBoardWatchEvent(raw)!;
    expect(ev.cause.toLowerCase()).toContain("silent");
  });
});
