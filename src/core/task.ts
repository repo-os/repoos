/**
 * Turn a markdown file (content + path) into a normalized Task, and turn a
 * Task back into file content for writing. Normalization is forgiving: missing
 * fields get sensible derived defaults so even a bare markdown file becomes a
 * usable task.
 */
import { basename, relative } from "node:path";
import { parseDocument, serializeDocument } from "./frontmatter.js";
import { STATUSES, type Task, type Status, type Assignee, type TaskGitInfo } from "./types.js";
import { emptyGitInfo } from "./git.js";
import { normalizeStoryName } from "./stories.js";
import { formatTaskAreas, parseTaskAreas } from "./areas.js";

/** Canonical frontmatter key order, so writes produce tidy, stable diffs. */
const KEY_ORDER = [
  "id",
  "title",
  "type",
  "status",
  "needs_input",
  "questions",
  "needs_input_reason",
  "needs_input_detail",
  "debug_tldr",
  "debug_tldr_at",
  "debug_tldr_key",
  "needs_merge",
  "no_source_change",
  "priority",
  "area",
  "story",
  "assigned_to",
  "created_by",
  "branch",
  "tags",
  "agent_override",
  "cli_override",
  "model_override",
  "pm_agent_override",
  "pm_cli_override",
  "pm_model_override",
  "review_agent_override",
  "review_cli_override",
  "review_model_override",
  "hotfix",
  "hotfix_target",
  "created_at",
  "updated_at",
];

export const ACTIVITY_HEADING = "## Activity";
/** User-attached screenshots section (0123). Rendered into the body, kept before `## Activity`. */
export const SCREENSHOTS_HEADING = "## Screenshots";
/** The user's verbatim freeform prompt, preserved so an agent rewrite can't lose it. */
export const ORIGINAL_PROMPT_HEADING = "## Original prompt";
/**
 * A release is a successful close-out event, not any prose mentioning a
 * release. `markTaskReleased` is the sole writer of this exact marker.
 */
const RELEASE_ACTIVITY =
  /^- (\d{4}-\d{2}-\d{2}T[^\s]+) · status [a-z]+→done, release:success\r?$/gmu;

/** ISO-8601 UTC timestamp to the second, e.g. 2026-06-01T09:14:02Z. */
export function utcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Normalize a legacy date-only or partial timestamp to full ISO-8601 UTC.
 * `2026-06-01` → `2026-06-01T00:00:00Z`. Null passthrough.
 */
export function normalizeTimestamp(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00:00Z`;
  return value;
}

/**
 * Append a single activity entry to the body's Activity section.
 * Creates the section if it does not exist. The Activity section is always
 * the last thing in the body — append-only invariant.
 */
export function appendActivityEntry(body: string, line: string): string {
  const trimmed = body.replace(/\s+$/, "");
  const headingIndex = trimmed.lastIndexOf(`\n${ACTIVITY_HEADING}\n`);
  if (headingIndex === -1) {
    return `${trimmed}\n\n${ACTIVITY_HEADING}\n\n${line}\n`;
  }
  return `${trimmed}\n${line}\n`;
}

/** The line index where a top-level `## Heading` section starts, or -1. */
function sectionStart(lines: string[], heading: string): number {
  return lines.findIndex((l) => l.trim() === heading);
}

/** The line index of the next top-level `## ` heading after `from`, or `lines.length`. */
function nextSection(lines: string[], from: number): number {
  for (let i = from; i < lines.length; i++) {
    if (/^##\s/.test(lines[i].trim())) return i;
  }
  return lines.length;
}

/**
 * Extract a top-level `## Heading` section from a body — the heading line
 * through the last line before the next `## ` heading (or EOF), trimmed of
 * surrounding blank lines. Returns null when the heading is absent.
 */
export function extractSection(body: string, heading: string): string | null {
  const lines = body.split("\n");
  const start = sectionStart(lines, heading);
  if (start === -1) return null;
  return lines
    .slice(start, nextSection(lines, start + 1))
    .join("\n")
    .trim();
}

/**
 * Remove the `## Heading` section (see {@link extractSection}) from a body,
 * collapsing the blank lines it leaves behind. Unchanged when the heading is
 * absent.
 */
/** Normalize a section title to the exact `## Heading` line `replaceSection` expects. */
export function normalizeSectionHeading(heading: string): string {
  const trimmed = heading.trim();
  if (trimmed.startsWith("## ")) return trimmed;
  return `## ${trimmed}`;
}

export function removeSection(body: string, heading: string): string {
  const lines = body.split("\n");
  const start = sectionStart(lines, heading);
  if (start === -1) return body;
  const end = nextSection(lines, start + 1);
  const before = lines.slice(0, start).join("\n").replace(/\s+$/, "");
  const after = lines.slice(end).join("\n").replace(/^\s+/, "");
  return [before, after].filter(Boolean).join("\n\n");
}

/**
 * Replace a single `## Heading` section's content without touching the rest
 * of the body. When the heading is absent, it is created at the end (before
 * `## Activity` if present) with a blank line before it. The section content
 * is the heading line plus the provided `content` (which may itself span
 * multiple lines). All other sections — including `## Activity` — are preserved
 * verbatim.
 */
export function replaceSection(body: string, heading: string, content: string): string {
  const lines = body.split("\n");
  const start = sectionStart(lines, heading);
  const bodyTrimmed = body.replace(/\s+$/, "");

  // Activity always lives at the end. Preserve it and its preceding blank
  // line by temporarily stripping it, then re-applying after the edit.
  const activityStart = bodyTrimmed.lastIndexOf(`\n${ACTIVITY_HEADING}\n`);
  let withoutActivity = bodyTrimmed;
  let activitySuffix = "";
  if (activityStart !== -1) {
    withoutActivity = bodyTrimmed.slice(0, activityStart);
    activitySuffix = bodyTrimmed.slice(activityStart);
  }

  if (start === -1) {
    // Create the section: append with a blank line before it (unless the
    // body is empty), then re-attach Activity after it.
    const section = `\n${heading}\n${content}`;
    const base = withoutActivity ? `${withoutActivity}${section}` : `${heading}\n${content}`;
    return [base, activitySuffix].filter(Boolean).join("\n\n");
  }

  const end = nextSection(lines, start + 1);
  const before = lines.slice(0, start).join("\n").replace(/\s+$/, "");
  const after = lines.slice(end).join("\n").replace(/^\s+/, "");
  const rest = [before, after].filter(Boolean).join("\n\n");
  const section = `${heading}\n${content}`;
  return (
    [rest, section].filter(Boolean).join("\n\n") + (activitySuffix ? `\n\n${activitySuffix}` : "")
  );
}

/**
 * Single change-recording helper. Every mutation path MUST call this.
 * Stamps `updated_at` and appends an activity log entry onto `task.body`.
 *
 * @param task  The task to record a change on (mutated in-place).
 * @param entry The activity line content after the timestamp,
 *              e.g. `status inbox→ready · nick`.
 */
export function recordChange(task: Task, entry: string): void {
  task.updated_at = utcTimestamp();
  task.body = appendActivityEntry(task.body, `- ${task.updated_at} · ${entry}`);
}

/** Latest successful-close-out timestamp recorded in the append-only activity log. */
export function releasedAtFromActivity(body: string): string | null {
  let releasedAt: string | null = null;
  for (const match of body.matchAll(RELEASE_ACTIVITY)) releasedAt = match[1];
  return releasedAt;
}

function deriveIdFromFilename(file: string): string {
  const name = basename(file).replace(/\.[^.]+$/, "");
  const m = name.match(/^(\d{2,})/);
  if (m) return m[1];
  return name;
}

function deriveTitleFromBody(body: string, fallback: string): string {
  const h1 = body.match(/^\s*#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return fallback;
}

function normalizeStatus(raw: unknown, fallback: Status): Status {
  const s = String(raw ?? "").toLowerCase();
  return (STATUSES as readonly string[]).includes(s) ? (s as Status) : fallback;
}

function resolveAssignee(raw: string): Assignee {
  const v = raw.toLowerCase().trim();
  if (v === "ai" || v === "agent") return "ai";
  if (v === "" || v === "unassigned" || v === "none") return "unassigned";
  return "human";
}

/**
 * The two area fields (#0583), parsed once from whatever the frontmatter held.
 * `area` stays the comma-joined display string (historical single-value
 * fallback "general" when unset); `areas` is the canonical list matchers must
 * read — always via the shared `parseTaskAreas` helper, never a whole-string
 * compare.
 */
function beforeAreaFields(data: Record<string, unknown>): { area: string; areas: string[] } {
  const parsed = parseTaskAreas(data.area);
  if (parsed.length === 0) return { areas: ["general"], area: "general" };
  return { areas: parsed, area: formatTaskAreas(parsed) };
}

/**
 * The canonical frontmatter WRITTEN form (#0583): a plain scalar when one
 * area, an inline list when several. It uses the parsed `areas` when present
 * and otherwise re-parses `area` (legacy shapes included), so a
 * partially-constructed task still writes exactly one deterministic shape.
 */
function beforeAreaWrite(task: Task): string | string[] {
  const areas = task.areas?.length ? task.areas : parseTaskAreas(task.area);
  return areas.length > 1 ? areas : (areas[0] ?? task.area);
}

export interface ParseTaskArgs {
  content: string;
  absPath: string;
  root: string;
  defaultStatus: Status;
  defaultAssignee: Assignee;
  git?: TaskGitInfo;
}

export function parseTask(args: ParseTaskArgs): Task {
  const { content, absPath, root, defaultStatus, defaultAssignee } = args;
  const { data, body } = parseDocument(content);
  const relPath = relative(root, absPath).split("\\").join("/");

  const id = String(data.id ?? deriveIdFromFilename(absPath));
  const title = String(data.title ?? deriveTitleFromBody(body, id));
  const assignedTo = String(data.assigned_to ?? "");
  const assignee = resolveAssignee(
    assignedTo || (defaultAssignee === "unassigned" ? "" : defaultAssignee),
  );

  // collect unknown keys to preserve on write
  const known = new Set(KEY_ORDER);
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!known.has(k)) extra[k] = v;
  }

  // Per-task agent override fields
  const agentOverride =
    typeof data.agent_override === "string" && data.agent_override ? data.agent_override : null;
  const cliOverride =
    typeof data.cli_override === "string" && data.cli_override ? data.cli_override : null;
  const modelOverride =
    typeof data.model_override === "string" && data.model_override ? data.model_override : null;

  // Per-task PM agent override fields
  const pmAgentOverride =
    typeof data.pm_agent_override === "string" && data.pm_agent_override
      ? data.pm_agent_override
      : null;
  const pmCliOverride =
    typeof data.pm_cli_override === "string" && data.pm_cli_override ? data.pm_cli_override : null;
  const pmModelOverride =
    typeof data.pm_model_override === "string" && data.pm_model_override
      ? data.pm_model_override
      : null;

  // Per-task reviewer agent override fields
  const reviewAgentOverride =
    typeof data.review_agent_override === "string" && data.review_agent_override
      ? data.review_agent_override
      : null;
  const reviewCliOverride =
    typeof data.review_cli_override === "string" && data.review_cli_override
      ? data.review_cli_override
      : null;
  const reviewModelOverride =
    typeof data.review_model_override === "string" && data.review_model_override
      ? data.review_model_override
      : null;

  // read created_at with fallback to deprecated created
  const created_at = data.created_at
    ? String(data.created_at)
    : data.created
      ? String(data.created)
      : null;
  // read updated_at with fallback to deprecated updated
  const updated_at = data.updated_at
    ? String(data.updated_at)
    : data.updated
      ? String(data.updated)
      : null;

  return {
    id,
    title,
    type: String(data.type ?? "feature"),
    status: normalizeStatus(data.status, "inbox" as Status),
    needsInput: data.needs_input === true,
    questions: Array.isArray(data.questions)
      ? data.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
      : undefined,
    needsInputReason:
      typeof data.needs_input_reason === "string" ? data.needs_input_reason : undefined,
    needsInputDetail:
      typeof data.needs_input_detail === "string" ? data.needs_input_detail : undefined,
    debugTldr: typeof data.debug_tldr === "string" ? data.debug_tldr : undefined,
    debugTldrAt: typeof data.debug_tldr_at === "string" ? data.debug_tldr_at : undefined,
    debugTldrKey: typeof data.debug_tldr_key === "string" ? data.debug_tldr_key : undefined,
    needsMerge: data.needs_merge === true,
    noSourceChange: data.no_source_change === true,
    priority: String(data.priority ?? "p2"),
    // #0583: one shared parse for every shape the frontmatter may hold — list,
    // comma string, or legacy "a + b". `area` keeps the comma-joined display
    // form so plain-text consumers (list/show/logs) print "a, b" unchanged;
    // `areas` is the canonical list matchers must read. An unset/blank area
    // falls back to the historical "general" default.
    ...beforeAreaFields(data),
    story: normalizeStoryName(data.story),
    assignee,
    assignedTo: assignedTo || (assignee === "unassigned" ? "" : assignee),
    createdBy: String(data.created_by ?? ""),
    branch: String(data.branch ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    created_at,
    updated_at,
    releasedAt: releasedAtFromActivity(body),
    path: relPath,
    absPath,
    body,
    extra,
    agentOverride,
    cliOverride,
    modelOverride,
    pmAgentOverride,
    pmCliOverride,
    pmModelOverride,
    reviewAgentOverride,
    reviewCliOverride,
    reviewModelOverride,
    hotfix: data.hotfix === true ? true : undefined,
    hotfixTarget:
      data.hotfix === true ? (data.hotfix_target === "main" ? "main" : "branch") : undefined,
    git: args.git ?? emptyGitInfo(),
  };
}

/** Build the file content for a Task, preserving unknown frontmatter. */
export function serializeTask(task: Task): string {
  const data: Record<string, unknown> = {
    id: task.id,
    title: task.title,
    type: task.type,
    status: task.status,
    priority: task.priority,
    // #0583: the canonical written form — a plain scalar when one area,
    // an inline list (`area: [web, core]`) when several. Commas as the
    // separator, never the legacy `+`. `areas` is normalized on parse; a
    // partially-constructed Task without it falls back to the shared parser.
    area: beforeAreaWrite(task),
    assigned_to: task.assignedTo || (task.assignee === "ai" ? "ai" : ""),
    created_by: task.createdBy,
    branch: task.branch,
  };
  // Only ever write `story` when set — clearing it removes the key so an
  // untagged task parses back exactly as a task that never had one.
  if (task.story) data.story = task.story;
  if (task.tags.length) data.tags = task.tags;
  // Only ever write `needs_input` / `needs_merge` when true — false is the
  // default and is never persisted, so clearing the flag removes the key.
  // The reason is only ever meaningful alongside the flag itself — clearing
  // needsInput (or never setting a reason) must never leave a stale reason
  // behind to be misread on a later re-escalation.
  // The AI tl;dr (`debug_tldr*`, #0570) is gated the same way on purpose: it
  // describes the CURRENT failure, so tying its persistence to the flag makes
  // every clear path (dismiss, review-again, status advance, release) drop it
  // automatically instead of each site remembering to clear three fields.
  if (task.needsInput) {
    data.needs_input = true;
    if (task.needsInputReason) data.needs_input_reason = task.needsInputReason;
    if (task.needsInputDetail) data.needs_input_detail = task.needsInputDetail;
    if (task.debugTldr) {
      data.debug_tldr = task.debugTldr;
      if (task.debugTldrAt) data.debug_tldr_at = task.debugTldrAt;
      if (task.debugTldrKey) data.debug_tldr_key = task.debugTldrKey;
    }
  }
  if (task.questions && task.questions.length > 0) data.questions = task.questions;
  if (task.needsMerge) data.needs_merge = true;
  if (task.noSourceChange) data.no_source_change = true;
  if (task.agentOverride) data.agent_override = task.agentOverride;
  if (task.cliOverride) data.cli_override = task.cliOverride;
  if (task.modelOverride) data.model_override = task.modelOverride;
  if (task.pmAgentOverride) data.pm_agent_override = task.pmAgentOverride;
  if (task.pmCliOverride) data.pm_cli_override = task.pmCliOverride;
  if (task.pmModelOverride) data.pm_model_override = task.pmModelOverride;
  if (task.reviewAgentOverride) data.review_agent_override = task.reviewAgentOverride;
  if (task.reviewCliOverride) data.review_cli_override = task.reviewCliOverride;
  if (task.reviewModelOverride) data.review_model_override = task.reviewModelOverride;
  if (task.hotfix) {
    data.hotfix = true;
    data.hotfix_target = task.hotfixTarget ?? "branch";
  }
  if (task.created_at) data.created_at = normalizeTimestamp(task.created_at);
  if (task.updated_at) data.updated_at = normalizeTimestamp(task.updated_at);
  // re-attach preserved unknown keys
  for (const [k, v] of Object.entries(task.extra)) data[k] = v;

  return serializeDocument(data, task.body, KEY_ORDER);
}
