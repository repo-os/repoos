/**
 * Server integration: leaving draft with a stub body raises `underspecified`
 * needs_input after the status write, without clobbering other reasons.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import type { RepoOSConfig } from "../../core/types.js";
import { patchTask, pmMessage, taskAction } from "../../server/routes/tasks.js";
import { flagUnderspecifiedIfNeeded } from "../../server/task-underspecified-flag.js";
import type { Agent } from "../../core/types.js";
import type { RouteContext } from "../../server/routes/types.js";

vi.mock("../../core/bootstrap.js", () => ({
  bootstrap: vi.fn(async () => ({
    ok: false,
    reason: "test stop after task activation",
    durationMs: 1,
    steps: [],
  })),
}));

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
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
  };
}

const STUB_BODY = `## Original prompt

Add a widget counter to the dashboard.
`;

function taskText(status: string, extraFrontmatter = ""): string {
  return `---
id: "0558"
title: Stub task
type: feature
status: ${status}
priority: p2
area: server
assigned_to: ai
${extraFrontmatter}---
${STUB_BODY}`;
}

function makeFixture(status: string, extraFrontmatter = "") {
  const root = mkdtempSync(join(tmpdir(), "repoos-underspecified-flag-"));
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const taskPath = join(workDir, "0558-stub.md");
  writeFileSync(taskPath, taskText(status, extraFrontmatter));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  return {
    root,
    taskPath,
    config: config(root),
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function readTaskFile(fx: ReturnType<typeof makeFixture>) {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  });
}

function makeReq(body: unknown = {}): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  } as unknown as IncomingMessage;
}

function makeRes(): { res: any; fake: { status: number; payload: unknown } } {
  const fake = { status: 0, payload: undefined as unknown };
  return {
    res: {
      writeHead(code: number) {
        fake.status = code;
      },
      end(p: string) {
        fake.payload = p ? JSON.parse(p) : undefined;
      },
    },
    fake,
  };
}

const PM_AGENT: Agent = {
  name: "pm",
  cli: "opencode",
  model: "default",
  enabled: true,
};

const ENGINEER_AGENT: Agent = {
  ...PM_AGENT,
  name: "engineer",
};

function makeCtx(
  fx: ReturnType<typeof makeFixture>,
  runnerOverrides: Record<string, unknown> = {},
): RouteContext {
  return {
    config: { ...fx.config, agents: [PM_AGENT] },
    index: {
      getTask: () => readTaskFile(fx),
      applyFileChange: () => {},
      refreshBranches: () => {},
    } as any,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => false, cancel: vi.fn() } as any,
    runner: {
      isRunning: () => false,
      stop: vi.fn(() => ({ stopped: true })),
      output: () => null,
      startChat: vi.fn(() => ({ ok: true, pid: 42 })),
      ...runnerOverrides,
    } as any,
    previews: { stop: vi.fn(async () => {}) } as any,
    cto: {} as any,
    freeformRuns: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: { enqueue: () => ({}), allJobs: () => [] } as any,
    reportedStages: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: {
      task: vi.fn(),
      system: () => {},
      agent: () => {},
      getTaskLogs: () => [],
      getAgentLogs: () => [],
      getSystemLogs: () => [],
    } as any,
    onServerStatusChange: () => {},
    startUnifiedHandoff: () => ({ started: false, reason: "not wired in this test" }),
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("underspecified flag on task start (#0613)", () => {
  it("raises the flag and logs a visible warning when an underspecified task starts", async () => {
    const fx = makeFixture("ready", "hotfix: true\n");
    try {
      const ctx = makeCtx(fx);
      ctx.config.agents = [ENGINEER_AGENT];
      const { res, fake } = makeRes();
      await taskAction(ctx, makeReq(), res, { param1: "0558", param2: "start" });
      expect(fake.status).toBe(500);
      expect(readTaskFile(fx)).toMatchObject({
        status: "active",
        needsInput: true,
        needsInputReason: "underspecified",
      });
      expect(ctx.logger.task).toHaveBeenCalledWith(
        "0558",
        "warn",
        "Task body is underspecified at start",
        expect.objectContaining({ detail: expect.any(String), needsInputRaised: true }),
      );
    } finally {
      fx.clean();
    }
  });

  it("preserves an unrelated needs_input reason during start", async () => {
    const fx = makeFixture(
      "ready",
      "hotfix: true\nneeds_input: true\nneeds_input_reason: dev-error\n",
    );
    try {
      const ctx = makeCtx(fx);
      ctx.config.agents = [ENGINEER_AGENT];
      const { res } = makeRes();
      await taskAction(ctx, makeReq(), res, { param1: "0558", param2: "start" });
      expect(readTaskFile(fx)).toMatchObject({
        status: "active",
        needsInput: true,
        needsInputReason: "dev-error",
      });
      expect(ctx.logger.task).toHaveBeenCalledWith(
        "0558",
        "warn",
        "Task body is underspecified at start",
        expect.objectContaining({ detail: expect.any(String), needsInputRaised: false }),
      );
    } finally {
      fx.clean();
    }
  });
});

describe("underspecified flag on draft exit (#0558)", () => {
  it("raises needs_input after draft → inbox and keeps the status change", async () => {
    const fx = makeFixture("draft");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "inbox" }), res, { param1: "0558" });
      expect(fake.status).toBe(200);
      const onDisk = readTaskFile(fx);
      expect(onDisk.status).toBe("inbox");
      expect(onDisk.needsInput).toBe(true);
      expect(onDisk.needsInputReason).toBe("underspecified");
      expect(onDisk.needsInputDetail).toContain("missing sections");
    } finally {
      fx.clean();
    }
  });

  it("does not overwrite an existing dev-error needs_input reason", async () => {
    const fx = makeFixture("draft", "needs_input: true\nneeds_input_reason: dev-error\n");
    try {
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ status: "inbox" }), res, { param1: "0558" });
      expect(fake.status).toBe(200);
      const onDisk = readTaskFile(fx);
      expect(onDisk.status).toBe("inbox");
      expect(onDisk.needsInputReason).toBe("dev-error");
    } finally {
      fx.clean();
    }
  });
});

describe("underspecified flag on body edit (#0613)", () => {
  const WELL_SPECIFIED = `## Problem

${"Substantive problem description that is long enough to avoid the short-body heuristic. ".repeat(8)}

## Desired UX

${"Substantive UX description that is long enough to avoid the short-body heuristic. ".repeat(8)}

## Acceptance criteria

- [ ] Users can complete the flow end to end

## Notes for AI

${"Substantive notes that are long enough to avoid the short-body heuristic. ".repeat(6)}

## Activity

- 2026-01-01T00:00:00Z · created
`;

  it("raises needs_input when body and review transition share one PATCH (#0613)", async () => {
    const fx = makeFixture("active");
    try {
      writeFileSync(fx.taskPath, taskText("active", "").replace(STUB_BODY, WELL_SPECIFIED));
      const gutted = WELL_SPECIFIED.replace(
        /## Problem\n\n[\s\S]*?\n\n## Desired UX/,
        "## Problem\n\n\n## Desired UX",
      );
      const { res, fake } = makeRes();
      const ctx = makeCtx(fx);
      ctx.startUnifiedHandoff = () => ({ started: true });
      await patchTask(ctx, makeReq({ status: "review", body: gutted, skipChecks: true }), res, {
        param1: "0558",
      });
      expect(fake.status).toBe(202);
      const onDisk = readTaskFile(fx);
      expect(onDisk.needsInput).toBe(true);
      expect(onDisk.needsInputReason).toBe("underspecified");
    } finally {
      fx.clean();
    }
  });

  it("raises needs_input when a later body edit leaves spec sections empty", async () => {
    const fx = makeFixture("active");
    try {
      writeFileSync(fx.taskPath, taskText("active", "").replace(STUB_BODY, WELL_SPECIFIED));
      const gutted = WELL_SPECIFIED.replace(
        /## Problem\n\n[\s\S]*?\n\n## Desired UX/,
        "## Problem\n\n\n## Desired UX",
      );
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ body: gutted }), res, { param1: "0558" });
      expect(fake.status).toBe(200);
      const onDisk = readTaskFile(fx);
      expect(onDisk.needsInput).toBe(true);
      expect(onDisk.needsInputReason).toBe("underspecified");
    } finally {
      fx.clean();
    }
  });

  it("returns a client error for a malformed section patch", async () => {
    const fx = makeFixture("active");
    try {
      const originalBody = readTaskFile(fx).body;
      const { res, fake } = makeRes();
      await patchTask(makeCtx(fx), makeReq({ section: "Shots" }), res, { param1: "0558" });
      expect(fake.status).toBe(400);
      expect((fake.payload as { error: string }).error).toContain(
        "section must contain string heading and content fields",
      );
      expect(readTaskFile(fx).body).toBe(originalBody);
    } finally {
      fx.clean();
    }
  });

  it("clears underspecified needs_input when the body is fleshed out again", () => {
    const fx = makeFixture("active", "needs_input: true\nneeds_input_reason: underspecified\n");
    try {
      writeFileSync(
        fx.taskPath,
        taskText("active", "needs_input: true\nneeds_input_reason: underspecified\n").replace(
          STUB_BODY,
          WELL_SPECIFIED,
        ),
      );
      const task = readTaskFile(fx);
      const cleared = flagUnderspecifiedIfNeeded(fx.config, task);
      expect(cleared).not.toBeNull();
      expect(cleared!.needsInput).toBe(false);
    } finally {
      fx.clean();
    }
  });
});

describe("flagUnderspecifiedIfNeeded guards (#0558)", () => {
  it("does not replace needs_input that only has agent questions", () => {
    const fx = makeFixture("draft");
    try {
      writeFileSync(
        fx.taskPath,
        taskText("draft", 'needs_input: true\nquestions:\n  - "Which API?"\n'),
      );
      const task = readTaskFile(fx);
      expect(flagUnderspecifiedIfNeeded(fx.config, task)).toBeNull();
    } finally {
      fx.clean();
    }
  });
});

describe("pmMessage underspecified clear (#0558)", () => {
  it("keeps needs_input when the PM runner rejects the send", async () => {
    const fx = makeFixture("inbox", "needs_input: true\nneeds_input_reason: underspecified\n");
    try {
      const { res, fake } = makeRes();
      const ctx = makeCtx(fx, {
        startChat: vi.fn(() => ({ ok: false, busy: true, reason: "PM is busy" })),
      });
      await pmMessage(ctx, makeReq({ text: "Can you flesh this out?" }), res, { param1: "0558" });
      expect(fake.status).toBe(409);
      const onDisk = readTaskFile(fx);
      expect(onDisk.needsInput).toBe(true);
      expect(onDisk.needsInputReason).toBe("underspecified");
    } finally {
      fx.clean();
    }
  });

  it("clears underspecified needs_input after the PM runner accepts the send", async () => {
    const fx = makeFixture("inbox", "needs_input: true\nneeds_input_reason: underspecified\n");
    try {
      const { res, fake } = makeRes();
      await pmMessage(makeCtx(fx), makeReq({ text: "Can you flesh this out?" }), res, {
        param1: "0558",
      });
      expect(fake.status).toBe(200);
      const onDisk = readTaskFile(fx);
      expect(onDisk.needsInput).toBe(false);
    } finally {
      fx.clean();
    }
  });
});
