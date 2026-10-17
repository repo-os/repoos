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
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { requirementsChangeMessage, summarizeRequirementsChange } from "../../core/task-body-diff";
import { patchTaskFile } from "../../server/write";
import { LiveIndex } from "../../server/live-index";
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
  function makeRunner(hasSession: boolean): {
    runner: RequirementsNoticeRunner;
    send: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
  } {
    const send = vi.fn(() => ({ ok: true }));
    const start = vi.fn(() => ({ ok: true }));
    return {
      runner: { output: () => (hasSession ? {} : null), send, start },
      send,
      start,
    };
  }

  it("messages the engineer once, with the same summary, for an active task", () => {
    const { root } = setupTask("active");
    const { runner: r, send, start } = makeRunner(true);
    const next = BODY.replace(
      "- Do not touch the worktree copy\n",
      "- Do not touch the worktree copy\n- Report the change\n",
    );
    const result = notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next),
      BODY,
    );

    expect(result.sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    const [id, text] = send.mock.calls[0] as [string, string];
    expect(id).toBe("0817");
    expect(text).toContain(result.summary!);
    expect(text).toContain("Acceptance criteria (added 1)");
    expect(text).toContain("worktree");
  });

  it("starts the engineer when no session exists yet", () => {
    const { root } = setupTask("active");
    const { runner: r, send, start } = makeRunner(false);
    const next = BODY.replace("- Keep the notice short\n", "- Keep the notice very short\n");
    const result = notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next),
      BODY,
    );

    expect(result.sent).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("never messages on a task that is not active", () => {
    const { root } = setupTask("review");
    const { runner: r, send, start } = makeRunner(true);
    const next = BODY.replace("- Keep the notice short\n", "- Keep the notice very short\n");
    const result = notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(next, { status: "review" }),
      BODY,
    );

    expect(result.sent).toBe(false);
    expect(result.reason).toBe("task is not active");
    expect(send).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("does nothing when no requirement section changed", () => {
    const { root } = setupTask("active");
    const { runner: r, send, start } = makeRunner(true);
    const result = notifyEngineerOfRequirementsChange(
      { config: config(root), runner: r },
      task(BODY),
      BODY,
    );
    expect(result.sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});

describe("LiveIndex requirements-change hook", () => {
  it("fires on a body change applied through a file write (the CLI path)", () => {
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
    index.applyFileChange(absPath);

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
