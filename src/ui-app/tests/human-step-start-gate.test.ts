/**
 * #0804 — the decision-model gate on the start route.
 *
 * `runHumanStepDecisionCheck` is mocked so the route wiring is exercised
 * without a network call: a `human` verdict must refuse the start and flag the
 * task with the explanation; an `agent` verdict must start it and leave the
 * keyword heuristic suppressed.
 */
import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTask } from "../../core/task.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";
import type { RouteContext } from "../../server/routes/types.js";

vi.mock("../../server/human-step-decision.js", () => ({
  runHumanStepDecisionCheck: vi.fn(),
}));

import { runHumanStepDecisionCheck } from "../../server/human-step-decision.js";
import { taskAction } from "../../server/routes/tasks.js";

vi.mock("../../core/bootstrap.js", () => ({
  bootstrap: vi.fn(async () => ({
    ok: false,
    reason: "test stop after task activation",
    durationMs: 1,
    steps: [],
  })),
}));

const ENGINEER_AGENT: Agent = {
  name: "engineer",
  cli: "opencode",
  model: "default",
  enabled: true,
};

const KEYS_BODY = `## Problem

Replace the token store.

## Desired UX

N/A

## Acceptance criteria

- [ ] The dev config no longer reads the API keys from disk
- [ ] Tests still pass

## Notes for AI

Standard.
`;

function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-human-step-route-"));
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const taskPath = join(workDir, "0804-keys.md");
  writeFileSync(
    taskPath,
    `---
id: "0804"
title: Keys task
type: feature
status: ready
priority: p2
area: server
assigned_to: ai
hotfix: true
---
${KEYS_BODY}`,
  );
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  const config: RepoOSConfig = {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    agents: [ENGINEER_AGENT],
    modelRouting: { mode: "automatic", provider: "jev", humanStepCheck: true },
  };
  const read = () =>
    parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
  const ctx: RouteContext = {
    config,
    index: {
      getTask: () => read(),
      getTasks: () => [read()],
      applyFileChange: () => {},
      refreshBranches: () => {},
    } as any,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => false, cancel: vi.fn() } as any,
    runner: { isRunning: () => false, stop: vi.fn(() => ({ stopped: true })) } as any,
    previews: { stop: vi.fn(async () => {}) } as any,
    cto: {} as any,
    freeformRuns: {} as any,
    repoos: {} as any,
    emitEvent: () => {},
    closeOutLock: {} as any,
    rootLock: {} as any,
    jobCoordinator: { enqueue: () => ({}), allJobs: () => [] } as any,
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
  };
  return {
    ctx,
    read,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function makeReq(): IncomingMessage {
  const data = Buffer.from("{}", "utf8");
  return {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  } as unknown as IncomingMessage;
}

function makeRes(): { res: any; fake: { status: number; payload: any } } {
  const fake = { status: 0, payload: undefined as any };
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

describe("decision-model start gate (#0804)", () => {
  it("refuses the start and flags the task with the explanation when the model says human", async () => {
    vi.mocked(runHumanStepDecisionCheck).mockResolvedValue({
      outcome: "human",
      detail:
        "Decision model (91%): split this into an AI task and a human task — it needs a real account, credential, or API key.",
      decision: { needsHumanStep: true, probability: 0.91, reason: "account", explanation: "" },
    });
    const fx = makeFixture();
    try {
      const { res, fake } = makeRes();
      await taskAction(fx.ctx, makeReq(), res, { param1: "0804", param2: "start" });
      expect(fake.status).toBe(409);
      expect(fake.payload.reason).toBe("needs-human-step");
      expect(fake.payload.detail).toContain("split this into an AI task");
      const onDisk = fx.read();
      expect(onDisk.status).toBe("ready");
      expect(onDisk.needsInput).toBe(true);
      expect(onDisk.needsInputReason).toBe("needs-human-step");
      expect(onDisk.needsInputDetail).toContain("real account");
      expect(onDisk.humanStepDecision).toBe("human");
    } finally {
      fx.clean();
    }
  });

  it("starts the task and suppresses the keyword flag when the model says an agent can do it", async () => {
    vi.mocked(runHumanStepDecisionCheck).mockResolvedValue({
      outcome: "agent",
      detail: "Decision model (4%): no step only a human can do — an AI agent can do this task.",
      decision: { needsHumanStep: false, probability: 0.04, reason: "none", explanation: "" },
    });
    const fx = makeFixture();
    try {
      const { res } = makeRes();
      await taskAction(fx.ctx, makeReq(), res, { param1: "0804", param2: "start" });
      const onDisk = fx.read();
      expect(onDisk.status).toBe("active");
      expect(onDisk.needsInput).toBe(false);
      expect(onDisk.humanStepDecision).toBe("agent");
    } finally {
      fx.clean();
    }
  });

  it("falls back to the keyword check when the model call fails", async () => {
    vi.mocked(runHumanStepDecisionCheck).mockResolvedValue({
      outcome: "failed",
      error: "timeout",
    });
    const fx = makeFixture();
    try {
      const { res } = makeRes();
      await taskAction(fx.ctx, makeReq(), res, { param1: "0804", param2: "start" });
      const onDisk = fx.read();
      expect(onDisk.status).toBe("active");
      // The 'keys' word matches the keyword heuristic, so the flag is raised.
      expect(onDisk.needsInputReason).toBe("needs-human-step");
    } finally {
      fx.clean();
    }
  });

  it("refuses a human-step task before healing a phantom, and heals once the gate allows the start", async () => {
    const release = vi.fn();
    let running = true;
    const fx = makeFixture();
    fx.ctx.runner = {
      isRunning: () => running,
      releasePhantomRunner: (id: string) => {
        release(id);
        running = false;
        return true;
      },
      stop: vi.fn(() => ({ stopped: true })),
    } as any;

    vi.mocked(runHumanStepDecisionCheck).mockResolvedValue({
      outcome: "human",
      detail: "Decision model (91%): this needs a real account.",
      decision: { needsHumanStep: true, probability: 0.91, reason: "account", explanation: "" },
    });
    try {
      const refused = makeRes();
      await taskAction(fx.ctx, makeReq(), refused.res, { param1: "0804", param2: "start" });
      expect(refused.fake.status).toBe(409);
      expect(refused.fake.payload.reason).toBe("needs-human-step");
      expect(release).not.toHaveBeenCalled();
      expect(fx.read().status).toBe("ready");

      vi.mocked(runHumanStepDecisionCheck).mockResolvedValue({
        outcome: "agent",
        detail: "Decision model (4%): an AI agent can do this task.",
        decision: { needsHumanStep: false, probability: 0.04, reason: "none", explanation: "" },
      });
      const started = makeRes();
      await taskAction(fx.ctx, makeReq(), started.res, { param1: "0804", param2: "start" });
      expect(release).toHaveBeenCalledWith("0804");
      expect(fx.read().status).toBe("active");
    } finally {
      fx.clean();
    }
  });
});
