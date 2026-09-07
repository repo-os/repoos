/**
 * Mission Control's "AI usage — all roles" panel groups the sessions table by
 * sessionType, so a role appears iff a session row carries its label (0331).
 * Every AI role that burns tokens must land on its own row: Ross (the repo
 * guide), the Debugger, the CTO monitor — not just task-scoped engineer/
 * reviewer sessions. The old classifier probed `includes("repoos")` first, so
 * a legacy "RepoOS Guide" agent was recorded as an "engineer", the Debugger
 * fell through to "task", and board-level chats carried the synthetic chat
 * key around as a bogus taskId.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunner,
  classifySessionType,
  debuggerSessionId,
  REPO_GUIDE_SESSION_ID,
} from "../../server/agents";
import { CTOManager } from "../../server/cto";
import type { Agent, RepoOSConfig } from "../../core/types";
import { RepoOSDb, resetDbInstance } from "../../core/db";
import { waitFor } from "./helpers";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-roles-"));
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

function configFor(root: string, agents: Agent[] = []): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    agents,
  };
}

/**
 * Fake `opencode` on PATH: emits one step_finish carrying tokens + cost and a
 * text part, both stamped with a stable sessionID so multi-turn sends resume
 * into the same record.
 */
function installFakeOpenCode(root: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const fake = join(bin, "opencode");
  writeFileSync(
    fake,
    `#!/usr/bin/env node
const lines = [
  '{"type":"step_start","sessionID":"ross-sess-1"}',
  '{"type":"step_finish","sessionID":"ross-sess-1","part":{"type":"step-finish","tokens":{"total":1500,"input":1200,"output":300},"cost":0.021}}',
  '{"type":"text","sessionID":"ross-sess-1","part":{"type":"text","text":"Nothing to report."}}',
];
for (const l of lines) process.stdout.write(l + "\\n");
`,
    { mode: 0o755 },
  );
  return bin;
}

const ross: Agent = { name: "Ross", cli: "opencode", model: "test/m", enabled: true };

describe("classifySessionType — every built-in role lands on its own label (0331)", () => {
  it("maps the built-in agent names exactly", () => {
    expect(classifySessionType("engineer", "0331")).toBe("engineer");
    expect(classifySessionType("reviewer", "0331")).toBe("reviewer");
    expect(classifySessionType("pm", "0331")).toBe("pm");
    expect(classifySessionType("Ross", "repoos-guide")).toBe("guide");
    expect(classifySessionType("cto", undefined)).toBe("cto");
    expect(classifySessionType("debugger", "__repoos-debugger__")).toBe("debugger");
    expect(classifySessionType("tech-debt", undefined)).toBe("tech-debt");
  });

  it("classifies the legacy 'RepoOS Guide' name as a guide, never an engineer", () => {
    // The old classifier probed includes("repoos") BEFORE the guide branch, so
    // "repoos guide" was swallowed into "engineer".
    expect(classifySessionType("RepoOS Guide", "repoos-guide")).toBe("guide");
    expect(classifySessionType("repoos guide")).toBe("guide");
    expect(classifySessionType("repoos-guide")).toBe("guide");
  });

  it("still recognizes role names inside compound agent names", () => {
    expect(classifySessionType("repoos engineer", "0331")).toBe("engineer");
    expect(classifySessionType("code reviewer", "0331")).toBe("reviewer");
    expect(classifySessionType("ross guide hybrid")).toBe("guide");
    expect(classifySessionType("debugger pro", "__repoos-debugger__")).toBe("debugger");
    expect(classifySessionType("tech debt scanner")).toBe("tech-debt");
  });

  it("falls back to task/chat by whether the session is keyed to a task", () => {
    expect(classifySessionType("my-custom-agent", "0331")).toBe("task");
    expect(classifySessionType("my-custom-agent")).toBe("chat");
    expect(classifySessionType(undefined, "0331")).toBe("task");
    expect(classifySessionType(undefined)).toBe("chat");
  });
});

describe("board-level chats record their own role rows (0331)", () => {
  it("a Ross chat lands on a 'guide' row with tokens/cost and no taskId", async () => {
    const root = tempRoot();
    const bin = installFakeOpenCode(root);
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const runner = new AgentRunner(configFor(root), () => {});
      const started = runner.startChat(
        REPO_GUIDE_SESSION_ID,
        "what is this repo about?",
        ross,
        "Repository context",
      );
      expect(started.ok).toBe(true);
      await waitFor(() => !runner.isRunning(REPO_GUIDE_SESSION_ID), "ross turn exit");

      const db = new RepoOSDb(root);
      const guide = db.getSessionTypeStats().find((r) => r.sessionType === "guide");
      expect(guide).toBeDefined();
      expect(guide!.totalTokens).toBe(1500);
      expect(guide!.totalCostUsd ?? 0).toBeCloseTo(0.021, 10);
      expect(guide!.totalElapsedMs).toBeGreaterThan(0);
      // Board-level chat: no task attribution — the old pass-through recorded
      // the synthetic chat key itself as the taskId.
      expect(db.getTaskStats(REPO_GUIDE_SESSION_ID)).toBeNull();
      // No session row may carry a taskId for the board chat.
      for (const row of db.getBoardStats().roles) {
        if (row.role === "guide") expect(row.totalSessions).toBeGreaterThan(0);
      }
      runner.dispose();
      db.close();
    } finally {
      process.env.PATH = old;
    }
  });

  it("multi-turn Ross chats accumulate into ONE record, not one per turn", async () => {
    const root = tempRoot();
    const bin = installFakeOpenCode(root);
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const runner = new AgentRunner(configFor(root), () => {});
      expect(
        runner.startChat(REPO_GUIDE_SESSION_ID, "first question", ross, "Repository context").ok,
      ).toBe(true);
      await waitFor(() => !runner.isRunning(REPO_GUIDE_SESSION_ID), "turn 1 exit");
      const followUp = runner.send(REPO_GUIDE_SESSION_ID, "follow-up question", ross, {
        resumePreamble: "Updated repository context",
      });
      expect(followUp.ok).toBe(true);
      await waitFor(() => !runner.isRunning(REPO_GUIDE_SESSION_ID), "turn 2 exit");

      const db = new RepoOSDb(root);
      const guide = db.getSessionTypeStats().find((r) => r.sessionType === "guide");
      expect(guide).toBeDefined();
      expect(guide!.totalSessions).toBe(1);
      expect(guide!.totalTokens).toBe(3000); // step_finish deltas fold across turns
      expect(guide!.totalElapsedMs).toBeGreaterThan(0);
      runner.dispose();
      db.close();
    } finally {
      process.env.PATH = old;
    }
  });

  it("a legacy 'RepoOS Guide' agent no longer shows up under 'engineer'", async () => {
    const root = tempRoot();
    const bin = installFakeOpenCode(root);
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const runner = new AgentRunner(configFor(root), () => {});
      const legacy: Agent = {
        name: "RepoOS Guide",
        cli: "opencode",
        model: "test/m",
        enabled: true,
      };
      expect(
        runner.startChat(REPO_GUIDE_SESSION_ID, "hello", legacy, "Repository context").ok,
      ).toBe(true);
      await waitFor(() => !runner.isRunning(REPO_GUIDE_SESSION_ID), "legacy guide turn exit");

      const db = new RepoOSDb(root);
      const byRole = db.getSessionTypeStats();
      expect(byRole.find((r) => r.sessionType === "guide")).toBeDefined();
      expect(byRole.find((r) => r.sessionType === "engineer")).toBeUndefined();
      runner.dispose();
      db.close();
    } finally {
      process.env.PATH = old;
    }
  });

  it("a Debugger chat lands on a 'debugger' row, not 'task'", async () => {
    const root = tempRoot();
    const bin = installFakeOpenCode(root);
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const runner = new AgentRunner(configFor(root), () => {});
      const dbg: Agent = { name: "debugger", cli: "opencode", model: "test/m", enabled: true };
      expect(
        runner.startChat(debuggerSessionId, "TypeError: foo is not a function", dbg, "context").ok,
      ).toBe(true);
      await waitFor(() => !runner.isRunning(debuggerSessionId), "debugger turn exit");

      const db = new RepoOSDb(root);
      const byRole = db.getSessionTypeStats();
      const debuggerRow = byRole.find((r) => r.sessionType === "debugger");
      expect(debuggerRow).toBeDefined();
      expect(debuggerRow!.totalTokens).toBe(1500);
      expect(byRole.find((r) => r.sessionType === "task")).toBeUndefined();
      expect(db.getTaskStats(debuggerSessionId)).toBeNull();
      runner.dispose();
      db.close();
    } finally {
      process.env.PATH = old;
    }
  });
});

describe("CTO monitor passes record a 'cto' row (0331)", () => {
  it("a monitoring pass writes a cto session with elapsed time and CLI usage", async () => {
    const root = tempRoot();
    const bin = installFakeOpenCode(root);
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const ctoAgent: Agent = { name: "cto", cli: "opencode", model: "test/m", enabled: true };
      const cto = new CTOManager(configFor(root, [ctoAgent]), () => {});
      const result = await cto.run("Board digest: all healthy.");
      expect(result.ok).toBe(true);

      const db = new RepoOSDb(root);
      const ctoRow = db.getSessionTypeStats().find((r) => r.sessionType === "cto");
      expect(ctoRow).toBeDefined();
      expect(ctoRow!.totalSessions).toBe(1);
      expect(ctoRow!.totalTokens).toBe(1500);
      expect(ctoRow!.totalCostUsd ?? 0).toBeCloseTo(0.021, 10);
      expect(ctoRow!.totalElapsedMs).toBeGreaterThan(0);
      db.close();
    } finally {
      process.env.PATH = old;
    }
  });
});
