/**
 * The review agent (0101): an automatic, read-only assessment of a task's
 * implementation, produced the moment the task lands in `review` and read by
 * the human who signs it off.
 *
 * It SUPPORTS sign-off, it never replaces it. The report is advisory: the
 * agent inspects the branch's diff in the task's own worktree, writes a short
 * markdown report to `<cacheDir>/reviews/<id>.md`, and stops. It never edits
 * the repo, never merges, and never moves the task to `done` — that transition
 * stays exactly where it was, behind the human's "Move to done".
 *
 * Three layers keep it that way:
 *   1. the mission spells out the read-only boundary;
 *   2. the child is spawned through `runPrompt`, which injects no
 *      `REPOOS_API_URL`/`REPOOS_TASK_ID`, so the agent has no pointer at the
 *      control plane's `/done` endpoint;
 *   3. `enforceStillInReview` reverts the task file if it comes back `done`
 *      anyway, and says so loudly (the same shape as the 0077 self-heal).
 *
 * Zero runtime deps — node:fs / node:path only.
 */
import type { ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../core/types.js";
import { parseDocument, serializeDocument } from "../core/frontmatter.js";
import { commitTaskFile, currentBranch, worktreePathForBranch } from "../core/git.js";
import { parseTask, utcTimestamp } from "../core/task.js";
import type { LiveIndex, RepoEvent } from "./live-index.js";
import {
  estimateCostUsd,
  extractOneShotReportText,
  parseOneShotLine,
  resolveReviewer,
  resolveReviewerForTask,
  reviewCommand,
  runPrompt,
  usageCostSource,
  type AgentRunner,
  type PromptResult,
} from "./agents.js";
import { patchTaskFile } from "./write.js";
import { createLogger, type Logger } from "../core/logger.js";
import { getRepoOSDb, type RepoOSDb } from "../core/db.js";

/** A stored agent review, as served to the UI. */
export interface ReviewReport {
  /** Task id this report belongs to. */
  id: string;
  /** ISO timestamp the report was written. */
  at: string;
  /** Agent role name that produced it (normally "reviewer"). */
  agent: string;
  /** Coding-agent CLI and model behind that role. */
  cli: string;
  model: string;
  /** Branch that was reviewed. */
  branch: string;
  /** "ok" when the agent reported; "failed" when the run itself failed. */
  state: "ok" | "failed";
  /** The report markdown (or the failure detail when state is "failed"). */
  markdown: string;
}

export interface ReviewRunResult {
  ok: boolean;
  /** True when no review was attempted at all (agent disabled, no worktree). */
  skipped?: boolean;
  reason?: string;
  report?: ReviewReport;
}

/**
 * Ceiling on one review run. Generous compared to the 3-minute one-shot
 * default: a reviewer reads a whole diff and may run the test suite, and a
 * timeout means the human gets no report at all.
 */
const REVIEW_TIMEOUT_MS = 900_000;

/** Cap on the task spec quoted into the mission (keeps the prompt bounded). */
const SPEC_CHARS = 6000;

/** Cap on the stored report (a runaway agent must not fill the cache dir). */
const REPORT_CHARS = 20_000;

/**
 * Prefix on the SSE event id used for a task's reviewer conversation. The
 * engineer session streams under the plain task id; reviewer output streams
 * under `review:<taskId>` so the two conversations can never mix on the wire
 * or in the UI (0110).
 */
export const REVIEW_SESSION_ID_PREFIX = "review:";

/** Cap on retained reviewer-conversation entries in the client and on disk. */
const SESSION_LINES_CAP = 2000;

/** Debounce window for persisting the reviewer conversation to disk. */
const SESSION_WRITE_DEBOUNCE_MS = 300;

const now = (): string => new Date().toISOString();

/**
 * Compute the reviewer session's cost + source the same way the engineer's
 * `recordSessionToDb` does (0273): a real CLI-reported figure wins outright,
 * otherwise a token-count estimate (never fabricated), and Kiro credits are
 * never passed off as US dollars.
 */
function reviewUsage(
  agent: Agent,
  usage: { costUsd?: number; totalTokens?: number },
): { costUsd?: number; costSource: string } {
  if (usage.costUsd) {
    return { costUsd: usage.costUsd, costSource: usageCostSource(agent, usage) };
  }
  if (usage.totalTokens) {
    return { costUsd: estimateCostUsd(usage.totalTokens), costSource: "estimate" };
  }
  return { costSource: "none" };
}

/** Frontmatter key order for the stored report file. */
const REPORT_KEYS = ["task", "at", "agent", "cli", "model", "branch", "state"];

/** Max number of automatic review/fix rounds before requiring human intervention. */
const MAX_AUTO_REVIEW_ROUNDS = 2;

/**
 * The mission handed to the review agent. Deliberately narrow: what to look
 * at, what to write, and a hard boundary on what it may not touch.
 */
export function reviewMission(
  task: Task,
  agent: Agent,
  workdir: string,
  baseBranch: string,
): string {
  const spec = task.body.trim().slice(0, SPEC_CHARS);
  const role = agent.instructions?.trim();
  const parts: string[] = [];
  if (role) parts.push(role, "");
  parts.push(
    "You are the REVIEW agent for RepoOS. A human is about to sign this task off and",
    "wants your read on it first. Your job is to inspect the finished implementation",
    "and write ONE short report they can read while reviewing. You do not approve",
    "anything and you do not finish the task — the human does.",
    "",
    `Task #${task.id}: ${task.title}`,
    `Worktree (read-only for you): ${workdir}`,
    `Branch under review: ${task.branch || "(none)"} · base branch: ${baseBranch}`,
    "",
    "## The task spec",
    "",
    spec || "(the task file has no body)",
    "",
    "## How to inspect it",
    "",
    `- \`git diff ${baseBranch}...HEAD\` and \`git log ${baseBranch}..HEAD --oneline\` in the`,
    "  worktree show exactly what changed. Start there.",
    "- Read the files the diff touches — judge the CODE, not just the diff hunks.",
    "- Check the implementation actually does what the spec asks, including every",
    "  acceptance criterion, and that its behaviour holds up beyond the happy path.",
    "- Look for real bugs: wrong logic, unhandled errors, races, resource leaks,",
    "  broken contracts with existing callers, missing or misleading tests.",
    "- Call out the edge cases that matter for this change (empty/missing input,",
    "  concurrency, failure of a dependency, first run, repeated run).",
    "- You may run read-only commands (git, reading files). The implementer already",
    "  ran `repoos check` green to enter review, so do NOT re-run the full build or",
    "  test suite — it is slow and adds nothing you cannot see from the code.",
    "- Before judging the diff itself, check whether the task is still worth having.",
    "  Look at what has landed on the base branch and skim nearby recent tasks in",
    "  `work/` for signs the same problem was already solved elsewhere, requirements",
    "  shifted, or the task's premise no longer holds. A diff can be flawless and the",
    "  task still not worth merging as scoped — say so; don't just grade the code.",
    "",
    "## Hard boundaries",
    "",
    "- Do NOT edit, create, or delete ANY file, including the task file.",
    "- Do NOT commit, push, merge, sync, or delete branches.",
    "- Do NOT change the task's status, and NEVER move it to `done` — the task stays",
    "  in `review` for the human. Approving, merging, and completing are not yours.",
    "- Do NOT start servers or long-running processes.",
    "",
    "## What to output",
    "",
    "Output ONLY the report, as markdown, with no preamble and no closing chatter.",
    "Keep it under 400 words — a reviewer reads this next to the diff. Use exactly",
    "these sections. Verdict and Relevance each require one of their labels; write",
    "`None found` under Bugs, Edge cases, or Suggestions when genuinely empty:",
    "",
    "## Verdict",
    "Open the report with EXACTLY one of these three verdict labels, then one or two",
    "sentences saying what the change does and whether anything blocks sign-off:",
    "",
    "`good to go` — the change is correct and complete.",
    "`needs some work` — the change is close, but has issues worth fixing first.",
    "`back to the drawing board` — the change is off the mark.",
    "",
    "## Relevance",
    "Open with EXACTLY one of these three labels, then one sentence explaining why.",
    "This is independent of code quality — a correct diff can still fail this check:",
    "",
    "`still relevant` — the task's premise holds; this is still worth landing.",
    "`no longer needed` — the problem is already solved (elsewhere, or superseded by",
    "other work since this task was written); recommend discarding instead of merging.",
    "`needs rescoping` — the premise partly holds, but the task description or",
    "acceptance criteria are stale given what's shipped since; a human should update",
    "the task before this is merged as-is.",
    "",
    "## Bugs",
    "Concrete defects, each with the file and what goes wrong.",
    "",
    "## Edge cases",
    "Cases worth checking that the change may not handle.",
    "",
    "## Suggestions",
    "Improvements worth making. Say so plainly when there are none.",
  );
  return parts.join("\n");
}

/**
 * The mission handed to the review agent for a follow-up chat turn. The human
 * asked a question about the review; the reviewer answers in the same read-only
 * style, grounded in the task spec, its own previous report (when one exists),
 * and the actual code. It still never touches the repo beyond reading.
 */
export function reviewFollowupMission(
  task: Task,
  agent: Agent,
  workdir: string,
  baseBranch: string,
  text: string,
  previousReport: ReviewReport | null,
): string {
  const spec = task.body.trim().slice(0, SPEC_CHARS);
  const role = agent.instructions?.trim();
  const parts: string[] = [];
  if (role) parts.push(role, "");
  parts.push(
    "You are the REVIEW agent for RepoOS, continuing an earlier review conversation.",
    "A human is asking a follow-up question about your review of a task. Answer it",
    "directly and concisely, grounded in the actual code. You still do not approve",
    "anything and you do not finish the task — the human does.",
    "",
    `Task #${task.id}: ${task.title}`,
    `Worktree (read-only for you): ${workdir}`,
    `Branch under review: ${task.branch || "(none)"} · base branch: ${baseBranch}`,
    "",
    "## The task spec",
    "",
    spec || "(the task file has no body)",
    "",
    ...(previousReport
      ? [
          "## Your previous review",
          "",
          previousReport.markdown.trim().slice(0, REPORT_CHARS),
          "",
        ]
      : []),
    "## Hard boundaries",
    "",
    "- Do NOT edit, create, or delete ANY file, including the task file.",
    "- Do NOT commit, push, merge, sync, or delete branches.",
    "- Do NOT change the task's status, and NEVER move it to `done` — the task stays",
    "  in `review` for the human. Approving, merging, and completing are not yours.",
    "- Do NOT start servers or long-running processes.",
    "",
    "## What to output",
    "",
    "Answer the human's follow-up question in plain markdown, under 400 words. Quote",
    "specific files and lines where useful. If the question is about the verdict,",
    "say clearly whether it stays one of: `good to go`, `needs some work`, or",
    "`back to the drawing board`.",
    "",
    "## The human's question",
    "",
    text,
  );
  return parts.join("\n");
}

/** In-flight bookkeeping for one review run. */
interface Run {
  proc?: ChildProcess;
  cancelled: boolean;
}

/** How long a guard revert stays claimable by the review trigger, in ms. */
const REVERT_CLAIM_MS = 30_000;

/** Parse the verdict from the review report markdown. */
function parseVerdict(markdown: string): "good to go" | "needs some work" | "back to the drawing board" | null {
  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.includes("`good to go`")) return "good to go";
    if (line.includes("`needs some work`")) return "needs some work";
    if (line.includes("`back to the drawing board`")) return "back to the drawing board";
  }
  return null;
}

/**
 * Parse the relevance label from the review report markdown (whether the task
 * is still worth having, independent of the diff's code quality). Absent on
 * reports written before this section existed — callers must treat `null` as
 * "unknown", not as "still relevant".
 */
function parseRelevance(markdown: string): "still relevant" | "no longer needed" | "needs rescoping" | null {
  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.includes("`still relevant`")) return "still relevant";
    if (line.includes("`no longer needed`")) return "no longer needed";
    if (line.includes("`needs rescoping`")) return "needs rescoping";
  }
  return null;
}

/** Extract Relevance, Bugs, Edge cases, and Suggestions sections from the report markdown. */
function extractReportSections(markdown: string): {
  relevance?: string;
  bugs?: string;
  edgeCases?: string;
  suggestions?: string;
} {
  const sections: Record<string, string> = {};
  const lines = markdown.split("\n");
  let currentSection: string | null = null;
  const sectionLines: Record<string, string[]> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "## Relevance") {
      currentSection = "relevance";
      sectionLines.relevance = [];
    } else if (trimmed === "## Bugs") {
      currentSection = "bugs";
      sectionLines.bugs = [];
    } else if (trimmed === "## Edge cases") {
      currentSection = "edgeCases";
      sectionLines.edgeCases = [];
    } else if (trimmed === "## Suggestions") {
      currentSection = "suggestions";
      sectionLines.suggestions = [];
    } else if (trimmed.startsWith("## ") && currentSection) {
      currentSection = null;
    } else if (currentSection && sectionLines[currentSection]) {
      sectionLines[currentSection].push(line);
    }
  }

  for (const [key, lines] of Object.entries(sectionLines)) {
    const content = lines.join("\n").trim();
    if (content && content !== "None found") {
      sections[key] = content;
    }
  }

  return {
    relevance: sections.relevance,
    bugs: sections.bugs,
    edgeCases: sections.edgeCases,
    suggestions: sections.suggestions,
  };
}

export class ReviewManager {
  private readonly config: RepoOSConfig;
  private readonly emit: (e: RepoEvent) => void;
  private readonly runs = new Map<string, Run>();
  /** Tasks the status guard just put back in `review`, by timestamp. */
  private readonly reverted = new Map<string, number>();
  /**
   * The reviewer conversation per task, in-memory. Kept apart from the
   * engineer session (which lives in AgentRunner): reviewer chat must stay
   * isolated in both UI state and message routing (0110).
   */
  private readonly sessions = new Map<string, AgentOutputEntry[]>();
  private readonly sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** AgentRunner to send auto-bounce messages to the engineer session. */
  private readonly runner?: AgentRunner;
  /**
   * Reflects a trusted write straight into the index (see server.ts's other
   * `applyFileChange(path, { guarded: true })` call sites). Without this the
   * revert below is only ever seen by the async file watcher, which under
   * load can fire the transition-into-review path twice for one write —
   * `claimRevert` is single-use, so the second, spurious firing starts a
   * second review the guard was supposed to prevent.
   */
  private readonly index?: LiveIndex;
  /**
   * Own logger rather than a constructor param (0187 review): the only call
   * site is `startServer`, and every review event is a task-lifecycle event —
   * it belongs on the same per-task log stream `logger.task()` already
   * writes to elsewhere, keyed by the same `config.root`.
   */
  private readonly logger: Logger;
  /** Database for recording review sessions. */
  private readonly db: RepoOSDb | null;

  constructor(
    config: RepoOSConfig,
    emit: (e: RepoEvent) => void,
    runner?: AgentRunner,
    index?: LiveIndex,
  ) {
    this.config = config;
    this.emit = emit;
    this.runner = runner;
    this.index = index;
    this.logger = createLogger(config.root);
    this.db = getRepoOSDb(config.root);
  }

  /** Whether an enabled review agent exists — the Agents page toggle. */
  enabled(): boolean {
    return resolveReviewer(this.config) !== null;
  }

  isRunning(taskId: string): boolean {
    return this.runs.has(taskId);
  }

  /** How many reviews are in flight (the server's idle check). */
  runningCount(): number {
    return this.runs.size;
  }

  /**
   * Claim the "this task is only back in `review` because the guard put it
   * there" marker, if it is fresh. The revert lands on disk as an ordinary
   * status change, so without this the trigger would start another review,
   * whose agent would move it to done again, forever.
   */
  claimRevert(taskId: string): boolean {
    const at = this.reverted.get(taskId);
    if (at === undefined) return false;
    this.reverted.delete(taskId);
    return Date.now() - at <= REVERT_CLAIM_MS;
  }

  /** Where a task's report lives. Derived cache — safe to delete. */
  path(taskId: string): string {
    return join(this.config.root, this.config.cacheDir, "reviews", `${taskId}.md`);
  }

  /** The stored report for a task, or null when none was ever written. */
  read(taskId: string): ReviewReport | null {
    const file = this.path(taskId);
    if (!existsSync(file)) return null;
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return null;
    }
    const doc = parseDocument(raw);
    const str = (key: string): string => {
      const v = doc.data[key];
      return v === null || v === undefined ? "" : String(v);
    };
    return {
      id: str("task") || taskId,
      at: str("at"),
      agent: str("agent"),
      cli: str("cli"),
      model: str("model"),
      branch: str("branch"),
      state: str("state") === "failed" ? "failed" : "ok",
      markdown: doc.body.trim(),
    };
  }

  /**
   * The synchronous gate both `run` and `send` share: is a review possible for
   * this task right now? Resolved before firing the async spawn so an HTTP
   * handler can answer "why not" without waiting for a prompt that will never
   * start.
   */
  canRun(task: Task): { ok: boolean; reason?: string } {
    if (this.runs.has(task.id)) {
      return { ok: false, reason: "a review is already running for this task" };
    }
    if (task.hotfix) {
      return { ok: false, reason: "hotfix tasks skip diff-based review" };
    }
    const agent = resolveReviewerForTask(this.config, task);
    if (!agent) {
      return { ok: false, reason: "the review agent is disabled on the Agents page" };
    }
    const workdir = task.branch ? worktreePathForBranch(this.config.root, task.branch) : null;
    if (!workdir) {
      return { ok: false, reason: "the task has no worktree to review" };
    }
    return { ok: true };
  }

  /**
   * Same gate for a follow-up chat turn, which additionally needs a prior
   * conversation (a review must have run at least once).
   */
  canSend(task: Task): { ok: boolean; reason?: string } {
    const base = this.canRun(task);
    if (!base.ok) return base;
    if (!this.hasSession(task.id)) {
      return { ok: false, reason: "no review has run for this task — start a review first" };
    }
    return { ok: true };
  }

  /**
   * Run the review agent against a task sitting in `review`.
   *
   * Skips silently (no event, no file) when the review agent is disabled or
   * the task has no worktree to inspect — "disabled means nothing happens" is
   * the contract, not "something happens quietly and fails".
   *
   * A fresh run every time: the reviewer conversation is reset, so the run is
   * a new assessment (the initial landing review, or a deliberate "Review
   * again"), never a continuation of the prior one (0110).
   */
  async run(task: Task): Promise<ReviewRunResult> {
    if (this.runs.has(task.id)) {
      return { ok: false, reason: "a review is already running for this task" };
    }
    const agent = resolveReviewerForTask(this.config, task);
    if (!agent) {
      this.logger.task(task.id, "info", "review skipped — agent disabled");
      return { ok: false, skipped: true, reason: "the review agent is disabled" };
    }
    const workdir = task.branch
      ? worktreePathForBranch(this.config.root, task.branch)
      : null;
    if (!workdir) {
      this.logger.task(task.id, "info", "review skipped — no worktree", { branch: task.branch });
      return { ok: false, skipped: true, reason: "the task has no worktree to review" };
    }
    const baseBranch = currentBranch(this.config.root) ?? "main";

    // Fresh run: drop any earlier conversation and its persisted copy so the
    // new report reads as a new assessment, not a continuation of the old one.
    this.resetSession(task.id);

    const run: Run = { cancelled: false };
    this.runs.set(task.id, run);
    this.emit({ type: "review", id: task.id, state: "running", at: now() });
    this.appendMarker(task.id, `review started — ${agent.name} (${agent.cli})`);
    this.logger.task(task.id, "info", "review started", { agent: agent.name, cli: agent.cli, model: agent.model });

    const mission = reviewMission(task, agent, workdir, baseBranch);
    let result;
    try {
      result = await runPrompt(agent, mission, {
        cwd: workdir,
        timeoutMs: REVIEW_TIMEOUT_MS,
        command: reviewCommand(agent, mission, workdir),
        onSpawn: (proc) => {
          run.proc = proc;
          // A cancel that landed between spawn and this callback still kills.
          if (run.cancelled) proc.kill("SIGTERM");
        },
        onLine: (line) => this.appendSessionLine(task.id, agent.cli, line),
      });
    } finally {
      this.runs.delete(task.id);
    }

    // Cancelled means the task left review (close-out, restart, a human move):
    // the report would describe a state nobody is signing off on any more, and
    // the status guard below must not fight the human who moved it.
    if (run.cancelled) {
      this.logger.task(task.id, "info", "review cancelled — task left review");
      this.emit({ type: "review", id: task.id, state: "cancelled", at: now() });
      return { ok: false, skipped: true, reason: "review cancelled" };
    }

    const state: ReviewReport["state"] = result.ok && result.output ? "ok" : "failed";
    const body =
      state === "ok"
        ? extractOneShotReportText(agent.cli, result.output ?? "")
        : `The review agent produced no report: ${result.error ?? "unknown error"}`;
    const report: ReviewReport = {
      id: task.id,
      at: now(),
      agent: agent.name,
      cli: agent.cli,
      model: agent.model,
      branch: task.branch,
      state,
      markdown: body.slice(0, REPORT_CHARS),
    };
    this.write(report);
    this.appendMarker(
      task.id,
      state === "ok" ? "✓ review complete" : `✗ review failed: ${result.error ?? "no report"}`,
    );
    if (state === "ok") {
      this.logger.task(task.id, "info", "review completed");
    } else {
      this.logger.task(task.id, "error", "review failed", { error: result.error ?? "no report" });
    }
    this.persistSession(task.id);
    this.emit({
      type: "review",
      id: task.id,
      state: state === "ok" ? "ready" : "failed",
      at: report.at,
      ...(state === "failed" ? { error: result.error } : {}),
    });
    this.enforceStillInReview(task);

    // The review agent produced no report at all (crash, timeout) — there's no
    // verdict to auto-bounce on and nothing for the engineer to act on, so
    // bouncing would just burn a round on silence. Escalate straight to a
    // human, same as the relevance-flag escalation below.
    if (state === "failed" && !task.needsInput) {
      try {
        patchTaskFile(this.config, task.absPath, { needsInput: true });
        this.emit({
          type: "task.corrected",
          id: task.id,
          path: task.path,
          note: `Review agent failed to produce a report (${result.error ?? "unknown error"}) — needs a human to retry or investigate.`,
          at: now(),
        });
      } catch (err) {
        console.error(`[repoos] could not escalate failed review for #${task.id}: ${(err as Error).message}`);
      }
    }

    // Auto-bounce if review is ok and verdict is not "good to go"
    // Fire-and-forget (don't await) so the review completion isn't delayed
    if (state === "ok") {
      const verdict = parseVerdict(report.markdown);
      if (verdict) {
        this.autoBounce(task, report, verdict).catch((err) => {
          console.error(`[repoos] uncaught error in auto-bounce for #${task.id}: ${(err as Error).message}`);
        });
      }
    }

    // Record the review session to the database
    this.recordReviewSession(task.id, agent, result, report.at, state === "ok");
    // Track every COMPLETED review pass (a real report, not a failed/empty
    // run) so the badge D/R counters reflect reality. See review_rounds
    // (auto-bounce bookkeeping, capped at MAX_AUTO_REVIEW_ROUNDS) vs
    // review_passes (all successful passes).
    if (state === "ok") this.bumpReviewPasses(task);

    return state === "ok"
      ? { ok: true, report }
      : { ok: false, reason: result.error ?? "the review agent failed", report };
  }

  /**
   * Increment the `review_passes` frontmatter counter. Unlike `review_rounds`
   * (which counts only auto-bounced rounds and caps at MAX_AUTO_REVIEW_ROUNDS),
   * this counts every completed review pass — auto and manual ("Review again")
   * alike — so the UI badge (`D# · R#`) matches the true number of review
   * sessions.
   *
   * The write also bumps `updated_at` (a field the live index's `diff()`
   * watches, since it omits `extra`) and commits the file, so the drawer's
   * badge refreshes live and `main` stays clean/mergeable. Best-effort, never
   * fails.
   */
  private bumpReviewPasses(task: Task): void {
    try {
      const raw = readFileSync(task.absPath, "utf8");
      const doc = parseDocument(raw);
      const current = doc.data.review_passes as number | undefined;
      const passes = typeof current === "number" && Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0;
      doc.data.review_passes = passes + 1;
      doc.data.updated_at = utcTimestamp();
      const keys = Object.keys(doc.data).filter((k) => k !== "review_passes" && k !== "updated_at");
      keys.unshift("updated_at", "review_passes");
      writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
      commitTaskFile(this.config.root, task.absPath, `docs(${task.id}): update task`);
    } catch (err) {
      console.error(`[repoos] could not update review_passes for #${task.id}: ${(err as Error).message}`);
    }
  }

  /** Record a review session to the database. Best-effort, never fails. */
  private recordReviewSession(
    taskId: string,
    agent: Agent,
    result: PromptResult,
    completedAt: string,
    success: boolean,
  ): void {
    if (!this.db) return;
    try {
      const sessionId = `review:${taskId}-${completedAt}`;
      const elapsedMs = result.elapsedMs ?? 0;
      const { costUsd, costSource } = reviewUsage(agent, result);
      this.db.upsertSession({
        sessionId,
        sessionType: "reviewer",
        taskId,
        agent: agent.name,
        model: agent.model,
        codingAgent: agent.cli,
        startedAt: new Date(Date.parse(completedAt) - elapsedMs).toISOString(),
        endedAt: completedAt,
        elapsedMs,
        inputTokens: result.inputTokens ?? undefined,
        outputTokens: result.outputTokens ?? undefined,
        totalTokens: result.totalTokens ?? undefined,
        costUsd,
        costSource,
        status: success ? "finished" : "errored",
        lastActivityAt: completedAt,
      });
    } catch {
      // Database recording is best-effort and must never crash.
    }
  }

  /**
   * Send a follow-up chat turn to the reviewer. The human's message joins the
   * reviewer conversation (never the engineer session), and the reviewer's
   * answer streams into the same conversation. Chat turns do not overwrite the
   * stored report — the verdict callout keeps describing the last full review.
   */
  async send(task: Task, text: string): Promise<ReviewRunResult> {
    if (this.runs.has(task.id)) {
      return { ok: false, reason: "a review is already running for this task" };
    }
    const agent = resolveReviewerForTask(this.config, task);
    if (!agent) {
      return { ok: false, reason: "the review agent is disabled" };
    }
    const workdir = task.branch ? worktreePathForBranch(this.config.root, task.branch) : null;
    if (!workdir) {
      return { ok: false, reason: "the task has no worktree to review" };
    }
    const baseBranch = currentBranch(this.config.root) ?? "main";

    // The human's message starts the turn. The conversation must already exist
    // (a review ran first) so the reviewer has context; the report on disk
    // still feeds the follow-up mission even after a server restart.
    if (!this.hasSession(task.id)) {
      this.sessions.set(task.id, []);
    }
    this.appendEntry(task.id, { type: "human", text });

    const run: Run = { cancelled: false };
    this.runs.set(task.id, run);
    this.emit({ type: "review", id: task.id, state: "running", at: now() });

    const mission = reviewFollowupMission(task, agent, workdir, baseBranch, text, this.read(task.id));
    let result;
    try {
      result = await runPrompt(agent, mission, {
        cwd: workdir,
        timeoutMs: REVIEW_TIMEOUT_MS,
        command: reviewCommand(agent, mission, workdir),
        onSpawn: (proc) => {
          run.proc = proc;
          if (run.cancelled) proc.kill("SIGTERM");
        },
        onLine: (line) => this.appendSessionLine(task.id, agent.cli, line),
      });
    } finally {
      this.runs.delete(task.id);
    }

    if (run.cancelled) {
      this.emit({ type: "review", id: task.id, state: "cancelled", at: now() });
      return { ok: false, skipped: true, reason: "review cancelled" };
    }

    const completedAt = now();
    const success = result.ok;

    if (!result.ok) {
      this.appendMarker(task.id, `✗ the reviewer could not answer: ${result.error ?? "unknown error"}`);
      this.persistSession(task.id);
      this.emit({
        type: "review",
        id: task.id,
        state: "failed",
        at: completedAt,
        ...(result.error ? { error: result.error } : {}),
      });
      this.enforceStillInReview(task);
      // Record the failed chat turn
      this.recordReviewChatTurn(task.id, agent, result, completedAt, false);
      return { ok: false, reason: result.error ?? "the reviewer failed to answer" };
    }

    this.persistSession(task.id);
    this.emit({ type: "review", id: task.id, state: "ready", at: completedAt });
    this.enforceStillInReview(task);
    // Record the successful chat turn
    this.recordReviewChatTurn(task.id, agent, result, completedAt, true);
    return { ok: true };
  }

  /** Record a review chat turn to the database. Best-effort, never fails. */
  private recordReviewChatTurn(taskId: string, agent: Agent, result: PromptResult, completedAt: string, success: boolean): void {
    if (!this.db) return;
    try {
      const sessionId = `review:${taskId}-chat-${completedAt}`;
      const elapsedMs = result.elapsedMs ?? 0;
      const { costUsd, costSource } = reviewUsage(agent, result);
      this.db.upsertSession({
        sessionId,
        sessionType: "reviewer",
        taskId,
        agent: agent.name,
        model: agent.model,
        codingAgent: agent.cli,
        startedAt: new Date(Date.parse(completedAt) - elapsedMs).toISOString(),
        endedAt: completedAt,
        elapsedMs,
        inputTokens: result.inputTokens ?? undefined,
        outputTokens: result.outputTokens ?? undefined,
        totalTokens: result.totalTokens ?? undefined,
        costUsd,
        costSource,
        status: success ? "finished" : "errored",
        lastActivityAt: completedAt,
      });
    } catch {
      // Database recording is best-effort and must never crash.
    }
  }

  /** The retained reviewer conversation for a task, or [] when none exists. */
  session(taskId: string): AgentOutputEntry[] {
    const lines = this.sessions.get(taskId);
    if (lines) return lines;
    const loaded = this.readSession(taskId);
    return loaded ?? [];
  }

  /**
   * Abandon a task's review: kill the child if one is running and mark the run
   * cancelled so it writes nothing. Called when the task leaves `review` by a
   * human route (the close-out, a status change from the API), where both the
   * report and the status guard have stopped being relevant — and where the
   * worktree is about to be removed out from under the child.
   */
  cancel(taskId: string): void {
    const run = this.runs.get(taskId);
    if (!run) return;
    run.cancelled = true;
    try {
      run.proc?.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }

  /** Cancel every in-flight review (server shutdown). */
  cancelAll(): void {
    for (const id of [...this.runs.keys()]) this.cancel(id);
  }

  /**
   * Auto-bounce logic: if the verdict is "needs some work" or "back to the
   * drawing board" and we haven't exceeded the max rounds, send the findings
   * back to the engineer session and increment the review_rounds counter.
   */
  private async autoBounce(task: Task, report: ReviewReport, verdict: string): Promise<void> {
    if (!this.runner || verdict === "good to go") {
      return;
    }
    if (verdict !== "needs some work" && verdict !== "back to the drawing board") {
      return;
    }

    // A relevance flag means the task itself is the problem, not the diff —
    // bouncing back to the engineer to "fix" an obsolete task just burns a
    // review round on nothing. Escalate to a human instead.
    const relevance = parseRelevance(report.markdown);
    if (relevance && relevance !== "still relevant") {
      const note = `Reviewer flagged this task's relevance as "${relevance}" — needs a human scoping decision, not further engineering. See the review report.`;
      this.emit({
        type: "task.corrected",
        id: task.id,
        path: task.path,
        note,
        at: now(),
      });
      console.log(`[repoos] auto-bounce skipped for #${task.id}: relevance=${relevance}`);
      return;
    }

    // Check if the engineer session is resumable
    const engineerSession = this.runner.output(task.id);
    if (!engineerSession) {
      // Session not found or completed, log that human must step in
      const note = "Auto-bounce could not proceed: engineer session is not resumable";
      this.emit({
        type: "task.corrected",
        id: task.id,
        path: task.path,
        note,
        at: now(),
      });
      console.log(`[repoos] auto-bounce blocked for #${task.id}: ${note}`);
      return;
    }

    // Get current review_rounds count
    let reviewRounds = task.extra?.review_rounds as number | undefined;
    if (typeof reviewRounds !== "number") reviewRounds = 0;

    // Check if we've exceeded the max rounds
    if (reviewRounds >= MAX_AUTO_REVIEW_ROUNDS) {
      const note = `Auto-bounce stopped: reached maximum of ${MAX_AUTO_REVIEW_ROUNDS} review rounds. Human review needed.`;
      this.emit({
        type: "task.corrected",
        id: task.id,
        path: task.path,
        note,
        at: now(),
      });
      console.log(`[repoos] auto-bounce max rounds reached for #${task.id}`);
      return;
    }

    // Extract the report sections
    const sections = extractReportSections(report.markdown);
    const messageParts: string[] = [];
    messageParts.push(`The automated review found the following (review round ${reviewRounds + 1}):`);
    messageParts.push("");

    if (sections.bugs) {
      messageParts.push("## Bugs");
      messageParts.push(sections.bugs);
      messageParts.push("");
    }

    if (sections.edgeCases) {
      messageParts.push("## Edge cases");
      messageParts.push(sections.edgeCases);
      messageParts.push("");
    }

    if (sections.suggestions) {
      messageParts.push("## Suggestions");
      messageParts.push(sections.suggestions);
      messageParts.push("");
    }

    messageParts.push(`Please fix the issues and re-handoff to review (review round ${reviewRounds + 2}).`);
    const message = messageParts.join("\n");

    // Start the engineer before changing the task state. If the session cannot
    // resume, leaving the task in review is honest and does not consume a
    // review round. Once it does start, the task MUST leave review: otherwise
    // Move to done is blocked by a real engineer process that the board still
    // presents as sign-off-ready (#0239).
    try {
      const agent = resolveReviewerForTask(this.config, task);
      if (!agent) return;

      // Get the engineer agent
      const { resolveAgentForTask } = await import("./agents.js");
      const engineerAgent = resolveAgentForTask(this.config, task);
      if (!engineerAgent) return;

      const sent = this.runner.send(task.id, message, engineerAgent, { skipBoardDivergence: true });
      if (!sent.ok) {
        const note = `Auto-bounce could not start the engineer: ${sent.reason ?? "unknown error"}`;
        this.emit({
          type: "task.corrected",
          id: task.id,
          path: task.path,
          note,
          at: now(),
        });
        console.log(`[repoos] auto-bounce blocked for #${task.id}: ${note}`);
        return;
      }

      // Increment the counter in task frontmatter.
      const newRounds = reviewRounds + 1;

      // Update the review_rounds counter in the task file
      try {
        const raw = readFileSync(task.absPath, "utf8");
        const doc = parseDocument(raw);
        doc.data.review_rounds = newRounds;
        const keys = Object.keys(doc.data).filter((k) => k !== "review_rounds");
        keys.unshift("review_rounds");
        writeFileSync(task.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
      } catch (err) {
        console.error(`[repoos] could not update review_rounds for #${task.id}: ${(err as Error).message}`);
        return;
      }

      // A successful auto-bounce is engineering work, not a review task. This
      // status write also records an activity entry and commits the updated
      // review-round counter. The live index observes it and keeps the board
      // and completion guards in sync.
      patchTaskFile(this.config, task.absPath, { status: "active" });

      this.emit({
        type: "task.corrected",
        id: task.id,
        path: task.path,
        note: `Auto-bounce sent review findings (round ${newRounds}) to engineer`,
        at: now(),
      });
      console.log(`[repoos] auto-bounce sent findings for #${task.id}, round ${newRounds}`);
    } catch (err) {
      const note = `Auto-bounce failed: ${(err as Error).message}`;
      this.emit({
        type: "task.corrected",
        id: task.id,
        path: task.path,
        note,
        at: now(),
      });
      console.error(`[repoos] auto-bounce error for #${task.id}: ${(err as Error).message}`);
    }
  }

  // ---- reviewer conversation (isolated from the engineer session) ----

  /** The SSE event id used to stream a task's reviewer conversation. */
  private sessionId(taskId: string): string {
    return `${REVIEW_SESSION_ID_PREFIX}${taskId}`;
  }

  /** Whether a conversation is held for the task (in memory or persisted). */
  private hasSession(taskId: string): boolean {
    if (this.sessions.has(taskId)) return true;
    const file = this.sessionFile(taskId);
    return file !== null && existsSync(file);
  }

  /** Sidecar file holding the reviewer conversation, or null when unsafe. */
  private sessionFile(taskId: string): string | null {
    if (!/^[A-Za-z0-9._-]+$/.test(taskId)) return null;
    return join(this.config.root, this.config.cacheDir, "reviews", `${taskId}.session.json`);
  }

  /** Read a persisted reviewer conversation (server restart survival). */
  private readSession(taskId: string): AgentOutputEntry[] | null {
    const file = this.sessionFile(taskId);
    if (!file || !existsSync(file)) return null;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { lines?: unknown };
      if (!Array.isArray(parsed.lines)) return null;
      const lines = parsed.lines as AgentOutputEntry[];
      this.sessions.set(taskId, lines.slice(-SESSION_LINES_CAP));
      return lines;
    } catch {
      return null;
    }
  }

  /** Write the conversation atomically (temp + rename), best-effort. */
  private persistSession(taskId: string): void {
    const timer = this.sessionTimers.get(taskId);
    if (timer) clearTimeout(timer);
    this.sessionTimers.delete(taskId);
    const lines = this.sessions.get(taskId);
    const file = this.sessionFile(taskId);
    if (!lines || !file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify({ lines }, null, 2), "utf8");
        renameSync(temp, file);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
      }
    } catch {
      /* the conversation is best-effort — never take the server down */
    }
  }

  /** Debounced write, so a fast-running agent does not write per line. */
  private scheduleSessionWrite(taskId: string): void {
    const existing = this.sessionTimers.get(taskId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.persistSession(taskId), SESSION_WRITE_DEBOUNCE_MS);
    timer.unref?.();
    this.sessionTimers.set(taskId, timer);
  }

  /** Drop a task's conversation, in memory and on disk (a fresh run starts clean). */
  private resetSession(taskId: string): void {
    const timer = this.sessionTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(taskId);
    }
    this.sessions.delete(taskId);
    const file = this.sessionFile(taskId);
    if (file) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        /* best-effort */
      }
    }
  }

  /** Append a human/system entry and stream it under the review session id. */
  private appendEntry(taskId: string, entry: AgentOutputEntry): void {
    let lines = this.sessions.get(taskId);
    if (!lines) {
      lines = [];
      this.sessions.set(taskId, lines);
    }
    lines.push(entry);
    if (lines.length > SESSION_LINES_CAP) lines.splice(0, lines.length - SESSION_LINES_CAP);
    this.emit({
      type: "agent.output",
      id: this.sessionId(taskId),
      entry,
      stream: "out",
      at: now(),
    });
    this.scheduleSessionWrite(taskId);
  }

  /** Append a streamed line from the agent's stdout, parsed per its CLI. */
  private appendSessionLine(taskId: string, cli: string, line: string): void {
    const entry = parseOneShotLine(cli, line);
    if (!entry) return; // a recognized-but-voiceless structured event
    this.appendEntry(taskId, entry);
  }

  /** Append a trusted system marker (run start / completion). */
  private appendMarker(taskId: string, text: string): void {
    this.appendEntry(taskId, { type: "sys", d: text });
  }

  /** Persist a report, creating `<cacheDir>/reviews/` on first use. */
  private write(report: ReviewReport): void {
    const file = this.path(report.id);
    try {
      mkdirSync(dirname(file), { recursive: true });
      const data: Record<string, unknown> = {
        task: report.id,
        at: report.at,
        agent: report.agent,
        cli: report.cli,
        model: report.model,
        branch: report.branch,
        state: report.state,
      };
      writeFileSync(file, serializeDocument(data, `\n${report.markdown}\n`, REPORT_KEYS));
    } catch (err) {
      console.error(
        `[repoos] could not write the review for #${report.id}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Defense in depth for the one thing the review agent must never do. If the
   * task file says `done` when the review ends, the reviewer moved it there:
   * every human route out of `review` cancels the run first, so a live run can
   * only be looking at a task a human has not touched. Put it back and say so.
   */
  private enforceStillInReview(task: Task): void {
    if (!existsSync(task.absPath)) return;
    let current: Task;
    try {
      current = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: this.config.root,
        defaultStatus: this.config.defaultStatus,
        defaultAssignee: this.config.defaultAssignee,
      });
    } catch {
      return;
    }
    if (current.status !== "done") return;
    this.reverted.set(task.id, Date.now());
    try {
      patchTaskFile(this.config, task.absPath, { status: "review" });
    } catch (err) {
      this.reverted.delete(task.id);
      console.error(
        `[repoos] could not revert #${task.id} to review: ${(err as Error).message}`,
      );
      return;
    }
    // Reflect the revert into the index immediately (trusted write — see the
    // constructor comment on `index`), instead of leaving it to the async
    // file watcher, which can otherwise process the transition twice under
    // load and burn the single-use revert claim on a spurious first firing.
    void this.index?.applyFileChange(task.absPath, { guarded: true });
    const note =
      "the review agent moved this task to done — only a human signs a task off, " +
      "so it was put back in review";
    this.emit({ type: "task.corrected", id: task.id, path: task.path, note, at: now() });
    console.error(`[repoos] reverted task #${task.id} to review — ${note}`);
  }
}
