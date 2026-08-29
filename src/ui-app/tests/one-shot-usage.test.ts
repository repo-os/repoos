/**
 * One-shot AI work — freeform task/doc authoring, the auto-engineering dispatch
 * pass — runs through `runPrompt`, not the AgentRunner, so nothing used to book
 * it. The Tokens tab then showed only Engineer + Reviewer for any task the PM
 * had authored, and doc/dispatch spend was a total black hole (0311).
 * `recordOneShotSession` closes that: it persists a session row from the
 * returned usage, with `taskId` null for board-level work.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordOneShotSession, type PromptResult } from "../../server/agents";
import type { Agent } from "../../core/types";
import { RepoOSDb, resetDbInstance } from "../../core/db";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-oneshot-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  resetDbInstance();
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {}
  }
  roots.length = 0;
});

const pm: Agent = { name: "pm", cli: "opencode", model: "deepinfra/m", enabled: true };

describe("recordOneShotSession — tracking AI usage outside the AgentRunner (0311)", () => {
  it("books the freeform task-authoring PM pass under the task with CLI tokens/cost", () => {
    const root = tempRoot();
    const result: PromptResult = {
      ok: true,
      output: "…",
      elapsedMs: 4200,
      inputTokens: 900,
      outputTokens: 300,
      totalTokens: 1200,
      costUsd: 0.0123,
    };
    recordOneShotSession(root, pm, result, { sessionType: "pm", taskId: "0311" });

    const db = new RepoOSDb(root);
    const pmRole = db.getTaskStats("0311")!.roles.find((r) => r.role === "pm");
    expect(pmRole).toBeDefined();
    expect(pmRole!.totalTokens).toBe(1200);
    expect(pmRole!.totalCostUsd ?? 0).toBeCloseTo(0.0123, 10);
    expect(pmRole!.costSource).toBe("extractUsage");
    expect(pmRole!.totalElapsedMs).toBe(4200);
    db.close();
  });

  it("records board-level work (doc / dispatch) with a null taskId that still rolls into board stats", () => {
    const root = tempRoot();
    recordOneShotSession(
      root,
      pm,
      { ok: true, output: "…", elapsedMs: 800, totalTokens: 3000, costUsd: 0.002 },
      {
        sessionType: "pm",
        taskId: null,
      },
    );
    recordOneShotSession(
      root,
      pm,
      { ok: true, output: "…", elapsedMs: 500, totalTokens: 1500, costUsd: 0.0009 },
      {
        sessionType: "dispatch",
        taskId: null,
      },
    );

    const db = new RepoOSDb(root);
    // No task attribution…
    expect(db.getTaskStats("0311")).toBeNull();
    // …but both show up in the board-level by-role breakdown.
    const byRole = db.getSessionTypeStats();
    expect(byRole.find((r) => r.sessionType === "pm")!.totalTokens).toBe(3000);
    expect(byRole.find((r) => r.sessionType === "dispatch")!.totalTokens).toBe(1500);
    const board = db.getBoardStats();
    expect(board!.totalTokens).toBe(4500);
    db.close();
  });

  it("falls back to a token-based cost estimate when the CLI reports none", () => {
    const root = tempRoot();
    recordOneShotSession(
      root,
      pm,
      { ok: true, output: "…", elapsedMs: 1000, totalTokens: 50_000 },
      {
        sessionType: "pm",
        taskId: "0312",
      },
    );

    const db = new RepoOSDb(root);
    const pmRole = db.getTaskStats("0312")!.roles.find((r) => r.role === "pm");
    expect(pmRole!.costSource).toBe("estimate");
    expect(pmRole!.totalCostUsd ?? 0).toBeGreaterThan(0);
    db.close();
  });

  it("still books the session (as errored) when the run failed", () => {
    const root = tempRoot();
    recordOneShotSession(
      root,
      pm,
      { ok: false, error: "timed out after 180s", elapsedMs: 180_000 },
      {
        sessionType: "pm",
        taskId: "0313",
      },
    );

    const db = new RepoOSDb(root);
    expect(db.getTaskStats("0313")!.sessions[0]?.status).toBe("errored");
    db.close();
  });

  it("keeps each call as its own row (no sessionId collisions within a task)", () => {
    const root = tempRoot();
    const r: PromptResult = { ok: true, output: "…", elapsedMs: 100, totalTokens: 10 };
    recordOneShotSession(root, pm, r, { sessionType: "pm", taskId: "0314" });
    recordOneShotSession(root, pm, r, { sessionType: "pm", taskId: "0314" });

    const db = new RepoOSDb(root);
    expect(db.getTaskStats("0314")!.sessions.length).toBe(2);
    db.close();
  });
});
