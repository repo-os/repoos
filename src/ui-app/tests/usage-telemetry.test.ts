import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoOSDb, resetDbInstance } from "../../core/db";
import { extractUsage, foldUsage, resolveSessionTaskId, runPrompt } from "../../server/agents";
import type { Agent, RepoOSConfig } from "../../core/types";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-usage-"));
  roots.push(root);
  return root;
}

function configFor(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "pm",
    cli: "opencode",
    model: "default",
    enabled: true,
    ...overrides,
  };
}

afterEach(() => {
  resetDbInstance();
  for (const r of roots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
  roots.length = 0;
});

describe("resolveSessionTaskId — role-to-task attribution (0230)", () => {
  it("attributes PM chat keys to their real task id", () => {
    expect(resolveSessionTaskId("pm-task-v2:0001")).toBe("0001");
    expect(resolveSessionTaskId("pm-task-v2:1234")).toBe("1234");
    expect(resolveSessionTaskId("pm:0001")).toBe("0001");
  });

  it("maps legacy pm-task keys without mis-parsing the suffix", () => {
    expect(resolveSessionTaskId("pm-task:0209")).toBe("0209");
    expect(resolveSessionTaskId("pm-task:0007")).toBe("0007");
  });

  it("strips the per-user ::<email> suffix from PM chat keys (0248)", () => {
    expect(resolveSessionTaskId("pm-task-v2:0001::alice@example.com")).toBe("0001");
    expect(resolveSessionTaskId("pm-task-v2:1234::bob.smith@sub.example.co")).toBe("1234");
  });

  it("passes engineer/review task ids straight through", () => {
    expect(resolveSessionTaskId("0001")).toBe("0001");
    expect(resolveSessionTaskId("0042")).toBe("0042");
  });

  it("returns null for non-task chats (guide) and missing keys", () => {
    expect(resolveSessionTaskId("repoos-guide")).toBe("repoos-guide");
    expect(resolveSessionTaskId(undefined)).toBeNull();
    expect(resolveSessionTaskId("")).toBeNull();
  });
});

describe("extractUsage / foldUsage — authoritative usage, zero/unknown safety", () => {
  it("extracts authoritative tokens and cost from a JSON usage event", () => {
    const u = extractUsage('{"usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30,"cost_usd":0.05}}');
    expect(u.inputTokens).toBe(10);
    expect(u.outputTokens).toBe(20);
    expect(u.totalTokens).toBe(30);
    expect(u.costUsd).toBeCloseTo(0.05, 10);
  });

  it("extracts tokens/cost from opencode's step_finish event (part.tokens, not usage)", () => {
    // Captured from a real `opencode run --format json` session — opencode
    // nests usage under `part.tokens.{total,input,output}` and `part.cost`,
    // a different shape than the `usage.{input,output}_tokens` claude/codex
    // events use, so this previously fell through extractUsage unrecognized
    // and every opencode-backed session's tokens/cost stayed null forever.
    const u = extractUsage(
      '{"type":"step_finish","part":{"type":"step-finish","tokens":{"total":8339,"input":7274,"output":41,"reasoning":0,"cache":{"write":0,"read":1024}},"cost":0.02}}',
    );
    expect(u.inputTokens).toBe(7274);
    expect(u.outputTokens).toBe(41);
    expect(u.totalTokens).toBe(8339);
    expect(u.costUsd).toBeCloseTo(0.02, 10);
  });

  it("never fabricates numbers for output with no usage", () => {
    const u = extractUsage("the agent produced a normal answer with no usage block");
    expect(u.inputTokens).toBeUndefined();
    expect(u.outputTokens).toBeUndefined();
    expect(u.totalTokens).toBeUndefined();
    expect(u.costUsd).toBeUndefined();
  });

  it("folds usage monotonically upward and stays blank on unknown input", () => {
    const total: { inputTokens?: number; totalTokens?: number; costUsd?: number } = {};
    foldUsage(total, "plain line without usage");
    expect(total.totalTokens).toBeUndefined();
    expect(total.costUsd).toBeUndefined();

    foldUsage(total, '{"usage":{"total_tokens":30,"input_tokens":10,"cost_usd":0.05}}');
    expect(total.totalTokens).toBe(30);
    expect(total.costUsd).toBeCloseTo(0.05, 10);

    // A later lower figure must not move the total backward.
    foldUsage(total, '{"usage":{"total_tokens":5,"cost_usd":0.01}}');
    expect(total.totalTokens).toBe(30);
    expect(total.costUsd).toBeCloseTo(0.05, 10);
  });
});

describe("runPrompt — elapsed time + usage capture for one-shot roles", () => {
  it("returns wall-clock elapsed time and CLI-reported usage", async () => {
    const root = tempRoot();
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const fake = join(bin, "fake-cli");
    writeFileSync(
      fake,
      `#!/usr/bin/env node
const t0 = Date.now();
while (Date.now() - t0 < 60) { /* sleep ~60ms */ }
process.stdout.write('{"usage":{"input_tokens":11,"output_tokens":22,"total_tokens":33,"cost_usd":0.07}}\\n');
process.stdout.write('the reviewer verdict\\n');
`,
      { mode: 0o755 },
    );
    process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
    try {
      const result = await runPrompt(agent(), "review the change", {
        command: { cmd: fake, args: [] },
      });
      expect(result.ok).toBe(true);
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(result.inputTokens).toBe(11);
      expect(result.outputTokens).toBe(22);
      expect(result.totalTokens).toBe(33);
      expect(result.costUsd).toBeCloseTo(0.07, 10);
    } finally {
      process.env.PATH = (process.env.PATH ?? "").split(":").filter((p) => p !== bin).join(":");
    }
  });
});

describe("RepoOSDb — persistence + aggregation (0230)", () => {
  it("round-trips sessions and aggregates role breakdowns per task", () => {
    const root = tempRoot();
    configFor(root);
    const db = new RepoOSDb(root);
    expect(db.isAvailable()).toBe(true);

    const ended = new Date().toISOString();
    // Engineer session for task 0001 (authoritative usage).
    db.upsertSession({
      sessionId: "eng-1",
      sessionType: "engineer",
      taskId: "0001",
      agent: "engineer",
      model: "default",
      codingAgent: "opencode",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 1000,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      costUsd: 0.4,
      costSource: "extractUsage",
      status: "finished",
      lastActivityAt: ended,
    });
    // PM chat attributed to the same task (0230).
    db.upsertSession({
      sessionId: "pm-1",
      sessionType: "pm",
      taskId: "0001",
      agent: "pm",
      model: "default",
      codingAgent: "opencode",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 500,
      totalTokens: 60,
      costUsd: 0.1,
      costSource: "extractUsage",
      status: "finished",
      lastActivityAt: ended,
    });
    // A failed reviewer turn for task 0001 (status errored, nonzero time).
    db.upsertSession({
      sessionId: "rev-1",
      sessionType: "reviewer",
      taskId: "0001",
      agent: "reviewer",
      model: "default",
      codingAgent: "claude code",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 4000,
      status: "errored",
      lastActivityAt: ended,
    });

    const stats = db.getTaskStats("0001");
    expect(stats).not.toBeNull();
    expect(stats!.totalSessions).toBe(3);
    expect(stats!.totalElapsedMs).toBe(5500);
    expect(stats!.totalTokens).toBe(360);
    expect(stats!.totalCostUsd).toBeCloseTo(0.5, 10);
    // Role breakdown includes each role that touched the task.
    const roles = stats!.roles;
    expect(roles.map((r) => r.role).sort()).toEqual(["engineer", "pm", "reviewer"]);
    const eng = roles.find((r) => r.role === "engineer")!;
    expect(eng.totalElapsedMs).toBe(1000);
    expect(eng.totalTokens).toBe(300);
    // Roles and aggregate totals carry the representative cost source so the UI
    // can label estimates/credits honestly (0230 / review).
    expect(eng.costSource).toBe("extractUsage");
    expect(stats!.costSource).toBe("extractUsage");
    db.close();
  });

  it("aggregates per-role, per-day, and board totals", () => {
    const root = tempRoot();
    const db = new RepoOSDb(root);
    expect(db.isAvailable()).toBe(true);

    const now = new Date();
    const ended = now.toISOString();
    db.upsertSession({
      sessionId: "e",
      sessionType: "engineer",
      taskId: "0001",
      agent: "engineer",
      model: "default",
      codingAgent: "opencode",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 2000,
      totalTokens: 200,
      costUsd: 0.3,
      costSource: "extractUsage",
      status: "finished",
      lastActivityAt: ended,
    });
    db.upsertSession({
      sessionId: "c",
      sessionType: "cto",
      taskId: null,
      agent: "cto",
      model: "default",
      codingAgent: "opencode",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 1500,
      costSource: "none",
      status: "finished",
      lastActivityAt: ended,
    });

    const byRole = db.getSessionTypeStats();
    expect(byRole.find((r) => r.sessionType === "engineer")!.totalElapsedMs).toBe(2000);
    expect(byRole.find((r) => r.sessionType === "cto")!.totalElapsedMs).toBe(1500);

    const board = db.getBoardStats();
    expect(board.totalSessions).toBe(2);
    expect(board.totalElapsedMs).toBe(3500);
    expect(board.roles.length).toBeGreaterThanOrEqual(2);
    expect(board.days.length).toBeGreaterThanOrEqual(1);
    // Board roles are role-keyed (not sessionType), so the UI label renders.
    const engRole = board.roles.find((r) => "role" in r && (r as any).role === "engineer");
    expect(engRole).toBeDefined();
    expect((engRole as any).totalElapsedMs).toBe(2000);

    // Board-level totals carry the representative cost source too, so the panel
    // never labels a credits/estimate/mixed board as firm USD (0230 / review).
    expect(board.costSource).toBe("extractUsage");

    // Per-day totals group by the server's local day.
    const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const day = db.getDailyTotals().find((d) => d.day === local);
    expect(day).toBeDefined();
    expect(day!.totalElapsedMs).toBe(3500);
    db.close();
  });

  it("classifies cost source honestly (mixed/estimate/kiro never shown as USD)", () => {
    const root = tempRoot();
    const db = new RepoOSDb(root);
    expect(db.isAvailable()).toBe(true);

    const ended = new Date().toISOString();
    const session = (opts: {
      sessionId: string;
      sessionType: string;
      costUsd?: number;
      costSource: string;
      totalTokens?: number;
    }) =>
      db.upsertSession({
        sessionId: opts.sessionId,
        sessionType: opts.sessionType,
        taskId: "0001",
        agent: opts.sessionType,
        model: "default",
        codingAgent: "kiro",
        startedAt: ended,
        endedAt: ended,
        elapsedMs: 100,
        totalTokens: opts.totalTokens,
        costUsd: opts.costUsd,
        costSource: opts.costSource,
        status: "finished",
        lastActivityAt: ended,
      });

    // A single Kiro-credits session → its source is preserved.
    session({ sessionId: "k1", sessionType: "engineer", costUsd: 0.15, costSource: "kiro-credits", totalTokens: 30 });
    const one = db.getTaskStats("0001")!;
    expect(one.costSource).toBe("kiro-credits");

    // Adding an authoritative-USD session mixes the sources.
    session({ sessionId: "k2", sessionType: "pm", costUsd: 0.05, costSource: "extractUsage", totalTokens: 10 });
    const mixed = db.getTaskStats("0001")!;
    expect(mixed.costSource).toBe("mixed");
    // The board aggregates across tasks/sources and must also say "mixed".
    expect(db.getBoardStats().costSource).toBe("mixed");

    // An estimate-only group reads as "estimate", never silent USD.
    db.upsertSession({
      sessionId: "est1",
      sessionType: "cto",
      taskId: "0002",
      agent: "cto",
      model: "default",
      codingAgent: "opencode",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 50,
      totalTokens: 20,
      costUsd: 0.02,
      costSource: "estimate",
      status: "finished",
      lastActivityAt: ended,
    });
    const est = db.getTaskStats("0002")!;
    expect(est.costSource).toBe("estimate");
    db.close();
  });

  it("treats zero/unknown usage as absent (no invented cost)", () => {
    const root = tempRoot();
    const db = new RepoOSDb(root);
    const ended = new Date().toISOString();
    db.upsertSession({
      sessionId: "z",
      sessionType: "engineer",
      taskId: "0001",
      agent: "engineer",
      model: "default",
      codingAgent: "opencode",
      startedAt: ended,
      endedAt: ended,
      elapsedMs: 0,
      status: "finished",
      lastActivityAt: ended,
    });
    const stats = db.getTaskStats("0001");
    expect(stats!.totalTokens).toBeNull();
    expect(stats!.totalCostUsd).toBeNull();
    db.close();
  });
});

describe("no-SQLite graceful fallback (0230)", () => {
  it("degrades to empty results when the DB cannot be opened", () => {
    // A repoRoot that is actually a file, so `.repoos` cannot be created under it.
    const root = tempRoot();
    const file = join(root, "not-a-dir");
    writeFileSync(file, "occupied");
    const db = new RepoOSDb(file);
    expect(db.isAvailable()).toBe(false);
    expect(db.getTaskStats("0001")).toBeNull();
    expect(db.getTaskSessions("0001")).toEqual([]);
    expect(db.getSessionTypeStats()).toEqual([]);
    expect(db.getDailyTotals()).toEqual([]);
    const board = db.getBoardStats();
    expect(board.totalSessions).toBe(0);
    expect(board.totalElapsedMs).toBe(0);
    expect(board.roles).toEqual([]);
    expect(board.days).toEqual([]);
  });
});
