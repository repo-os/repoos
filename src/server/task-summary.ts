/**
 * Post-merge task summary report (#1041): generation, storage and queueing.
 *
 * After a task lands on `done`, the PM agent writes one `summary.md` into the
 * task's report directory from recorded facts (task file, engineering rounds,
 * review passes, activity log, sessions, linked tasks). Generation never
 * blocks or fails the landing: `queueTaskSummary` runs it in the background,
 * records a visible pending/done/failed status under the repo cache dir, and
 * `repoos summary <id>` (or `POST /api/tasks/:id/summary`) retries it.
 * Re-running overwrites the same file — idempotent, never duplicated.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { SessionRecord } from "../core/db.js";
import { getRepoOSDb } from "../core/db.js";
import { parseDocument } from "../core/frontmatter.js";
import { parseTask } from "../core/task.js";
import { commitFiles, runGit, type GitRun } from "../core/git.js";
import { isOwnReportPath, reportsTaskDir } from "../core/report-paths.js";
import { findReviewPassFile, listReviewPasses } from "../core/review-passes.js";
import { repoAgentRunTmpOpts } from "../core/agent-run-tmpdir.js";
import { recordOneShotSession, resolvePmAgent, runPrompt } from "./agents.js";
import { createRepositoryLock, createRootLock } from "./repo-lock.js";

/** The PM agent shape, derived from the resolver so no private type import is needed. */
type PmAgent = NonNullable<ReturnType<typeof resolvePmAgent>>;
import { loadEngineeringReports } from "./engineering-reports.js";
import {
  buildTaskSummaryPrompt,
  effectiveSummaryJobStatus,
  formatTaskSummaryFileChanges,
  stripTaskSummaryMarkerLines,
  validateTaskSummary,
  type TaskSummaryFacts,
  type TaskSummaryFileChange,
  type TaskSummarySessionFacts,
  type TaskSummaryRoundFacts,
  type TaskSummaryReviewFacts,
} from "../core/task-summary.js";

type SummaryPriorState =
  | { kind: "absent" }
  | { kind: "backup"; content: string }
  | { kind: "unreadable"; message: string };

/** Restore `summary.md` after a failed write/commit, or delete only when there was no prior file. */
function restoreSummaryPathAfterFailure(
  absPath: string,
  prior: SummaryPriorState,
  io: { writeFileSync: typeof writeFileSync; unlinkSync: typeof unlinkSync },
): Error | null {
  if (prior.kind === "backup") {
    try {
      io.writeFileSync(absPath, prior.content);
      return null;
    } catch (err) {
      return err as Error;
    }
  }
  if (prior.kind === "absent") {
    try {
      io.unlinkSync(absPath);
      return null;
    } catch (err) {
      return err as Error;
    }
  }
  // Pre-existing file we could not read — never unlink it (#1041 review).
  return new Error(`Existing summary.md is unreadable; left in place: ${prior.message}`);
}

/** Visible lifecycle of a task's summary job. `idle` means never attempted. */
export type TaskSummaryStatus = "idle" | "pending" | "done" | "failed";

export interface TaskSummaryState {
  taskId: string;
  status: TaskSummaryStatus;
  at: string;
  /** When status is `pending`, start of this run (ISO) — stale checks compare report mtime to this. */
  pendingSince?: string;
  error?: string;
}

export interface TaskSummaryResult {
  ok: boolean;
  error?: string;
}

/** Injectable seams so tests never spawn a real agent or commit. */
export interface TaskSummaryDeps {
  resolvePm?: (config: RepoOSConfig) => PmAgent | null;
  runPrompt?: typeof runPrompt;
  commit?: (root: string, absPaths: string[], message: string) => boolean;
  /** From queue: disk task list + errors when live index is empty (one scan; #1041). */
  diskCandidates?: Task[];
  diskLoadErrors?: string[];
  /**
   * Acquire the publication-commit slot; resolves to a release function, or
   * null when a landing holds publication past the wait budget. Defaults to
   * the real repo/root locks so the bookkeeping commit never contends with a
   * landing's shared index/ref.
   */
  commitSlot?: (root: string, taskId: string) => Promise<(() => void) | null>;
  /** Test seam for merge diff listing — never set in production. */
  runGit?: (root: string, args: string[], timeout: number) => Promise<GitRun>;
  /**
   * Optional I/O for the generated `summary.md` path only — lets tests simulate
   * read/write/unlink failures without spying on ESM `fs` exports (#1041).
   */
  summaryReadFileSync?: typeof readFileSync;
  summaryWriteFileSync?: typeof writeFileSync;
  summaryUnlinkSync?: typeof unlinkSync;
}

/**
 * Lifecycle gate for the post-merge summary. Only a released (`done`) task
 * has complete facts — generating earlier would bake in a pre-merge story.
 * Returns the refusal message, or null when generation may proceed. The disk
 * file governs: callers pass the file-preferred task.
 */
export function summaryReleaseGate(task: Pick<Task, "id" | "status">): string | null {
  if (task.status === "done") return null;
  return (
    `Task #${task.id} is not released (status: ${task.status ?? "unknown"}) — ` +
    "the post-merge summary is generated after Move to done. Retry once the task has landed."
  );
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Serialize the summary bookkeeping commit with publication: hold the
 * close-out (publication) lock and the root lock — in that order, matching
 * the orchestrator — only around the commit itself, never during the slow PM
 * generation. Returns a release function, or null after the wait budget when
 * a landing is publishing (the summary fails visibly and stays retryable).
 */
export async function acquireSummaryCommitSlot(
  root: string,
  taskId: string,
  opts: { tries?: number; delayMs?: number } = {},
): Promise<(() => void) | null> {
  const { tries = 30, delayMs = 2000 } = opts;
  const repoLock = createRepositoryLock(root);
  const rootLock = createRootLock(root);
  for (let attempt = 0; attempt < tries; attempt++) {
    if (repoLock.acquire(taskId)) {
      if (rootLock.acquire(taskId, "close-out")) {
        return () => {
          rootLock.release(taskId);
          repoLock.release(taskId);
        };
      }
      repoLock.release(taskId);
    }
    await sleep(delayMs);
  }
  return null;
}

const statusDir = (config: RepoOSConfig): string =>
  join(config.root, config.cacheDir ?? ".repoos", "task-summary");

const statusFile = (config: RepoOSConfig, taskId: string): string =>
  join(statusDir(config), `${taskId}.json`);

export function readSummaryStatus(config: RepoOSConfig, taskId: string): TaskSummaryState {
  const path = statusFile(config, taskId);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") return { taskId, status: "idle", at: "" };
    return {
      taskId,
      status: "failed",
      at: new Date().toISOString(),
      error: `Could not read summary job status file: ${(err as Error).message}`.slice(0, 500),
    };
  }
  let parsed: Partial<TaskSummaryState>;
  try {
    parsed = JSON.parse(raw) as Partial<TaskSummaryState>;
  } catch (err) {
    return {
      taskId,
      status: "failed",
      at: new Date().toISOString(),
      error: `Summary job status file is corrupted (invalid JSON): ${(err as Error).message}`.slice(
        0,
        500,
      ),
    };
  }
  if (parsed.status === "pending" || parsed.status === "done" || parsed.status === "failed") {
    // If status is "done", validate that the summary file exists and is readable.
    // If the file is missing or unreadable, return failed instead.
    if (parsed.status === "done") {
      const markdown = loadTaskSummaryMarkdown(config, taskId);
      if (!markdown) {
        return {
          taskId,
          status: "failed",
          at: new Date().toISOString(),
          error: "Summary marked done but summary.md is missing or unreadable.",
        };
      }
    }
    return {
      taskId,
      status: parsed.status,
      at: typeof parsed.at === "string" ? parsed.at : "",
      pendingSince:
        typeof parsed.pendingSince === "string" && parsed.pendingSince.trim()
          ? parsed.pendingSince
          : parsed.status === "pending" && typeof parsed.at === "string"
            ? parsed.at
            : undefined,
      error: typeof parsed.error === "string" ? parsed.error : undefined,
    };
  }
  return {
    taskId,
    status: "failed",
    at: new Date().toISOString(),
    error: "Summary job status file has an invalid status field.",
  };
}

/**
 * API/CLI payload: applies stale-`pending` recovery when the report file exists
 * but the `done` status write was lost (#1041).
 */
export function getTaskSummaryJobPayload(
  config: RepoOSConfig,
  taskId: string,
  opts: { nowMs?: number } = {},
): {
  markdown: string | null;
  status: TaskSummaryStatus;
  statusAt: string | null;
  pendingSince: string | null;
  reportMtimeMs: number | null;
  error: string | null;
} {
  const disk = readSummaryStatus(config, taskId);
  const sf = disk.taskId === "" ? { ...disk, taskId } : disk;
  const reportPath = join(reportsTaskDir(config, taskId), "summary.md");
  let markdown: string | null = null;
  let reportMtimeMs: number | null = null;
  let reportReadError: string | null = null;
  if (existsSync(reportPath)) {
    try {
      reportMtimeMs = statSync(reportPath).mtimeMs;
    } catch (err) {
      reportReadError = `Could not stat summary report: ${(err as Error).message}`;
    }
    try {
      markdown = readFileSync(reportPath, "utf8");
    } catch (err) {
      const msg = `Could not read summary report: ${(err as Error).message}`;
      reportReadError = reportReadError ? `${reportReadError}; ${msg}` : msg;
      markdown = null;
    }
  }
  const nowMs = opts.nowMs ?? Date.now();
  const exists = markdown !== null;
  let status = effectiveSummaryJobStatus(
    sf.status,
    sf.at,
    exists,
    nowMs,
    reportMtimeMs,
    sf.pendingSince ?? null,
  );
  const parts: string[] = [];
  if (sf.error) parts.push(sf.error);
  if (reportReadError) parts.push(reportReadError);
  if (status === "failed" && sf.status === "pending" && exists && reportMtimeMs !== null) {
    const anchorRaw = (sf.pendingSince?.trim() || sf.at.trim()) ?? "";
    const anchor = anchorRaw ? Date.parse(anchorRaw) : NaN;
    if (!Number.isNaN(anchor) && reportMtimeMs < anchor) {
      parts.push(
        "Post-merge summary retry timed out: on-disk report is older than this run — run `repoos summary <id>` again.",
      );
    }
  }
  if (reportReadError) {
    if (sf.status === "pending") status = "failed";
    else if (sf.status === "idle") {
      status = "failed";
      parts.push("Could not load the committed summary report.");
    }
  }
  return {
    markdown,
    status,
    statusAt: sf.at || null,
    pendingSince: sf.pendingSince?.trim() || (sf.status === "pending" ? sf.at || null : null),
    reportMtimeMs,
    error: parts.length ? parts.join(" — ") : null,
  };
}

/**
 * Persist the summary job state. Returns false (and logs) when persistence
 * fails instead of throwing: callers treat the report file as ground truth,
 * but a lost status must stay visible in the server log — silently mapping to
 * `idle` is what used to hide failures from polling and the drawer.
 * Two write attempts; on total failure records `failed` with the I/O error (#1041).
 */
function writeSummaryStatus(
  config: RepoOSConfig,
  taskId: string,
  status: Exclude<TaskSummaryStatus, "idle">,
  error?: string,
): boolean {
  const now = new Date().toISOString();
  const state: TaskSummaryState = {
    taskId,
    status,
    at: now,
    ...(status === "pending" ? { pendingSince: now } : {}),
    ...(error ? { error: error.slice(0, 500) } : {}),
  };
  const path = statusFile(config, taskId);
  const body = `${JSON.stringify(state, null, 2)}\n`;
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(statusDir(config), { recursive: true });
      writeFileSync(path, body);
      return true;
    } catch (err) {
      lastErr = err as Error;
      console.error(
        `Task summary status write attempt ${attempt + 1} failed for ${taskId} (${status}): ${lastErr.message}`,
      );
    }
  }
  const detail = lastErr?.message ?? "unknown error";
  console.error(`Task summary status not persisted for ${taskId} (${status}): ${detail}`);
  try {
    mkdirSync(statusDir(config), { recursive: true });
    const failedState: TaskSummaryState = {
      taskId,
      status: "failed",
      at: now,
      error: `Could not persist summary job status (${status}): ${detail}`.slice(0, 500),
    };
    writeFileSync(statusFile(config, taskId), `${JSON.stringify(failedState, null, 2)}\n`);
  } catch (err2) {
    console.error(
      `Task summary failed-state could not be persisted for ${taskId}: ${(err2 as Error).message}`,
    );
  }
  return false;
}

/** Stricter than `parseTask` alone: body-only files are rejected as invalid task files (#1041 disk scan). */
function parseTaskFileFromDiskContent(
  config: RepoOSConfig,
  content: string,
  absPath: string,
): Task {
  const { hadFrontmatter } = parseDocument(content);
  if (!hadFrontmatter)
    throw new Error("Task file has no YAML frontmatter — expected opening --- delimiter.");
  return parseTask({
    content,
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus ?? "inbox",
    defaultAssignee: config.defaultAssignee ?? "unassigned",
  });
}

/**
 * Best-effort task list read straight from the work directory, for
 * fire-and-forget callers (close-out) that hold no live index. Used only for
 * linked-task facts — never for status decisions. Unparseable files are
 * skipped. A failed directory read yields `loadErrors` instead of an empty
 * list silently (#1041).
 */
export function loadCandidateTasksFromDisk(config: RepoOSConfig): {
  tasks: Task[];
  loadErrors: string[];
} {
  const dir = join(config.root, config.workDir ?? "work");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    return {
      tasks: [],
      loadErrors: [`Could not scan work directory for linked tasks: ${(err as Error).message}`],
    };
  }
  const out: Task[] = [];
  const loadErrors: string[] = [];
  for (const entry of entries) {
    if (!/^\d+-.*\.md$/.test(entry)) continue;
    const absPath = join(dir, entry);
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch (err) {
      loadErrors.push(`Could not read task file ${entry}: ${(err as Error).message}`);
      continue;
    }
    try {
      out.push(parseTaskFileFromDiskContent(config, content, absPath));
    } catch (err) {
      loadErrors.push(`Could not parse task file ${entry}: ${(err as Error).message}`);
    }
  }
  return { tasks: out, loadErrors };
}

/**
 * One task read straight from its file on disk, mirroring the release stamp's
 * own fallback when the live index misses it. Null when the file cannot be
 * located or parsed.
 */
export function readTaskFromDisk(config: RepoOSConfig, taskId: string): Task | null {
  const dir = join(config.root, config.workDir ?? "work");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const match = entries.find((f) => f.startsWith(`${taskId}-`) && f.endsWith(".md"));
  if (!match) return null;
  const absPath = join(dir, match);
  try {
    return parseTask({
      content: readFileSync(absPath, "utf8"),
      absPath,
      root: config.root,
      defaultStatus: config.defaultStatus ?? "inbox",
      defaultAssignee: config.defaultAssignee ?? "unassigned",
    });
  } catch {
    return null;
  }
}

/** The stored `summary.md` narrative, or null when none was ever written. */
export function loadTaskSummaryMarkdown(config: RepoOSConfig, taskId: string): string | null {
  try {
    const file = join(reportsTaskDir(config, taskId), "summary.md");
    if (!existsSync(file)) return null;
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function splitBodyAndActivity(body: string): { body: string; activity: string[] } {
  const lines = (body ?? "").split("\n");
  const idx = lines.findIndex((line) => line.trim() === "## Activity");
  const main = (idx === -1 ? lines : lines.slice(0, idx)).join("\n").trim();
  const activity: string[] = [];
  if (idx !== -1) {
    for (const line of lines.slice(idx + 1)) {
      const trimmed = line.trim();
      if (/^##\s/.test(trimmed)) break;
      if (trimmed.startsWith("- ")) activity.push(trimmed.slice(2).trim());
    }
  }
  return { body: main, activity };
}

function readReviewBody(config: RepoOSConfig, taskId: string, pass: number): string {
  try {
    const file = findReviewPassFile(config, taskId, pass);
    if (!file) return "";
    return parseDocument(readFileSync(file, "utf8")).body.trim();
  } catch {
    return "";
  }
}

function toSessionFacts(row: SessionRecord): TaskSummarySessionFacts {
  return {
    sessionType: row.sessionType,
    agent: row.agent,
    model: row.model,
    codingAgent: row.codingAgent,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    elapsedMs: row.elapsedMs,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    costSource: row.costSource,
    status: row.status,
    errorReason: row.errorReason,
  };
}

/**
 * Gather every recorded fact the PM may cite. Reads the task file fresh from
 * disk (the passed task may predate the release stamp) and falls back to the
 * passed task's body when the file cannot be read.
 */
export function collectTaskSummaryFacts(
  config: RepoOSConfig,
  task: Task,
  allTasks: Task[],
  diskFallback?: { tasks: Task[]; loadErrors: string[] },
): TaskSummaryFacts {
  const loadErrors: string[] = [...(diskFallback?.loadErrors ?? [])];

  let body = task.body ?? "";
  try {
    if (task.absPath && existsSync(task.absPath))
      body = parseDocument(readFileSync(task.absPath, "utf8")).body;
  } catch (err) {
    loadErrors.push(`Could not read task body from disk: ${(err as Error).message}`);
  }
  const { body: bodyWithoutActivity, activity } = splitBodyAndActivity(body);

  const { reports: loadedReports, errors: engineeringErrors } = loadEngineeringReports(
    config,
    task.id,
  );
  loadErrors.push(...engineeringErrors);
  const rounds: TaskSummaryRoundFacts[] = loadedReports.map((report) => ({
    round: report.round,
    at: report.at,
    agent: report.agent,
    model: report.model,
    branch: report.branch,
    wordCount: report.wordCount,
    markdown: report.markdown,
  }));

  let reviews: TaskSummaryReviewFacts[] = [];
  try {
    reviews = listReviewPasses(config, task.id).map((pass) => {
      const markdown = readReviewBody(config, task.id, pass.pass);
      if (!markdown) {
        loadErrors.push(`Review pass ${pass.pass}: could not read body`);
      }
      return {
        pass: pass.pass,
        at: pass.at,
        state: pass.state,
        verdict: pass.verdict,
        agent: pass.agent,
        cli: pass.cli,
        model: pass.model,
        markdown,
      };
    });
  } catch (err) {
    loadErrors.push(`Could not load review passes: ${(err as Error).message}`);
  }

  let sessions: TaskSummarySessionFacts[] = [];
  try {
    const db = getRepoOSDb(config.root);
    if (!db) {
      loadErrors.push("Session database unavailable — session facts were not loaded.");
    } else {
      sessions = db.getTaskSessions(task.id).map(toSessionFacts);
    }
  } catch (err) {
    loadErrors.push(`Could not load session records: ${(err as Error).message}`);
  }

  let candidateTasks = allTasks;
  if (allTasks.length === 0) {
    if (diskFallback) {
      candidateTasks = diskFallback.tasks;
    } else {
      const disk = loadCandidateTasksFromDisk(config);
      loadErrors.push(...disk.loadErrors);
      candidateTasks = disk.tasks;
    }
  }

  const linkedTaskSnapshot = (
    candidate: Task,
  ): { createdAt: string | null; bodyExcerpt: string } => {
    const rawBody = candidate.body ?? "";
    const { body: noActivity } = splitBodyAndActivity(rawBody);
    const excerpt = noActivity.replace(/\s+/g, " ").trim().slice(0, 400);
    return { createdAt: candidate.created_at ?? null, bodyExcerpt: excerpt };
  };

  const linked = candidateTasks
    .filter((candidate) => candidate.id !== task.id)
    .flatMap((candidate) => {
      const snap = linkedTaskSnapshot(candidate);
      const out: TaskSummaryFacts["linked"] = [];
      if (task.dependsOn?.includes(candidate.id))
        out.push({
          id: candidate.id,
          title: candidate.title,
          status: candidate.status,
          relation: "depends-on",
          createdAt: snap.createdAt,
          bodyExcerpt: snap.bodyExcerpt,
        });
      if (candidate.dependsOn?.includes(task.id))
        out.push({
          id: candidate.id,
          title: candidate.title,
          status: candidate.status,
          relation: "dependent",
          createdAt: snap.createdAt,
          bodyExcerpt: snap.bodyExcerpt,
        });
      return out;
    });

  return {
    taskId: task.id,
    title: task.title,
    type: task.type,
    area: task.area ?? "",
    priority: String(task.priority ?? ""),
    status: task.status,
    branch: task.branch || null,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    mergedCommit: task.mergedCommit ?? null,
    body: bodyWithoutActivity,
    activity,
    rounds,
    reviews,
    sessions,
    linked,
    loadErrors,
  };
}

/**
 * Deterministic file-changes listing for the merged commit. Bookkeeping paths
 * (the task's own file and report directory) are excluded, like the
 * engineering report's generated summary. Empty when the merge commit is
 * unknown or unreadable — the narrative must stand on its own.
 */
async function computeChangedFiles(
  config: RepoOSConfig,
  task: Task,
  mergedCommit: string | null,
  deps: Pick<TaskSummaryDeps, "runGit"> = {},
): Promise<{ files: TaskSummaryFileChange[]; unavailableReason?: string }> {
  const rg = deps.runGit ?? runGit;
  if (!mergedCommit)
    return { files: [], unavailableReason: "merged commit not recorded on the task" };
  const range = `${mergedCommit}^`;
  const num = await rg(
    config.root,
    ["diff", "--no-ext-diff", "--find-renames", "--numstat", range, mergedCommit],
    10_000,
  );
  const names = await rg(
    config.root,
    ["diff", "--no-ext-diff", "--find-renames", "--name-status", range, mergedCommit],
    10_000,
  );
  if (num.timedOut || names.timedOut) {
    return {
      files: [],
      unavailableReason: "git diff timed out while resolving merge file list",
    };
  }
  if (num.status === null || names.status === null) {
    return {
      files: [],
      unavailableReason: "git diff failed to run (git unavailable)",
    };
  }
  if (num.status !== 0) {
    const hint = (num.stderr || num.stdout || "").trim();
    return {
      files: [],
      unavailableReason: hint ? `numstat: ${hint}` : `numstat exited ${num.status}`,
    };
  }
  if (names.status !== 0) {
    const hint = (names.stderr || names.stdout || "").trim();
    return {
      files: [],
      unavailableReason: hint ? `name-status: ${hint}` : `name-status exited ${names.status}`,
    };
  }
  const nameRows = names.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const numRows = num.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  if (nameRows.length !== numRows.length) {
    return {
      files: [],
      unavailableReason: "git diff outputs could not be paired (mismatched line counts)",
    };
  }
  const isBookkeeping = (path: string): boolean =>
    isOwnReportPath(path, config, task.id) || path === task.path;
  const files = nameRows.flatMap(([status, ...paths], index) => {
    if (paths.some(isBookkeeping)) return [];
    const row = numRows[index];
    return [
      {
        path: paths.length === 2 ? `${paths[0]} → ${paths[1]}` : (paths[0] ?? ""),
        status: status ?? "",
        additions: row?.[0] ?? "0",
        deletions: row?.[1] ?? "0",
      },
    ];
  });
  return { files };
}

function fail(config: RepoOSConfig, taskId: string, error: string): TaskSummaryResult {
  writeSummaryStatus(config, taskId, "failed", error.slice(0, 500));
  return { ok: false, error };
}

/**
 * Generate the summary with the PM agent and commit it as task bookkeeping.
 * A failure never touches the task's `done` status — it only records a
 * visible `failed` state so `repoos summary <id>` can retry it.
 */
export async function runTaskSummaryNow(
  config: RepoOSConfig,
  task: Task,
  allTasks: Task[],
  deps: TaskSummaryDeps = {},
): Promise<TaskSummaryResult> {
  // Prefer the task file on disk: close-out queues with the live-index object,
  // which predates the release stamp (status, timestamps, merged commit are
  // flushed to the file first). The file is the source of truth; the passed
  // object is only a fallback when nothing is on disk (e.g. tests).
  const current = readTaskFromDisk(config, task.id) ?? task;
  const taskId = current.id;
  const gateError = summaryReleaseGate(current);
  if (gateError) return fail(config, taskId, gateError);
  try {
    const diskFb =
      allTasks.length === 0 &&
      (deps.diskCandidates !== undefined || deps.diskLoadErrors !== undefined)
        ? { tasks: deps.diskCandidates ?? [], loadErrors: deps.diskLoadErrors ?? [] }
        : undefined;
    const facts = collectTaskSummaryFacts(config, current, allTasks, diskFb);
    const pm = (deps.resolvePm ?? resolvePmAgent)(config);
    if (!pm)
      return fail(
        config,
        taskId,
        "No enabled PM agent is configured — enable one on the Agents page, then retry with `repoos summary <id>`.",
      );
    const prompt = buildTaskSummaryPrompt(facts);
    let result;
    try {
      result = await (deps.runPrompt ?? runPrompt)(pm, prompt, {
        cwd: config.root,
        ...repoAgentRunTmpOpts(config),
      });
    } catch (err) {
      return fail(config, taskId, `PM summary run failed: ${(err as Error).message}`);
    }
    recordOneShotSession(config.root, pm, result, { sessionType: "summary", taskId });
    if (!result.ok || !result.output?.trim())
      return fail(
        config,
        taskId,
        `PM summary run produced no output (${result.error || "unknown error"})`,
      );
    // The marker is a server-protocol token — strip any PM-emitted copies
    // before validating and storing, so injected text after a fake marker
    // counts toward the budget and the stored file carries exactly one marker.
    const narrative = stripTaskSummaryMarkerLines(result.output.trim()).trim();
    const errors = validateTaskSummary(narrative);
    if (errors.length) return fail(config, taskId, errors.join(" "));
    const changed = await computeChangedFiles(config, current, facts.mergedCommit, deps);
    const markdown = `${narrative}\n\n${formatTaskSummaryFileChanges(changed.files, { unavailableReason: changed.unavailableReason })}`;

    // Serialize the bookkeeping commit with publication: a landing holds the
    // same locks while merging, so committing blind could contend with its
    // shared index/ref and fail that landing. Waiting here never blocks a
    // landing — only this background job, which fails visibly when the slot
    // never opens. Acquire the slot BEFORE writing the file so failures never
    // leave it uncommitted and dirty in the checkout.
    const slot = await (deps.commitSlot ?? acquireSummaryCommitSlot)(config.root, taskId);
    if (!slot)
      return fail(
        config,
        taskId,
        "A landing is publishing and the summary could not take the commit slot — " +
          `retry with \`repoos summary ${taskId}\`.`,
      );

    let committed = false;
    let absPath: string | null = null;
    let prior: SummaryPriorState = { kind: "absent" };
    const summaryRead = deps.summaryReadFileSync ?? readFileSync;
    const summaryWrite = deps.summaryWriteFileSync ?? writeFileSync;
    const summaryUnlink = deps.summaryUnlinkSync ?? unlinkSync;
    const pathIo = { writeFileSync: summaryWrite, unlinkSync: summaryUnlink };
    try {
      const dir = reportsTaskDir(config, taskId);
      mkdirSync(dir, { recursive: true });
      absPath = join(dir, "summary.md");
      // Preserve any existing file so it can be restored on failure; if the file
      // exists but is unreadable, never unlink it on rollback (#1041 review).
      if (existsSync(absPath)) {
        try {
          prior = { kind: "backup", content: summaryRead(absPath, "utf8") };
        } catch (err) {
          prior = { kind: "unreadable", message: (err as Error).message };
        }
      }
      if (prior.kind === "unreadable") {
        return fail(
          config,
          taskId,
          `Existing summary.md is unreadable; left in place: ${prior.message}`,
        );
      }
      try {
        summaryWrite(absPath, `${markdown.trim()}\n`);
        committed = (deps.commit ?? commitFiles)(
          config.root,
          [absPath],
          `docs(${taskId}): post-merge summary report`,
        );
      } catch (err) {
        const restoreErr = restoreSummaryPathAfterFailure(absPath, prior, pathIo);
        if (restoreErr)
          throw new Error(
            `${(err as Error).message}; additionally could not restore checkout: ${restoreErr.message}`,
          );
        throw err;
      }
      if (!committed) {
        const restoreErr = restoreSummaryPathAfterFailure(absPath, prior, pathIo);
        return fail(
          config,
          taskId,
          restoreErr
            ? `Wrote summary.md but the bookkeeping commit failed — restore error: ${restoreErr.message}`
            : "Wrote summary.md but the bookkeeping commit failed — retry to commit it.",
        );
      }
    } finally {
      slot();
    }

    // A lost done-status is logged, not fatal: the committed report is ground
    // truth and polling/CLI recognize it via `exists`.
    writeSummaryStatus(config, taskId, "done");
    return { ok: true };
  } catch (err) {
    return fail(config, taskId, `PM summary run failed: ${(err as Error).message}`);
  }
}

const inFlight = new Set<string>();

/**
 * Fire-and-forget post-merge generation for close-out. Never throws and never
 * touches the task status — a slow or failed summary must not change the
 * landing. A concurrent attempt for the same task is skipped.
 */
export function queueTaskSummary(config: RepoOSConfig, task: Task, allTasks: Task[]): void {
  if (inFlight.has(task.id)) return;
  inFlight.add(task.id);
  const diskFallback = allTasks.length === 0 ? loadCandidateTasksFromDisk(config) : null;
  // Mark the job as pending before starting. If the status write fails, do not
  // start the job and mark it failed instead so polling doesn't hang.
  const pendingWriteOk = writeSummaryStatus(config, task.id, "pending");
  if (!pendingWriteOk) {
    inFlight.delete(task.id);
    writeSummaryStatus(
      config,
      task.id,
      "failed",
      "Could not write pending status — job not started",
    );
    return;
  }
  void (async () => {
    try {
      // Fire-and-forget callers (close-out) hold no live index, so an empty
      // list falls back to a best-effort work-dir scan — automatic reports
      // must carry the same linked-task facts as a manual retry.
      const candidates = allTasks.length > 0 ? allTasks : (diskFallback?.tasks ?? []);
      await runTaskSummaryNow(config, task, candidates, {
        diskCandidates: diskFallback?.tasks,
        diskLoadErrors: diskFallback?.loadErrors,
      });
    } catch (err) {
      try {
        writeSummaryStatus(config, task.id, "failed", (err as Error).message.slice(0, 500));
      } catch {
        /* advisory only */
      }
    } finally {
      inFlight.delete(task.id);
    }
  })();
}
