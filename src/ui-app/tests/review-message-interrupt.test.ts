/**
 * #0865: a human message sent while a review is in flight (or open) must reach
 * the engineer, never be refused as "review in progress". The route cancels the
 * running review, records why in the task's Activity, moves the task back to
 * `active` and delivers the message. Table-driven over the task state.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";
import type { RouteContext } from "../../server/routes/types.js";
import { taskAction } from "../../server/routes/tasks.js";

const ENGINEER: Agent = { name: "engineer", cli: "opencode", model: "default", enabled: true };

function makeFixture(status: "review" | "active", reviewRunning: boolean) {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-msg-"));
  mkdirSync(join(root, "work"), { recursive: true });
  const taskPath = join(root, "work", "0865-test.md");
  writeFileSync(
    taskPath,
    `---
id: "0865"
title: Test task
type: feature
status: ${status}
priority: p2
area: server
assigned_to: ai
---
## Problem

Body.

## Activity

- 2026-01-01T00:00:00Z · created · test
`,
  );
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    agents: [ENGINEER],
  };
  const read = () =>
    parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
  const cancel = vi.fn();
  const send = vi.fn(() => ({ ok: true, queued: false }));
  const ctx = {
    config,
    index: {
      getTask: () => read(),
      getTasks: () => [read()],
      applyFileChange: () => {},
      refreshBranches: () => {},
    } as any,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => reviewRunning, cancel } as any,
    runner: {
      isRunning: () => false,
      send,
      stop: vi.fn(() => ({ stopped: true })),
      markPaused: vi.fn(),
      waitForStop: vi.fn(async () => true),
    } as any,
    previews: { stop: vi.fn(async () => {}) } as any,
    cto: {} as any,
    freeformRuns: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: { getJob: () => undefined, enqueue: () => ({}), allJobs: () => [] } as any,
    reportedStages: {},
    reportedStageAt: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: { task: vi.fn(), system: () => {}, agent: () => {} } as any,
    onServerStatusChange: () => {},
    startUnifiedHandoff: () => ({ started: false, reason: "not wired" }),
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  } as unknown as RouteContext;
  return { ctx, read, cancel, send, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function req(body: unknown): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  } as unknown as IncomingMessage;
}

function makeRes() {
  const fake = { status: 0, payload: undefined as any };
  return {
    res: {
      writeHead(code: number) {
        fake.status = code;
      },
      end(p: string) {
        fake.payload = p ? JSON.parse(p) : undefined;
      },
    } as any,
    fake,
  };
}

describe("message while a review is open or running (#0865)", () => {
  it.each([
    {
      label: "a review is running",
      status: "review" as const,
      reviewRunning: true,
      cancelled: true,
      note: "message interrupts in-flight review",
    },
    {
      label: "the review has finished and the task awaits sign-off",
      status: "review" as const,
      reviewRunning: false,
      cancelled: false,
      note: "follow-up message — moved from review to active",
    },
  ])("is delivered when $label", async ({ status, reviewRunning, cancelled, note }) => {
    const fx = makeFixture(status, reviewRunning);
    try {
      const { res, fake } = makeRes();
      await taskAction(fx.ctx, req({ text: "please also handle X" }), res, {
        param1: "0865",
        param2: "message",
      });
      // Never refused with "review in progress".
      expect(fake.status).not.toBe(409);
      expect(JSON.stringify(fake.payload ?? {})).not.toMatch(/review in progress/i);
      expect(fx.cancel).toHaveBeenCalledTimes(cancelled ? 1 : 0);
      expect(fx.read().status).toBe("active");
      expect(readFileSync(fx.read().absPath, "utf8")).toContain(note);
      expect(fx.send).toHaveBeenCalled();
    } finally {
      fx.clean();
    }
  });
});
