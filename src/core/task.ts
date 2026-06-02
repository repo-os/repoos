/**
 * Turn a markdown file (content + path) into a normalized Task, and turn a
 * Task back into file content for writing. Normalization is forgiving: missing
 * fields get sensible derived defaults so even a bare markdown file becomes a
 * usable task.
 */
import { basename, relative } from "node:path";
import { parseDocument, serializeDocument } from "./frontmatter.js";
import {
  STATUSES,
  type Task,
  type Status,
  type Assignee,
  type TaskGitInfo,
} from "./types.js";
import { emptyGitInfo } from "./git.js";

/** Canonical frontmatter key order, so writes produce tidy, stable diffs. */
const KEY_ORDER = [
  "id",
  "title",
  "type",
  "status",
  "priority",
  "area",
  "assigned_to",
  "created_by",
  "branch",
  "tags",
  "created_at",
  "updated_at",
];

const ACTIVITY_HEADING = "## Activity";

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
  const title = String(
    data.title ?? deriveTitleFromBody(body, id),
  );
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
    status: normalizeStatus(data.status, defaultStatus),
    priority: String(data.priority ?? "p2"),
    area: String(data.area ?? "general"),
    assignee,
    assignedTo: assignedTo || (assignee === "unassigned" ? "" : assignee),
    createdBy: String(data.created_by ?? ""),
    branch: String(data.branch ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    created_at,
    updated_at,
    path: relPath,
    absPath,
    body,
    extra,
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
    area: task.area,
    assigned_to: task.assignedTo || (task.assignee === "ai" ? "ai" : ""),
    created_by: task.createdBy,
    branch: task.branch,
  };
  if (task.tags.length) data.tags = task.tags;
  if (task.created_at) data.created_at = normalizeTimestamp(task.created_at);
  if (task.updated_at) data.updated_at = normalizeTimestamp(task.updated_at);
  // re-attach preserved unknown keys
  for (const [k, v] of Object.entries(task.extra)) data[k] = v;

  return serializeDocument(data, task.body, KEY_ORDER);
}
