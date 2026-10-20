/**
 * `repoos landable` pre-checks (#0867): every check and its failure message.
 * The evaluator is pure, so this suite drives it directly; the server gatherer
 * only supplies facts.
 */
import { describe, expect, it } from "vitest";
import {
  classifyMainDirtyFiles,
  evaluateLandable,
  mainDirtyOwner,
  reviewPredatesLatestHandoff,
  type LandableFacts,
} from "../../core/landable";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function passingFacts(over: Partial<LandableFacts> = {}): LandableFacts {
  return {
    taskId: "0867",
    branch: "feat/landable",
    headSha: SHA_A,
    lock: { sha: SHA_A },
    review: { present: true, state: "ok", verdict: "good to go", blockingBugs: false },
    worktreeDirty: [],
    branchMissing: false,
    merge: { ok: true, conflicts: [] },
    ownTaskFile: "work/0867-repoos-landable.md",
    changedPaths: ["src/core/landable.ts", "work/0867-repoos-landable.md"],
    bookkeeping: {
      workDir: "work",
      inputsDir: "inputs",
      storiesDir: "stories",
      remindersDir: "reminders",
      schedulesDir: "schedules",
    },
    mainDirty: { files: [], checkFailed: false },
    ...over,
  };
}

interface Case {
  name: string;
  facts: Partial<LandableFacts>;
  id: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  nextStep?: string;
}

const cases: Case[] = [
  // review-verdict
  {
    name: "no review report",
    facts: { review: { present: false, state: null, verdict: null, blockingBugs: false } },
    id: "review-verdict",
    status: "fail",
    detail: "no review report yet",
    nextStep: "Request a review first: repoos review <id>",
  },
  {
    name: "review pass failed",
    facts: { review: { present: true, state: "failed", verdict: null, blockingBugs: false } },
    id: "review-verdict",
    status: "fail",
    detail: "the latest review pass failed and produced no report",
  },
  {
    name: "review pass incomplete",
    facts: { review: { present: true, state: "incomplete", verdict: null, blockingBugs: false } },
    id: "review-verdict",
    status: "fail",
    detail: "the latest review pass has no verdict",
  },
  {
    name: "review lists blocking bugs",
    facts: {
      review: {
        present: true,
        state: "ok",
        verdict: "good to go",
        blockingBugs: true,
      },
    },
    id: "review-verdict",
    status: "fail",
    detail: "the review still lists blocking bugs",
  },
  {
    name: "review report predates the latest handoff",
    facts: {
      review: {
        present: true,
        state: "ok",
        verdict: "good to go",
        blockingBugs: false,
        current: false,
      },
    },
    id: "review-verdict",
    status: "fail",
    detail: "the review report predates the latest handoff",
    nextStep: "Run a fresh review of the current commit: repoos review again <id>",
  },
  {
    name: "review verdict is needs some work",
    facts: {
      review: { present: true, state: "ok", verdict: "needs some work", blockingBugs: false },
    },
    id: "review-verdict",
    status: "fail",
    detail: 'the latest review verdict is "needs some work" (needs "good to go")',
  },
  {
    name: "review verdict good to go",
    facts: {},
    id: "review-verdict",
    status: "pass",
    detail: 'latest review pass is "good to go"',
  },

  // review-lock
  {
    name: "missing review lock is a warning",
    facts: { lock: null },
    id: "review-lock",
    status: "warn",
    detail: "no review lock for this task",
  },
  {
    name: "review lock differs from worktree HEAD",
    facts: { lock: { sha: SHA_B }, headSha: SHA_A },
    id: "review-lock",
    status: "fail",
    detail: "the review lock is at bbbbbbb but the worktree is at aaaaaaa",
  },
  {
    name: "worktree HEAD unreadable",
    facts: { headSha: null },
    id: "review-lock",
    status: "fail",
    detail: "could not read the worktree HEAD",
  },
  {
    name: "lock sha matches",
    facts: {},
    id: "review-lock",
    status: "pass",
    detail: "lock sha aaaaaaa matches worktree HEAD aaaaaaa",
  },

  // worktree-clean
  {
    name: "worktree dirty state unreadable",
    facts: { worktreeDirty: null },
    id: "worktree-clean",
    status: "fail",
    detail: "could not read the worktree's dirty state",
  },
  {
    name: "worktree has uncommitted files",
    facts: { worktreeDirty: ["src/a.ts", "src/b.ts"] },
    id: "worktree-clean",
    status: "fail",
    detail: "worktree has 2 uncommitted files: src/a.ts, src/b.ts",
  },
  {
    name: "worktree clean",
    facts: {},
    id: "worktree-clean",
    status: "pass",
    detail: "worktree is clean",
  },

  // merge-conflicts
  {
    name: "branch missing",
    facts: { branchMissing: true, merge: null },
    id: "merge-conflicts",
    status: "fail",
    detail: 'branch "feat/landable" no longer exists locally',
  },
  {
    name: "merge analysis unavailable",
    facts: { merge: null },
    id: "merge-conflicts",
    status: "fail",
    detail: "could not analyze the merge with main",
  },
  {
    name: "merge analysis failed with a reason",
    facts: { merge: { ok: false, conflicts: [], reason: "boom" } },
    id: "merge-conflicts",
    status: "fail",
    detail: "could not analyze the merge with main: boom",
  },
  {
    name: "source file conflicts with main",
    facts: { merge: { ok: false, conflicts: ["src/core/types.ts"] } },
    id: "merge-conflicts",
    status: "fail",
    detail: "src/core/types.ts conflicts with main: merge main into the branch, keep both sides",
    nextStep:
      "Merge main into the branch (repoos sync <id>), keep both sides, then re-request review: repoos review again <id>",
  },
  {
    name: "only the task's own file conflicts",
    facts: {
      merge: { ok: false, conflicts: ["work/0867-repoos-landable.md"] },
    },
    id: "merge-conflicts",
    status: "warn",
    detail:
      "only this task's own work/0867-repoos-landable.md conflicts with main — close-out resolves it from main",
    nextStep: "No action needed; close-out takes main's copy of the task file",
  },
  {
    name: "branch merges cleanly",
    facts: {},
    id: "merge-conflicts",
    status: "pass",
    detail: "branch merges cleanly with main",
  },

  // task-scope
  {
    name: "changed paths unreadable",
    facts: { changedPaths: null },
    id: "task-scope",
    status: "fail",
    detail: "could not read the branch's changed paths",
  },
  {
    name: "diff changes repoos.toml",
    facts: { changedPaths: ["repoos.toml"] },
    id: "task-scope",
    status: "fail",
    detail: "the diff changes repoos.toml — config changes never land with a task",
    nextStep: "Remove repoos.toml from the branch and re-request review",
  },
  {
    name: "diff changes another task file",
    facts: { changedPaths: ["src/a.ts", "work/0123-other-task.md"] },
    id: "task-scope",
    status: "fail",
    detail: "the diff changes another task's bookkeeping: work/0123-other-task.md",
  },
  {
    name: "diff changes an input",
    facts: { changedPaths: ["inputs/0007-a-note.md"] },
    id: "task-scope",
    status: "fail",
    detail: "the diff changes another task's bookkeeping: inputs/0007-a-note.md",
  },
  {
    name: "diff stays within the task",
    facts: {},
    id: "task-scope",
    status: "pass",
    detail: "diff changes 2 files, all within this task",
  },

  // main-clean
  {
    name: "main dirty state unreadable",
    facts: { mainDirty: { files: [], checkFailed: true } },
    id: "main-clean",
    status: "fail",
    detail: "could not read main's dirty state",
  },
  {
    name: "main has a repoos.toml edit",
    facts: { mainDirty: { files: ["repoos.toml"], checkFailed: false } },
    id: "main-clean",
    status: "fail",
    detail: "main has 1 uncommitted file: repoos.toml (repoos.toml)",
  },
  {
    name: "main has a reminder edit",
    facts: { mainDirty: { files: ["reminders/0001-dentist.md"], checkFailed: false } },
    id: "main-clean",
    status: "fail",
    detail: "main has 1 uncommitted file: reminders/0001-dentist.md (reminders/)",
  },
  {
    name: "main has a schedule edit",
    facts: { mainDirty: { files: ["schedules/morning.md"], checkFailed: false } },
    id: "main-clean",
    status: "fail",
    detail: "main has 1 uncommitted file: schedules/morning.md (schedules/)",
  },
  {
    name: "main has an unknown edit",
    facts: { mainDirty: { files: ["src/wip.ts"], checkFailed: false } },
    id: "main-clean",
    status: "fail",
    detail: "main has 1 uncommitted file: src/wip.ts (unknown)",
  },
  {
    name: "main clean",
    facts: {},
    id: "main-clean",
    status: "pass",
    detail: "main has no uncommitted files",
  },
];

describe("evaluateLandable checks", () => {
  it.each(cases)("$name", ({ facts, id, status, detail, nextStep }) => {
    const result = evaluateLandable(passingFacts(facts));
    const check = result.checks.find((c) => c.id === id);
    expect(check).toBeDefined();
    expect(check?.status).toBe(status);
    expect(check?.detail).toBe(detail);
    if (nextStep) expect(check?.nextStep).toBe(nextStep);
  });
});

describe("evaluateLandable result", () => {
  it("is landable when every check passes or only warns", () => {
    const result = evaluateLandable(passingFacts({ lock: null }));
    expect(result.landable).toBe(true);
    expect(result.summary).toEqual({ pass: 5, warn: 1, fail: 0 });
  });

  it("is not landable when any check fails", () => {
    const result = evaluateLandable(
      passingFacts({ merge: { ok: false, conflicts: ["src/core/types.ts"] } }),
    );
    expect(result.landable).toBe(false);
    expect(result.summary.fail).toBe(1);
    expect(result.checks).toHaveLength(6);
  });

  it("reports the branch, HEAD and lock sha in the JSON shape", () => {
    const result = evaluateLandable(passingFacts());
    expect(result).toMatchObject({
      taskId: "0867",
      branch: "feat/landable",
      headSha: SHA_A,
      lockSha: SHA_A,
      landable: true,
    });
  });
});

describe("main dirty ownership", () => {
  it("classifies the four owner buckets", () => {
    const dirs = { remindersDir: "reminders", schedulesDir: "schedules" };
    expect(mainDirtyOwner("repoos.toml", dirs)).toBe("repoos.toml");
    expect(mainDirtyOwner("reminders/0001-a.md", dirs)).toBe("reminders/");
    expect(mainDirtyOwner("schedules/a.md", dirs)).toBe("schedules/");
    expect(mainDirtyOwner("src/a.ts", dirs)).toBe("unknown");
    expect(classifyMainDirtyFiles(["repoos.toml", "src/a.ts"], dirs)).toEqual([
      { path: "repoos.toml", owner: "repoos.toml" },
      { path: "src/a.ts", owner: "unknown" },
    ]);
  });
});

describe("review freshness", () => {
  const body = [
    "## Activity",
    "",
    "- 2026-10-20T10:00:00Z · status active→review",
    "- 2026-10-20T11:00:00Z · status review→active",
  ].join("\n");

  it("flags a report older than the latest handoff", () => {
    expect(reviewPredatesLatestHandoff(body, "2026-10-20T09:00:00Z")).toBe(true);
  });

  it("keeps a report written after the latest handoff", () => {
    expect(reviewPredatesLatestHandoff(body, "2026-10-20T10:30:00Z")).toBe(false);
  });

  it("treats a body with no handoff transition as current", () => {
    expect(reviewPredatesLatestHandoff("## Activity\n", "2026-10-20T09:00:00Z")).toBe(false);
  });

  it("does not guess from an invalid report timestamp", () => {
    expect(reviewPredatesLatestHandoff(body, "not-a-date")).toBe(false);
  });
});
