import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentRunner,
  extractOneShotReportText,
  parseOneShotLine,
  reviewCommand,
  runPrompt,
  taskPmPrompt,
  type PromptResult,
} from "../../server/agents";
import type { Agent, RepoOSConfig } from "../../core/types";
import { RepoOSDb, resetDbInstance } from "../../core/db";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-rev-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const r of roots) {
    try { rmSync(r, { recursive: true, force: true }); } catch {}
  }
  roots.length = 0;
});

function engineer (name: "engineer" | "reviewer", over = {}) {
  return { name, cli: "claude code", model: "haiku", enabled: true, ...over } as const;
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

function waitFor(cond: () => boolean, label = "condition", ms = 3000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > ms) return reject(new Error(`waiting for ${label} timed out`));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe("reviewer usage wiring (0273)", () => {
  it("reviewCommand emits structured stream usage for claude/qwen/codex", () => {
    const base = { name: "reviewer", model: "provider/m", enabled: true } as const;
    const claude = reviewCommand(
      { ...base, cli: "claude code" },
      "review",
      "/worktree",
    );
    expect(claude.args).toContain("--output-format");
    expect(claude.args).toContain("stream-json");
    expect(claude.args).toContain("--dangerously-skip-permissions");

    const qwen = reviewCommand({ ...base, cli: "qwen code" }, "review", "/worktree");
    expect(qwen.args).toContain("stream-json");

    const codex = reviewCommand({ ...base, cli: "codex" }, "review", "/worktree");
    expect(codex.args).toContain("--json");
    // Reviewer stays read-only: no write-workspace sandbox.
    expect(codex.args).not.toContain("--sandbox");

    const oc = reviewCommand({ ...base, cli: "opencode" }, "review", "/worktree");
    expect(oc.args).toContain("--format");
    expect(oc.args).toContain("json");
  });

  it("parseOneShotLine renders claude stream text and swallows voiceless events", () => {
    const text = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "the report" }] } });
    const entry = parseOneShotLine("claude code", text);
    expect(entry).toEqual({ type: "text", text: "the report" });

    const result = JSON.stringify({ type: "result", result: { cost: 0.02 }, session_id: "x" });
    expect(parseOneShotLine("claude code", result)).toBeNull();

    const init = JSON.stringify({ type: "system", subtype: "init", session_id: "x" });
    expect(parseOneShotLine("claude code", init)).toBeNull();

    expect(parseOneShotLine("claude code", "a plain warning line")).toEqual({ s: "out", d: "a plain warning line" });
  });

  it("extractOneShotReportText isolates the final answer from a codex stream", () => {
    const out = [
      JSON.stringify({ type: "item.updated", delta: "thinking..." }),
      JSON.stringify({ type: "item.updated", delta: "The verdict is good." }),
    ].join("\n");
    expect(extractOneShotReportText("codex", out)).toBe("The verdict is good.");
  });

  it("extractOneShotReportText keeps plain kiro output verbatim", () => {
    expect(extractOneShotReportText("kiro", "final answer")).toBe("final answer");
  });

  it("runPrompt captures reviewer cost/tokens from the stream-json a claude review emits", async () => {
    const root = tempRoot();
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const fake = join(bin, "claude");
    writeFileSync(
      fake,
      `#!/usr/bin/env node
const lines = [
  '{"type":"system","subtype":"init","session_id":"rev-1"}',
  '{"type":"assistant","message":{"usage":{"input_tokens":40,"output_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":0},"content":[{"type":"text","text":"verdict ok"}]}}',
  '{"type":"result","total_cost_usd":0.004,"duration_ms":500,"session_id":"rev-1"}',
];
for (const l of lines) process.stdout.write(l + "\\n");
`,
      { mode: 0o755 },
    );
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const result: PromptResult = await runPrompt(
        engineer("reviewer", { cli: "claude code" }),
        "review",
        { command: { cmd: fake, args: ["-p", "review"] } },
      );
      expect(result.ok).toBe(true);
      expect(result.totalTokens).toBe(50);
      expect(result.costUsd).toBeCloseTo(0.004, 10);
    } finally {
      process.env.PATH = old;
    }
  });

  it("a PM chat lands in the task ledger with tokens/cost (shared engineer path)", async () => {
    const root = tempRoot();
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    // The PM chat drives the SAME opencode `--format json` command as the
    // engineer; this fake emits a step_finish carrying tokens + cost.
    const fake = join(bin, "opencode");
    writeFileSync(
      fake,
      `#!/usr/bin/env node
const lines = [
  '{"type":"step_finish","part":{"type":"step-finish","tokens":{"total":1234,"input":1000,"output":234},"cost":0.01}}',
  '{"type":"text","part":{"type":"text","text":"I updated the task."}}',
];
for (const l of lines) process.stdout.write(l + "\\n");
`,
      { mode: 0o755 },
    );
    const old = process.env.PATH;
    process.env.PATH = `${bin}:${old}`;
    try {
      const runner = new AgentRunner(configFor(root), () => {});
      const pm: Agent = { name: "pm", cli: "opencode", model: "deepinfra/m", enabled: true };
      const started = runner.startChat(
        "pm-task-v2:0001",
        "move 0001 to review",
        pm,
        "Task #0001 context",
        taskPmPrompt,
      );
      expect(started.ok).toBe(true);
      await waitFor(() => !runner.isRunning("pm-task-v2:0001"), "pm turn exit");

      const db = new RepoOSDb(root);
      const stats = db.getTaskStats("0001");
      expect(stats).not.toBeNull();
      const pmRole = stats!.roles.find((r) => r.role === "pm");
      expect(pmRole).toBeDefined();
      expect(pmRole!.totalTokens).toBe(1234);
      expect(pmRole!.totalCostUsd ?? 0).toBeCloseTo(0.01, 10);
      runner.dispose();
      db.close();
    } finally {
      process.env.PATH = old;
      resetDbInstance();
    }
  });
});
