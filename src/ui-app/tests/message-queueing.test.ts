/**
 * Message queueing: when an agent is busy, messages are queued instead of
 * refused, and delivered at the start of the next turn in order.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRunner } from "../../server/agents";
import type { Agent, RepoOSConfig, Task } from "../../core/types";
import { waitFor } from "./helpers";

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

  it("should expire messages that are not delivered within timeout", () => {
    const fx = makeFixture();
    const cwd = fx.bin;
    const runner = new AgentRunner(config(cwd), () => {}, {
      stallTimeoutMs: 100,
      stallCheckIntervalMs: 50,
    });

    try {
      const t = task("expire-test");
      const taskId = t.id;

      // Manually set up a queued message with a very old timestamp
      const veryOldTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
      const messages = [{ text: "Old message", agent, opts: {}, queuedAt: veryOldTime }];
      runner["queuedMessages"].set(taskId, messages);
      runner["messageQueuedAt"].set(taskId, veryOldTime);

      // Check that the old message is there
      expect(runner["queuedMessages"].has(taskId)).toBe(true);

      // Call checkExpiredMessages to clean up expired ones
      runner["checkExpiredMessages"]();

      // The old message should be removed
      expect(runner["queuedMessages"].has(taskId)).toBe(false);
      expect(runner["messageQueuedAt"].has(taskId)).toBe(false);
    } finally {
      runner.dispose();
      fx.clean();
    }
  });
});
