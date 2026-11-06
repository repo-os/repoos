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

/**
 * If `pending` persists past this age while `summary.md` already exists, treat the
 * job as finished for API/CLI (lost `done` status write). Slightly above the
 * drawer's poll window (~10 min) so the UI stops "writing" without handoff races.
 */
/** Align with TaskDrawer `TASK_SUMMARY_POLL_MS × TASK_SUMMARY_POLL_MAX` (~10 min). */
export const SUMMARY_PENDING_STALE_MS = 10 * 60 * 1000;

const WORD_RE = /\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu;

/** Remove `<!-- … -->` blocks (multiline OK) before structure checks (#1041). */
export function stripHtmlBlockComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

export function isStaleSummaryPending(
  statusAt: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!statusAt?.trim()) return false;
  const t = Date.parse(statusAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t >= SUMMARY_PENDING_STALE_MS;
}

/** Anchor for “this run” when status is `pending`: prefer `pendingSince`, else `at` (legacy files). */
function pendingRunAnchorMs(
  pendingSince: string | null | undefined,
  statusAt: string,
): number | null {
  const raw = (pendingSince?.trim() || statusAt?.trim()) ?? "";
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

/**
 * Visible job status for API/CLI/drawer: a committed report plus stale `pending`
 * resolves as `done` when the report is at least as new as this pending run
 * (mtime ≥ pending anchor). Otherwise stale `pending` with an older on-disk
 * report becomes `failed` — a retry must not pass while the PM is still writing.
 */
export function effectiveSummaryJobStatus(
  stored: "idle" | "pending" | "done" | "failed",
  statusAt: string,
  reportExists: boolean,
  nowMs: number = Date.now(),
  reportMtimeMs: number | null = null,
  pendingSince: string | null = null,
): "idle" | "pending" | "done" | "failed" {
  if (stored === "pending" && reportExists && isStaleSummaryPending(statusAt, nowMs)) {
    const anchor = pendingRunAnchorMs(pendingSince, statusAt);
    if (anchor !== null && reportMtimeMs !== null) {
      return reportMtimeMs >= anchor ? "done" : "failed";
    }
    // Legacy: no anchor or unknown mtime — preserve lost-done-write recovery.
    return "done";
  }
  return stored;
}

/**
 * Marker the server appends with the deterministic file-changes listing.
 * Only this exact marker line is excluded from the word count — a
 * same-named heading written by the PM counts fully, so narrative words can
 * never evade the budget check behind a lookalike heading.
 */
export const GENERATED_CHANGES_MARKER = "<!-- repoos:generated-changes -->";

/**
 * Remove every server-marker line from PM-authored text. The marker is a
 * server-protocol token: only the server may emit it, exactly once, ahead of
 * the file-changes listing. Stripping (never cutting) means text the PM puts
 * after an injected marker still counts toward the word budget instead of
 * evading validation behind it.
 */
export function stripTaskSummaryMarkerLines(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => line.trim() !== GENERATED_CHANGES_MARKER)
    .join("\n");
}

/**
 * Words in the report narrative: the whole document except the
 * server-generated file-changes listing (the same convention the engineering
 * report uses — the generated listing never counts).
 */
export function countSummaryNarrativeWords(markdown: string): number {
  const lines = markdown.split("\n");
  let cut = -1;
  lines.forEach((line, index) => {
    if (line.trim() === GENERATED_CHANGES_MARKER) cut = index;
  });
  const narrative = (cut === -1 ? lines : lines.slice(0, cut)).join("\n");
  return narrative.match(WORD_RE)?.length ?? 0;
}

/**
 * Hard acceptance checks for a summary report: it starts with `## TL;DR`,
 * includes all required sections, and the narrative stays within the word
 * budget. Returns one message per failure, empty when the report passes.
 *
 * Visible markdown lines for heading checks: fenced blocks (``` … ```) are
 * skipped so headings inside code samples do not satisfy validation; indented
 * code blocks are left in (they are not markdown headings).
 */
function visibleSummaryLines(markdown: string): string[] {
  const lines = stripHtmlBlockComments(markdown).split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (fence) {
      if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      fence = fenceMatch[1]!;
      continue;
    }
    out.push(line);
  }
  return out;
}

const HEADING_LINE = /^##\s+(.+?)\s*$/;

export function validateTaskSummary(markdown: string): string[] {
  const errors: string[] = [];
  const forStructure = stripHtmlBlockComments(markdown);
  if (!forStructure.trim()) return ["Task summary is empty."];
  const firstNonBlankRaw = forStructure.split("\n").find((l) => l.trim().length > 0);
  const visible = visibleSummaryLines(markdown);
  const firstNonBlankVisible = visible.find((l) => l.trim().length > 0);
  if (firstNonBlankRaw?.trim() !== "## TL;DR" || firstNonBlankVisible?.trim() !== "## TL;DR")
    errors.push(
      "Task summary must begin with ## TL;DR as the first non-blank line in the document (no preamble or fenced block before it), and after skipping fenced code blocks the first visible line must still be ## TL;DR.",
    );

  const requiredSections = [
    "Outcome",
    "Process stats",
    "What went wrong",
    "Learnings",
    "Follow-ups",
  ];
  const headingTitles: string[] = [];
  for (const line of visible) {
    const m = HEADING_LINE.exec(line.trimEnd());
    if (!m) continue;
    headingTitles.push(m[1]!.trim());
  }
  let reqIdx = 0;
  for (const title of headingTitles) {
    if (reqIdx < requiredSections.length && title === requiredSections[reqIdx]) reqIdx += 1;
  }
  if (reqIdx < requiredSections.length) {
    const missing = requiredSections.slice(reqIdx);
    errors.push(
      `Task summary must include these sections in order: ${requiredSections.join(", ")}. ` +
        (missing.length === requiredSections.length
          ? "No matching ## headings found (check spelling and order — e.g. use ## Outcome, not ## Outcomes)."
          : `Missing or out of order after "${requiredSections[reqIdx - 1] ?? "start"}": ${missing.join(", ")}.`),
    );
  }

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
  createdAt: string | null;
  /** Task body excerpt (no Activity block) for follow-up context. */
  bodyExcerpt: string;
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
  /** Load errors that occurred while gathering facts. Empty if all sources loaded cleanly. */
  loadErrors: string[];
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
  ];

  if (facts.loadErrors.length) {
    lines.push(
      "⚠️ **Load errors — some recorded facts could not be read:**",
      "",
      ...facts.loadErrors.map((err) => `- ${err}`),
      "",
    );
  }

  lines.push(
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
  );
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
      ? facts.linked.map((t) => {
          const when = fmt(t.createdAt);
          const excerpt = t.bodyExcerpt.trim() ? t.bodyExcerpt.trim() : "—";
          return `- #${t.id} (${t.relation}, ${t.status}, created ${when}): ${t.title}\n  Excerpt: ${excerpt}`;
        })
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
export function formatTaskSummaryFileChanges(
  files: TaskSummaryFileChange[],
  opts?: { unavailableReason?: string },
): string {
  const rows =
    opts?.unavailableReason != null
      ? [`- Changed files unavailable: ${opts.unavailableReason}`]
      : files.length
        ? files.map(
            (file) => `- ${file.status} ${file.path}: +${file.additions} / −${file.deletions}`,
          )
        : ["- No changed files."];
  return [GENERATED_CHANGES_MARKER, "## Changed files", "", ...rows].join("\n");
}
