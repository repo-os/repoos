/**
 * Safe, single-task mutations for the server.
 *
 * The CLI mutates by rebuilding the whole index then writing — fine for a
 * one-shot process. A long-lived server with multiple writers (you + agents)
 * needs to avoid clobbering: between the moment the server read a task and the
 * moment it writes, the file may have changed on disk (an agent edited the
 * body, say). So we re-read immediately before writing and merge the requested
 * field changes onto the CURRENT on-disk state, rather than onto a possibly
 * stale in-memory copy.
 *
 * Because status lives in per-task files (never a shared queue file), the only
 * conflict surface is concurrent writes to the SAME task — which this handles.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, sep, relative, basename } from "node:path";
import type { RepoOSConfig, Task, Status } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import {
  parseTask,
  serializeTask,
  recordChange,
  stripLastStatusActivityEntry,
  utcTimestamp,
  extractSection,
  removeSection,
  replaceSection,
  normalizeSectionHeading,
  ACTIVITY_HEADING,
  SCREENSHOTS_HEADING,
  ORIGINAL_PROMPT_HEADING,
} from "../core/task.js";
import { formatTaskAreas, parseTaskAreas } from "../core/areas.js";
import { normalizeStoryName } from "../core/stories.js";
import { branchCommit, commitTaskFile, currentBranch } from "../core/git.js";
import { buildIndex } from "../core/indexer.js";
import { normalizeTaskDependencies, validateTaskDependencies } from "../core/task-dependencies.js";
import { taskPriorityError, taskTypeError } from "../core/task-fields.js";
import { appendScreenshotsSection, type ScreenshotMeta } from "./attachments.js";
import { storiesDirOf } from "../core/story-definition-files.js";

/**
 * Body sections that are user-owned or append-only: they live in the task body
 * but must survive a wholesale body replacement. The freeform PM "flesh it out"
 * flow runs `repoos update --body`, which otherwise silently drops the user's
 * screenshots, their original prompt, and the entire activity history (#0317).
 * When a patch supplies a new body that is silent about one of these sections,
 * it's carried over verbatim from the current on-disk copy. Order is
 * canonical — they always sit at the end of the body in this order.
 */
const PROTECTED_SECTIONS = [
  ORIGINAL_PROMPT_HEADING,
  SCREENSHOTS_HEADING,
  ACTIVITY_HEADING,
] as const;

/**
 * Sections in PROTECTED_SECTIONS where the caller's own copy, if the patch
 * body explicitly includes one, wins over the on-disk version instead of
 * being silently discarded. Screenshots and Activity are system-managed
 * (via `addScreenshot` / `recordChange`) and must never be settable by a
 * plain body replacement, so they stay force-preserved-from-disk regardless
 * of what a caller's body happens to contain. Original Prompt is the one
 * exception: it's the durable record of what the user actually asked for
 * (#0345 — a malformed PM response wiped it with no way to restore it short
 * of hand-editing the file, which AGENTS.md forbids), so a caller that
 * deliberately includes an updated one — e.g. a hotfix restoring lost
 * content via `repoos update --body` — must be able to set it.
 */
const CALLER_OVERRIDABLE_SECTIONS: readonly string[] = [ORIGINAL_PROMPT_HEADING];

/**
 * Spec headings that a full `--body` replace must not silently drop. An
 * engineer declaring `## Shots` with `--section` should never need `--body`;
 * a `--body` that removes Problem / Desired UX / Acceptance criteria / Notes
 * for AI is a clobbering attempt unless explicitly forced (#0613).
 */
const SPEC_SECTION_HEADINGS = [
  "## Problem",
  "## Desired UX",
  "## Acceptance criteria",
  "## Notes for AI",
] as const;

/** True when `newBody` drops a spec heading that existed in `currentBody`. */
function bodyDropsSpecSections(currentBody: string, newBody: string): boolean {
  return SPEC_SECTION_HEADINGS.some(
    (h) => extractSection(currentBody, h) !== null && extractSection(newBody, h) === null,
  );
}

export interface TaskPatch {
  status?: Status;
  title?: string;
  priority?: string;
  /**
   * One area, a comma-separated string ("web, core"), or a list of them
   * (#0583). Normalized through the shared `parseTaskAreas` helper; legacy
   * "a + b" values are accepted too.
   */
  area?: string | string[];
  /** Cross-area delivery slice (a "story"), or empty string to clear it. */
  story?: string;
  /** Upstream task ids that must be merged before this task can start. */
  dependsOn?: string[];
  assignedTo?: string;
  branch?: string;
  type?: string;
  body?: string;
  /** Clear (false) or set (true) the waiting-on-human flag. */
  needsInput?: boolean;
  /** Specific blocking questions for the human to answer while `needsInput` is true. Empty array or null clears them. */
  questions?: string[] | null;
  /** Machine-readable reason `needsInput` was set, or null to clear it. Only meaningful alongside `needsInput: true`. */
  needsInputReason?: string | null;
  /** Free-text detail for why `needsInput` was set, or null to clear it. See {@link Task.needsInputDetail}. */
  needsInputDetail?: string | null;
  /** Clear (false) or set (true) the branch-drifted flag. */
  needsMerge?: boolean;
  /**
   * Archive (true) or unarchive (false) the task (#0657). Orthogonal to
   * `status`: the status, branch and worktree are preserved. Clearing the flag
   * also drops `archiveDetail`. Prefer the dedicated `/archive` and
   * `/unarchive` action routes, which enforce the live-run refusal; this patch
   * field is for internal callers that already hold that guarantee.
   */
  archived?: boolean;
  /** Free-text reason for archiving; null clears it. Only written while archived. */
  archiveDetail?: string | null;
  /**
   * Hold (true) or release (false) the task out of auto-start (#0690).
   * Orthogonal to `status`: a held task stays `ready` and is still startable
   * by hand; the auto-engineering picker just skips it.
   */
  hold?: boolean;
  /** Repo-relative files this task expects to touch; null/empty clears them. */
  paths?: string[] | null;
  /** Per-task agent name override, or null to clear. */
  agentOverride?: string | null;
  /** Per-task CLI override, or null to clear. */
  cliOverride?: string | null;
  /** Per-task model override, or null to clear. */
  modelOverride?: string | null;
  /** Per-task PM agent name override, or null to clear. */
  pmAgentOverride?: string | null;
  /** Per-task PM CLI override, or null to clear. */
  pmCliOverride?: string | null;
  /** Per-task PM model override, or null to clear. */
  pmModelOverride?: string | null;
  /** Per-task reviewer agent name override, or null to clear. */
  reviewAgentOverride?: string | null;
  /** Per-task reviewer CLI override, or null to clear. */
  reviewCliOverride?: string | null;
  /** Per-task reviewer model override, or null to clear. */
  reviewModelOverride?: string | null;
  /**
   * Append one uploaded screenshot to the task's `## Screenshots` section
   * (created before `## Activity` when absent). This is the only mutation path
   * for that section; a body replacement in this or a later patch never drops
   * it (see {@link PROTECTED_SECTIONS}).
   */
  addScreenshot?: ScreenshotMeta;
  /**
   * Append several screenshots in one patch (0381): the PM chat's pending
   * images land on a freshly created task as a batch, so the section is
   * written once with a single activity entry instead of one rewrite per
   * image. Same section rules as `addScreenshot`.
   */
  addScreenshots?: ScreenshotMeta[];
  /** Set hotfix mode (true to enable, false to disable). */
  hotfix?: boolean;
  /** Hotfix merge target. */
  hotfixTarget?: "branch" | "main";
  /**
   * Append a short, free-form note to the task's activity log (e.g.
   * instructions from a PM/reviewer back to the developer). The note is
   * recorded as its own activity entry — it never rewrites the task body and
   * can be combined with a status transition in the same patch. An empty or
   * whitespace-only note is ignored.
   */
  note?: string | null;
  /**
   * Replace only the named `## Section` in the body (create it if absent),
   * leaving every other section — including `## Activity` — untouched. This is
   * how engineers declare `## Shots` without risking a full-body clobber (#0613).
   * Mutually exclusive with `body`.
   */
  section?: { heading: string; content: string } | null;
  /**
   * When true, allow a full `body` replacement that would drop spec headings
   * (Problem / Desired UX / Acceptance criteria / Notes for AI). Without it,
   * such a replace is refused with a message pointing at the `--section` form.
   */
  force?: boolean;
}

export interface PatchTaskOptions {
  /**
   * Called when a patch actually changes a task's status, with the task being
   * written and the previous/new statuses. Lets the server reap preview
   * servers when a task leaves active/review (see preview.ts).
   */
  onStatusChange?: (task: Task, prev: Status, next: Status) => void;
  /** Do not append a `status a→b` activity line for this status change (#0704). */
  skipStatusActivity?: boolean;
  /** Drop the last activity entry if it matches this transition before writing. */
  stripStatusActivity?: { from: Status; to: Status };
}

export class WriteError extends Error {}

/** Thrown when a delete target resolves outside the configured work dir. */
export class PathGuardError extends WriteError {}

/**
 * Normalize an area PATCH/collection input (#0583): string or list, comma-
 * separated (canonical) or legacy `+` spellings, into the canonical pair the
 * Task carries — the list plus the comma-joined display form.
 */
function normalizePatchArea(raw: string | string[]): { area: string; areas: string[] } {
  const parsed = parseTaskAreas(raw as unknown);
  return parsed.length
    ? { areas: parsed, area: formatTaskAreas(parsed) }
    : { areas: ["general"], area: "general" };
}

/**
 * Apply a patch to a task file safely. `absPath` is the file to edit. Returns
 * the freshly re-parsed Task. Throws WriteError on bad input or missing file.
 */
export function patchTaskFile(
  config: RepoOSConfig,
  absPath: string,
  patch: TaskPatch,
  opts: PatchTaskOptions = {},
): Task {
  if (!existsSync(absPath)) {
    throw new WriteError(`Task file not found: ${absPath}`);
  }
  if (patch.status !== undefined && !(STATUSES as readonly string[]).includes(patch.status)) {
    throw new WriteError(`Invalid status "${patch.status}". Valid: ${STATUSES.join(", ")}`);
  }
  // #0656: reject an out-of-set priority/type before anything is written. The
  // message names the field, the bad value and the full valid set; the value
  // is never coerced to a default. Unset fields are a no-op (a patch that does
  // not touch priority/type is never rejected over what is already on disk).
  const fieldError = taskPriorityError(patch.priority) ?? taskTypeError(patch.type);
  if (fieldError) throw new WriteError(fieldError);

  // Re-read CURRENT on-disk state right before writing.
  const current = parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });

  // Track changes for activity log
  const changes: string[] = [];

  if (opts.stripStatusActivity) {
    current.body = stripLastStatusActivityEntry(
      current.body,
      opts.stripStatusActivity.from,
      opts.stripStatusActivity.to,
    );
  }

  // Merge requested fields onto the current state.
  if (patch.status !== undefined) {
    if (patch.status !== current.status) {
      if (!opts.skipStatusActivity) changes.push(`status ${current.status}→${patch.status}`);
      opts.onStatusChange?.(current, current.status, patch.status);
    }
    current.status = patch.status;
  }
  if (patch.needsInput !== undefined) {
    if (patch.needsInput !== current.needsInput) changes.push("needs_input");
    current.needsInput = patch.needsInput;
    // A cleared flag has no reason to carry forward — serializeTask would drop
    // it anyway (only written while needsInput is true), but clearing it here
    // too keeps the in-memory Task consistent with what gets written.
    if (!patch.needsInput) {
      current.needsInputReason = undefined;
      current.needsInputDetail = undefined;
      current.questions = undefined;
      // The AI tl;dr describes the failure this flag was raised for (#0570) —
      // same rule: the file drops it via serializeTask's needsInput gate, and
      // clearing here keeps the returned Task honest.
      current.debugTldr = undefined;
      current.debugTldrAt = undefined;
      current.debugTldrKey = undefined;
    }
  }
  if (patch.questions !== undefined) {
    const currentQuestions = current.questions ?? [];
    const nextQuestions = patch.questions ?? [];
    if (
      currentQuestions.length !== nextQuestions.length ||
      currentQuestions.some((question, index) => question !== nextQuestions[index])
    ) {
      changes.push("questions");
    }
    current.questions =
      patch.questions && patch.questions.length > 0 ? patch.questions.map(String) : undefined;
  }
  if (patch.needsInputReason !== undefined) {
    current.needsInputReason = patch.needsInputReason ?? undefined;
  }
  if (patch.needsInputDetail !== undefined) {
    current.needsInputDetail = patch.needsInputDetail ?? undefined;
  }
  if (patch.needsMerge !== undefined) {
    if (patch.needsMerge !== current.needsMerge) changes.push("needs_merge");
    current.needsMerge = patch.needsMerge;
  }
  if (patch.archived !== undefined) {
    if (patch.archived !== current.isArchived) {
      // Collapse newlines so the activity list keeps its single-line entries.
      const detail =
        typeof patch.archiveDetail === "string"
          ? patch.archiveDetail.replace(/\r?\n/g, " ").trim()
          : (current.archiveDetail?.trim() ?? "");
      changes.push(patch.archived ? (detail ? `archived: ${detail}` : "archived") : "unarchived");
    }
    current.isArchived = patch.archived;
    // Unarchiving always drops the reason — it described the archive, not the task.
    if (!patch.archived) current.archiveDetail = undefined;
  }
  if (patch.archiveDetail !== undefined) {
    current.archiveDetail = patch.archiveDetail ? String(patch.archiveDetail) : undefined;
  }
  if (patch.hold !== undefined) {
    if (patch.hold !== Boolean(current.isHeld)) changes.push(patch.hold ? "held" : "released");
    current.isHeld = patch.hold;
  }
  if (patch.paths !== undefined) {
    const next = patch.paths
      ?.map(String)
      .map((p) => p.trim())
      .filter(Boolean);
    const normalized = next && next.length > 0 ? next : undefined;
    if ((normalized ?? []).join("\0") !== (current.paths ?? []).join("\0")) changes.push("paths");
    current.paths = normalized;
  }
  if (patch.title !== undefined) {
    if (patch.title !== current.title) changes.push("title");
    current.title = patch.title;
  }
  if (patch.priority !== undefined) {
    if (patch.priority !== current.priority) changes.push("priority");
    current.priority = patch.priority;
  }
  if (patch.area !== undefined) {
    // #0583: accept a string ("web", "web, core", legacy "web + core") or a
    // list; normalize through the shared parser so storage has one canonical
    // shape. Compare the canonical JOINED forms, so a re-order or case-only
    // change still records itself but no-op values never write.
    const next = normalizePatchArea(patch.area);
    if (next.area !== current.area) changes.push("area");
    current.area = next.area;
    current.areas = next.areas;
  }
  if (patch.story !== undefined) {
    // Whitespace-normalize on write, same as parse, so " Email  launch "
    // and "Email launch" can never land as two distinct tags.
    const story = normalizeStoryName(patch.story);
    if (story !== (current.story ?? "")) changes.push("story");
    current.story = story;
  }
  if (patch.dependsOn !== undefined) {
    const dependsOn = normalizeTaskDependencies(patch.dependsOn);
    validateTaskDependencies(current.id, dependsOn, buildIndex(config).tasks);
    if (dependsOn.join("\0") !== (current.dependsOn ?? []).join("\0")) {
      changes.push("depends_on");
    }
    current.dependsOn = dependsOn;
  }
  if (patch.branch !== undefined) {
    if (patch.branch !== current.branch) changes.push("branch");
    current.branch = patch.branch;
  }
  if (patch.type !== undefined) {
    if (patch.type !== current.type) changes.push("type");
    current.type = patch.type;
  }
  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo !== current.assignedTo) changes.push("assigned_to");
    current.assignedTo = patch.assignedTo;
    current.assignee =
      patch.assignedTo.toLowerCase() === "ai" ? "ai" : patch.assignedTo ? "human" : "unassigned";
  }
  if (patch.section !== undefined && patch.section !== null && patch.body !== undefined) {
    throw new WriteError(
      "section and body are mutually exclusive — use section to edit one ## heading, or body for a full replace",
    );
  }
  if (patch.section !== undefined && patch.section !== null) {
    // Section-level edit (#0613): replace only the named `## Section`,
    // creating it if absent. All other sections are preserved verbatim;
    // Activity is append-only. Mutually exclusive with `body`.
    const { heading, content } = patch.section;
    const normalizedHeading = normalizeSectionHeading(heading);
    if (normalizedHeading === ACTIVITY_HEADING) {
      throw new WriteError("## Activity is append-only and cannot be edited as a section");
    }
    const nextBody = replaceSection(current.body, normalizedHeading, content);
    if (nextBody !== current.body) changes.push(`body: section ${heading}`);
    current.body = nextBody;
  } else if (patch.body !== undefined) {
    if (!patch.force && bodyDropsSpecSections(current.body, patch.body)) {
      throw new WriteError(
        "a full --body replace would drop spec sections (Problem / Desired UX / " +
          'Acceptance criteria / Notes for AI) — use --section "<heading>" to edit ' +
          "one section, or pass --force to override this guard",
      );
    }
    // Carry user-owned / append-only sections over from the on-disk copy so a
    // caller that replaced the whole body (freeform PM rewrites do) can't drop
    // them — UNLESS the caller's own body already includes that section and
    // it's caller-overridable, in which case the caller's version wins (see
    // CALLER_OVERRIDABLE_SECTIONS). Anything not kept from the caller's own
    // body is stripped first, so nothing duplicates.
    const preserved = PROTECTED_SECTIONS.map((h) => {
      const fromCaller = extractSection(patch.body!, h);
      if (fromCaller !== null && CALLER_OVERRIDABLE_SECTIONS.includes(h)) return null;
      return extractSection(current.body, h);
    }).filter((s): s is string => s !== null);
    let nextBody = patch.body;
    for (const h of PROTECTED_SECTIONS) {
      if (CALLER_OVERRIDABLE_SECTIONS.includes(h) && extractSection(patch.body, h) !== null) {
        continue; // caller's version is kept in place below, not stripped.
      }
      nextBody = removeSection(nextBody, h);
    }
    nextBody = [nextBody.replace(/\s+$/, ""), ...preserved].filter(Boolean).join("\n\n");
    if (nextBody !== current.body) changes.push("body");
    current.body = nextBody;
  }
  if (patch.addScreenshot) {
    current.body = appendScreenshotsSection(current.body, [patch.addScreenshot]);
    changes.push("screenshots");
  }
  if (patch.addScreenshots && patch.addScreenshots.length > 0) {
    current.body = appendScreenshotsSection(current.body, patch.addScreenshots);
    changes.push("screenshots");
  }
  if (patch.agentOverride !== undefined) {
    if (patch.agentOverride !== current.agentOverride) changes.push("agent_override");
    current.agentOverride = patch.agentOverride;
  }
  if (patch.cliOverride !== undefined) {
    if (patch.cliOverride !== current.cliOverride) changes.push("cli_override");
    current.cliOverride = patch.cliOverride;
  }
  if (patch.modelOverride !== undefined) {
    if (patch.modelOverride !== current.modelOverride) changes.push("model_override");
    current.modelOverride = patch.modelOverride;
  }
  if (patch.pmAgentOverride !== undefined) {
    if (patch.pmAgentOverride !== current.pmAgentOverride) changes.push("pm_agent_override");
    current.pmAgentOverride = patch.pmAgentOverride;
  }
  if (patch.pmCliOverride !== undefined) {
    if (patch.pmCliOverride !== current.pmCliOverride) changes.push("pm_cli_override");
    current.pmCliOverride = patch.pmCliOverride;
  }
  if (patch.pmModelOverride !== undefined) {
    if (patch.pmModelOverride !== current.pmModelOverride) changes.push("pm_model_override");
    current.pmModelOverride = patch.pmModelOverride;
  }
  if (patch.reviewAgentOverride !== undefined) {
    if (patch.reviewAgentOverride !== current.reviewAgentOverride)
      changes.push("review_agent_override");
    current.reviewAgentOverride = patch.reviewAgentOverride;
  }
  if (patch.reviewCliOverride !== undefined) {
    if (patch.reviewCliOverride !== current.reviewCliOverride) changes.push("review_cli_override");
    current.reviewCliOverride = patch.reviewCliOverride;
  }
  if (patch.reviewModelOverride !== undefined) {
    if (patch.reviewModelOverride !== current.reviewModelOverride)
      changes.push("review_model_override");
    current.reviewModelOverride = patch.reviewModelOverride;
  }
  if (patch.hotfix !== undefined) {
    if (patch.hotfix !== current.hotfix) changes.push("hotfix");
    current.hotfix = patch.hotfix;
  }
  if (patch.hotfixTarget !== undefined) {
    if (patch.hotfixTarget !== current.hotfixTarget) changes.push("hotfix_target");
    current.hotfixTarget = patch.hotfixTarget;
  }

  // A note is an additive activity entry, not a task field: it surfaces in the
  // timeline (and therefore in the UI and to AI reviewers) without rewriting
  // the body. It can accompany a status transition in the same patch. Entries
  // are appended status-first then note, matching the core `updateStatus` path,
  // so the timeline reads identically regardless of entry path.
  //
  // Newlines are collapsed to spaces (defense-in-depth): a multi-line note
  // from the UI textarea must not inject raw line breaks into the `## Activity`
  // list, which would break the single-line `- ts · entry` structure that
  // consumers (e.g. DebugPanel.parseActivity) rely on.
  const note = typeof patch.note === "string" ? patch.note.replace(/\r?\n/g, " ").trim() : "";
  const entries: string[] = [];
  if (changes.length) entries.push(changes.join(", "));
  if (note) entries.push(`note: ${note}`);

  if (entries.length) {
    for (const entry of entries) recordChange(current, entry);
  } else {
    current.updated_at = utcTimestamp();
  }
  writeFileSync(absPath, serializeTask(current));

  // Keep the task file committed in main so a later close-out merge never
  // aborts on an untracked or dirty copy. Fail-soft: the write itself already
  // succeeded; a git failure only means a future merge must commit first.
  commitTaskFile(config.root, absPath, `docs(${current.id}): update task`);

  // Re-parse so the returned object reflects exactly what's on disk.
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
}

/**
 * Mark the successful end of the review-to-done flow in the task's existing
 * append-only activity log. This is deliberately separate from TaskPatch so a
 * normal status edit cannot make an unmerged task appear in release history.
 */
export function markTaskReleased(
  config: RepoOSConfig,
  absPath: string,
  mergedCommit?: string | null,
): Task {
  if (!existsSync(absPath)) throw new WriteError(`Task file not found: ${absPath}`);

  const task = parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
  // A close-out retry after the successful marker was written must not create a
  // second release or move the timeline entry. Checked against the task's
  // CURRENT status, not `task.releasedAt` — that field is derived from the
  // most recent "release:success" entry anywhere in the append-only Activity
  // log (releasedAtFromActivity), which never clears once written. A task
  // reopened after release (done→ready, a legitimate action — e.g. "went done
  // with no real work, moved back to active to redo it properly") still shows
  // a truthy releasedAt from its FIRST release forever, so the old check here
  // silently no-op'd every subsequent close-out (#0195, 2026-08-15): main got
  // the merge, but the task sat published-and-still-review indefinitely.
  // `status === "done"` is only true for an actually-current release.
  const resolvedMergedCommit =
    mergedCommit ??
    branchCommit(config.root, task.branch || currentBranch(config.root) || "main") ??
    task.mergedCommit ??
    null;
  if (task.status === "done") {
    // Close-out can delete the feature branch before a retry finishes
    // markTaskReleased; backfill proof without a second release marker (#0711).
    if (!task.mergedCommit && resolvedMergedCommit) {
      task.mergedCommit = resolvedMergedCommit;
      writeFileSync(absPath, serializeTask(task));
      commitTaskFile(config.root, absPath, `docs(${task.id}): record merged commit`);
    }
    return task;
  }

  const previousStatus = task.status;
  task.status = "done";
  task.mergedCommit = resolvedMergedCommit;
  // A finished task is never "waiting on human input" — leaving a stale flag
  // here (e.g. from an earlier failed review that got fixed on retry) makes a
  // completed task show a permanent "needs input" badge for no reason (#0293
  // follow-up: confirmed live on #0253, which released with needs_input still
  // set from a since-resolved merge conflict retry).
  task.needsInput = false;
  task.needsInputReason = undefined;
  recordChange(task, `status ${previousStatus}→done, release:success`);
  writeFileSync(absPath, serializeTask(task));
  commitTaskFile(config.root, absPath, `docs(${task.id}): set status done`);

  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  });
}

/**
 * Remove a task file. `absPath` must resolve inside the configured work dir —
 * this mirrors the `safeRepoFile` guard and prevents deleting arbitrary repo
 * files through the API. Throws PathGuardError when the target is outside the
 * work dir, and WriteError when the file is already gone (callers treat the
 * latter as an idempotent 404).
 */
export function deleteTaskFile(config: RepoOSConfig, absPath: string): string {
  const workDir = resolve(join(config.root, config.workDir));
  const abs = resolve(absPath);
  if (!(abs.startsWith(workDir + sep) || abs === workDir)) {
    throw new PathGuardError(`Refusing to delete outside work dir: ${abs}`);
  }
  if (!existsSync(abs)) {
    throw new WriteError(`Task file not found: ${abs}`);
  }
  unlinkSync(abs);
  // Tracked task files must not linger as staged deletions — commit the
  // removal (fail-soft) so main stays mergeable. Untracked files need nothing.
  const rel = relative(config.root, abs);
  if (gitTracked(config.root, rel)) {
    commitTaskFile(config.root, abs, `docs(${basename(abs).split("-")[0]}): delete task`);
  }
  return abs;
}

/** Whether git tracks a (relative) path in the given checkout. */
function gitTracked(root: string, rel: string): boolean {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd: root,
      stdio: "ignore",
      timeout: 4000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Refuse to delete anything outside the given data directory (relative to the
 * repo root) — the input/story counterparts of `deleteTaskFile`'s work-dir
 * guard, so the API can never be coaxed into unlinking an arbitrary repo
 * file. Throws PathGuardError; callers map that to 400.
 */
function guardDataDir(config: RepoOSConfig, absPath: string, relDir: string): string {
  const base = resolve(join(config.root, relDir));
  const abs = resolve(absPath);
  if (!(abs.startsWith(base + sep) || abs === base)) {
    throw new PathGuardError(`Refusing to delete outside ${relDir}: ${abs}`);
  }
  return abs;
}

/**
 * Unlink a data file and, when git tracks it, commit the removal (fail-soft)
 * so main stays mergeable — the same contract as `deleteTaskFile`. Throws
 * WriteError when the file is already gone (callers treat that as 404).
 */
function deleteDataFile(config: RepoOSConfig, abs: string, commitMessage: string): string {
  if (!existsSync(abs)) throw new WriteError(`File not found: ${abs}`);
  unlinkSync(abs);
  const rel = relative(config.root, abs);
  if (gitTracked(config.root, rel)) commitTaskFile(config.root, abs, commitMessage);
  return abs;
}

/**
 * Remove an input's markdown file (#0634). `absPath` must resolve inside the
 * configured inputs dir. The input's attachments are NOT handled here — they
 * are gitignored and directory-scoped, so the route removes them via
 * `removeInputAttachments` after the guarded file delete succeeds.
 */
export function deleteInputFile(config: RepoOSConfig, absPath: string, commitMessage: string) {
  return deleteDataFile(
    config,
    guardDataDir(config, absPath, config.inputsDir ?? "inputs"),
    commitMessage,
  );
}

/**
 * Remove a story definition file (#0634). `absPath` must resolve inside
 * `stories/`. Only the definition is removed — tasks tagged with the story
 * name are untouched, matching the derived-story model (`MergedStoryGroup`).
 */
export function deleteStoryFile(config: RepoOSConfig, absPath: string, commitMessage: string) {
  return deleteDataFile(config, guardDataDir(config, absPath, storiesDirOf(config)), commitMessage);
}
