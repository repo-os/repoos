/**
 * Landing pre-checks (#0867): the single, read-only answer to "can this task in
 * review actually land?".
 *
 * `repoos landable <id>`, the task drawer next to Move to done, the approval
 * policy and the reviewer all read this result so they cannot disagree about
 * whether a branch is ready. The facts are gathered by the server (git
 * merge-tree, worktree status, review lock, review report); this module is the
 * pure evaluator so every check and its failure message is table-testable.
 */
import type { ReviewVerdict } from "./review-verdict.js";

export type LandableCheckId =
  | "review-verdict"
  | "review-lock"
  | "worktree-clean"
  | "merge-conflicts"
  | "task-scope"
  | "main-clean";

export type LandableCheckStatus = "pass" | "warn" | "fail";

/** One line of the pass/fail checklist. */
export interface LandableCheck {
  /** Stable id for JSON consumers and tests. */
  id: LandableCheckId;
  /** Short human label, e.g. "Merge with main". */
  label: string;
  status: LandableCheckStatus;
  /** What was found. For a failure this is the reason. */
  detail: string;
  /** The exact next step a human or agent should take. Absent when passing. */
  nextStep?: string;
}

export interface LandableResult {
  taskId: string;
  branch: string | null;
  /** Full worktree HEAD sha, when readable. */
  headSha: string | null;
  /** Full sha recorded in the review lock, when present. */
  lockSha: string | null;
  /** True only when no check failed. Warnings do not block. */
  landable: boolean;
  checks: LandableCheck[];
  summary: { pass: number; warn: number; fail: number };
}

/** Where a dirty file on main comes from — the ownership split drivers need. */
export type MainDirtyOwner = "repoos.toml" | "reminders/" | "schedules/" | "unknown";

export interface MainDirtyFile {
  path: string;
  owner: MainDirtyOwner;
}

export interface LandableBookkeepingDirs {
  workDir: string;
  inputsDir: string;
  storiesDir: string;
  remindersDir: string;
  schedulesDir: string;
}

export interface LandableFacts {
  taskId: string;
  branch: string | null;
  headSha: string | null;
  /** Review lock, or null when no handoff lock was written. */
  lock: { sha: string } | null;
  review: {
    present: boolean;
    /** "ok" | "incomplete" | "failed" — the stored report's state. */
    state: string | null;
    verdict: ReviewVerdict | null;
    blockingBugs: boolean;
    /**
     * False when the report predates the latest `…→review` handoff (it reviewed
     * an older commit). Defaults to current when omitted.
     */
    current?: boolean;
  };
  /** null when there is no worktree or its status could not be read. */
  worktreeDirty: string[] | null;
  branchMissing: boolean;
  /** Merge analysis, or null when it could not be run. */
  merge: { ok: boolean; conflicts: string[]; reason?: string } | null;
  /** Repo-relative path of this task's own markdown file. */
  ownTaskFile: string;
  /** Repo-relative paths the branch changes vs its merge-base with main; null when unreadable. */
  changedPaths: string[] | null;
  bookkeeping: LandableBookkeepingDirs;
  mainDirty: { files: string[]; checkFailed: boolean };
}

const CONFIG_PATH = "repoos.toml";

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "unknown";
}

function quoteList(paths: string[], limit = 4): string {
  if (paths.length <= limit) return paths.join(", ");
  return `${paths.slice(0, limit).join(", ")} (+${paths.length - limit} more)`;
}

/** Latest `…→review` handoff timestamp recorded in the task's Activity log. */
export function latestReviewHandoffAt(body: string): number | null {
  let latest: number | null = null;
  for (const m of body.matchAll(/^- ([^\s]+) · status [^\s]+→review\s*$/gm)) {
    const time = Date.parse(m[1]!);
    if (Number.isFinite(time)) latest = latest === null ? time : Math.max(latest, time);
  }
  return latest;
}

/**
 * True when a stored review report predates the latest `…→review` handoff — the
 * report reviewed an older commit. The same rule the drawer uses for "Awaiting
 * a new review": an older verdict must never count as the current pass.
 */
export function reviewPredatesLatestHandoff(body: string, reportAt: string): boolean {
  const reportTime = Date.parse(reportAt);
  if (!Number.isFinite(reportTime)) return false;
  const latest = latestReviewHandoffAt(body);
  return latest !== null && latest > reportTime;
}

/** True for a conflict path that is this task's own markdown file. */
export function isOwnTaskFileConflict(path: string, taskId: string, workDir: string): boolean {
  const prefix = `${workDir.replace(/\/+$/, "")}/`;
  return path.startsWith(`${prefix}${taskId}-`) && path.endsWith(".md");
}

/** Owner of one dirty path on main, by the repo's managed directories. */
export function mainDirtyOwner(
  path: string,
  dirs: Pick<LandableBookkeepingDirs, "remindersDir" | "schedulesDir">,
): MainDirtyOwner {
  if (path === CONFIG_PATH) return "repoos.toml";
  const reminders = `${dirs.remindersDir.replace(/\/+$/, "")}/`;
  if (path.startsWith(reminders)) return "reminders/";
  const schedules = `${dirs.schedulesDir.replace(/\/+$/, "")}/`;
  if (path.startsWith(schedules)) return "schedules/";
  return "unknown";
}

export function classifyMainDirtyFiles(
  paths: string[],
  dirs: Pick<LandableBookkeepingDirs, "remindersDir" | "schedulesDir">,
): MainDirtyFile[] {
  return paths.map((path) => ({ path, owner: mainDirtyOwner(path, dirs) }));
}

/**
 * A branch change outside the task's own work file is drift: config, another
 * task's markdown, an input, or a story definition never lands with this task.
 */
export function isForbiddenTaskScopePath(
  path: string,
  ownTaskFile: string,
  dirs: Pick<LandableBookkeepingDirs, "workDir" | "inputsDir" | "storiesDir">,
): boolean {
  if (path === CONFIG_PATH) return true;
  if (path === ownTaskFile) return false;
  const prefixes = [dirs.workDir, dirs.inputsDir, dirs.storiesDir].map(
    (d) => `${d.replace(/\/+$/, "")}/`,
  );
  return prefixes.some((prefix) => path.startsWith(prefix));
}

export function evaluateReviewVerdictCheck(review: LandableFacts["review"]): LandableCheck {
  const label = "Review verdict";
  if (!review.present) {
    return {
      id: "review-verdict",
      label,
      status: "fail",
      detail: "no review report yet",
      nextStep: "Request a review first: repoos review <id>",
    };
  }
  if (review.state === "failed") {
    return {
      id: "review-verdict",
      label,
      status: "fail",
      detail: "the latest review pass failed and produced no report",
      nextStep: "Run a fresh review: repoos review again <id>",
    };
  }
  if (review.state === "incomplete") {
    return {
      id: "review-verdict",
      label,
      status: "fail",
      detail: "the latest review pass has no verdict",
      nextStep: "Run a fresh review: repoos review again <id>",
    };
  }
  if (review.current === false) {
    return {
      id: "review-verdict",
      label,
      status: "fail",
      detail: "the review report predates the latest handoff",
      nextStep: "Run a fresh review of the current commit: repoos review again <id>",
    };
  }
  if (review.blockingBugs) {
    return {
      id: "review-verdict",
      label,
      status: "fail",
      detail: "the review still lists blocking bugs",
      nextStep: "Fix the findings and request a fresh review: repoos review again <id>",
    };
  }
  if (review.verdict !== "good to go") {
    return {
      id: "review-verdict",
      label,
      status: "fail",
      detail: `the latest review verdict is "${review.verdict ?? "unknown"}" (needs "good to go")`,
      nextStep: "Fix the findings and request a fresh review: repoos review again <id>",
    };
  }
  return {
    id: "review-verdict",
    label,
    status: "pass",
    detail: 'latest review pass is "good to go"',
  };
}

export function evaluateReviewLockCheck(
  lock: LandableFacts["lock"],
  headSha: string | null,
): LandableCheck {
  const label = "Review lock";
  if (!lock) {
    return {
      id: "review-lock",
      label,
      status: "warn",
      detail: "no review lock for this task",
      nextStep: "Hand the task off to review so the reviewed commit is locked",
    };
  }
  if (!headSha) {
    return {
      id: "review-lock",
      label,
      status: "fail",
      detail: "could not read the worktree HEAD",
      nextStep: "Check git state in the task worktree and retry",
    };
  }
  if (lock.sha !== headSha) {
    return {
      id: "review-lock",
      label,
      status: "fail",
      detail: `the review lock is at ${shortSha(lock.sha)} but the worktree is at ${shortSha(headSha)}`,
      nextStep: "The branch moved after handoff — request a fresh review: repoos review again <id>",
    };
  }
  return {
    id: "review-lock",
    label,
    status: "pass",
    detail: `lock sha ${shortSha(lock.sha)} matches worktree HEAD ${shortSha(headSha)}`,
  };
}

export function evaluateWorktreeCleanCheck(
  worktreeDirty: LandableFacts["worktreeDirty"],
): LandableCheck {
  const label = "Worktree clean";
  if (worktreeDirty === null) {
    return {
      id: "worktree-clean",
      label,
      status: "fail",
      detail: "could not read the worktree's dirty state",
      nextStep: "Check git status in the task worktree and retry",
    };
  }
  if (worktreeDirty.length > 0) {
    return {
      id: "worktree-clean",
      label,
      status: "fail",
      detail: `worktree has ${worktreeDirty.length} uncommitted file${worktreeDirty.length === 1 ? "" : "s"}: ${quoteList(worktreeDirty)}`,
      nextStep: "Commit them on the branch or discard them, then request a fresh review",
    };
  }
  return { id: "worktree-clean", label, status: "pass", detail: "worktree is clean" };
}

export function evaluateMergeCheck(facts: {
  branch: string | null;
  branchMissing: boolean;
  merge: LandableFacts["merge"];
  taskId: string;
  bookkeeping: Pick<LandableBookkeepingDirs, "workDir">;
}): LandableCheck {
  const label = "Merge with main";
  if (facts.branchMissing || !facts.branch) {
    return {
      id: "merge-conflicts",
      label,
      status: "fail",
      detail: facts.branch
        ? `branch "${facts.branch}" no longer exists locally`
        : "the task has no branch to merge",
      nextStep: "Re-hand off the task from its worktree so the branch exists again",
    };
  }
  if (!facts.merge) {
    return {
      id: "merge-conflicts",
      label,
      status: "fail",
      detail: "could not analyze the merge with main",
      nextStep: "Check git state and retry",
    };
  }
  if (facts.merge.ok) {
    return {
      id: "merge-conflicts",
      label,
      status: "pass",
      detail: "branch merges cleanly with main",
    };
  }
  if (facts.merge.conflicts.length === 0) {
    return {
      id: "merge-conflicts",
      label,
      status: "fail",
      detail: `could not analyze the merge with main: ${facts.merge.reason ?? "unknown error"}`,
      nextStep: "Check git state and retry",
    };
  }
  const own = facts.merge.conflicts.filter((p) =>
    isOwnTaskFileConflict(p, facts.taskId, facts.bookkeeping.workDir),
  );
  const source = facts.merge.conflicts.filter((p) => !own.includes(p));
  if (source.length === 0) {
    return {
      id: "merge-conflicts",
      label,
      status: "warn",
      detail: `only this task's own ${quoteList(own)} conflicts with main — close-out resolves it from main`,
      nextStep: "No action needed; close-out takes main's copy of the task file",
    };
  }
  const reason = `${quoteList(source)} conflict${source.length === 1 ? "s" : ""} with main: merge main into the branch, keep both sides`;
  return {
    id: "merge-conflicts",
    label,
    status: "fail",
    detail: reason,
    nextStep:
      "Merge main into the branch (repoos sync <id>), keep both sides, then re-request review: repoos review again <id>",
  };
}

export function evaluateTaskScopeCheck(facts: {
  changedPaths: string[] | null;
  ownTaskFile: string;
  bookkeeping: Pick<LandableBookkeepingDirs, "workDir" | "inputsDir" | "storiesDir">;
}): LandableCheck {
  const label = "Task scope";
  if (facts.changedPaths === null) {
    return {
      id: "task-scope",
      label,
      status: "fail",
      detail: "could not read the branch's changed paths",
      nextStep: "Check git state and retry",
    };
  }
  const forbidden = facts.changedPaths.filter((p) =>
    isForbiddenTaskScopePath(p, facts.ownTaskFile, facts.bookkeeping),
  );
  if (forbidden.length > 0) {
    const config = forbidden.includes(CONFIG_PATH);
    return {
      id: "task-scope",
      label,
      status: "fail",
      detail: config
        ? "the diff changes repoos.toml — config changes never land with a task"
        : `the diff changes another task's bookkeeping: ${quoteList(forbidden)}`,
      nextStep: config
        ? "Remove repoos.toml from the branch and re-request review"
        : `Restore ${quoteList(forbidden)} from main on the branch (git checkout main -- <path>) and re-request review`,
    };
  }
  return {
    id: "task-scope",
    label,
    status: "pass",
    detail: `diff changes ${facts.changedPaths.length} file${facts.changedPaths.length === 1 ? "" : "s"}, all within this task`,
  };
}

export function evaluateMainCleanCheck(
  facts: LandableFacts["mainDirty"],
  dirs: Pick<LandableBookkeepingDirs, "remindersDir" | "schedulesDir">,
): LandableCheck {
  const label = "Main clean";
  if (facts.checkFailed) {
    return {
      id: "main-clean",
      label,
      status: "fail",
      detail: "could not read main's dirty state",
      nextStep: "Check git status on main and retry",
    };
  }
  if (facts.files.length > 0) {
    const owned = classifyMainDirtyFiles(facts.files, dirs);
    const listed = owned.map((f) => `${f.path} (${f.owner})`).join(", ");
    return {
      id: "main-clean",
      label,
      status: "fail",
      detail: `main has ${owned.length} uncommitted file${owned.length === 1 ? "" : "s"}: ${listed}`,
      nextStep: "Commit or stash them on main, then retry Move to done",
    };
  }
  return { id: "main-clean", label, status: "pass", detail: "main has no uncommitted files" };
}

/** Evaluate every landing pre-check from gathered facts. Pure and read-only. */
export function evaluateLandable(facts: LandableFacts): LandableResult {
  const checks: LandableCheck[] = [
    evaluateReviewVerdictCheck(facts.review),
    evaluateReviewLockCheck(facts.lock, facts.headSha),
    evaluateWorktreeCleanCheck(facts.worktreeDirty),
    evaluateMergeCheck({
      branch: facts.branch,
      branchMissing: facts.branchMissing,
      merge: facts.merge,
      taskId: facts.taskId,
      bookkeeping: facts.bookkeeping,
    }),
    evaluateTaskScopeCheck({
      changedPaths: facts.changedPaths,
      ownTaskFile: facts.ownTaskFile,
      bookkeeping: facts.bookkeeping,
    }),
    evaluateMainCleanCheck(facts.mainDirty, facts.bookkeeping),
  ];
  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
  };
  return {
    taskId: facts.taskId,
    branch: facts.branch,
    headSha: facts.headSha,
    lockSha: facts.lock?.sha ?? null,
    landable: summary.fail === 0,
    checks,
    summary,
  };
}
