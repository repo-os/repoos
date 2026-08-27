/**
 * Freeform task creation runs the PM agent through `runPrompt`, not the
 * AgentRunner, so — unlike a per-task PM chat — nothing used to book that pass
 * under the task. The Tokens tab then showed only Engineer + Reviewer for any
 * task the PM had authored (0311). `recordFreeformPmSession` closes that gap by
 * persisting a `pm` session from the returned usage.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordFreeformPmSession } from "../../server/routes/tasks";
import type { PromptResult } from "../../server/agents";
import type { Agent } from "../../core/types";
import { RepoOSDb, resetDbInstance } from "../../core/db";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-ff-pm-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  resetDbInstance();
  for (const r of roots) {
    try { rmSync(r, { recursive: true, force: true }); } catch {}
  }
  roots.length = 0;
});

const pm: Agent = { name: "pm", cli: "opencode", model: "deepinfra/m", enabled: true };

describe("freeform PM authoring lands in the task ledger (0311)", () => {
  it("records a pm session attributed to the task with CLI-reported tokens/cost", () => {
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
    recordFreeformPmSession(root, "0311", pm, result);

    const db = new RepoOSDb(root);
    const stats = db.getTaskStats("0311");
    expect(stats).not.toBeNull();
    const pmRole = stats!.roles.find((r) => r.role === "pm");
    expect(pmRole).toBeDefined();
    expect(pmRole!.totalTokens).toBe(1200);
    expect(pmRole!.totalCostUsd ?? 0).toBeCloseTo(0.0123, 10);
    expect(pmRole!.costSource).toBe("extractUsage");
    expect(pmRole!.totalElapsedMs).toBe(4200);
    db.close();
  });

  it("falls back to a token-based cost estimate when the CLI reports none", () => {
    const root = tempRoot();
    recordFreeformPmSession(root, "0312", pm, {
      ok: true,
      output: "…",
      elapsedMs: 1000,
      totalTokens: 50_000,
    });

    const db = new RepoOSDb(root);
    const pmRole = db.getTaskStats("0312")!.roles.find((r) => r.role === "pm");
    expect(pmRole).toBeDefined();
    expect(pmRole!.costSource).toBe("estimate");
    expect(pmRole!.totalCostUsd ?? 0).toBeGreaterThan(0);
    db.close();
  });

  it("still books the session (as errored) when the PM run failed", () => {
    const root = tempRoot();
    recordFreeformPmSession(root, "0313", pm, {
      ok: false,
      error: "the opencode agent timed out after 180s",
      elapsedMs: 180_000,
    });

    const db = new RepoOSDb(root);
    const stats = db.getTaskStats("0313");
    expect(stats!.roles.find((r) => r.role === "pm")).toBeDefined();
    expect(stats!.sessions[0]?.status).toBe("errored");
    db.close();
  });
});
