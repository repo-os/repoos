/**
 * Update requirements on an active task (#0817).
 *
 * Covers the three pieces that must agree:
 *  - `summarizeRequirementsChange` — the section/item diff (add + remove);
 *  - `patchTaskFile` — records one activity entry naming the changed sections;
 *  - `notifyEngineerOfRequirementsChange` + the `LiveIndex` hook — messages the
 *    engineer once for a body change on an active task, never on a non-active
 *    one, and never writes the worktree copy.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage } from "node:http";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { requirementsChangeMessage, summarizeRequirementsChange } from "../../core/task-body-diff";
import { patchTaskFile } from "../../server/write";
import { LiveIndex } from "../../server/live-index";
import { WorkWatcher } from "../../server/watcher";
import { patchTask } from "../../server/routes/tasks";
import type { RouteContext } from "../../server/routes/types";
import {
  notifyEngineerOfRequirementsChange,
  type RequirementsNoticeRunner,
} from "../../server/requirements-notice";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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
  } as RepoOSConfig;
}

const BODY = [
  "## Problem",
  "",
  "Requirements change while the engineer works.",
  "",
  "## Desired UX",
  "",
  "- Keep the notice short",
  "",
  "## Acceptance criteria",
  "",
  "- Engine is told what changed",
  "- Do not touch the worktree copy",
  "",
  "## Notes for AI",
  "",
  "Start from the body-update route.",
].join("\n");

function taskFile(status: Task["status"], body: string): string {
  return [
    "---",
    'id: "0817"',
    'title: "Update requirements"',
    "type: feature",
    `status: ${status}`,
    'created_at: "2026-10-17T00:00:00Z"',
    'updated_at: "2026-10-17T00:00:00Z"',
    "---",
    body,
    "",
    "## Activity",
    "",
    "- 2026-10-17T00:00:00Z · created",
    "",
  ].join("\n");
}

function gitRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-reqs-"));
  roots.push(root);
  mkdirSync(join(root, "work"), { recursive: true });
  execSync(`git -C ${root} init -b main`, { stdio: "ignore" });
  execSync(`git -C ${root} config user.email test@example.com`, { stdio: "ignore" });
  execSync(`git -C ${root} config user.name Test`, { stdio: "ignore" });
  return root;
}

function setupTask(status: Task["status"], body = BODY): { root: string; absPath: string } {
  const root = gitRoot();
  const absPath = join(root, "work", "0817-update-requirements.md");
  writeFileSync(absPath, taskFile(status, body));
  execSync(`git -C ${root} add -A`, { stdio: "ignore" });
  execSync(`git -C ${root} commit -m "add task"`, { stdio: "ignore" });
  return { root, absPath };
}

function task(body: string, overrides: Partial<Task> = {}): Task {
  return {
    id: "0817",
    title: "Update requirements",
    type: "feature",
    status: "active",
    needsInput: false,
    needsMerge: false,
    priority: "p2",
    area: "web",
    areas: ["web"],
    assignedTo: "ai",
    assignee: "ai",
    branch: "feat/0817",
    path: "work/0817-update-requirements.md",
    absPath: "/tmp/0817-update-requirements.md",
    body,
    isArchived: false,
    isHeld: false,
    ...overrides,
  } as Task;
}

describe("summarizeRequirementsChange", () => {
  it("reports an added and a removed acceptance criterion", () => {
    const next = BODY.replace("- Do not touch the worktree copy\n", "- Report the change\n");
    const change = summarizeRequirementsChange(BODY, next);
    expect(change).not.toBeNull();
    const ac = change!.sections.find((s) => s.heading === "## Acceptance criteria");
    expect(ac).toBeDefined();
    expect(ac!.kind).toBe("edited");
    expect(ac!.added).toEqual(["- Report the change"]);
    expect(ac!.removed).toEqual(["- Do not touch the worktree copy"]);
    expect(change!.summary).toContain("Acceptance criteria (added 1, removed 1)");
  });

  it("classifies a whole added section, a whole removed section, and an edited one", () => {
    const next = [
      "## Problem",
      "",
      "Reworded problem.",
      "",
      "## Acceptance criteria",
      "",
      "- Engine is told what changed",
      "- Do not touch the worktree copy",
      "",
      "## Notes for AI",
      "",
      "Start from the body-update route.",
      "",
      "## Rollout",
      "",
      "Ship it.",
    ].join("\n");
    const change = summarizeRequirementsChange(BODY, next)!;
    const byHeading = new Map(change.sections.map((s) => [s.heading, s]));
    expect(byHeading.get("## Desired UX")!.kind).toBe("removed");
    expect(byHeading.get("## Rollout")!.kind).toBe("added");
    expect(byHeading.get("## Problem")!.kind).toBe("edited");
    expect(change.summary).toContain("Desired UX (removed)");
    expect(change.summary).toContain("Rollout (added)");
  });

  it("ignores bookkeeping sections (Activity, Screenshots, Shots, Original prompt)", () => {
    const next = `${BODY}

## Shots

\`\`\`json
[{"target": "default"}]
\`\`\`

## Activity

- 2026-10-17T01:00:00Z · status active→review`;
    // Only the Activity/Shots tail changed — no requirement section did.
    expect(summarizeRequirementsChange(BODY, next)).toBeNull();
  });

  it("returns null when nothing changed", () => {
    expect(summarizeRequirementsChange(BODY, BODY)).toBeNull();
  });
});

describe("patchTaskFile requirements activity entry", () => {
  it("records one entry naming the changed sections", () => {
    const { root, absPath } = setupTask("active");
    const next = BODY.replace(
      "- Do not touch the worktree copy\n",
      "- Do not touch the worktree copy\n- Report the change\n",
    );
    const updated = patchTaskFile(config(root), absPath, { body: next, force: true });

    const entries = updated.body.split("\n").filter((l) => l.includes(" · body"));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain("body: Acceptance criteria (added 1)");
    // The engineer-facing file is untouched by this write (there is no worktree
    // copy here); the board file is what changed.
    expect(readFileSync(absPath, "utf8")).toContain("body: Acceptance criteria (added 1)");
  });
});

describe("notifyEngineerOfRequirementsChange", () => {
  function makeRunner(result: { ok: boolean; queued?: boolean; reason?: string } = { ok: true }): {
    runner: RequirementsNoticeRunner;
    send: ReturnType<typeof vi.fn>;
  } {
    const send = vi.fn(() => result);
    return { runner: { send }, send };
  }

  it("messages the engineer once, with the same summary, for an active task", async () => {
    const { root } = setupTask("active");
    const { runner: r, send } = makeRunner();
    const next = BODY.replace(
      "- Do not touch the worktree copy\n",
      "- Do not touch the worktree copy\n- Report the change\n",
    );
    const result = await notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next),
      BODY,
    );

    expect(result.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const [id, text] = send.mock.calls[0] as [string, string];
    expect(id).toBe("0817");
    expect(text).toContain(result.summary!);
    expect(text).toContain("Acceptance criteria (added 1)");
    expect(text).toContain("worktree");
  });

  it("reports a queued delivery when the engineer's turn is live", async () => {
    const { root } = setupTask("active");
    const { runner: r } = makeRunner({ ok: true, queued: true });
    const next = BODY.replace("- Keep the notice short\n", "- Keep the notice very short\n");
    const result = await notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next),
      BODY,
    );
    expect(result).toMatchObject({ sent: true, queued: true });
  });

  it("reports (does not start a session) when the runner has no engineer session", async () => {
    const { root } = setupTask("active");
    const { runner: r, send } = makeRunner({ ok: false, reason: "no session for this task" });
    const next = BODY.replace("- Keep the notice short\n", "- Keep the notice very short\n");
    const result = await notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next),
      BODY,
    );
    // The notice is attempted against the existing session — it never starts one.
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("no session for this task");
  });

  it("never messages on a task that is not active", async () => {
    const { root } = setupTask("review");
    const { runner: r, send } = makeRunner();
    const next = BODY.replace("- Keep the notice short\n", "- Keep the notice very short\n");
    const result = await notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next, { status: "review" }),
      BODY,
    );

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("task is not active");
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when no requirement section changed", async () => {
    const { root } = setupTask("active");
    const { runner: r, send } = makeRunner();
    const result = await notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(BODY),
      BODY,
    );
    expect(result.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("LiveIndex requirements-change hook", () => {
  it("records one activity entry and sends one engineer message (patch + index hook)", async () => {
    const { root, absPath } = setupTask("active");
    const cfg = config(root);
    const index = new LiveIndex(cfg);
    index.refreshAll();
    const send = vi.fn((_id: string, text: string) => {
      void text;
      return { ok: true };
    });
    index.setBodyChangeNotifier((applied, prev) =>
      notifyEngineerOfRequirementsChange({ config: cfg, runner: { send } }, applied, prev.body),
    );

    const next = BODY.replace(
      "- Do not touch the worktree copy\n",
      "- Do not touch the worktree copy\n- Report the change\n",
    );
    patchTaskFile(cfg, absPath, { body: next, force: true });
    await index.applyFileChange(absPath);

    const activity = readFileSync(absPath, "utf8")
      .split("\n")
      .filter((l) => l.includes(" · body"));
    expect(activity).toHaveLength(1);
    expect(activity[0]).toContain("body: Acceptance criteria (added 1)");
    expect(send).toHaveBeenCalledTimes(1);
    const [id, text] = send.mock.calls[0] as [string, string];
    expect(id).toBe("0817");
    expect(text).toContain("Acceptance criteria");
  });

  it("stores the notice result for PATCH responses", async () => {
    const { root, absPath } = setupTask("active");
    const index = new LiveIndex(config(root));
    index.refreshAll();
    index.setBodyChangeNotifier(() => ({
      sent: false,
      summary: "Acceptance criteria (added 1)",
      reason: "no session for this task",
    }));

    const next = BODY.replace("- Do not touch the worktree copy\n", "- Report the change\n");
    patchTaskFile(config(root), absPath, { body: next, force: true });
    await index.applyFileChange(absPath);

    expect(index.consumeRequirementsNotice("0817")).toMatchObject({
      sent: false,
      reason: "no session for this task",
    });
    expect(index.consumeRequirementsNotice("0817")).toBeNull();
  });

  it("fires on a body change applied through a file write (the CLI path)", async () => {
    const { root, absPath } = setupTask("active");
    const index = new LiveIndex(config(root));
    index.refreshAll();
    const spy = vi.fn();
    index.setBodyChangeNotifier(spy);

    const next = BODY.replace(
      "- Engine is told what changed\n",
      "- Engine is told what changed\n- Engine is told quickly\n",
    );
    // The CLI writes with `patchTaskFile` and never touches the index; the
    // server's watcher calls `applyFileChange`, which is what fires the hook.
    patchTaskFile(config(root), absPath, { body: next, force: true });
    await index.applyFileChange(absPath);

    expect(spy).toHaveBeenCalledTimes(1);
    const [applied, prev] = spy.mock.calls[0] as [Task, Task];
    expect(applied.body).toContain("- Engine is told quickly");
    expect(prev.body).not.toContain("- Engine is told quickly");
  });

  it("does not touch a worktree copy of the task file", () => {
    const { root, absPath } = setupTask("active");
    // Stand in for the engineer's worktree copy: a sibling file the action must
    // never write. The real worktree lives outside `work/`, but the guarantee
    // is the same — only the board file is edited.
    const worktreeCopy = join(root, "worktree-copy.md");
    const original = taskFile("active", BODY);
    writeFileSync(worktreeCopy, original);

    patchTaskFile(config(root), absPath, {
      body: BODY.replace("- Keep the notice short\n", "- Keep the notice short\n- And clear\n"),
      force: true,
    });

    expect(readFileSync(worktreeCopy, "utf8")).toBe(original);
  });
});

/** A JSON request body as Node's http server hands it to a route. */
function makeReq(body: unknown = {}): IncomingMessage {
  const data = Buffer.from(JSON.stringify(body), "utf8");
  return {
    [Symbol.asyncIterator]: async function* () {
      yield data;
    },
  } as unknown as IncomingMessage;
}

/** A response stub capturing the status and decoded JSON body. */
function makeRes(): { statusCode: number; body: unknown; writeHead: unknown; end: unknown } {
  const capture = {
    statusCode: 0,
    body: undefined as unknown,
    writeHead(code: number) {
      capture.statusCode = code;
      return capture;
    },
    end(payload?: string) {
      capture.body = payload ? JSON.parse(payload) : undefined;
    },
  };
  return capture;
}

function routeCtx(cfg: RepoOSConfig, index: LiveIndex): RouteContext {
  return {
    config: cfg,
    index,
    indexReady: Promise.resolve(),
    reviews: { isRunning: () => false, cancel: vi.fn() } as never,
    runner: { isRunning: () => false, stop: vi.fn() } as never,
    previews: { stop: vi.fn(async () => {}) } as never,
    cto: {} as never,
    freeformRuns: {} as never,
    repoos: {} as never,
    emitEvent: () => {},
    closeOutLock: {} as never,
    rootLock: {} as never,
    jobCoordinator: { enqueue: () => ({}), allJobs: () => [] } as never,
    reportedStages: {},
    reportedStageAt: {},
    triggerJobProcessing: () => {},
    pendingReview: new Set(),
    uiDir: null,
    reload: null,
    logger: {
      task: () => {},
      system: () => {},
      agent: () => {},
      getTaskLogs: () => [],
      getAgentLogs: () => [],
      getSystemLogs: () => [],
    } as never,
    onServerStatusChange: () => {},
    startUnifiedHandoff: () => ({ started: false, reason: "not wired in this test" }),
    syncTaskBranch: async () => ({ ok: true, conflicts: [] }),
  };
}

describe("spec-form save notifies the engineer (#0819)", () => {
  it("sends one requirements notice when the body is saved through PATCH", async () => {
    const { root } = setupTask("active");
    const cfg = config(root);
    const index = new LiveIndex(cfg);
    index.refreshAll();
    const send = vi.fn((_id: string, _text: string) => ({ ok: true }));
    index.setBodyChangeNotifier((applied, prev) =>
      notifyEngineerOfRequirementsChange({ config: cfg, runner: { send } }, applied, prev.body),
    );

    const next = BODY.replace(
      "- Do not touch the worktree copy\n",
      "- Do not touch the worktree copy\n- Report the change\n",
    );
    const res = makeRes();
    await patchTask(routeCtx(cfg, index), makeReq({ body: next }), res as never, {
      param1: "0817",
    });

    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const [id, text] = send.mock.calls[0] as [string, string];
    expect(id).toBe("0817");
    expect(text).toContain("Acceptance criteria (added 1)");
    // The response carries the notice so the UI can echo what was sent.
    expect((res.body as { requirementsNotice?: { sent?: boolean } }).requirementsNotice?.sent).toBe(
      true,
    );
  });
});

describe("hand edit notifies the engineer via the watcher (#0819)", () => {
  it("sends one requirements notice when the task file is edited by hand", async () => {
    const { root, absPath } = setupTask("active");
    const cfg = config(root);
    const index = new LiveIndex(cfg);
    index.refreshAll();
    const send = vi.fn((_id: string, _text: string) => ({ ok: true }));
    index.setBodyChangeNotifier((applied, prev) =>
      notifyEngineerOfRequirementsChange({ config: cfg, runner: { send } }, applied, prev.body),
    );
    const watcher = new WorkWatcher(cfg, index);
    watcher.start();
    try {
      const next = BODY.replace(
        "- Engine is told what changed\n",
        "- Engine is told what changed\n- Engine is told quickly\n",
      );
      // The edit is made OUTSIDE any RepoOS write path, then the watcher's
      // reconciliation observes the new mtime and re-applies the file.
      writeFileSync(absPath, taskFile("active", next));
      const future = new Date(Date.now() + 5000);
      utimesSync(absPath, future, future);
      await (watcher as unknown as { reconcile: () => Promise<void> }).reconcile();

      expect(send).toHaveBeenCalledTimes(1);
      const [id, text] = send.mock.calls[0] as [string, string];
      expect(id).toBe("0817");
      expect(text).toContain("Acceptance criteria");
    } finally {
      watcher.stop();
    }
  });
});

describe("requirementsChangeMessage", () => {
  it("names the task, the summary, and the worktree-copy caveat", () => {
    const change = summarizeRequirementsChange(
      BODY,
      BODY.replace("- Keep the notice short\n", ""),
    )!;
    const message = requirementsChangeMessage({ id: "0817" }, change);
    expect(message).toContain("#0817");
    expect(message).toContain(change.summary);
    expect(message).toContain("worktree");
  });
});
