/**
 * Message queueing: when an agent is busy, messages are queued instead of
 * refused, and delivered at the start of the next turn in order.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import { writeHandoffRequest } from "../../server/handoff-request.js";
import { parseTask } from "../../core/task";
import type { Agent, RepoOSConfig, Task } from "../../core/types";

const FAKEBIN = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, (process.env.REPOOS_TASK_ID || "") + "\\n");
setTimeout(() => {
  process.stdout.write("done\\n");
}, 100);
`;

interface Fixture {
  root: string;
  bin: string;
  log: string;
  clean: () => void;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-msg-queue-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "qwen"), FAKEBIN, { mode: 0o755 });
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function withFakePath(fx: Fixture): string {
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  return oldPath;
}

/** Poll until `predicate` is true, or throw after `timeoutMs`. */
async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`condition not met after ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
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

/** A real task file so `recordTaskActivity` can append to its Activity log. */
function setupTaskFile(root: string, id: string, status = "review"): string {
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const absPath = join(workDir, `${id}-test.md`);
  writeFileSync(
    absPath,
    `---
id: "${id}"
title: Test task
type: feature
status: ${status}
priority: p2
area: web
assigned_to: ai
created_by: test
---
## Problem

Body.

## Activity

- 2026-01-01T00:00:00Z · created · test
`,
  );
  return absPath;
}

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    maxConcurrentAgents: 1,
    // A busy runner's pressure guard defers the first start(), so `start()`
    // returns `{ queued: true }` with no pid and the busy-turn assertions below
    // never run (#0891). These tests measure queueing, not host pressure; the
    // guard has its own suite.
    pressureGuard: { enabled: false },
  };
}

const task = (id: string): Task => ({
  id,
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: `feat/${id}`,
  tags: [],
  needsInput: false,
  needsMerge: false,
  noSourceChange: false,
  created_at: null,
  updated_at: null,
  path: `work/${id}-test.md`,
  absPath: `/tmp/work/${id}-test.md`,
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
});

const agent: Agent = { name: "engineer", cli: "qwen code", model: "default", enabled: true };

describe("message queueing", () => {
  it("should queue a message when agent is busy (returns queued instead of error)", () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd), () => {});

    try {
      const t = task("busy-test");
      const startRes = runner.start(t, "feat/busy-test", agent, { cwd });
      expect(startRes.ok).toBe(true);
      expect(startRes.pid).toBeDefined();

      // While the agent is running, send a message
      const sendRes = runner.send(t.id, "This is a queued message", agent);
      expect(sendRes.ok).toBe(true);
      expect(sendRes.queued).toBe(true);
      expect(sendRes.busy).toBeUndefined();
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("should deliver queued messages in order on next turn", () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd), () => {});

    try {
      const t = task("order-test");

      // Start first run
      const startRes1 = runner.start(t, "feat/order-test", agent, { cwd });
      expect(startRes1.ok).toBe(true);

      // Queue two messages while running
      const sendRes1 = runner.send(t.id, "Message 1", agent);
      expect(sendRes1.queued).toBe(true);

      const sendRes2 = runner.send(t.id, "Message 2", agent);
      expect(sendRes2.queued).toBe(true);

      // Verify messages are queued
      const queuedMsgs = runner["queuedMessages"].get(t.id);
      expect(queuedMsgs).toBeDefined();
      expect(queuedMsgs?.length).toBe(2);
      expect(queuedMsgs?.[0].text).toBe("Message 1");
      expect(queuedMsgs?.[1].text).toBe("Message 2");
      expect(queuedMsgs?.[0].text).toBe("Message 1");
      expect(queuedMsgs?.[1].text).toBe("Message 2");
      // Verify they maintain order
      const queuedTexts = queuedMsgs?.map((m) => m.text) ?? [];
      expect(queuedTexts).toEqual(["Message 1", "Message 2"]);
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("flags an overdue message instead of dropping it (#0821)", () => {
    const fx = makeFixture();
    const absPath = setupTaskFile(fx.root, "expire-test", "active");
    const runner = new AgentRunner(config(fx.root), () => {}, {
      stallTimeoutMs: 1000,
      stallCheckIntervalMs: 500,
      getTask: () => parseFile(fx.root, absPath),
    });

    try {
      const taskId = "expire-test";
      const veryOldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      runner["queuedMessages"].set(taskId, [
        { text: "Old message", agent, opts: {}, queuedAt: veryOldTime },
      ]);
      runner["messageQueuedAt"].set(taskId, veryOldTime);

      runner["checkExpiredMessages"]();

      // Retained, not dropped — and reported overdue so the UI can flag it.
      expect(runner["queuedMessages"].has(taskId)).toBe(true);
      const summary = runner.queuedMessageSummary();
      expect(summary).toHaveLength(1);
      expect(summary[0]).toMatchObject({ id: taskId, count: 1, overdue: true });
      // The overdue flag is recorded on the task's activity log.
      expect(readFileSync(absPath, "utf8")).toContain("message_overdue");
    } finally {
      runner.dispose();
      fx.clean();
    }
  });

  it("delivers a message queued during a turn when that turn ends (#0821)", async () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd), () => {});

    try {
      const t = task("turn-end-delivery-test");
      const startRes = runner.start(t, "feat/turn-end-delivery-test", agent, { cwd });
      expect(startRes.ok).toBe(true);

      // Queue while the turn runs.
      expect(runner.send(t.id, "Read me when the turn ends", agent).queued).toBe(true);
      expect(runner["queuedMessages"].get(t.id)?.length).toBe(1);

      // Without another send or start, the end of the turn delivers the message
      // by starting a fresh turn — the fakebin is spawned a second time.
      await waitFor(() => {
        try {
          const log = readFileSync(fx.log, "utf8").trim().split("\n").filter(Boolean);
          return log.length >= 2;
        } catch {
          return false;
        }
      });

      // The queue is drained and the queued text is in the transcript.
      await waitFor(() => !runner["queuedMessages"].has(t.id));
      const session = runner["sessions"].get(t.id);
      const texts = (session?.lines ?? [])
        .filter((l) => "text" in l && l.type === "human")
        .map((e) => (e as { text: string }).text);
      expect(texts).toContain("Read me when the turn ends");
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("persists queued messages across a restart (#0821)", () => {
    const fx = makeFixture();
    const cwd = fx.bin;
    const first = new AgentRunner(config(cwd), () => {});
    try {
      const queuedAt = new Date().toISOString();
      first["queuedMessages"].set("persist-test", [
        { text: "survive the restart", agent, opts: {}, queuedAt },
      ]);
      first["messageQueuedAt"].set("persist-test", queuedAt);
      first["persistQueuedMessages"]();
    } finally {
      first.dispose();
    }

    const second = new AgentRunner(config(cwd), () => {});
    try {
      const restored = second["queuedMessages"].get("persist-test");
      expect(restored?.length).toBe(1);
      expect(restored?.[0].text).toBe("survive the restart");
      expect(second.queuedMessageSummary()[0]).toMatchObject({ id: "persist-test", count: 1 });
    } finally {
      second.dispose();
      fx.clean();
    }
  });

  it("delivers a message queued while the task is in review when the engineer next runs (#0821)", () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const absPath = setupTaskFile(fx.root, "0821", "review");
    const t: Task = { ...task("0821"), status: "review", absPath, path: "work/0821-test.md" };
    const runner = new AgentRunner(config(fx.root), () => {}, {
      getTask: () => parseFile(fx.root, absPath),
    });

    try {
      const queuedAt = new Date().toISOString();
      runner["queuedMessages"].set(t.id, [
        { text: "apply the review fix", agent, opts: {}, queuedAt },
      ]);
      runner["messageQueuedAt"].set(t.id, queuedAt);

      // The engineer next runs — the held queue is delivered and recorded.
      const res = runner.start(t, "feat/0821", agent, { cwd: fx.bin });
      expect(res.ok).toBe(true);
      expect(runner["queuedMessages"].has(t.id)).toBe(false);
      expect(readFileSync(absPath, "utf8")).toContain("message_delivered");
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("queues a startChat for a busy chat instead of refusing it (#0821)", () => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd), () => {});

    try {
      const first = runner.startChat("chat-key", "hello", agent, "context");
      expect(first.ok).toBe(true);
      const second = runner.startChat("chat-key", "queued follow-up", agent, "context");
      expect(second.ok).toBe(true);
      expect(second.queued).toBe(true);
      expect(runner["queuedMessages"].get("chat-key")?.[0].text).toBe("queued follow-up");
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("exposes hasQueuedMessages for handoff deferral (#0865)", () => {
    const fx = makeFixture();
    const runner = new AgentRunner(config(fx.root), () => {});
    try {
      expect(runner.hasQueuedMessages("none")).toBe(false);
      runner["queuedMessages"].set("0865", [
        { text: "wait", agent, opts: {}, queuedAt: new Date().toISOString() },
      ]);
      expect(runner.hasQueuedMessages("0865")).toBe(true);
    } finally {
      runner.dispose();
      fx.clean();
    }
  });

  it("tracks queue age from the earliest message, not the latest (#0821)", () => {
    const fx = makeFixture();
    const runner = new AgentRunner(config(fx.root), () => {});

    try {
      const taskId = "expiry-timing-test";
      const baseTime = Date.now() - 70 * 60 * 1000; // 70 minutes ago
      const firstTime = new Date(baseTime).toISOString();
      runner["queuedMessages"].set(taskId, [
        { text: "Message 1", agent, opts: {}, queuedAt: firstTime },
      ]);
      runner["messageQueuedAt"].set(taskId, firstTime);

      const secondTime = new Date(baseTime + 50 * 60 * 1000).toISOString();
      const messages = runner["queuedMessages"].get(taskId) ?? [];
      messages.push({ text: "Message 2", agent, opts: {}, queuedAt: secondTime });
      runner["queuedMessages"].set(taskId, messages);
      expect(runner["messageQueuedAt"].get(taskId)).toBe(firstTime);

      // Overdue is judged from the FIRST message's age, and both are retained.
      runner["checkExpiredMessages"]();
      expect(runner["queuedMessages"].has(taskId)).toBe(true);
      expect(runner.queuedMessageSummary()[0].overdue).toBe(true);
    } finally {
      runner.dispose();
      fx.clean();
    }
  });
});

describe("handoff deferral while messages are queued (#0865)", () => {
  // One row per turn-end state. A handoff requested in the same turn as a still
  // queued message must be deferred (and noted) so the human's message is read
  // BEFORE any review starts; with nothing queued the handoff stands.
  it.each([
    { label: "a queued message", queued: ["Please also fix the docs"], deferred: true },
    { label: "two queued messages", queued: ["first", "second"], deferred: true },
    { label: "no queued message", queued: [] as string[], deferred: false },
  ])("with $label the handoff is deferred: $deferred", async ({ queued, deferred }) => {
    const fx = makeFixture();
    const oldPath = withFakePath(fx);
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const id = "defer-test";
    const absPath = setupTaskFile(fx.root, id, "active");
    const onHandoff = vi.fn();
    const runner = new AgentRunner(config(fx.root), () => {}, {
      getTask: () => parseFile(fx.root, absPath),
      onHandoff,
    });
    try {
      const t = task(id);
      expect(runner.start(t, `feat/${id}`, agent, { cwd: fx.bin }).ok).toBe(true);
      for (const text of queued) expect(runner.send(id, text, agent).queued).toBe(true);
      // The engineer asks for handoff in the same turn the messages were queued.
      const entry = runner["entries"].get(id) as { handoffRequested?: boolean } | undefined;
      expect(entry).toBeDefined();
      entry!.handoffRequested = true;

      await waitFor(() => !runner.isRunning(id), 8000);
      const activity = readFileSync(absPath, "utf8");
      if (deferred) {
        expect(activity).toContain(
          `handoff_deferred: ${queued.length} queued message(s) must be read before review`,
        );
        // The deferral clears the persisted handoff so no review is triggered.
        expect(runner.hasPendingHandoff(id)).toBe(false);
        expect(onHandoff).not.toHaveBeenCalled();
      } else {
        expect(activity).not.toContain("handoff_deferred");
        expect(onHandoff).toHaveBeenCalledOnce();
      }
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      fx.clean();
    }
  });

  it("defers handoff when repoos mv request file lands in the same turn as a queued message (#0865)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-msg-handoff-file-"));
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "qwen"),
      `#!/usr/bin/env node
setTimeout(() => { process.stdout.write("done\\n"); }, 250);
`,
      { mode: 0o755 },
    );
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    const id = "mv-defer";
    const absPath = setupTaskFile(root, id, "active");
    const onHandoff = vi.fn();
    const runner = new AgentRunner(config(root), () => {}, {
      getTask: () => parseFile(root, absPath),
      onHandoff,
    });
    try {
      const t = task(id);
      expect(runner.start(t, `feat/${id}`, agent, { cwd: bin }).ok).toBe(true);
      expect(runner.send(id, "read this before review", agent).queued).toBe(true);
      const entry = runner["entries"].get(id) as { runId?: string } | undefined;
      expect(entry?.runId).toBeTruthy();
      expect(
        writeHandoffRequest(root, ".repoos", {
          taskId: id,
          runId: entry!.runId!,
          at: new Date().toISOString(),
          source: "repoos-mv",
        }),
      ).toBe(true);

      await waitFor(() => !runner.isRunning(id), 8000);

      const activity = readFileSync(absPath, "utf8");
      expect(activity).toContain(
        "handoff_deferred: 1 queued message(s) must be read before review",
      );
      expect(onHandoff).not.toHaveBeenCalled();
      expect(runner.hasPendingHandoff(id)).toBe(false);
      await waitFor(() => readFileSync(absPath, "utf8").includes("message_delivered"));
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
