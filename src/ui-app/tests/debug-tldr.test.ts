/**
 * The failure tl;dr (#0570): the Debugger's one-line diagnosis persisted on
 * the task as `debug_tldr` frontmatter, and the gates around it — diagnosable
 * reasons only, dedupe by `(reason, detail)` fingerprint, one run in flight,
 * best-effort failure, secret redaction, and clearing with the failure it
 * describes.
 */
import { describe, expect, it, beforeEach, afterEach, vi, type Mock } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentOutputEntry, RepoOSConfig, Task } from "../../core/types";
import type { LogEntry } from "../../core/logger";
import { parseTask, serializeTask } from "../../core/task";
import { patchTaskFile } from "../../server/write";
import {
  DebugTldrManager,
  buildDebugTldrPrompt,
  isDiagnosableReason,
  sanitizeTldrAnswer,
  tldrFingerprint,
  type DebugTldrDeps,
} from "../../server/debug-tldr";
import { resetDbInstance, RepoOSDb } from "../../core/db";

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-debug-tldr-"));
  roots.push(root);
  mkdirSync(join(root, "work"), { recursive: true });
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
beforeEach(() => {
  resetDbInstance();
  vi.restoreAllMocks();
});

function config(root: string, debuggerEnabled = true): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    builtInAgents: { debugger: { enabled: debuggerEnabled } },
  };
}

const FAILED = `---
id: "0570"
title: Failing task
type: feature
status: active
needs_input: true
needs_input_reason: review-failed
needs_input_detail: "You have exceeded your monthly quota (Request ID: 123)"
---
## Problem

Body.
`;

function setupFile(content: string): { root: string; absPath: string } {
  const root = tempRoot();
  const absPath = join(root, "work", "0570-failing.md");
  writeFileSync(absPath, content);
  return { root, absPath };
}

function parseFile(root: string, absPath: string): Task {
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

interface Harness {
  root: string;
  absPath: string;
  deps: DebugTldrDeps;
  runMock: Mock<DebugTldrRunFn>;
  prompts: string[];
  changed: string[];
  started: string[];
  finished: string[];
}

/** The one-shot runner signature, with the option's `undefined` stripped so it
 *  is a valid `Mock<T>` instantiation type. */
type DebugTldrRunFn = NonNullable<DebugTldrDeps["run"]>;

function harness(
  content: string,
  opts: {
    debuggerEnabled?: boolean;
    transcript?: AgentOutputEntry[];
    logs?: LogEntry[];
    run?: DebugTldrDeps["run"];
  } = {},
): Harness {
  const { root, absPath } = setupFile(content);
  const prompts: string[] = [];
  const changed: string[] = [];
  const started: string[] = [];
  const finished: string[] = [];
  const defaultRun: DebugTldrRunFn = async (_agent, prompt) => {
    prompts.push(prompt);
    return { ok: true, output: "Review agent ran out of credits — pick another and retry." };
  };
  const runMock = (opts.run ? vi.fn(opts.run) : vi.fn(defaultRun)) as Mock<DebugTldrRunFn>;
  const deps: DebugTldrDeps = {
    config: config(root, opts.debuggerEnabled ?? true),
    getTask: () => parseFile(root, absPath),
    getTranscript: () => opts.transcript ?? [],
    getTaskLogs: () => opts.logs ?? [],
    onTaskFileChanged: (p) => changed.push(p),
    onDiagnosisStarted: (id) => started.push(id),
    onDiagnosisFinished: (id) => finished.push(id),
    run: runMock as unknown as DebugTldrDeps["run"],
  };
  return { root, absPath, deps, runMock, prompts, changed, started, finished };
}

const REVIEWER_LINES: AgentOutputEntry[] = [
  { type: "text", text: "Starting review pass" },
  { type: "sys", d: "github copilot: You have exceeded your monthly quota (Request ID: 42)" },
];

describe("debug tl;dr field plumbing", () => {
  it("parses debug_tldr frontmatter onto the Task", () => {
    const { root, absPath } = setupFile(
      FAILED.replace(
        'needs_input_detail: "You have exceeded your monthly quota (Request ID: 123)"',
        [
          'needs_input_detail: "You have exceeded your monthly quota (Request ID: 123)"',
          'debug_tldr: "Review agent ran out of credits — choose another and retry."',
          'debug_tldr_at: "2026-09-28T12:00:00Z"',
          'debug_tldr_key: "review-failed::quota"',
        ].join("\n"),
      ),
    );
    const t = parseFile(root, absPath);
    expect(t.debugTldr).toBe("Review agent ran out of credits — choose another and retry.");
    expect(t.debugTldrAt).toBe("2026-09-28T12:00:00Z");
    expect(t.debugTldrKey).toBe("review-failed::quota");
    expect(t.extra.debug_tldr).toBeUndefined();
  });

  it("serializes the fields only while needsInput is true — clearing the flag drops them", () => {
    const { root, absPath } = setupFile(FAILED);
    const t = parseFile(root, absPath);
    t.debugTldr = "Review agent ran out of credits.";
    t.debugTldrAt = "2026-09-28T12:00:00Z";
    t.debugTldrKey = tldrFingerprint("review-failed", t.needsInputDetail);
    const flagged = parseTask({
      content: serializeTask(t),
      absPath,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    expect(flagged.debugTldr).toBe("Review agent ran out of credits.");
    expect(flagged.debugTldrKey).toBe(tldrFingerprint("review-failed", flagged.needsInputDetail));

    // Every clear path (dismiss, review-again, status advance, release) ends
    // in needsInput: false — the sentence must not outlive its failure.
    const cleared = parseTask({
      content: serializeTask({ ...t, needsInput: false }),
      absPath,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    expect(cleared.needsInput).toBe(false);
    expect(cleared.debugTldr).toBeUndefined();
    expect(cleared.debugTldrAt).toBeUndefined();
    expect(cleared.debugTldrKey).toBeUndefined();
  });

  it("patchTaskFile(needsInput: false) clears the persisted sentence and the returned Task", () => {
    const { root, absPath } = setupFile(FAILED);
    const flagged = parseFile(root, absPath);
    flagged.debugTldr = "Review agent ran out of credits.";
    flagged.debugTldrAt = "2026-09-28T12:00:00Z";
    flagged.debugTldrKey = tldrFingerprint("review-failed", flagged.needsInputDetail);
    writeFileSync(absPath, serializeTask(flagged));

    const after = patchTaskFile(config(root), absPath, { needsInput: false });
    expect(after.debugTldr).toBeUndefined();
    const onDisk = readFileSync(absPath, "utf8");
    expect(onDisk).not.toContain("debug_tldr");
    expect(parseFile(root, absPath).debugTldr).toBeUndefined();
  });
});

describe("isDiagnosableReason", () => {
  it("accepts the failure reasons and rejects questions/underspecified escalations", () => {
    for (const reason of [
      "review-failed",
      "dev-error",
      "check-failed-after-retries",
      "watchdog-stuck",
    ]) {
      expect(isDiagnosableReason(reason)).toBe(true);
    }
    for (const reason of [
      "cto-escalation",
      "questions",
      "underspecified",
      "review-rounds-exhausted",
      undefined,
    ]) {
      expect(isDiagnosableReason(reason)).toBe(false);
    }
  });
});

describe("sanitizeTldrAnswer", () => {
  it("takes the first non-empty line, strips quotes and a tl;dr prefix, collapses whitespace", () => {
    expect(
      sanitizeTldrAnswer("opencode", "“Review agent ran out of credits — pick another.”"),
    ).toBe("Review agent ran out of credits — pick another.");
    expect(
      sanitizeTldrAnswer("opencode", "tl;dr: Reviewer hit its quota. Retry with another agent."),
    ).toBe("Reviewer hit its quota. Retry with another agent.");
    expect(sanitizeTldrAnswer("opencode", "  A   b\n\n  c  ")).toBe("A b");
    expect(sanitizeTldrAnswer("opencode", "")).toBeNull();
    expect(sanitizeTldrAnswer("opencode", "\n  \n")).toBeNull();
    // A non-default Debugger CLI: the report text parses with THAT cli's
    // format, not a hardcoded one.
    expect(sanitizeTldrAnswer("claude code", "Review agent ran out of credits.")).toBe(
      "Review agent ran out of credits.",
    );
  });

  it("hard-caps a runaway answer", () => {
    const long = "x".repeat(400);
    const out = sanitizeTldrAnswer("opencode", long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(280);
    expect(out!.endsWith("…")).toBe(true);
  });
});

describe("buildDebugTldrPrompt", () => {
  it("asks for exactly one sentence with the cause and next action", () => {
    const prompt = buildDebugTldrPrompt(
      { id: "0570", title: "Failing task" },
      "review-failed",
      "quota exceeded",
      "log excerpt",
    );
    expect(prompt).toContain("#0570");
    expect(prompt).toContain("review-failed");
    expect(prompt).toContain("quota exceeded");
    expect(prompt).toContain("log excerpt");
    expect(prompt).toContain("EXACTLY ONE sentence");
  });
});

describe("DebugTldrManager", () => {
  it("runs the Debugger once and persists the sentence on the task", async () => {
    const h = harness(FAILED, { transcript: REVIEWER_LINES });
    const manager = new DebugTldrManager(h.deps);
    const result = await manager.run("0570", "review-failed");

    expect(result.ok).toBe(true);
    expect(result.tldr).toBe("Review agent ran out of credits — pick another and retry.");
    expect(h.runMock).toHaveBeenCalledTimes(1);
    expect(h.started).toEqual(["0570"]);
    expect(h.finished).toEqual(["0570"]);
    expect(h.changed).toEqual([h.absPath]);

    const t = parseFile(h.root, h.absPath);
    expect(t.debugTldr).toBe("Review agent ran out of credits — pick another and retry.");
    expect(t.debugTldrKey).toBe(tldrFingerprint("review-failed", t.needsInputDetail));
    expect(t.debugTldrAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("books the one-shot call in the sessions db under the task as the debugger role", async () => {
    const h = harness(FAILED, {
      run: async () => ({
        ok: true,
        output: "Review agent ran out of credits.",
        elapsedMs: 1500,
        inputTokens: 500,
        outputTokens: 20,
        totalTokens: 520,
        costUsd: 0.001,
      }),
    });
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");

    const db = new RepoOSDb(h.root);
    try {
      const role = db.getTaskStats("0570")?.roles.find((r) => r.role === "debugger");
      expect(role).toBeDefined();
      expect(role!.totalTokens).toBe(520);
    } finally {
      db.close();
    }
  });

  it("feeds the reviewer transcript tail to the prompt for review-failed", async () => {
    const h = harness(FAILED, { transcript: REVIEWER_LINES });
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");
    expect(h.prompts[0]).toContain("exceeded your monthly quota");
  });

  it("redacts secrets before the failure context reaches the model", async () => {
    const h = harness(
      FAILED.replace("(Request ID: 123)", "(Request ID: 123) token=ghp_abcdefghijklmnopqrstuvwx"),
      { transcript: [{ type: "sys", d: "boom sk-live-abcdefghijklmnopqrstuv" }] },
    );
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");
    expect(h.prompts.join("\n")).not.toContain("ghp_abcdefghijklmnopqrstuvwx");
    expect(h.prompts.join("\n")).not.toContain("sk-live-abcdefghijklmnopqrstuv");
    expect(h.prompts.join("\n")).toContain("***REDACTED***");
  });

  it("skips when the Debugger is disabled", async () => {
    const h = harness(FAILED, { debuggerEnabled: false });
    const manager = new DebugTldrManager(h.deps);
    const result = await manager.run("0570", "review-failed");
    expect(result).toEqual({ ok: false, reason: "debugger disabled" });
    expect(h.runMock).not.toHaveBeenCalled();
    expect(h.started).toEqual([]);
  });

  it("skips when the failure is no longer the current one", async () => {
    const h = harness(FAILED);
    const manager = new DebugTldrManager(h.deps);
    expect(await manager.run("0570", "dev-error")).toEqual({
      ok: false,
      reason: "failure no longer current",
    });
    // Cleared flag.
    writeFileSync(h.absPath, serializeTask({ ...parseFile(h.root, h.absPath), needsInput: false }));
    expect(await manager.run("0570", "review-failed")).toEqual({
      ok: false,
      reason: "failure no longer current",
    });
    expect(h.runMock).not.toHaveBeenCalled();
  });

  it("does not regenerate while the persisted tl;dr describes the same failure", async () => {
    const h = harness(FAILED);
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");
    const calls = h.runMock.mock.calls.length;
    const again = await manager.run("0570", "review-failed");
    expect(again).toEqual({ ok: false, reason: "tl;dr already current" });
    expect(h.runMock.mock.calls.length).toBe(calls);
  });

  it("regenerates when the failure detail changes", async () => {
    const h = harness(FAILED);
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");

    const current = parseFile(h.root, h.absPath);
    current.needsInputDetail = "a different error entirely";
    writeFileSync(h.absPath, serializeTask(current));

    const again = await manager.run("0570", "review-failed");
    expect(again.ok).toBe(true);
    expect(h.runMock).toHaveBeenCalledTimes(2);
    const t = parseFile(h.root, h.absPath);
    expect(t.debugTldrKey).toBe(tldrFingerprint("review-failed", "a different error entirely"));
  });

  it("never runs two diagnoses for the same task at once", async () => {
    let release!: (r: { ok: true; output: string }) => void;
    const gate = new Promise<{ ok: true; output: string }>((resolve) => {
      release = resolve;
    });
    const h = harness(FAILED, { run: () => gate });
    const manager = new DebugTldrManager(h.deps);
    const first = manager.run("0570", "review-failed");
    const second = await manager.run("0570", "review-failed");
    expect(second).toEqual({ ok: false, reason: "already running" });
    release({ ok: true, output: "Review agent ran out of credits." });
    expect((await first).ok).toBe(true);
    expect(h.finished).toEqual(["0570"]);
  });

  it("keeps the newest log lines when the excerpt truncates", async () => {
    // getTaskLogs is newest-first; a head-slice keeps the freshest. The tail
    // would keep the OLDEST lines and miss the failure entirely.
    const filler = "y".repeat(120);
    const logs = [
      {
        timestamp: "t0",
        level: "error" as const,
        component: "task" as const,
        message: "FRESHEST failure line",
      },
      ...Array.from({ length: 39 }, (_, i) => ({
        timestamp: `t${i + 1}`,
        level: "info" as const,
        component: "task" as const,
        message: `older ${i} ${filler} ${filler} ${filler}`,
      })),
    ];
    const h = harness(FAILED, { logs });
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");
    expect(h.prompts[0]).toContain("FRESHEST failure line");
    // The oldest lines — the tail of the newest-first list — are the ones cut.
    expect(h.prompts[0]).not.toContain("older 39");
  });

  it("redacts secrets before any length cut clips the logs", async () => {
    const secret = "token=ghp_abcdefghijklmnopqrstuvwx";
    // A secret sitting entirely inside the 40th (oldest, clipped) line would
    // have been safe anyway; the interesting case is one whose redacted
    // replacement crosses the cut. Simple check: a secret near the head
    // survives the slice only as ***REDACTED***.
    const filler = "z".repeat(100);
    const logs = [
      {
        timestamp: "t0",
        level: "error" as const,
        component: "task" as const,
        message: `line with ${secret}`,
      },
      ...Array.from({ length: 39 }, (_, i) => ({
        timestamp: `t${i + 1}`,
        level: "info" as const,
        component: "task" as const,
        message: `older ${i} ${filler} ${filler} ${filler} ${filler}`,
      })),
    ];
    const h = harness(FAILED, { logs });
    const manager = new DebugTldrManager(h.deps);
    await manager.run("0570", "review-failed");
    expect(h.prompts.join("\n")).not.toContain("ghp_abcdefghijklmnopqrstuvwx");
    expect(h.prompts.join("\n")).toContain("***REDACTED***");
  });

  it("leaves no tl;dr behind when the run fails", async () => {
    const h = harness(FAILED, { run: async () => ({ ok: false, error: "cli exploded" }) });
    const manager = new DebugTldrManager(h.deps);
    const result = await manager.run("0570", "review-failed");
    expect(result).toEqual({ ok: false, reason: "cli exploded" });
    expect(h.finished).toEqual(["0570"]);
    const t = parseFile(h.root, h.absPath);
    expect(t.debugTldr).toBeUndefined();
    expect(t.debugTldrKey).toBeUndefined();
  });

  it("skips the write when the failure clears while the model runs", async () => {
    const h = harness(FAILED, {
      run: async () => {
        // The human dismisses the flag (or a fresh review starts) mid-flight.
        writeFileSync(
          h.absPath,
          serializeTask({ ...parseFile(h.root, h.absPath), needsInput: false }),
        );
        return { ok: true, output: "Review agent ran out of credits." };
      },
    });
    const manager = new DebugTldrManager(h.deps);
    const result = await manager.run("0570", "review-failed");
    expect(result).toEqual({ ok: false, reason: "failure cleared while diagnosing" });
    expect(h.changed).toEqual([]);
    expect(parseFile(h.root, h.absPath).debugTldr).toBeUndefined();
  });

  it("skips the write when a different failure replaced the one being diagnosed", async () => {
    const h = harness(FAILED, {
      run: async () => {
        const current = parseFile(h.root, h.absPath);
        current.needsInputDetail = "a newer, different error";
        writeFileSync(h.absPath, serializeTask(current));
        return { ok: true, output: "Review agent ran out of credits." };
      },
    });
    const manager = new DebugTldrManager(h.deps);
    const result = await manager.run("0570", "review-failed");
    expect(result).toEqual({ ok: false, reason: "failure cleared while diagnosing" });
    expect(parseFile(h.root, h.absPath).debugTldr).toBeUndefined();
  });

  it("ignores escalations that are questions, not errors", async () => {
    const h = harness(FAILED);
    const manager = new DebugTldrManager(h.deps);
    manager.onFailureEscalated("0570", "underspecified");
    manager.onFailureEscalated("0570", "cto-escalation");
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.runMock).not.toHaveBeenCalled();
  });

  it("onFailureEscalated drives the whole pass fire-and-forget", async () => {
    const h = harness(FAILED, { transcript: REVIEWER_LINES });
    const manager = new DebugTldrManager(h.deps);
    manager.onFailureEscalated("0570", "review-failed");
    await vi.waitFor(() => {
      expect(parseFile(h.root, h.absPath).debugTldr).toBeDefined();
    });
    expect(h.started).toEqual(["0570"]);
    expect(h.finished).toEqual(["0570"]);
  });
});
