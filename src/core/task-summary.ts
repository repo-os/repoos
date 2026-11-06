/**
 * Post-merge task summary report (#1041).
 *
 * Every task that merges to `done` gets one summary report at
 * `<workDir>/reports/<task-id>/summary.md`, beside the engineering rounds
 * (`round-<n>.json`) and review passes (`review-<n>.md`). It is written by the
 * PM agent after close-out, from recorded facts only — the PM narrates, never
 * invents numbers. Re-running overwrites the same file (idempotent, never
 * duplicated). Because it lives under the task's own `reports/<id>/`
 * directory, `isOwnReportPath` already treats it as task bookkeeping, so
 * landable/close-out scope checks ignore it with no extra allowlisting.
 */

import { reportsTaskDirRelPath } from "./report-paths.js";

/** Hard cap on narrative words, excluding the trailing file-changes listing. */
export const TASK_SUMMARY_MAX_WORDS = 2000;

/** `summary.md` filename inside a task's report directory. */
export const TASK_SUMMARY_FILENAME = "summary.md";

/** `<workDir>/reports/<taskId>/summary.md`, repo-relative. */
export function summaryReportRelPath(config: { workDir?: string }, taskId: string): string {
  return `${reportsTaskDirRelPath(config, taskId)}/${TASK_SUMMARY_FILENAME}`;
}

const WORD_RE = /\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu;

/** First-line match for the deterministic trailing file-changes listing. */
function isFileChangesHeading(line: string): boolean {
  return /^##\s+(changed files|generated change summary|file changes)\s*$/i.test(line.trim());
}

/**
 * Words in the report narrative: everything before the trailing
 * file-changes listing (the same convention the engineering report uses —
 * the generated listing never counts).
 */
export function countSummaryNarrativeWords(markdown: string): number {
  const lines = markdown.split("\n");
  const cut = lines.findIndex(isFileChangesHeading);
  const narrative = (cut === -1 ? lines : lines.slice(0, cut)).join("\n");
  return narrative.match(WORD_RE)?.length ?? 0;
}

/**
 * Hard acceptance checks for a summary report: it starts with `## TL;DR`
 * and the narrative stays within the word budget. Returns one message per
 * failure, empty when the report passes.
 */
export function validateTaskSummary(markdown: string): string[] {
  const errors: string[] = [];
  if (!markdown.trim()) return ["Task summary is empty."];
  if (!markdown.trimStart().startsWith("## TL;DR"))
    errors.push("Task summary must begin with ## TL;DR; remove any text before it.");
  const words = countSummaryNarrativeWords(markdown);
  if (words > TASK_SUMMARY_MAX_WORDS)
    errors.push(
      `Task summary narrative is ${words} words; keep it to about ${TASK_SUMMARY_MAX_WORDS} words of narrative (file-changes listing excluded). Shorten it and try again.`,
    );
  return errors;
}

/** One engineering round, as stored in `round-<n>.json`. */
export interface TaskSummaryRoundFacts {
  round: number;
  at: string;
  agent: string;
  model: string;
  branch: string;
  wordCount: number;
  markdown: string;
}

/** One review pass, with the stored report body. */
export interface TaskSummaryReviewFacts {
  pass: number;
  at: string;
  state: string;
  verdict: string | null;
  agent: string;
  cli: string;
  model: string;
  markdown: string;
}

/** One recorded agent session for the task. */
export interface TaskSummarySessionFacts {
  sessionType: string;
  agent: string;
  model: string;
  codingAgent: string;
  startedAt: string;
  endedAt: string | null;
  elapsedMs: number;
  totalTokens: number | null;
  costUsd: number | null;
  costSource: string;
  status: string;
  errorReason: string | null;
}

/** A task linked to this one (dependency, dependent, or follow-up). */
export interface TaskSummaryLinkedTask {
  id: string;
  title: string;
  status: string;
  relation: "depends-on" | "dependent";
}

/** Everything the PM may draw on. Counts and dates come from here. */
export interface TaskSummaryFacts {
  taskId: string;
  title: string;
  type: string;
  area: string;
  priority: string;
  status: string;
  branch: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  mergedCommit: string | null;
  /** Task body without the Activity section (activity is passed separately). */
  body: string;
  activity: string[];
  rounds: TaskSummaryRoundFacts[];
  reviews: TaskSummaryReviewFacts[];
  sessions: TaskSummarySessionFacts[];
  linked: TaskSummaryLinkedTask[];
}

function fmt(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "—";
}

/** Render the recorded facts as a Markdown brief embedded in the PM prompt. */
export function renderTaskSummaryFacts(facts: TaskSummaryFacts): string {
  const lines: string[] = [
    `# Task ${facts.taskId}: ${facts.title}`,
    "",
    `- Type: ${fmt(facts.type)} · Area: ${fmt(facts.area)} · Priority: ${fmt(facts.priority)} · Status: ${fmt(facts.status)}`,
    `- Branch: ${fmt(facts.branch)} · Created: ${fmt(facts.createdAt)} · Done: ${fmt(facts.updatedAt)} · Merged commit: ${fmt(facts.mergedCommit)}`,
    "",
    "## Task body",
    "",
    facts.body.trim() || "—",
    "",
    "## Activity log",
    "",
    ...(facts.activity.length ? facts.activity.map((entry) => `- ${entry}`) : ["—"]),
    "",
    "## Engineering rounds",
    "",
  ];
  for (const round of facts.rounds) {
    lines.push(
      `### Round ${round.round} — ${fmt(round.at)} · ${fmt(round.agent)} · ${fmt(round.model)}`,
      "",
      round.markdown.trim() || "—",
      "",
    );
  }
  if (!facts.rounds.length) lines.push("No engineering rounds recorded.", "");
  lines.push("## Review passes", "");
  for (const review of facts.reviews) {
    lines.push(
      `### Pass ${review.pass} — ${fmt(review.at)} · state ${fmt(review.state)} · verdict ${fmt(review.verdict)} · ${fmt(review.cli || review.agent)} · ${fmt(review.model)}`,
      "",
      review.markdown.trim() || "—",
      "",
    );
  }
  if (!facts.reviews.length) lines.push("No review passes recorded.", "");
  lines.push("## Sessions", "");
  if (facts.sessions.length) {
    lines.push(
      "| Role | Agent | Model | Started | Elapsed | Tokens | Cost | Status |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const session of facts.sessions) {
      lines.push(
        `| ${fmt(session.sessionType)} | ${fmt(session.agent)} | ${fmt(session.model)} | ${fmt(session.startedAt)} | ${Math.round(session.elapsedMs / 1000)}s | ${session.totalTokens ?? "—"} | ${session.costUsd ?? "—"} | ${fmt(session.status)}${session.errorReason ? ` (${session.errorReason})` : ""} |`,
      );
    }
    lines.push("");
  } else {
    lines.push("No sessions recorded.", "");
  }
  lines.push("## Linked tasks", "");
  lines.push(
    ...(facts.linked.length
      ? facts.linked.map(
          (task) => `- #${task.id} (${task.relation}, ${task.status}): ${task.title}`,
        )
      : ["None recorded."]),
  );
  return lines.join("\n");
}

/**
 * Prompt for the PM authoring run. The facts brief carries every number the
 * report may state; the instructions forbid inventing any count, date, agent,
 * model, token, or cost figure not present in it.
 */
export function buildTaskSummaryPrompt(facts: TaskSummaryFacts): string {
  return [
    "Write the post-merge summary report for the task below. It is committed",
    "as the task's permanent record, so write for a future reader who never",
    "saw the transcripts.",
    "",
    "Rules:",
    "- Start with `## TL;DR`, then use exactly these sections in order:",
    "  `## Outcome`, `## Process stats`, `## What went wrong`,",
    "  `## Learnings`, `## Follow-ups`.",
    "- Every number (round counts, dates, agents, models, tokens, costs,",
    "  wall-clock times) MUST come from the recorded facts below. Never invent,",
    "  estimate, or round a figure the facts do not state; write “not recorded”",
    "  when the facts are silent.",
    "- Outcome: what shipped, in plain English, plus the final verdict.",
    "- Process stats: dev/review rounds, wall-clock from start to done, agents",
    "  and models per role (engineer, reviewer, restarts or swaps), token and",
    "  cost totals where known.",
    "- What went wrong: crashes, stalls, failed handoffs or gates, flaky",
    "  checks, restarts, and how each was resolved.",
    "- Learnings: worth carrying forward. Point durable ones at where they",
    "  belong (AGENTS.md, docs/, an ADR) instead of leaving them only here.",
    "- Follow-ups: new tasks filed because of issues met along the way, with",
    `  ids and one-line reasons (see Linked tasks; write “none” when empty).`,
    `- Keep the narrative to about ${TASK_SUMMARY_MAX_WORDS} words at most; padding is worse than brevity.`,
    "- Do NOT append a file-changes listing; the server adds it deterministically.",
    "- Output only the report Markdown, no preamble.",
    "",
    renderTaskSummaryFacts(facts),
  ].join("\n");
}

/** One deterministic file-change row for the trailing listing. */
export interface TaskSummaryFileChange {
  path: string;
  status: string;
  additions: string;
  deletions: string;
}

/**
 * Deterministic trailing `## Changed files` section, computed from Git —
 * never authored by the model, and excluded from the narrative word count.
 */
export function formatTaskSummaryFileChanges(files: TaskSummaryFileChange[]): string {
  const rows = files.length
    ? files.map((file) => `- ${file.status} ${file.path}: +${file.additions} / −${file.deletions}`)
    : ["- No changed files."];
  return ["## Changed files", "", ...rows].join("\n");
}
