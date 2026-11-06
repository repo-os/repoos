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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import type { SessionRecord } from "../core/db.js";
import { getRepoOSDb } from "../core/db.js";
import { parseDocument } from "../core/frontmatter.js";
import { commitFiles, runGit } from "../core/git.js";
import { isOwnReportPath, reportsTaskDir } from "../core/report-paths.js";
import { findReviewPassFile, listReviewPasses } from "../core/review-passes.js";
import { repoAgentRunTmpOpts } from "../core/agent-run-tmpdir.js";
import { recordOneShotSession, resolvePmAgent, runPrompt } from "./agents.js";

/** The PM agent shape, derived from the resolver so no private type import is needed. */
type PmAgent = NonNullable<ReturnType<typeof resolvePmAgent>>;
import { loadEngineeringReports } from "./engineering-reports.js";
import {
  buildTaskSummaryPrompt,
  formatTaskSummaryFileChanges,
  validateTaskSummary,
  type TaskSummaryFacts,
  type TaskSummaryFileChange,
  type TaskSummarySessionFacts,
} from "../core/task-summary.js";

/** Visible lifecycle of a task's summary job. `idle` means never attempted. */
export type TaskSummaryStatus = "idle" | "pending" | "done" | "failed";

export interface TaskSummaryState {
  taskId: string;
  status: TaskSummaryStatus;
  at: string;
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
}

const statusDir = (config: RepoOSConfig): string =>
  join(config.root, config.cacheDir ?? ".repoos", "task-summary");

const statusFile = (config: RepoOSConfig, taskId: string): string =>
  join(statusDir(config), `${taskId}.json`);

export function readSummaryStatus(config: RepoOSConfig, taskId: string): TaskSummaryState {
  try {
    const raw = readFileSync(statusFile(config, taskId), "utf8");
    const parsed = JSON.parse(raw) as Partial<TaskSummaryState>;
    if (parsed.status === "pending" || parsed.status === "done" || parsed.status === "failed")
      return {
        taskId,
        status: parsed.status,
        at: typeof parsed.at === "string" ? parsed.at : "",
        error: typeof parsed.error === "string" ? parsed.error : undefined,
      };
  } catch {
    /* never attempted — idle */
  }
  return { taskId, status: "idle", at: "" };
}

function writeSummaryStatus(
  config: RepoOSConfig,
  taskId: string,
  status: Exclude<TaskSummaryStatus, "idle">,
  error?: string,
): void {
  try {
    mkdirSync(statusDir(config), { recursive: true });
    const state: TaskSummaryState = {
      taskId,
      status,
      at: new Date().toISOString(),
      ...(error ? { error } : {}),
    };
    writeFileSync(statusFile(config, taskId), `${JSON.stringify(state, null, 2)}\n`);
  } catch {
    /* status is advisory — the report file is the ground truth */
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
): TaskSummaryFacts {
  let body = task.body ?? "";
  try {
    if (task.absPath && existsSync(task.absPath))
      body = parseDocument(readFileSync(task.absPath, "utf8")).body;
  } catch {
    /* fall back to the passed task body */
  }
  const { body: bodyWithoutActivity, activity } = splitBodyAndActivity(body);
  const rounds = loadEngineeringReports(config, task.id).reports.map((report) => ({
    round: report.round,
    at: report.at,
    agent: report.agent,
    model: report.model,
    branch: report.branch,
    wordCount: report.wordCount,
    markdown: report.markdown,
  }));
  const reviews = listReviewPasses(config, task.id).map((pass) => ({
    pass: pass.pass,
    at: pass.at,
    state: pass.state,
    verdict: pass.verdict,
    agent: pass.agent,
    cli: pass.cli,
    model: pass.model,
    markdown: readReviewBody(config, task.id, pass.pass),
  }));
  let sessions: TaskSummarySessionFacts[] = [];
  try {
    sessions = (getRepoOSDb(config.root)?.getTaskSessions(task.id) ?? []).map(toSessionFacts);
  } catch {
    sessions = [];
  }
  const linked = allTasks
    .filter((candidate) => candidate.id !== task.id)
    .flatMap((candidate) => {
      const out: TaskSummaryFacts["linked"] = [];
      if (task.dependsOn?.includes(candidate.id))
        out.push({
          id: candidate.id,
          title: candidate.title,
          status: candidate.status,
          relation: "depends-on",
        });
      if (candidate.dependsOn?.includes(task.id))
        out.push({
          id: candidate.id,
          title: candidate.title,
          status: candidate.status,
          relation: "dependent",
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
): Promise<TaskSummaryFileChange[]> {
  if (!mergedCommit) return [];
  const num = await runGit(
    config.root,
    ["diff", "--no-ext-diff", "--find-renames", "--numstat", `${mergedCommit}^`, mergedCommit],
    10_000,
  );
  const names = await runGit(
    config.root,
    ["diff", "--no-ext-diff", "--find-renames", "--name-status", `${mergedCommit}^`, mergedCommit],
    10_000,
  );
  if (num.status !== 0 || names.status !== 0) return [];
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
  const isBookkeeping = (path: string): boolean =>
    isOwnReportPath(path, config, task.id) || path === task.path;
  return nameRows.flatMap(([status, ...paths], index) => {
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
  const taskId = task.id;
  try {
    const facts = collectTaskSummaryFacts(config, task, allTasks);
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
    const narrative = result.output.trim();
    const errors = validateTaskSummary(narrative);
    if (errors.length) return fail(config, taskId, errors.join(" "));
    const files = await computeChangedFiles(config, task, facts.mergedCommit);
    const markdown = `${narrative}\n\n${formatTaskSummaryFileChanges(files)}`;
    const dir = reportsTaskDir(config, taskId);
    mkdirSync(dir, { recursive: true });
    const absPath = join(dir, "summary.md");
    writeFileSync(absPath, `${markdown.trim()}\n`);
    const committed = (deps.commit ?? commitFiles)(
      config.root,
      [absPath],
      `docs(${taskId}): post-merge summary report`,
    );
    if (!committed)
      return fail(
        config,
        taskId,
        "Wrote summary.md but the bookkeeping commit failed — retry to commit it.",
      );
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
  try {
    writeSummaryStatus(config, task.id, "pending");
  } catch {
    /* advisory only */
  }
  void (async () => {
    try {
      await runTaskSummaryNow(config, task, allTasks);
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
