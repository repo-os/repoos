import type { Status, Agent, Task, RepoOSConfig } from "../../core/types.js";
import type { RouteHandler, RouteContext } from "./types.js";
import { json, readBody } from "./utils.js";
import { agentsForConfig } from "../../core/config.js";
import {
  patchTaskFile,
  deleteTaskFile,
  WriteError,
  PathGuardError,
  type TaskPatch,
} from "../write.js";
import {
  resolveAgentForTask,
  resolvePmAgent,
  taskPmPrompt,
  deriveBranch,
  isModelOverridePinned,
  mergeAgentOverride,
  recordOneShotSession,
  pmCommand,
  extractOneShotReportText,
  type PromptResult,
} from "../agents.js";
import {
  markPmWorking,
  clearPmWorking,
  withPmWorking,
  markPmChatSession,
  isPmWorking,
} from "../pm-runs.js";
import { queuePmImages, dropPmImages, type IncomingPmImage } from "../pm-attachments.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "../freeform.js";
import { effectiveAreaNames } from "../../core/areas.js";
import {
  recordFreeformFailure,
  readFreeformStore,
  freeformLogPaths,
  cleanupFreeformWorktree,
  type FreeformRunRecord,
} from "../freeform-runs.js";
import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { LiveIndex, RepoEvent } from "../live-index.js";
import type { Logger } from "../../core/logger.js";
import { getCurrentUser } from "./auth.js";
import { withOriginalPromptSection } from "../../core/repoos.js";
import { needsInputClearsOnNewEngineerRun } from "../../core/needs-input.js";
import {
  flagTaskSpecFlagsIfNeeded,
  isUnderspecifiedSweepEligible,
  needsInputClearsOnPmMessage,
  UNDERSPECIFIED_NEEDS_INPUT_REASON,
} from "../task-underspecified-flag.js";
import {
  answeringQuestionsMatchTask,
  wrapPmMessageWithQuestionContext,
} from "../../core/pm-question-context.js";
import { buildCanaryPrompt, canaryRelPath, isCanaryTaskExplanation } from "../../core/canary.js";
import { ensureCanaryReadyForTask } from "../../core/canary-repo.js";
import { listInputs } from "../../core/input.js";
import {
  commitTaskFile,
  commitDirtyFiles,
  mainDirtyFilesForCloseOut,
  uncommittedWorkFiles,
  workFileFilter,
  worktreePathForBranch,
  ensureWorktree,
  resetWorktree,
  getDiffStatsAsync,
  getDiff,
  runGit,
  GitDirtyCheckError,
  ensureHotfix,
  agentTouchedFiles,
  isAncestor,
  removeWorktree,
  deleteBranch,
  pruneWorktrees,
} from "../../core/git.js";
import { guardReviewTransition } from "../review-guard.js";
import { checkGenericStatusPatch } from "../task-transitions.js";
import { readFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { releaseBranchless, isBranchlessReleaseEligible } from "../branchless-release.js";
import { bootstrap } from "../../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../../core/context-pack.js";
import { mimeForExtension, readAttachment, saveScreenshot } from "../attachments.js";
import { readUiHandoffGateEvidence } from "../ui-handoff-gate.js";
import { localShotStore } from "../shots.js";
import { computeTaskShotContext } from "../shot-context.js";
import {
  appendDeclaredShot,
  declaredShotMatchesShot,
  parseShotEntry,
  removeDeclaredShots,
  resolveDeclaredTarget,
  sameDeclaredShot,
} from "../../core/shot-plan.js";
import { resolveShotTargets } from "../../core/shot-targets.js";
import { captureDeclaredShot } from "../shot-capture.js";
import { STATUSES } from "../../core/types.js";
import {
  ACTIVITY_HEADING,
  isSectionHeading,
  normalizeSectionHeading,
  parseTask,
} from "../../core/task.js";
import {
  DependencyValidationError,
  normalizeTaskDependencies,
  taskDependencyBlockers,
} from "../../core/task-dependencies.js";
import { TaskFieldValidationError } from "../../core/task-fields.js";
import type { UsageRange } from "../../core/db.js";
import { buildIntegrationSnapshot } from "../integration-status.js";
import { pendingCloseOutJobs } from "../integration-job.js";
import { createCloseOutOutcomeStore } from "../close-out-outcome.js";
import { resolvePipelineCheckPlan } from "../check-plan-info.js";
import { loadDiffSnapshot } from "../diff-snapshot.js";
import { computeMergeConflict } from "../merge-conflict.js";
import { previewTargetOptions, type PreviewTargetOption } from "../preview.js";
import { findStoryDefinitionByKey } from "../../core/story-definition-files.js";
import { storyKey } from "../../core/stories.js";
import {
  PM_FLESH_OUT_MESSAGE,
  assessTaskUnderspecified,
  fleshOutRequirementsPrompt,
} from "../../core/task-underspecified.js";
import {
  clearNeedsInputForReviewAgainOnTask,
  dismissNeedsInputOnTask,
} from "../needs-input-dismiss.js";
import {
  discardWorktreeHandoffChanges,
  readHandoffSnapshot,
  refreshHandoffSnapshotFromWorktree,
  verifyWorktreeHandoffIntegrity,
  writeWorktreeReviewLock,
} from "../worktree-handoff-guard.js";

// Helper to add review status to tasks
function withReviewStatus<T extends { id: string }>(
  task: T,
  reviews: { isRunning: (id: string) => boolean; enabled: () => boolean },
): T & { automaticReview: { running: boolean; enabled: boolean } } {
  return {
    ...task,
    automaticReview: {
      running: reviews.isRunning(task.id),
      enabled: reviews.enabled(),
    },
  };
}

/**
 * Add the preview targets a task can be served from (#0379). The drawer reads
 * this to show the active target's name and, when the task's area matches more
 * than one target, to offer a picker instead of silently previewing the first.
 */
function withPreviewTargets<T extends Task>(
  task: T,
  config: RepoOSConfig,
): T & { previewTargets: PreviewTargetOption[] } {
  return { ...task, previewTargets: previewTargetOptions(config, task) };
}

function withPendingHandoff<T extends { id: string }>(
  task: T,
  runner: { hasPendingHandoff: (id: string) => boolean },
): T & { pendingHandoff: boolean } {
  return { ...task, pendingHandoff: runner.hasPendingHandoff(task.id) };
}

function isSectionPatch(value: unknown): value is { heading: string; content: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).heading === "string" &&
    typeof (value as Record<string, unknown>).content === "string"
  );
}

export const getTasks: RouteHandler = (ctx, req, res) => {
  const { config, index, reviews, runner } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const status = url.searchParams.get("status") as Status | null;
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return json(res, 400, { error: `Invalid status "${status}"` });
  }
  const allTasks = index.getTasks();
  const tasks = allTasks
    .filter((task) => !status || task.status === status)
    .map((task) => ({
      ...task,
      blockedBy: taskDependencyBlockers(config.root, task, allTasks),
    }))
    .map((task) =>
      withPmWorking(
        withPendingHandoff(withReviewStatus(withPreviewTargets(task, config), reviews), runner),
      ),
    );
  return json(res, 200, tasks);
};

export const createTask: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index, logger } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  if (!body.title || typeof body.title !== "string") {
    return json(res, 400, { error: "title is required" });
  }
  let dependsOn: string[] | undefined;
  if (body.dependsOn !== undefined && body.depends_on !== undefined) {
    return json(res, 400, { error: "Use either dependsOn or depends_on, not both" });
  }
  if (body.dependsOn !== undefined || body.depends_on !== undefined) {
    try {
      dependsOn = normalizeTaskDependencies(body.dependsOn ?? body.depends_on);
    } catch (error) {
      if (error instanceof DependencyValidationError)
        return json(res, 400, { error: error.message });
      throw error;
    }
  }
  const taskBody = typeof body.body === "string" ? body.body : undefined;
  // The client-side "Save as draft" freeform path posts the raw prompt as the
  // body with status `draft` (no client change allowed, see #0251). Treat that
  // as `originalPrompt` so the raw capture is stored under `## Original prompt`.
  const originalPrompt =
    body.status === "draft"
      ? typeof body.originalPrompt === "string" && body.originalPrompt
        ? body.originalPrompt
        : taskBody
      : undefined;
  let created: Task;
  try {
    created = repoos.createTask({
      title: body.title,
      type: body.type as string | undefined,
      area: (body.area ?? undefined) as string | string[] | undefined,
      story: body.story as string | undefined,
      dependsOn,
      priority: body.priority as string | undefined,
      assignedTo: body.assignedTo as string | undefined,
      status: body.status as Status | undefined,
      body: taskBody,
      originalPrompt,
      createdBy: getCurrentUser(req, config)?.email,
    });
  } catch (error) {
    if (error instanceof DependencyValidationError) return json(res, 400, { error: error.message });
    if (error instanceof TaskFieldValidationError) return json(res, 400, { error: error.message });
    throw error;
  }
  logger.task(created.id, "info", "Task created", {
    title: created.title,
    type: created.type,
    area: created.area,
  });
  // #0668: a task created through the plain create path with a stub body is
  // flagged the moment it exists — not only after a later PATCH or PM run.
  // `flagTaskSpecFlagsIfNeeded` preserves any unrelated reason the caller set.
  if (isUnderspecifiedSweepEligible(created)) {
    const flagged = flagTaskSpecFlagsIfNeeded(config, created);
    if (flagged) {
      created = flagged;
      logger.task(created.id, "warn", "Task body is underspecified at creation", {
        detail: flagged.needsInputDetail,
        needsInputRaised: true,
      });
    }
  }
  index.applyFileChange(created.absPath);
  commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
  return json(res, 201, index.getTask(created.id));
};

export interface FreeformFinalizeDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  logger: Logger;
  emitEvent: (e: RepoEvent) => void;
  onServerStatusChange?: (task: Task, prev: Status, next: Status) => void;
}

/**
 * Post-process a finished freeform PM run (#0403): promote the draft, or keep
 * it and persist a durable reason. Shared by the live `FreeformRunManager`
 * callback and the boot-time adoption path, so a run that finishes after a
 * server reload produces exactly the result the inline path would have.
 *
 * Idempotent enough for a racing re-finalize: the one-shot session row is
 * keyed deterministically by runId, and a draft that was already promoted is
 * never overwritten.
 */
export function finalizeFreeformRun(
  deps: FreeformFinalizeDeps,
  run: FreeformRunRecord,
  result: PromptResult,
): void {
  const { config, index, logger, emitEvent } = deps;
  const { taskId, runId, explanation, agent: pm } = run;
  try {
    const task = index.getTask(taskId);
    if (!task) {
      // The draft was deleted while the run was in flight — nothing to promote.
      return;
    }
    // Book the run even on failure (it still spent tokens), keyed by runId so
    // a racing re-finalize cannot double-count.
    recordOneShotSession(config.root, pm, result, {
      sessionType: "pm",
      taskId,
      sessionId: `pm-freeform:${taskId}:${runId}`,
    });

    const output = result.ok ? extractOneShotReportText(pm.cli, result.output ?? "") : "";
    let fields: ReturnType<typeof parseGeneratedTask> | null = null;
    let reason: string | null = null;
    if (!result.ok || !output) {
      reason = result.error ?? "the PM agent returned no usable output";
    } else {
      fields = parseGeneratedTask(output);
      if (!fields.title || !fields.body || !fields.hadFrontmatter) {
        fields = null;
        reason = "the PM agent returned unusable output";
      }
    }

    // A racing finalize (or a human) may already have promoted the draft; never
    // overwrite real content, but still record a failure reason.
    const stillDraft = task.status === "draft";

    if (reason || !fields) {
      const failureReason = reason ?? "the PM agent returned unusable output";
      logger.task(taskId, "warn", "PM agent failed; keeping draft with original prompt", {
        reason: failureReason,
      });
      recordFreeformFailure(config, {
        runId,
        taskId,
        reason: failureReason,
        failedAt: new Date().toISOString(),
      });
      if (stillDraft) {
        // Durable, revisit-later trace: the activity note survives a page or
        // server reload, unlike the ephemeral SSE toast.
        try {
          const updated = patchTaskFile(config, task.absPath, {
            note: `Freeform PM run failed: ${failureReason}`,
          });
          index.applyFileChange(updated.absPath);
        } catch (err) {
          logger.task(taskId, "warn", "Could not record freeform failure note on draft", {
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
      emitEvent({
        type: "task.aiCreateFailed",
        id: taskId,
        reason: failureReason,
        at: new Date().toISOString(),
      });
      const afterFailure = index.getTask(taskId);
      if (afterFailure) {
        const flagged = flagTaskSpecFlagsIfNeeded(config, afterFailure);
        if (flagged) index.applyFileChange(flagged.absPath);
      }
      return;
    }

    if (!stillDraft) return; // a racing finalize already promoted it

    const finalBody = withOriginalPromptSection(fields.body, explanation);
    const updated = patchTaskFile(
      config,
      task.absPath,
      {
        title: fields.title,
        type: fields.type,
        priority: fields.priority,
        area: fields.area,
        // #0555: a story preset at creation (the New task hand-off) is the
        // human's choice and outranks whatever the PM agent's rewrite declared.
        // Untagged drafts have `story === ""` (or undefined), so this falls
        // through to `fields.story` — `undefined` still means "leave it alone" —
        // and every create without a preset behaves exactly as it did before.
        story: task.story || fields.story,
        assignedTo: fields.assignedTo,
        body: finalBody,
        status: config.defaultStatus,
      },
      { onStatusChange: deps.onServerStatusChange },
    );
    index.applyFileChange(updated.absPath);
    const afterPromote = index.getTask(taskId);
    if (afterPromote) {
      const flagged = flagTaskSpecFlagsIfNeeded(config, afterPromote);
      if (flagged) index.applyFileChange(flagged.absPath);
    }
    logger.task(taskId, "info", "PM agent fleshed out draft task", {
      title: updated.title,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.task(taskId, "warn", "PM agent update failed; keeping draft with original prompt", {
      reason,
    });
    emitEvent({
      type: "task.aiCreateFailed",
      id: taskId,
      reason,
      at: new Date().toISOString(),
    });
  } finally {
    // 0335: cleared on EVERY exit path so the indicator can never get stuck.
    // 0381: a live PM chat session on this task keeps the flag up.
    clearPmWorking(taskId);
    cleanupFreeformWorktree(config, run.pmWorktreeBranch);
    if (!isPmWorking(taskId)) {
      emitEvent({
        type: "task.pmFinished",
        id: taskId,
        at: new Date().toISOString(),
      });
    }
  }
}

/**
 * The durable state of one freeform PM run (#0403), keyed by the client's
 * `freeformRunId`. Reports an in-flight run and/or its persisted failure so a
 * client that navigated away (or whose page reloaded) can still see the
 * specific outcome, not just a generic draft.
 */
export const getFreeformRun: RouteHandler = (ctx, _req, res, params) => {
  const runId = params.param1;
  const store = readFreeformStore(ctx.config);
  const run = store.runs.find((r) => r.runId === runId) ?? null;
  const failure = store.failures.find((f) => f.runId === runId) ?? null;
  if (!run && !failure) {
    return json(res, 404, { error: `Freeform run ${runId} not found` });
  }
  return json(res, 200, {
    ok: true,
    run,
    failure,
    logs: freeformLogPaths(ctx.config, runId),
  });
};

export const createFreeformTask: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index, logger, emitEvent } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  let explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
  if (!explanation) {
    return json(res, 400, { error: "explanation is required" });
  }
  if (isCanaryTaskExplanation(explanation)) {
    const ready = ensureCanaryReadyForTask(config, (detail) => logger.system("warn", detail));
    if (!ready) {
      return json(res, 500, {
        error:
          "Could not prepare the canary counter on main — fix .gitignore / branch and try again",
      });
    }
    explanation = buildCanaryPrompt(canaryRelPath(config.cacheDir));
  }
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;
  // #0382: when a freeform task is created from a resolved input, carry the
  // input's screenshots onto the new task so they are linked in the task
  // itself. The copy runs BEFORE the PM agent's rewrite so the agent's prompt
  // already contains them (via `## Screenshots` in the draft body), and
  // PROTECTED_SECTIONS preserves the section across the rewrite.
  const sourceInputId = typeof body?.inputId === "string" && body.inputId ? body.inputId : null;
  // #0555: a story hand-off from the Story panel's New task button. Absent or
  // blank means "untagged", exactly as before; `createTask` normalizes it with
  // `normalizeStoryName` on write, so a messy name can't create a near-duplicate
  // story. Set on the draft up front so the tag is on the file the PM agent
  // rewrites rather than being reconstructed from that rewrite afterwards.
  const story = typeof body?.story === "string" && body.story.trim() ? body.story : undefined;

  // Parse the freeform pane's PM picker overrides. "default" is the sentinel
  // for "use the configured pm agent's own model" — not a real pin (same bug
  // class as resolveAgentForTask / resolveReviewerForTask / the PM-message
  // override below).
  const freeformAgentName =
    typeof body?.agentOverride === "string" && body.agentOverride ? body.agentOverride : undefined;
  const freeformCli =
    typeof body?.cliOverride === "string" && body.cliOverride ? body.cliOverride : undefined;
  const freeformModel =
    typeof body?.modelOverride === "string" && body.modelOverride ? body.modelOverride : undefined;
  const freeformModelPinned = isModelOverridePinned(freeformModel);
  const hasFreeformOverride = freeformAgentName || freeformCli || freeformModelPinned;

  let pm: Agent | null;
  if (hasFreeformOverride) {
    const list = agentsForConfig(config);
    const baseName = freeformAgentName || "pm";
    const base = list.find((a) => a.enabled && a.name === baseName) ?? null;
    pm = base ? mergeAgentOverride(base, freeformCli, freeformModel) : null;
  } else {
    pm = resolvePmAgent(config);
  }

  // #0461: persist the picker selection as the task's PM assignment at creation
  // so every later PM action (reply-from-context, re-flesh-out, restart) keeps
  // it — not just this one-off run. Only fields that actually differ from the
  // configured PM default are saved, mirroring the PM tab's own save logic
  // (nulls unchanged values, keeps the board tidy); "default" is never
  // persisted as a model pin. The saved values are the SAME parsed overrides
  // the flesh-out run above uses, so there is no drift between what ran and
  // what is stored.
  const defaultPm = resolvePmAgent(config);
  const pmAgentOverride =
    freeformAgentName && freeformAgentName !== (defaultPm?.name ?? "") ? freeformAgentName : null;
  const pmCliOverride = freeformCli && freeformCli !== (defaultPm?.cli ?? "") ? freeformCli : null;
  const pmModelOverride =
    freeformModelPinned && freeformModel !== (defaultPm?.model ?? "") ? freeformModel : null;

  // #0251: create a draft task with the raw prompt preserved FIRST, then spawn
  // the PM agent asynchronously to flesh it out. The draft survives a PM
  // failure, a slow/unavailable agent, or a bad response — the user's capture
  // is never lost.
  const created = repoos.createTask({
    title: explanationTitle(explanation),
    body: explanation,
    originalPrompt: explanation,
    status: "draft",
    story,
    createdBy: getCurrentUser(req, config)?.email,
    pmAgentOverride,
    pmCliOverride,
    pmModelOverride,
  });
  logger.task(created.id, "info", "Task created as draft, PM agent will flesh it out", {
    title: created.title,
  });
  index.applyFileChange(created.absPath);
  commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);

  // Carry input attachments onto the new task before the PM rewrite (so the
  // PM sees them in the draft body via `## Screenshots`). Each file is
  // re-saved through `saveScreenshot` so it lands under the task's own
  // `.attachments/<taskId>/` folder and gets a numbered name — the task is
  // self-contained and unaffected by later input deletion (#0382).
  //
  // Audit round 2: track every skip explicitly. A missing file or an
  // unsupported MIME on one attachment must not leave the carry silently
  // incomplete — the resulting log line lists the dropped names so a
  // human/agent reviewing the run can recover them rather than discover the
  // gap after the input is gone.
  if (sourceInputId) {
    const input = listInputs(config).find((i) => i.id === sourceInputId);
    if (input) {
      const inputAttDir = join(config.root, config.inputsDir ?? "inputs", ".attachments", input.id);
      let carried = 0;
      const skipped: string[] = [];
      for (const att of input.attachments) {
        const srcPath = join(inputAttDir, att.name);
        if (!existsSync(srcPath)) {
          logger.task(
            created.id,
            "warn",
            `Skipping input attachment ${att.name}: file missing on disk`,
          );
          skipped.push(att.name);
          continue;
        }
        const bytes = readFileSync(srcPath);
        const result = saveScreenshot(config, created, {
          name: att.name,
          mime: att.mime,
          data: bytes.toString("base64"),
        });
        if ("error" in result) {
          logger.task(created.id, "warn", `Skipping input attachment ${att.name}: ${result.error}`);
          skipped.push(att.name);
          continue;
        }
        const updated = patchTaskFile(config, created.absPath, {
          addScreenshot: result,
        });
        index.applyFileChange(updated.absPath);
        carried++;
      }
      if (carried > 0) {
        logger.task(created.id, "info", `Carried ${carried} input attachment(s) onto task`, {
          inputId: sourceInputId,
        });
      }
      if (skipped.length > 0) {
        logger.task(
          created.id,
          "warn",
          `Input carry incomplete: ${skipped.length}/${input.attachments.length} attachments dropped (${skipped.join(", ")})`,
          { inputId: sourceInputId },
        );
      }
    }
  }

  // No PM agent configured: leave the draft exactly as created (the fallback
  // behavior — the original prompt is already preserved under its heading).
  if (!pm) {
    return json(res, 201, {
      ok: true,
      fallback: true,
      fallbackReason: "no-pm-agent",
      task: withPmWorking(index.getTask(created.id)),
    });
  }

  // 0335: flag the draft as being fleshed out RIGHT NOW — the server-side
  // source of truth for the live "PM is working" indicator on the card and in
  // the task panel. Cleared in `finalizeFreeformRun` on every exit path below
  // so a failed run can never leave the task looking like it is still worked.
  markPmWorking(created.id);
  emitEvent({
    type: "task.pmWorking",
    id: created.id,
    at: new Date().toISOString(),
  });

  // Spawn the PM agent as a durable, detached run (#0403). The response is
  // returned immediately so the user gets their draft right away; completion
  // is delivered to the manager's finalizer, which survives a server reload:
  // the run's PID + log are registered durably, and a replacement server
  // re-adopts and finishes it. `pmCommand` keeps the same authoring-only blast
  // radius while letting usage extraction see real tokens/cost (0335).
  const effectiveRunId = runId ?? `freeform-${created.id}-${randomUUID()}`;
  // #0583: the PM gets the repo's effective area vocabulary so it picks from
  // it (or proposes a new one explicitly) instead of inventing values.
  const prompt = pmPrompt(explanation, effectiveAreaNames(config));
  // Antigravity is explicitly worktree-bound: even its read-only PM pass must
  // not start in the main checkout. Reserve a short-lived, task-scoped
  // worktree for this run; the durable finalizer removes it on every exit
  // path, including a server reload or a launch failure.
  const pmWorktreeBranch = pm.cli === "antigravity" ? `repoos/pm/${created.id}` : undefined;
  let pmCwd = config.root;
  if (pmWorktreeBranch) {
    const worktree = ensureWorktree(config.root, pmWorktreeBranch);
    if (!worktree.ok) {
      const record: FreeformRunRecord = {
        runId: effectiveRunId,
        taskId: created.id,
        pid: 0,
        cwd: config.root,
        pmWorktreeBranch,
        explanation,
        agent: pm,
        startedAt: new Date().toISOString(),
      };
      finalizeFreeformRun(
        {
          config,
          index,
          logger,
          emitEvent,
          onServerStatusChange: ctx.onServerStatusChange,
        },
        record,
        {
          ok: false,
          error: `Antigravity PM requires a task worktree: ${worktree.reason ?? "could not create worktree"}`,
          elapsedMs: 0,
        },
      );
      return json(res, 201, {
        ok: true,
        fallback: true,
        fallbackReason: "agent-failed",
        reason: worktree.reason ?? "could not create Antigravity PM worktree",
        task: withPmWorking(index.getTask(created.id)),
      });
    }
    pmCwd = worktree.path;
  }
  const record: FreeformRunRecord = {
    runId: effectiveRunId,
    taskId: created.id,
    pid: 0,
    cwd: pmCwd,
    pmWorktreeBranch,
    explanation,
    agent: pm,
    startedAt: new Date().toISOString(),
  };
  const startRes = ctx.freeformRuns.start({
    runId: effectiveRunId,
    taskId: created.id,
    cwd: pmCwd,
    pmWorktreeBranch,
    explanation,
    agent: pm,
    command: pmCommand(pm, prompt, pmCwd),
  });
  if (!startRes.ok) {
    // The child never launched: finalize immediately so the same durable
    // failure trace (session row, registry entry, activity note, SSE event)
    // is produced as any other failed run.
    record.pid = 0;
    finalizeFreeformRun(
      {
        config,
        index,
        logger,
        emitEvent,
        onServerStatusChange: ctx.onServerStatusChange,
      },
      record,
      {
        ok: false,
        error: startRes.reason ?? "could not launch the PM agent",
        elapsedMs: 0,
      },
    );
    return json(res, 201, {
      ok: true,
      fallback: true,
      fallbackReason: "agent-failed",
      reason: startRes.reason,
      task: withPmWorking(index.getTask(created.id)),
    });
  }

  return json(res, 201, {
    ok: true,
    fallback: false,
    task: withPmWorking(index.getTask(created.id)),
  });
};

export const getTask: RouteHandler = (ctx, _req, res, params) => {
  const { config, index, previews, reviews, runner } = ctx;
  const id = params.param1;
  const t = index.getTask(id);
  return t
    ? json(res, 200, {
        ...withPmWorking(
          withPendingHandoff(withReviewStatus(withPreviewTargets(t, config), reviews), runner),
        ),
        blockedBy: taskDependencyBlockers(config.root, t, index.getTasks()),
        preview: previews.get(t.id) ?? null,
      })
    : json(res, 404, { error: `Task #${id} not found` });
};

export const patchTask: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, reviews, runner, logger, onServerStatusChange, syncTaskBranch } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const body = (await readBody(req)) as TaskPatch & {
    depends_on?: unknown;
    /** #0507: skip `repoos check`, keep the commit gate. Humans only. */
    skipChecks?: unknown;
    /** #0507: which UI affordance asked, for the activity/progress record. */
    origin?: unknown;
  };
  // #0657: archiving has side-effect guards (live run/review/preview/close-out)
  // that a bare PATCH would skip. Force callers through the action routes.
  if (body.archived !== undefined || body.archiveDetail !== undefined) {
    return json(res, 400, {
      error: `Use POST /api/tasks/${id}/archive or /unarchive to change a task's archived state`,
    });
  }
  // #0657: an archived task is parked — a status change is a lifecycle
  // mutation that must go through unarchive first, matching `repoos mv` and
  // `/start`. Non-status metadata edits (title, area, body) stay allowed.
  if (body.status !== undefined && body.status !== existing.status && existing.isArchived) {
    return json(res, 400, {
      error: `Task #${id} is archived — unarchive it before changing its status`,
    });
  }
  if (body.section !== undefined && body.section !== null) {
    const section: unknown = body.section;
    if (!isSectionPatch(section)) {
      return json(res, 400, {
        error: "section must contain string heading and content fields",
      });
    }
    const heading = normalizeSectionHeading(section.heading);
    if (!isSectionHeading(heading)) {
      return json(res, 400, {
        error: "section heading must be a single ## heading (not ### or deeper)",
      });
    }
    if (heading === ACTIVITY_HEADING) {
      return json(res, 400, { error: "## Activity is append-only and cannot be edited" });
    }
    if (body.body !== undefined) {
      return json(res, 400, {
        error: "section and body are mutually exclusive — use section to edit one ## heading",
      });
    }
  }
  if (body.force !== undefined && typeof body.force !== "boolean") {
    return json(res, 400, { error: "force must be a boolean" });
  }
  if (body.depends_on !== undefined) {
    if (body.dependsOn !== undefined) {
      return json(res, 400, { error: "Use either dependsOn or depends_on, not both" });
    }
    try {
      body.dependsOn = normalizeTaskDependencies(body.depends_on);
    } catch (error) {
      if (error instanceof DependencyValidationError)
        return json(res, 400, { error: error.message });
      throw error;
    }
    delete body.depends_on;
  }
  const prevStatus = existing.status;
  if (body.status === "done" && prevStatus !== "done") {
    if (reviews.isRunning(existing.id)) {
      return json(res, 409, {
        error: `Task #${existing.id} is waiting for automatic review to finish`,
      });
    }
    return json(res, 400, {
      error: `Use POST /api/tasks/${existing.id}/done to complete a review task`,
    });
  }

  if (body.status && body.status !== prevStatus) {
    // The lifecycle audit's transition table: a bare status write may only
    // perform the six edges with no side effect requiring a dedicated
    // action endpoint (start/pause/done/abandon/reopen). Rejects every other
    // pair outright — including every skip-a-step jump and unreviewed
    // backward move — regardless of whether the request came from the task
    // drawer's dropdown, board drag-drop, or a direct API call.
    const check = checkGenericStatusPatch(prevStatus, body.status);
    if (!check.ok) {
      return json(res, 400, {
        error: `Cannot move task #${existing.id} from ${prevStatus} to ${body.status}: ${check.reason}`,
      });
    }
  }

  if (body.status === "review" && prevStatus !== "review") {
    // #0507: a move into `review` is a REQUEST, not a write. It runs the same
    // scoped `repoos check` → commit/vacuity gate → `review` finalization the
    // agent's handoff signal runs, so no route can reach `review` on the
    // commit gate alone. That check can take minutes, so the finalization is
    // fire-and-forget and this route answers immediately with the task
    // unchanged: it stays `active` with a "running checks…" state until the
    // finalization succeeds, and stays `active` with the failure shown if it
    // does not. Anything that wrote `status: review` here would be exactly the
    // unchecked route this task closed.
    const skipChecks = body.skipChecks === true;
    // Everything else in the body still applies (title, priority, assignee…),
    // minus the status itself, which the finalization owns. Apply it BEFORE the
    // fire-and-forget handoff starts: `patchTaskFile` can reject a body (the
    // spec-heading guard, #0613), and a rejected request must not leave a
    // handoff running against the old body.
    const { status: _status, skipChecks: _skip, origin: _origin, ...rest } = body;
    let updated = existing;
    if (Object.keys(rest).length) {
      try {
        updated = patchTaskFile(config, existing.absPath, rest, {
          onStatusChange: onServerStatusChange,
        });
      } catch (error) {
        if (error instanceof DependencyValidationError)
          return json(res, 400, { error: error.message });
        throw error;
      }
    }
    if (updated !== existing) index.applyFileChange(updated.absPath, { guarded: true });
    if (rest.body !== undefined || rest.section !== undefined) {
      const current = index.getTask(updated.id);
      if (current) {
        const flagged = flagTaskSpecFlagsIfNeeded(config, current);
        if (flagged) index.applyFileChange(flagged.absPath, { guarded: true });
      }
    }
    const result = ctx.startUnifiedHandoff(index.getTask(updated.id) ?? updated, {
      origin: body.origin === "board-drag" ? "board-drag" : "ui-review",
      skipChecks,
      actor: getCurrentUser(req, config)?.email ?? "human",
    });
    if (!result.started) {
      return json(res, 409, {
        error: `Cannot move task #${existing.id} to review: ${result.reason}`,
      });
    }
    return json(res, 202, { ...index.getTask(updated.id), pendingHandoff: true });
  }

  let updated: Task;
  try {
    updated = patchTaskFile(config, existing.absPath, body, {
      onStatusChange: onServerStatusChange,
    });
  } catch (error) {
    if (error instanceof DependencyValidationError) return json(res, 400, { error: error.message });
    throw error;
  }

  if (body.status && body.status !== prevStatus) {
    logger.task(id, "info", `Task status changed`, {
      from: prevStatus,
      to: body.status,
    });
  }

  // Guarded: the #0210 gate already ran above for transitions into review.
  index.applyFileChange(updated.absPath, { guarded: true });

  // Re-run the underspecified check on every body change (#0613) — not only
  // draft promotion. If the body becomes well-specified again the flag clears;
  // clearing when underspecified persists is handled inside flagTaskSpecFlagsIfNeeded.
  if (body.body !== undefined || body.section !== undefined) {
    const current = index.getTask(updated.id);
    if (current) {
      const flagged = flagTaskSpecFlagsIfNeeded(config, current);
      if (flagged) index.applyFileChange(flagged.absPath, { guarded: true });
    }
  }

  if (prevStatus === "draft" && updated.status !== "draft") {
    const current = index.getTask(updated.id);
    if (current) {
      const flagged = flagTaskSpecFlagsIfNeeded(config, current);
      if (flagged) index.applyFileChange(flagged.absPath, { guarded: true });
    }
  }

  if (
    prevStatus !== "review" &&
    updated.status === "review" &&
    updated.branch &&
    !runner.isRunning(updated.id)
  ) {
    void syncTaskBranch(updated);
  }

  return json(res, 200, index.getTask(updated.id));
};

export const deleteTask: RouteHandler = async (ctx, _req, res, params) => {
  const { config, index, logger, previews } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  await previews.stop(id);
  try {
    deleteTaskFile(config, existing.absPath);
  } catch (err) {
    if (err instanceof PathGuardError) {
      return json(res, 400, { error: err.message });
    }
    return json(res, 404, { error: `Task #${id} not found` });
  }
  logger.task(id, "info", "Task deleted", { title: existing.title });
  index.applyFileDelete(existing.absPath);
  return json(res, 200, { ok: true });
};

export const getScreenshot: RouteHandler = (ctx, _req, res, params) => {
  const { config } = ctx;
  const taskId = params.param1;
  const filename = params.param2;
  const stored = readAttachment(config, taskId, filename);
  if (!stored) {
    return json(res, 404, { error: "Attachment not found" });
  }
  res.writeHead(200, {
    "Content-Type": stored.mime,
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(stored.data);
};

export const uploadScreenshot: RouteHandler = async (ctx, req, res, params) => {
  const { config, index } = ctx;
  const taskId = params.param1;
  const task = index.getTask(taskId);
  if (!task) {
    return json(res, 404, { error: `Task #${taskId} not found` });
  }
  const body = (await readBody(req)) as {
    name?: unknown;
    mime?: unknown;
    data?: unknown;
  };
  const result = saveScreenshot(config, task, body ?? {});
  if ("error" in result) {
    return json(res, 400, { error: result.error });
  }
  const updated = patchTaskFile(config, task.absPath, {
    addScreenshot: result,
  });
  index.applyFileChange(updated.absPath);
  return json(res, 201, { ok: true, attachment: result });
};

// Captured preview shots (#0582). Separate from the uploaded screenshots above:
// written under `shots/`, never referenced from the task body, listed from disk.
export const listTaskShots: RouteHandler = (ctx, _req, res, params) => {
  const { config, index } = ctx;
  const taskId = params.param1;
  const task = index.getTask(taskId);
  if (!task) {
    return json(res, 404, { error: `Task #${taskId} not found` });
  }
  const shots = localShotStore(config, taskId).list();
  const shotContext = computeTaskShotContext(config, task);
  return json(res, 200, { ok: true, shots, ...shotContext });
};

/** Handoff UI verification evidence (#0680) for the Changes tab. */
export const getTaskUiVerification: RouteHandler = (ctx, _req, res, params) => {
  const { config, index } = ctx;
  const taskId = params.param1;
  const task = index.getTask(taskId);
  if (!task) {
    return json(res, 404, { error: `Task #${taskId} not found` });
  }
  const evidence = readUiHandoffGateEvidence(config, taskId);
  return json(res, 200, { ok: true, evidence });
};

export const getTaskShot: RouteHandler = (ctx, _req, res, params) => {
  const { config } = ctx;
  const abs = localShotStore(config, params.param1).resolve(params.param2);
  if (!abs) {
    return json(res, 404, { error: "Shot not found" });
  }
  const mime = mimeForExtension(abs) ?? "image/png";
  res.writeHead(200, {
    "Content-Type": mime,
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(readFileSync(abs));
};

export const uploadTaskShot: RouteHandler = async (ctx, req, res, params) => {
  const { config, index } = ctx;
  const taskId = params.param1;
  const task = index.getTask(taskId);
  if (!task) {
    return json(res, 404, { error: `Task #${taskId} not found` });
  }
  const body = (await readBody(req)) as {
    target?: unknown;
    route?: unknown;
    label?: unknown;
    highlight?: unknown;
    selector?: unknown;
    steps?: unknown;
    provenance?: unknown;
    mime?: unknown;
    name?: unknown;
    data?: unknown;
    warnings?: unknown;
  };
  // One POST route, two shapes (#0627): the CLI's `repoos shot` uploads already-
  // captured bytes (a `data` field); the drawer's Add shot declares an entry and
  // lets the server capture it. Dispatch on `data` so the CLI path is untouched.
  if (typeof body?.data !== "string") {
    return declareTaskShot(ctx, res, params, body as Record<string, unknown> | undefined);
  }
  const target =
    typeof body?.target === "string" && body.target.trim() ? body.target.trim() : "default";
  const result = localShotStore(config, taskId).save({
    target,
    ...(typeof body?.route === "string" && body.route ? { route: body.route } : {}),
    ...(typeof body?.label === "string" && body.label ? { label: body.label } : {}),
    ...(typeof body?.provenance === "string" && body.provenance
      ? { provenance: body.provenance }
      : {}),
    ...(typeof body?.mime === "string" && body.mime ? { mime: body.mime } : {}),
    ...(typeof body?.name === "string" && body.name ? { name: body.name } : {}),
    data: typeof body?.data === "string" ? body.data : "",
  });
  if ("error" in result) {
    return json(res, 400, { error: result.error });
  }
  // #0613: a manual `repoos shot` capture can pre-empt the automatic one, so
  // persist its selector/highlight misses on the task, like handoff capture does.
  if (Array.isArray(body?.warnings)) {
    for (const warning of body.warnings) {
      if (typeof warning !== "string" || !warning.trim()) continue;
      try {
        patchTaskFile(config, task.absPath, { note: warning.trim() });
      } catch {
        /* best-effort — the CLI already printed it */
      }
    }
  }
  return json(res, 201, { ok: true, shot: result });
};

/**
 * The drawer's Add shot (#0627): validate ONE declared entry with the shared
 * `parseShotPlan` rules, capture it immediately through the server-owned
 * preview (never evicting a preview a human is viewing — busy is a structured
 * error), store it as declared evidence, and append the entry to the task's
 * `## Shots` list so a later re-handoff captures it again. Capture happens
 * BEFORE the task-body write so a failed capture never leaves a
 * declared-but-never-captured entry behind: the response error is the only
 * trace of a failed attempt.
 */
/** The task's CURRENT body from disk, so a concurrent edit is never clobbered by a stale snapshot. */
function readTaskBody(config: RepoOSConfig, absPath: string): string {
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root: config.root,
    defaultStatus: config.defaultStatus,
    defaultAssignee: config.defaultAssignee,
  }).body;
}

async function declareTaskShot(
  ctx: RouteContext,
  res: ServerResponse,
  params: Record<string, string>,
  body:
    | {
        target?: unknown;
        route?: unknown;
        label?: unknown;
        highlight?: unknown;
        selector?: unknown;
        steps?: unknown;
      }
    | undefined,
): Promise<void> {
  const { config, index, previews } = ctx;
  const task = index.getTask(params.param1);
  if (!task) {
    return json(res, 404, { error: `Task #${params.param1} not found` });
  }
  if (task.status !== "active" && task.status !== "review") {
    return json(res, 400, {
      error: `Shots can only be added while a task is active or review (#${task.id} is ${task.status})`,
    });
  }
  if (!task.branch) {
    return json(res, 400, { error: "The task has no branch yet — nothing to capture" });
  }
  // Validate with the SAME rules `repoos update --shots` enforces — one shared
  // validator (`parseShotEntry` in core), never a second copy.
  // validator (`parseShotEntry` in core), never a second copy. Fields are
  // passed VERBATIM so a wrong type reaches the validator and is rejected —
  // filtering to well-typed values here would let `{ target: 5 }` sneak
  // through as an omitted target and capture anyway (review round 1).
  const raw: Record<string, unknown> = {};
  for (const key of ["target", "route", "label", "highlight", "selector", "steps"] as const) {
    if (body && body[key] !== undefined) raw[key] = body[key];
  }
  const parsed = parseShotEntry(raw);
  if (parsed.error || !parsed.shot) {
    return json(res, 400, { error: parsed.error ?? "Invalid shot entry" });
  }
  const entry = parsed.shot;
  // Resolve the target the way the capture would (changed paths, then area,
  // then the default command), so an unresolvable pick fails HERE, in the
  // modal, instead of as a capture failure after the declaration was written.
  const shotContext = computeTaskShotContext(config, task);
  // The drawer offers every configured target (#0379), not just the ones the
  // diff or the task's area resolve to — an explicit pick must be honored
  // through `resolveShotTargets`' override path, or an offered out-of-area
  // target would fail here even though it is configured (review round 2).
  // With no explicit target the default resolution applies (changed paths,
  // then area, then the default command).
  const resolution = resolveShotTargets(
    config.preview,
    task.area,
    shotContext.changedPaths,
    entry.target,
  );
  if (resolution.names.length === 0) {
    return json(res, 400, {
      error:
        (resolution.reason ?? "no preview target") +
        " — add a target with [[preview.paths]] matching this task's diff, or configure a default preview",
    });
  }
  const resolved = resolveDeclaredTarget(entry.target, resolution.names);
  if (resolved.error || !resolved.target) {
    return json(res, 400, { error: resolved.error ?? "the target could not be resolved" });
  }
  // The existing `## Shots` list must parse BEFORE anything is captured: a
  // malformed list cannot take the new declaration, and capturing first would
  // leave an image with no declaration behind (review round 5).
  const preflight = appendDeclaredShot(readTaskBody(config, task.absPath), entry);
  if (preflight.errors.length > 0) {
    return json(res, 400, {
      error: `the task's ## Shots section is not a valid list — fix it first: ${preflight.errors.join("; ")}`,
    });
  }
  const result = await captureDeclaredShot(config, task, previews, {
    target: resolved.target,
    route: entry.route ?? "/",
    ...(entry.label ? { label: entry.label } : {}),
    ...(entry.highlight ? { highlight: entry.highlight } : {}),
    ...(entry.selector ? { selector: entry.selector } : {}),
    ...(entry.steps?.length ? { steps: entry.steps } : {}),
    provenance: { kind: "declared", ...(entry.label ? { label: entry.label } : {}) },
    // The parsed declaration rides on the stored shot so delete can sync the
    // exact `## Shots` entry (selector and steps included) instead of guessing
    // from the shallow fields (#0627 review round 1).
    declared: entry,
  });
  if ("error" in result) {
    return json(res, result.busy ? 409 : 400, {
      error: result.error,
      ...(result.busy ? { busy: true } : {}),
    });
  }
  // The capture takes 5-30s; the task may have left active/review meanwhile
  // (done, paused back to ready, deleted). Recheck against the live index and
  // discard the new image rather than edit a task file the restriction says
  // this route may not touch (review round 6).
  const current = index.getTask(task.id);
  if (!current || (current.status !== "active" && current.status !== "review")) {
    localShotStore(config, task.id).remove(result.shot.name);
    return json(res, 409, {
      error: current
        ? `the shot was discarded: #${task.id} moved to ${current.status} while it was being captured`
        : `the shot was discarded: #${task.id} no longer exists`,
    });
  }
  // Append the declaration to `## Shots` (section write — no other body
  // section changes), with an activity note; capture-miss warnings ride the
  // same note so the capture's caveats are visible without a second write.
  // The body is re-read from disk right before the section write so an entry a
  // concurrent writer just added is never clobbered by a stale snapshot.
  const append = appendDeclaredShot(readTaskBody(config, task.absPath), entry);
  if (append.errors.length > 0) {
    // The shot itself is captured and stored; the declaration just needs fixing.
    return json(res, 201, {
      ok: true,
      shot: result.shot,
      warning: `the shot was captured, but the task's ## Shots section could not be updated: ${append.errors.join("; ")}`,
    });
  }
  try {
    const updated = patchTaskFile(config, task.absPath, {
      section: { heading: "Shots", content: append.content },
      note: `shot added: ${entry.target}${entry.route && entry.route !== "/" ? entry.route : ""}${entry.label ? ` – ${entry.label}` : ""}`,
    });
    index.applyFileChange(updated.absPath);
  } catch (error) {
    return json(res, 201, {
      ok: true,
      shot: result.shot,
      warning: `the shot was captured, but the ## Shots list could not be updated: ${(error as Error).message}`,
    });
  }
  // #0613-style visible warnings: a highlight/selector that matched nothing is
  // recorded on the task, not silently dropped.
  for (const warning of result.warnings) {
    try {
      patchTaskFile(config, task.absPath, { note: warning });
    } catch {
      /* best-effort */
    }
  }
  return json(res, 201, {
    ok: true,
    shot: result.shot,
    ...(result.warnings.length ? { warning: result.warnings.join("; ") } : {}),
  });
}

/**
 * Delete one captured shot from the task drawer (#0627): the PNG, its manifest
 * entry, and — so a later re-handoff cannot resurrect the evidence — every
 * `## Shots` declaration that describes it (matched on label/route/target, the
 * fields both sides share). Only the task `.md` (normal patch path) and the
 * gitignored `work/.attachments/` tree are touched, so this is safe while a
 * task is in `review`.
 */
export const deleteTaskShot: RouteHandler = async (ctx, _req, res, params) => {
  const { config, index } = ctx;
  const taskId = params.param1;
  const task = index.getTask(taskId);
  if (!task) {
    return json(res, 404, { error: `Task #${taskId} not found` });
  }
  if (task.status !== "active" && task.status !== "review") {
    // Same rule as Add: the drawer hides these controls elsewhere, and a
    // direct API call must not edit shots or task metadata outside them.
    return json(res, 400, {
      error: `Shots can only be deleted while a task is active or review (#${task.id} is ${task.status})`,
    });
  }
  let name = params.param2;
  try {
    name = decodeURIComponent(name);
  } catch {
    /* already decoded or plain — keep as-is */
  }
  const store = localShotStore(config, taskId);
  const found = store.list().find((shot) => shot.name === name);
  if (!found) {
    return json(res, 404, { error: "Shot not found" });
  }
  // Sync the declaration: a matching ## Shots entry would be captured again at
  // the next handoff. A hand-added shot carries its own full declaration in
  // the manifest (`found.declared`), so it syncs THE exact entry — selector
  // and steps included. Legacy and auto shots (no stored declaration) fall
  // back to the shallow matcher, which requires at least one identifying
  // field — an anonymous declaration (steps/highlight only) can never claim a
  // deleted shot (#0627 review round 1). The body is re-read from disk so a
  // declaration added concurrently is still seen.
  const removal = removeDeclaredShots(
    readTaskBody(config, task.absPath),
    found.declared
      ? (declared) => sameDeclaredShot(declared, found.declared!)
      : (declared) => declaredShotMatchesShot(declared, found),
  );
  // Declaration first, image second (review round 5). If the task file cannot
  // be read or written, nothing has been deleted and the caller gets a real
  // failure — the other order left a declaration that resurrects the shot at
  // the next handoff while reporting success.
  if (removal.errors.length > 0) {
    return json(res, 400, {
      error: `the task's ## Shots section is not a valid list — fix it before deleting: ${removal.errors.join("; ")}`,
    });
  }
  try {
    const updated = patchTaskFile(config, task.absPath, {
      note: `shot removed: ${found.label || found.name}`,
      ...(removal.removed > 0 ? { section: { heading: "Shots", content: removal.content } } : {}),
    });
    index.applyFileChange(updated.absPath);
  } catch (error) {
    return json(res, 500, {
      error: `the shot was NOT deleted: the task file could not be updated (${(error as Error).message})`,
    });
  }
  const removed = store.remove(name);
  if (!removed) {
    // Gone between the lookup and now (a concurrent delete) — the declaration
    // sync above is still correct, so this is success.
    return json(res, 200, { ok: true, removed: name, declarationsRemoved: removal.removed });
  }
  return json(res, 200, {
    ok: true,
    removed: removed.name,
    declarationsRemoved: removal.removed,
    ...(!removed.declared && removal.removed > 1
      ? {
          // A legacy/auto shot records no selector or steps, so every
          // declaration sharing its label/route/target is a candidate. All
          // go, or a re-handoff would recapture the deleted evidence.
          warning: `${removal.removed} ## Shots declarations matched this shot and were all removed — re-add any you still want`,
        }
      : {}),
  });
};

// Task logs
export const getTaskLogs: RouteHandler = (ctx, _req, res, params) => {
  const { logger } = ctx;
  const id = params.param1;
  const limit = 1000;
  const logs = logger.getTaskLogs(id, limit);
  return json(res, 200, { ok: true, logs });
};

// Task output
export const getTaskOutput: RouteHandler = (ctx, _req, res, params) => {
  const { runner } = ctx;
  const id = params.param1;
  const session = runner.output(id);
  return json(res, 200, {
    ok: true,
    lines: session?.lines ?? [],
    stats: runner.stats(id),
  });
};

/**
 * #0684: per-task agent override fields that the `/start` and `/message`
 * action bodies accept but do not apply. Both handlers resolve the engineer
 * with `resolveAgentForTask(config, task)`, which reads only the task's
 * persisted `agentOverride`/`cliOverride`/`modelOverride` — a body override is
 * parsed as an unknown property and dropped, so the run launches on the
 * configured default while the caller believes it named a CLI/model (the field
 * report's driver "believed for ~2 hours that two tasks were running on Cursor
 * when they were on DeepSeek"). Rejecting beats ignoring: the only supported
 * way to change a task's engineer assignment is `PATCH /api/tasks/:id`.
 *
 * Returns the offending field names, empty when the body carries none.
 */
const IGNORED_OVERRIDE_FIELDS = [
  "agentOverride",
  "cliOverride",
  "modelOverride",
  "pmAgentOverride",
  "pmCliOverride",
  "pmModelOverride",
  "reviewAgentOverride",
  "reviewCliOverride",
  "reviewModelOverride",
] as const;

function ignoredOverrideFieldNames(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  return IGNORED_OVERRIDE_FIELDS.filter((f) => record[f] !== undefined);
}

/**
 * #0684: reject a `start`/`message` body that carries a per-task override the
 * route will ignore, naming the endpoint that does apply it. Returns true when
 * a 400 was written (the caller must return immediately).
 */
function rejectIgnoredOverrides(res: ServerResponse, id: string, body: unknown): boolean {
  const fields = ignoredOverrideFieldNames(body);
  if (fields.length === 0) return false;
  const list = fields.map((f) => `"${f}"`).join(", ");
  json(res, 400, {
    error:
      `POST /api/tasks/${id}/start and /message do not apply agent overrides — ` +
      `${list} would be silently ignored. Set them on the task with ` +
      `PATCH /api/tasks/${id} { ${fields.join(", ")} }, or edit them from the ` +
      `task drawer's agent picker, then start the run.`,
  });
  return true;
}

// Task actions: start, pause, message, done, sync
export const taskAction: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner, previews, reviews, syncTaskBranch, onServerStatusChange, logger } =
    ctx;
  const { jobCoordinator } = ctx;
  const id = params.param1;
  const action = params.param2;
  let existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }

  // Hotfix activation switches the root checkout and rewrites this task file.
  // A rapid follow-up /start must use that on-disk state, not a snapshot that
  // was captured before the switch and can still point at a normal worktree.
  if (action === "start") {
    try {
      existing = parseTask({
        content: readFileSync(existing.absPath, "utf8"),
        absPath: existing.absPath,
        root: config.root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
      });
    } catch (error) {
      return json(res, 500, {
        error: `Could not refresh task #${id} before starting: ${(error as Error).message}`,
      });
    }
  }

  if (action === "start") {
    if (existing.status !== "ready" && existing.status !== "active") {
      return json(res, 400, {
        error: `Only ready or paused tasks can be started (#${id} is ${existing.status})`,
      });
    }
    // #0657: an archived task is parked, not runnable. Unarchive first so the
    // board never shows a hidden task consuming an agent slot.
    if (existing.isArchived) {
      return json(res, 400, {
        error: `Task #${id} is archived — unarchive it before starting work`,
      });
    }
    const body = (await readBody(req)) as {
      mode?: unknown;
      instruction?: unknown;
      overrideDependencies?: unknown;
      [key: string]: unknown;
    };
    // #0684: refuse overrides this route will not apply rather than accepting
    // (200) and silently dropping them — see rejectIgnoredOverrides.
    if (rejectIgnoredOverrides(res, id, body)) return;
    const blockers = taskDependencyBlockers(config.root, existing, index.getTasks());
    if (blockers.length && body?.overrideDependencies !== true) {
      const reason = blockers
        .map((blocker) =>
          blocker.state === "cancelled"
            ? `Blocked by cancelled task #${blocker.id}; needs a human`
            : blocker.state === "archived"
              ? `Blocked by archived task #${blocker.id}; unarchive it to unblock`
              : `Blocked by #${blocker.id}`,
        )
        .join("; ");
      return json(res, 409, { ok: false, error: reason, reason, blockedBy: blockers });
    }
    if (runner.isRunning(id)) {
      return json(res, 400, { error: `Task #${id} is already running` });
    }
    const agent = resolveAgentForTask(config, existing);
    if (!agent) {
      return json(res, 400, {
        error: "No enabled engineer agent is configured on the Agents page",
      });
    }
    const mode = body?.mode;
    const clean = mode === "clean" && !existing.hotfix;
    const freshSession = mode === "fresh";
    if (mode === "resume") {
      const invalidResume = runner.invalidResumeReason(id, agent);
      if (invalidResume) return json(res, 409, { ok: false, reason: invalidResume });
    }
    // A task returned from review needs its repair brief in the initial
    // resumed turn. Sending it as a follow-up would race the agent's start
    // and commonly be rejected while the new turn is already running.
    const instruction = typeof body?.instruction === "string" ? body.instruction.trim() : "";
    const branch = existing.branch || deriveBranch(existing.title);
    if (clean) {
      if (!existing.branch) {
        return json(res, 400, {
          error: `Task #${id} has no worktree yet — start normally instead`,
        });
      }
      if (!resetWorktree(config.root, branch)) {
        return json(res, 400, {
          error: `Could not reset the worktree for ${branch} — is it the main checkout?`,
        });
      }
    }
    const isHotfix = existing.hotfix === true;
    const patch: TaskPatch = { status: "active" };
    // Starting acknowledges ordinary question/underspecified flags and clears
    // recoverable run-health flags (#0716), but must not erase a failure
    // reason owned by another subsystem.
    if (needsInputClearsOnNewEngineerRun(existing.needsInputReason)) {
      patch.needsInput = false;
    }
    if (!existing.branch) patch.branch = branch;
    // Patch (and commit) the task file in main BEFORE forking the worktree's
    // branch — ensureWorktree forks from main's current committed HEAD, so
    // doing this after would freeze the new branch's task-file copy at the
    // pre-activation state (status: ready, branch: "") forever, since nothing
    // later syncs main's corrected metadata back into an already-forked
    // branch. That stale copy then fails handoff finalization's branch check.
    const updated = patchTaskFile(config, existing.absPath, patch, {
      onStatusChange: onServerStatusChange,
    });
    const wtRes = isHotfix
      ? { ok: true, path: config.root, created: false }
      : ensureWorktree(config.root, branch);
    index.applyFileChange(updated.absPath);
    index.refreshBranches();

    // #0613: surface the underspecified flag at start — the task is now live,
    // so a stub body must be visible to the engineer, not silently carried.
    // It does not block start; it records a visible activity note.
    const startedTask = index.getTask(updated.id);
    if (startedTask) {
      const assessment = assessTaskUnderspecified(startedTask.body, { area: startedTask.area });
      const flagged = flagTaskSpecFlagsIfNeeded(config, startedTask);
      if (flagged) {
        index.applyFileChange(flagged.absPath, { guarded: true });
      }
      if (assessment.underspecified) {
        logger.task(id, "warn", "Task body is underspecified at start", {
          detail: assessment.detail,
          needsInputRaised: flagged !== null,
        });
      }
    }
    const cwd = wtRes.ok ? wtRes.path : config.root;

    const taskForLaunch = index.getTask(updated.id) ?? updated;
    const bootResult = await bootstrap(config, taskForLaunch, branch, cwd);
    if (!bootResult.ok) {
      return json(res, 500, {
        ok: false,
        error: `Bootstrap failed: ${bootResult.reason ?? "unknown error"}`,
        bootstrap: {
          ok: false,
          durationMs: bootResult.durationMs,
          steps: bootResult.steps.map((s) => ({
            name: s.name,
            ok: s.ok,
            durationMs: s.durationMs,
            detail: s.detail,
          })),
        },
      });
    }

    const pack = generateContextPack(config, taskForLaunch, branch, cwd, bootResult);
    const resumeContext =
      clean || !existing.branch ? undefined : resumePreamble(config, taskForLaunch, branch, cwd);
    const preamble = [resumeContext, instruction].filter(Boolean).join("\n\n") || undefined;

    const spawnRes = runner.start(taskForLaunch, branch, agent, {
      cwd,
      contextPack: pack.content,
      resumePreamble: preamble,
      freshSession,
    });
    return json(res, 200, {
      ok: true,
      task: index.getTask(updated.id),
      branch,
      clean,
      git: wtRes.ok ? "ok" : (wtRes.reason ?? "unknown"),
      worktree: wtRes.ok ? wtRes.path : undefined,
      spawn: {
        ok: spawnRes.ok,
        pid: spawnRes.pid,
        queued: spawnRes.queued,
        reason: spawnRes.reason,
      },
      bootstrap: {
        ok: bootResult.ok,
        durationMs: bootResult.durationMs,
        steps: bootResult.steps.map((s) => ({
          name: s.name,
          ok: s.ok,
          durationMs: s.durationMs,
        })),
      },
      context: {
        cacheHit: pack.cacheHit,
        generationMs: pack.generationMs,
        size: pack.size,
      },
    });
  }

  if (action === "done") {
    // #0657: a parked task never closes out — its lifecycle is frozen until
    // it is unarchived, mirroring `repoos mv` and the status PATCH guard.
    if (existing.isArchived) {
      return json(res, 400, {
        error: `Task #${id} is archived — unarchive it before completing it`,
      });
    }
    // Branch-less release (2026-08-15): a task fixed by a direct commit on
    // main (a hotfix — see #0212, not yet a first-class flow) has nothing to
    // merge. Routing it through the branch-merge close-out pipeline below
    // just dead-ends on "no branch to merge" — that's not a rejection of the
    // task, it's the wrong pipeline for it. This is a separate, self-contained
    // path: verify main is currently green, then release directly. It never
    // touches the job queue or the repo lock, since there is no merge to
    // serialize against other close-outs.
    if (isBranchlessReleaseEligible(existing)) {
      if (runner.isRunning(id)) {
        return json(res, 409, {
          error: `Task #${id} has an agent turn in progress`,
        });
      }
      const result = await releaseBranchless(config, existing);
      if (!result.ok) {
        return json(res, 400, { error: result.reason });
      }
      index.applyFileChange(result.task!.absPath);
      return json(res, 200, index.getTask(id));
    }

    if (existing.status !== "review") {
      return json(res, 400, {
        error: `Only review tasks can be completed (#${id} is ${existing.status})`,
      });
    }
    // A branch-less task in review is unreachable in practice (nothing sets
    // status: review without a branch), but keep the guard as defense in
    // depth — the branch-less release path above only handles non-review
    // statuses, by design, so it must not silently fall through here.
    if (!existing.branch) {
      return json(res, 400, { error: `Task #${id} has no branch to merge` });
    }
    if (runner.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} has an agent turn in progress`,
      });
    }
    if (reviews.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} is waiting for automatic review to finish`,
      });
    }
    await previews.stop(id);
    reviews.cancel(id);
    void runner.stop(id);

    // Guard against task deletion mid-close-out (0118): re-validate the task
    // exists and still has a branch before enqueueing.
    const taskStillExists = index.getTask(id);
    if (!taskStillExists || !taskStillExists.branch) {
      return json(res, 400, {
        error: `Task #${id} was deleted or lost its branch before close-out could start`,
      });
    }

    // Stale-lock guard (0204): a stale repository lock blocks all close-outs.
    // Check before enqueueing; if stale, clear it automatically so the user
    // doesn't hit a cryptic "could not acquire publication lock" failure.
    const lockPath = join(config.root, ".repoos/close-out.lock");
    if (existsSync(lockPath)) {
      try {
        const lockStat = statSync(lockPath);
        const age = Date.now() - lockStat.mtime.getTime();
        if (age > 60_000) {
          unlinkSync(lockPath);
        }
      } catch {
        // Best-effort
      }
    }

    // Dirty-main guard (0204): a dirty working tree on `main` aborts the
    // close-out merge. Check before enqueueing; if dirty files exist and the
    // user has not opted in via "Commit & continue", hand the list back so the
    // UI can show a confirmation modal and pause the close-out. The task stays
    // in review until the user decides.
    //
    // Fails closed (#0211): if the dirty check itself errors or times out we
    // cannot assert the tree is clean, so the close-out is refused rather than
    // enqueued against a tree that git may abort at publish time. An unknown
    // state must never silently look clean.
    let dirty: string[];
    try {
      dirty = await mainDirtyFilesForCloseOut(config.root, config);
    } catch (err) {
      if (err instanceof GitDirtyCheckError) {
        return json(res, 409, {
          error: `could not verify main is clean before close-out (${err.message}). Retry, or commit/stash main's working tree and try again.`,
          needsCommit: true,
          dirtyFiles: [],
          dirtyCheckFailed: true,
          causeKind: err.causeKind,
        });
      }
      throw err;
    }
    const doneBody = (await readBody(req)) as { commitDirty?: unknown };
    const commitDirty = doneBody?.commitDirty === true;
    if (dirty.length > 0 && !commitDirty) {
      return json(res, 409, {
        error: `main has ${dirty.length} uncommitted file${dirty.length === 1 ? "" : "s"} blocking close-out`,
        needsCommit: true,
        dirtyScope: "main",
        dirtyFiles: dirty,
      });
    }

    // Dirty-WORKTREE guard (#0512). The merge above only carries the branch's
    // COMMITS, and `cleanup()` ends by removing the task's worktree — which
    // used to run `git worktree remove --force` and delete uncommitted work
    // without a word. An edit made after the last handoff commit (a fix applied
    // while the task sat in `review`, say) was never tested by the merge gate
    // and never kept. Same shape as the dirty-main response so the UI can ask
    // the human once, with the same modal, for either tree.
    //
    // Skipped for hotfix tasks: their "worktree" IS the main checkout, which the
    // dirty-main guard above already covered (and already committed on
    // "Commit & continue"), and its close-out removes no worktree at all.
    const branch = taskStillExists.branch;
    const worktree =
      taskStillExists.hotfix === true ? null : worktreePathForBranch(config.root, branch);
    let worktreeDirty: string[] = [];
    if (worktree) {
      try {
        worktreeDirty = await uncommittedWorkFiles(worktree, workFileFilter(config));
      } catch (err) {
        if (err instanceof GitDirtyCheckError) {
          return json(res, 409, {
            error: `could not verify the task worktree is clean before close-out (${err.message}). Close-out aborted; nothing was merged.`,
            needsCommit: true,
            dirtyCheckFailed: true,
            dirtyFiles: [],
          });
        }
        throw err;
      }
    }
    if (worktreeDirty.length > 0 && !commitDirty) {
      return json(res, 409, {
        error: `the worktree for ${branch} has ${worktreeDirty.length} uncommitted file${worktreeDirty.length === 1 ? "" : "s"} that close-out would delete`,
        needsCommit: true,
        dirtyScope: "worktree",
        dirtyFiles: worktreeDirty,
      });
    }
    let worktreeCommittedForCloseOut = false;
    if (worktreeDirty.length > 0 && commitDirty) {
      // "Commit & continue" for the worktree commits through the SAME path the
      // handoff uses, so a human-approved commit lands exactly what a handoff
      // would have committed (no `dist/`, no the task's own file, no other
      // task's `work/*.md` drift) — and the merge gate then validates the
      // commit, not the raw working tree.
      const gate = await guardReviewTransition(config, taskStillExists);
      if (!gate.ok) {
        return json(res, 500, {
          error: `could not commit the worktree's uncommitted changes (${gate.detail ?? "the review guard rejected it"}); close-out aborted and nothing was merged.`,
          needsCommit: true,
          dirtyScope: "worktree",
          dirtyFiles: worktreeDirty,
        });
      }
      worktreeCommittedForCloseOut = true;
    }
    if (dirty.length > 0 && commitDirty) {
      let committed: string[];
      try {
        committed = await commitDirtyFiles(
          config.root,
          `chore: checkpoint before close-out (#${id})`,
        );
      } catch (err) {
        if (err instanceof GitDirtyCheckError) {
          return json(res, 500, {
            error: `could not re-verify main while committing dirty files (${err.message}). Close-out aborted; nothing was merged.`,
            needsCommit: true,
            dirtyFiles: dirty,
            dirtyCheckFailed: true,
          });
        }
        throw err;
      }
      if (committed.length !== dirty.length) {
        return json(res, 500, {
          error: `auto-commit of ${dirty.length} dirty file${dirty.length === 1 ? "" : "s"} failed on main`,
          needsCommit: true,
          dirtyFiles: dirty,
        });
      }
    }

    let handoffSha: string | null = null;
    if (!taskStillExists.hotfix && branch && worktree) {
      if (worktreeCommittedForCloseOut) {
        const refreshed = await refreshHandoffSnapshotFromWorktree(config, id, branch, worktree);
        if (!refreshed.ok) {
          return json(res, 500, {
            error: refreshed.reason,
            needsCommit: true,
            dirtyScope: "worktree",
          });
        }
        handoffSha = refreshed.sha;
      } else {
        const handoffSnap = readHandoffSnapshot(config.root, config.cacheDir, id);
        if (handoffSnap) {
          const integrity = await verifyWorktreeHandoffIntegrity(config, branch, handoffSnap.sha, {
            handoffAt: handoffSnap.at,
            taskId: id,
          });
          if (!integrity.ok) {
            return json(res, 409, {
              error: integrity.reason,
              worktreeChangedAfterHandoff: true,
              handoffSha: handoffSnap.sha,
              attribution: integrity.attribution,
              dirtyFiles: integrity.dirtyFiles,
              resolutions: ["discard", "send-back"],
            });
          }
          handoffSha = handoffSnap.sha;
        }
      }
    }

    // Reserve the close-out window before queueing: a reload may already have
    // drained the listener, so wait for it to abort and re-bind first.
    if (ctx.reload) await ctx.reload.prepareForCloseOut();

    // Enqueue the close-out job (idempotent per task).
    const job = ctx.jobCoordinator.enqueue(taskStillExists, { handoffSha });
    if (!job) {
      ctx.reload?.releaseCloseOut();
      return json(res, 400, { error: `Task #${id} has no branch to merge` });
    }

    if (handoffSha) {
      writeWorktreeReviewLock(config.root, config.cacheDir, id, {
        status: "closing-out",
        sha: handoffSha,
        at: new Date().toISOString(),
      });
    }

    // Reflect the new queue entry in the pinned status bar immediately (0207),
    // even before job processing's own snapshot emission picks it up.
    ctx.emitEvent({
      type: "integration",
      pipeline: buildIntegrationSnapshot(
        ctx.jobCoordinator,
        {},
        resolvePipelineCheckPlan(ctx.config),
      ),
    });

    // Trigger job processing to start the pipeline.
    ctx.triggerJobProcessing();

    // Return the job status to the client.
    return json(res, 200, {
      ok: true,
      job: {
        taskId: job.taskId,
        phase: job.phase,
        enqueuedAt: job.enqueuedAt,
        startedAt: job.startedAt,
        queuePosition: pendingCloseOutJobs(ctx.jobCoordinator.allJobs()).findIndex(
          (j) => j.taskId === job.taskId,
        ),
        queueLength: pendingCloseOutJobs(ctx.jobCoordinator.allJobs()).length,
      },
    });
  }

  if (action === "sync") {
    if (!existing.branch) {
      return json(res, 400, { error: `Task #${id} has no branch to sync` });
    }
    if (runner.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} has an agent turn in progress`,
      });
    }
    if (reviews.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} has a review in progress`,
      });
    }
    const sync = await syncTaskBranch(existing);
    index.refreshBranches();
    return json(res, sync.ok ? 200 : 409, {
      ok: sync.ok,
      conflicts: sync.conflicts,
      error: sync.reason,
    });
  }

  if (action === "message") {
    if (existing.status !== "active" && existing.status !== "review") {
      return json(res, 400, {
        error: `Only active or review tasks accept messages (#${id} is ${existing.status})`,
      });
    }
    const agent = resolveAgentForTask(config, existing);
    if (!agent) {
      return json(res, 400, {
        error: "No enabled engineer agent is configured on the Agents page",
      });
    }
    const body = (await readBody(req)) as { text?: unknown; [key: string]: unknown };
    // #0684: the engineer message route resolves the agent from the task's
    // persisted overrides only — reject a body override instead of dropping it.
    if (rejectIgnoredOverrides(res, id, body)) return;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return json(res, 400, { error: "message text is required" });
    }
    if (existing.needsInput) {
      const cleared = patchTaskFile(config, existing.absPath, {
        needsInput: false,
      });
      index.applyFileChange(cleared.absPath);
    }
    let preamble: string | undefined;
    if (existing.branch) {
      const wtPath = worktreePathForBranch(config.root, existing.branch);
      if (wtPath) {
        preamble = resumePreamble(config, existing, existing.branch, wtPath) || undefined;
      }
    }
    const sendRes = runner.send(id, text, agent, { resumePreamble: preamble });
    if (!sendRes.ok && sendRes.busy) {
      return json(res, 409, { error: sendRes.reason ?? "agent is busy" });
    }
    if (!sendRes.ok) {
      return json(res, 400, {
        error: sendRes.reason ?? "could not send message",
      });
    }
    return json(res, 200, {
      ok: true,
      spawn: { ok: true, pid: sendRes.pid },
    });
  }

  if (action === "pause") {
    if (existing.status !== "active") {
      return json(res, 400, {
        error: `Only active tasks can be paused (#${id} is ${existing.status})`,
      });
    }
    const stopRes = runner.stop(id);
    // A human pause is legitimate: the task stays active with no process, so
    // tell the runner — the task watchdog must never disturb it (#0180).
    runner.markPaused(id);
    const updated = patchTaskFile(
      config,
      existing.absPath,
      {
        needsInput: false,
      },
      {
        onStatusChange: onServerStatusChange,
      },
    );
    index.applyFileChange(updated.absPath);
    return json(res, 200, {
      ok: true,
      task: index.getTask(updated.id),
      stopped: stopRes.stopped,
      reason: stopRes.reason,
    });
  }

  // Abandon (lifecycle audit, task-transitions.ts): active or review -> ready,
  // stopping any live agent/review first. Unlike pause (which stays active,
  // preserving the in-progress turn to resume later), abandon is a deliberate
  // "start this task's dev pass over" — the worktree is kept, not deleted, so
  // Start work can still resume from it, but the task no longer reads as
  // in-flight.
  if (action === "abandon") {
    if (existing.status !== "active" && existing.status !== "review") {
      return json(res, 400, {
        error: `Only active or review tasks can be abandoned (#${id} is ${existing.status})`,
      });
    }
    if (existing.status === "review") {
      reviews.cancel(id);
    }
    await previews.stop(id);
    const stopRes = runner.stop(id);
    const updated = patchTaskFile(
      config,
      existing.absPath,
      { status: "ready", needsInput: false, note: "task abandoned" },
      { onStatusChange: onServerStatusChange },
    );
    index.applyFileChange(updated.absPath);
    return json(res, 200, {
      ok: true,
      task: index.getTask(updated.id),
      stopped: stopRes.stopped,
      reason: stopRes.reason,
    });
  }

  // Archive / unarchive (#0657). Deliberately NOT a status transition: the
  // status, branch and worktree are all preserved, so an archived-from-review
  // task restores to the Review column unchanged. Archiving is refused while
  // any background machinery is holding the task (a live agent, an in-flight
  // review, a running preview, or a queued/running close-out), because hiding
  // a half-stopped run from the watchdog and dispatch would orphan it with no
  // one left to surface it. The user must stop work first.
  if (action === "archive") {
    if (existing.isArchived) {
      return json(res, 400, { error: `Task #${id} is already archived` });
    }
    if (runner.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} has a live agent run — stop work before archiving`,
      });
    }
    // A handoff finalization (scoped check → commit gate → review) is a live
    // server-side run that is no longer `isRunning()`. Hiding the task from
    // the index would orphan it mid-finalization, so refuse until it lands.
    if (runner.isHandoffInFlight(id) || runner.hasPendingHandoff(id)) {
      return json(res, 409, {
        error: `Task #${id} is finishing its handoff — wait for it to move to review before archiving`,
      });
    }
    if (reviews.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} has an in-progress review — stop work before archiving`,
      });
    }
    if (previews.get(id)) {
      return json(res, 409, {
        error: `Task #${id} has a running preview — stop it before archiving`,
      });
    }
    // Job files persist after close-out ends, so only a job that has not reached
    // a terminal phase counts: a finished (`done`) or `failed` job leaves the
    // task free to be parked.
    const closeOutJob = jobCoordinator.getJob(id);
    if (closeOutJob && closeOutJob.phase !== "done" && closeOutJob.phase !== "failed") {
      return json(res, 409, {
        error: `Task #${id} is in the close-out pipeline — wait for it to finish or cancel it before archiving`,
      });
    }
    const body = (await readBody(req)) as { detail?: unknown };
    const detail = typeof body?.detail === "string" ? body.detail.trim() : "";
    const updated = patchTaskFile(config, existing.absPath, {
      archived: true,
      archiveDetail: detail || null,
    });
    index.applyFileChange(updated.absPath);
    return json(res, 200, { ok: true, task: index.getTask(updated.id) });
  }

  if (action === "unarchive") {
    if (!existing.isArchived) {
      return json(res, 400, { error: `Task #${id} is not archived` });
    }
    // The branch/worktree may have been removed while the task was shelved
    // (a later GC, or a manual cleanup). Unarchive still restores the status;
    // it just warns that resuming will need a fresh worktree. Never repairs
    // the branch here — unarchive has no other side effects.
    const worktreeMissing = !!existing.branch && !existing.git?.worktreeExists;
    const updated = patchTaskFile(config, existing.absPath, { archived: false });
    index.applyFileChange(updated.absPath);
    return json(res, 200, {
      ok: true,
      task: index.getTask(updated.id),
      warning: worktreeMissing
        ? `Task #${id}'s worktree is gone; starting work will re-create it from the branch.`
        : undefined,
    });
  }

  // Reopen (lifecycle audit, task-transitions.ts): done -> ready. Close-out's
  // cleanup() deletes the task's branch and worktree, so re-provisioning them
  // here would just duplicate what Start work (ready -> active) already does
  // — clear the now-stale branch reference and land on ready instead, so the
  // next Start work derives a fresh branch exactly like a brand-new task.
  if (action === "reopen") {
    if (existing.status !== "done") {
      return json(res, 400, {
        error: `Only done tasks can be reopened (#${id} is ${existing.status})`,
      });
    }
    const updated = patchTaskFile(
      config,
      existing.absPath,
      { status: "ready", branch: "", needsInput: false },
      { onStatusChange: onServerStatusChange },
    );
    index.applyFileChange(updated.absPath);
    return json(res, 200, { ok: true, task: index.getTask(updated.id) });
  }

  if (action === "hotfix") {
    if (existing.status !== "ready" && !existing.hotfix) {
      return json(res, 400, {
        error: `Only ready tasks can be switched to hotfix (#${id} is ${existing.status})`,
      });
    }

    if (existing.hotfix) {
      return json(res, 400, {
        error: `Task #${id} is already in hotfix mode`,
      });
    }

    const body = (await readBody(req)) as { hotfixTarget?: unknown };
    const hotfixTarget: "branch" | "main" = body?.hotfixTarget === "main" ? "main" : "branch";

    const branch = `hotfix/${existing.id}-${existing.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40)}`;

    const rootLock = ctx.rootLock;
    if (!rootLock.acquire(existing.id, "hotfix")) {
      const holder = rootLock.getHolder();
      return json(res, 409, {
        error: `The main checkout is held by ${holder?.kind ?? "another operation"} (task #${holder?.taskId ?? "unknown"}) — wait for it to finish`,
      });
    }

    let dirty: string[];
    try {
      dirty = await mainDirtyFilesForCloseOut(config.root, config);
    } catch (err) {
      rootLock.release(existing.id);
      if (err instanceof GitDirtyCheckError) {
        return json(res, 409, {
          error: `could not verify main is clean before hotfix (${err.message}). Commit or stash first.`,
          needsCommit: true,
          dirtyCheckFailed: true,
          causeKind: err.causeKind,
        });
      }
      throw err;
    }
    if (dirty.length > 0) {
      rootLock.release(existing.id);
      return json(res, 409, {
        error: `main has ${dirty.length} uncommitted file${dirty.length === 1 ? "" : "s"} — commit or stash before starting a hotfix`,
        needsCommit: true,
        dirtyFiles: dirty,
      });
    }

    // The lock must precede `ensureHotfix`: checking out the hotfix branch is
    // itself a mutation of the root checkout and can race a close-out merge.
    const hotfixRes = ensureHotfix(config.root, branch, hotfixTarget);
    if (!hotfixRes.ok) {
      rootLock.release(existing.id);
      return json(res, 400, {
        error: `Cannot switch to hotfix: ${hotfixRes.reason ?? "unknown reason"}`,
      });
    }

    let updated: Task;
    try {
      updated = patchTaskFile(
        config,
        existing.absPath,
        {
          hotfix: true,
          hotfixTarget,
          branch,
        },
        {
          onStatusChange: onServerStatusChange,
        },
      );
    } catch (err) {
      rootLock.release(existing.id);
      throw err;
    }
    index.applyFileChange(updated.absPath);
    index.refreshBranches();

    return json(res, 200, {
      ok: true,
      task: index.getTask(updated.id),
      branch,
      hotfixTarget,
    });
  }

  return json(res, 400, { error: `Unknown action: ${action}` });
};

// Preview routes
export const startPreview: RouteHandler = async (ctx, req, res, params) => {
  const { index, previews } = ctx;
  const id = params.param1;
  const t = index.getTask(id);
  if (!t) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  // The drawer's picker passes the chosen target when the task's area matches
  // more than one (#0379); omitting it starts the first match.
  const body = (await readBody(req)) as { target?: unknown };
  const target =
    typeof body?.target === "string" && body.target.trim() ? body.target.trim() : undefined;
  const result = await previews.start(t, target);
  if (!result.ok) {
    return json(res, 400, { error: result.error ?? "could not start preview" });
  }
  return json(res, 200, {
    ok: true,
    port: result.port,
    url: result.url,
    label: result.label,
    ...(result.overrides?.length ? { overrides: result.overrides } : {}),
    ...(result.services?.length ? { services: result.services } : {}),
  });
};

export const stopPreview: RouteHandler = async (ctx, _req, res, params) => {
  const { previews } = ctx;
  const id = params.param1;
  await previews.stop(id);
  return json(res, 200, { ok: true });
};

// Review routes
export const getTaskReview: RouteHandler = (ctx, _req, res, params) => {
  const { reviews } = ctx;
  const id = params.param1;
  return json(res, 200, {
    ok: true,
    running: reviews.isRunning(id),
    enabled: reviews.enabled(),
    review: reviews.read(id),
    history: reviews.listPasses(id),
    lines: reviews.session(id),
  });
};

export const dismissNeedsInput: RouteHandler = async (ctx, req, res, params) => {
  const { config, index } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const user = getCurrentUser(req, config)?.email ?? "human";
  try {
    const updated = dismissNeedsInputOnTask(config, existing.absPath, user);
    index.applyFileChange(updated.absPath, { guarded: true });
    return json(res, 200, index.getTask(updated.id));
  } catch (err) {
    if (err instanceof WriteError) {
      return json(res, 400, { error: err.message });
    }
    throw err;
  }
};

/**
 * Clear a worktree that close-out kept (`closeout-worktree-dirty`): force-remove
 * it, delete its branch, and dismiss the flag. Only for a `done` task whose
 * branch is already an ancestor of main, so the only thing lost is bytes the
 * merge did not carry — which the human has just chosen to discard.
 */
export const clearKeptWorktree: RouteHandler = async (ctx, req, res, params) => {
  const { config, index } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  if (existing.needsInputReason !== "closeout-worktree-dirty") {
    return json(res, 400, { error: "Task has no kept close-out worktree to clear" });
  }
  const branch = existing.branch;
  if (existing.status !== "done" || !branch) {
    return json(res, 400, { error: "Only a done task with a recorded branch can be cleared" });
  }
  const root = config.root;
  const mainBranch = ["main", "master"].find((name) => isAncestor(root, name, name) === true);
  if (!mainBranch || isAncestor(root, branch, mainBranch) !== true) {
    return json(res, 409, {
      error: `Branch ${branch} is not merged into ${mainBranch ?? "main"} — refusing to discard its worktree`,
    });
  }
  if (!removeWorktree(root, branch, { force: true })) {
    return json(res, 500, { error: `Could not remove the worktree for ${branch}` });
  }
  pruneWorktrees(root);
  deleteBranch(root, branch);
  const user = getCurrentUser(req, config)?.email ?? "human";
  try {
    const updated = dismissNeedsInputOnTask(
      config,
      existing.absPath,
      `${user} (cleared kept worktree)`,
    );
    index.applyFileChange(updated.absPath, { guarded: true });
    return json(res, 200, index.getTask(updated.id));
  } catch (err) {
    if (err instanceof WriteError) {
      return json(res, 400, { error: err.message });
    }
    throw err;
  }
};

export const reviewAgain: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner, reviews } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  if (existing.status !== "review") {
    return json(res, 400, {
      error: `Only review tasks can be re-reviewed (#${id} is ${existing.status})`,
    });
  }
  if (existing.isArchived) {
    return json(res, 400, {
      error: `Task #${id} is archived — unarchive it before starting a review`,
    });
  }
  if (runner.isRunning(id)) {
    return json(res, 409, {
      error: `Task #${id} has an agent turn in progress — wait for it to finish`,
    });
  }
  const gate = reviews.canRun(existing);
  if (!gate.ok) {
    return json(res, 400, {
      error: gate.reason ?? "could not start the review",
    });
  }
  let task = existing;
  let needsClear = existing.needsInput;
  if (!needsClear) {
    try {
      const fresh = parseTask({
        content: readFileSync(existing.absPath, "utf8"),
        absPath: existing.absPath,
        root: config.root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
      });
      needsClear = fresh.needsInput;
    } catch {
      // Fall back to the indexed snapshot.
    }
  }
  if (needsClear) {
    const user = getCurrentUser(req, config)?.email ?? "human";
    try {
      const updated = clearNeedsInputForReviewAgainOnTask(config, existing.absPath, user);
      index.applyFileChange(updated.absPath, { guarded: true });
      task = index.getTask(updated.id) ?? updated;
    } catch (err) {
      if (err instanceof WriteError) {
        return json(res, 400, { error: err.message });
      }
      throw err;
    }
  }
  void reviews.run(task);
  return json(res, 200, { ok: true, task });
};

export const reviewMessage: RouteHandler = async (ctx, req, res, params) => {
  const { index, reviews } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  if (existing.status !== "review") {
    return json(res, 400, {
      error: `Only review tasks accept reviewer messages (#${id} is ${existing.status})`,
    });
  }
  if (existing.isArchived) {
    return json(res, 400, {
      error: `Task #${id} is archived — unarchive it before messaging its reviewer`,
    });
  }
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }
  const gate = reviews.canSend(existing);
  if (!gate.ok) {
    return json(res, 400, {
      error: gate.reason ?? "could not send to the reviewer",
    });
  }
  void reviews.send(existing, text);
  return json(res, 200, { ok: true });
};

export const getCTO: RouteHandler = (ctx, _req, res) => {
  const { cto } = ctx;
  return json(res, 200, {
    ok: true,
    running: cto.isRunning(),
    enabled: cto.enabled(),
    report: cto.read(),
    lines: cto.session(),
  });
};

export const ctoMessage: RouteHandler = async (ctx, req, res) => {
  const { cto } = ctx;
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }
  if (cto.isRunning()) {
    return json(res, 409, { error: "a CTO run is already in progress" });
  }
  if (!cto.enabled()) {
    return json(res, 400, { error: "the CTO agent is disabled" });
  }
  void cto.send(text);
  return json(res, 200, { ok: true });
};

/** Interrupt a running CTO response. Idempotent. */
export const ctoInterrupt: RouteHandler = (ctx, _req, res) => {
  const result = ctx.cto.interrupt();
  return json(res, 200, { ok: true, ...result });
};

/** Run one allowlisted CTO safe action (#0688). */
export const runCtoSafeActionRoute: RouteHandler = async (ctx, req, res, params) => {
  const actionId = params.param1;
  const body = (await readBody(req)) as { taskId?: unknown };
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : null;
  const { runCtoSafeAction } = await import("../cto-actions.js");
  const rates = ctx.ctoActionRates;
  if (!rates || !ctx.attentionEvents) {
    return json(res, 500, { error: "CTO action services are not available" });
  }
  const result = await runCtoSafeAction(
    {
      config: ctx.config,
      index: ctx.index,
      runner: ctx.runner,
      jobCoordinator: ctx.jobCoordinator,
      attentionEvents: ctx.attentionEvents,
      rates,
      logger: ctx.logger,
      emitEvent: ctx.emitEvent,
      triggerJobProcessing: ctx.triggerJobProcessing,
      reportedStages: ctx.reportedStages,
    },
    actionId,
    { taskId, actor: "human" },
  );
  if (!result.ok) {
    const status = result.rateLimited ? 429 : 400;
    return json(res, status, { ok: false, error: result.reason, rateLimited: result.rateLimited });
  }
  return json(res, 200, { ok: true, detail: result.detail });
};

/**
 * Build the "newly attached screenshots" fragment appended to the PM's task
 * context (#0382). Each entry surfaces the API URL and the repo-relative
 * path so the PM can either link them or quote them when editing the spec.
 * Empty/missing url+path combos are silently dropped. Returns an empty
 * string when there are no usable screenshots, leaving the prompt unchanged
 * for plain text messages.
 */
export function buildPmShotContext(incoming: ReadonlyArray<unknown>): string {
  const lines: string[] = [];
  for (const raw of incoming) {
    if (!raw || typeof raw !== "object") continue;
    const url =
      typeof (raw as { url?: unknown }).url === "string" ? (raw as { url: string }).url.trim() : "";
    const path =
      typeof (raw as { path?: unknown }).path === "string"
        ? (raw as { path: string }).path.trim()
        : "";
    if (!url && !path) continue;
    const bits: string[] = [];
    if (url) bits.push(`url=${url}`);
    if (path) bits.push(`repo-path=${path}`);
    lines.push(`- ${bits.join(" ")}`);
  }
  if (!lines.length) return "";
  return `\nNewly attached screenshots (already saved to this task — link them in the spec if relevant):\n${lines.join("\n")}\n`;
}

/** Story name + definition path (when a `stories/*.md` exists) for a task's `story` tag. */
function storyContextFor(
  config: RepoOSConfig,
  story: string | undefined,
): { name: string; path?: string } | undefined {
  const name = story?.trim();
  if (!name) return undefined;
  try {
    const def = findStoryDefinitionByKey(config, storyKey(name));
    return def ? { name: def.name, path: def.path } : { name };
  } catch {
    return { name };
  }
}

export const pmMessage: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner, logger, emitEvent } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }

  // v2 deliberately starts a clean PM conversation: older PM chats were
  // incorrectly launched with Ross's read-only mission. When auth is on,
  // each user gets their own PM conversation per task (0248) — otherwise
  // teammates sharing one instance would all read and post into the same
  // thread. Falls back to the unscoped id when auth is off, matching every
  // existing single-user setup exactly as before.
  const currentUserEmail = getCurrentUser(req, config)?.email;
  const pmSessionId = currentUserEmail
    ? `pm-task-v2:${id}::${currentUserEmail}`
    : `pm-task-v2:${id}`;
  const body = (await readBody(req)) as Record<string, unknown>;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }

  const rawAnsweringQuestions = Array.isArray(body?.answeringQuestions)
    ? (body.answeringQuestions as unknown[])
    : [];
  const answeringQuestions = rawAnsweringQuestions.filter(
    (q): q is string => typeof q === "string" && q.trim().length > 0,
  );
  if (
    answeringQuestions.length > 0 &&
    !answeringQuestionsMatchTask(answeringQuestions, existing.questions)
  ) {
    return json(res, 400, {
      error: "answeringQuestions must match this task's open questions",
    });
  }
  const baseMessageText =
    answeringQuestions.length > 0
      ? wrapPmMessageWithQuestionContext(answeringQuestions, text)
      : text;
  // The canned "flesh this out" chip carries no spec; tell the PM exactly what
  // the underspecified check requires so one pass satisfies it.
  const messageText =
    text === PM_FLESH_OUT_MESSAGE
      ? `${baseMessageText}\n\n${fleshOutRequirementsPrompt(storyContextFor(config, existing.story), existing.area)}`
      : baseMessageText;

  // Build a one-shot agent override for this PM request. Falls back to the
  // task's persisted PM overrides (set via the PM tab's selector) when the
  // client doesn't pass explicit values.
  const pmAgentName =
    typeof body?.agentOverride === "string" && body.agentOverride
      ? body.agentOverride
      : existing.pmAgentOverride || undefined;
  const pmCli =
    typeof body?.cliOverride === "string" && body.cliOverride
      ? body.cliOverride
      : existing.pmCliOverride || undefined;
  const pmModel =
    typeof body?.modelOverride === "string" && body.modelOverride
      ? body.modelOverride
      : existing.pmModelOverride || undefined;
  // "default" is the sentinel the PM tab's model dropdown offers for "use
  // the configured pm agent's own model" — NOT a real pin. Treating it as
  // truthy here force-overwrites the base agent's actual configured model
  // with the literal string "default", which then skips --model entirely
  // and falls back to the CLI's own raw default instead of what's
  // configured on the Agents page (same bug fixed in resolveAgentForTask /
  // resolveReviewerForTask).
  const pmModelPinned = isModelOverridePinned(pmModel);
  const hasPmOverride = pmAgentName || pmCli || pmModelPinned;

  // Resolve the PM agent, applying any one-shot override
  let pm: Agent | null;
  if (hasPmOverride) {
    const list = agentsForConfig(config);
    const baseName = pmAgentName || "pm";
    const base = list.find((a) => a.enabled && a.name === baseName) ?? null;
    pm = base ? mergeAgentOverride(base, pmCli, pmModel) : null;
  } else {
    pm = resolvePmAgent(config);
  }
  if (!pm) {
    return json(res, 400, {
      error: "PM agent is not configured — enable it on the Agents page",
    });
  }

  // Antigravity is worktree-bound for every turn, including an existing PM
  // chat. Refuse to fall back to the main checkout when a task has no managed
  // worktree or its registration has gone stale.
  let pmCwd: string | undefined;
  if (pm.cli === "antigravity") {
    if (!existing.branch) {
      return json(res, 400, {
        error: "Antigravity PM chat requires a managed task worktree",
      });
    }
    pmCwd = worktreePathForBranch(config.root, existing.branch) ?? undefined;
    if (!pmCwd) {
      return json(res, 400, {
        error: `No managed worktree exists for task #${id}; start the task before using Antigravity PM chat`,
      });
    }
  }

  // 0381: chat-input screenshots ride along as a pending batch keyed to this
  // PM session. The task the PM creates from the message doesn't exist yet,
  // so the batch is parked on disk now and attached to the created task by
  // the server's task.created hook while the session is still running.
  const rawImages = Array.isArray(body?.images) ? (body?.images as IncomingPmImage[]) : [];
  let imageBatchId: string | null = null;
  if (rawImages.length > 0) {
    const queuedImages = queuePmImages(config, pmSessionId, rawImages);
    imageBatchId = queuedImages.batchId;
    if (queuedImages.errors.length > 0) {
      // Best-effort: a rejected image never blocks the message itself.
      logger.task(id, "warn", "Some PM chat attachments were rejected", {
        errors: queuedImages.errors,
      });
    }
  }

  // Build context about the current task for the PM
  const taskContext = `Task #${id}: ${existing.title}
Status: ${existing.status}
Priority: ${existing.priority || "unset"}
Area: ${existing.area || "unset"}
Type: ${existing.type || "unset"}

Description:
${existing.body || "(no description)"}`;

  // #0382: the PM tab's attach button lets the user upload screenshots that
  // arrive as a `screenshots` array of {url,path} on this message. They are
  // already persisted in the task's `## Screenshots` section (and on disk) by
  // `POST /api/tasks/:id/attachments`; we surface them here so the PM agent
  // knows what to reference or link into the spec when relevant. Empty/missing
  // keys are silently ignored — a plain text message stays a plain text
  // message.
  const shotContext = buildPmShotContext(Array.isArray(body?.screenshots) ? body.screenshots : []);

  const fullContext = `${taskContext}${shotContext}`;

  const existing_session = runner.output(pmSessionId);
  const result = existing_session
    ? runner.send(pmSessionId, messageText, pm, {
        resumePreamble: `Task context:\n${fullContext}`,
        ...(pmCwd ? { cwd: pmCwd } : {}),
      })
    : runner.startChat(pmSessionId, messageText, pm, fullContext, taskPmPrompt, {
        ...(pmCwd ? { cwd: pmCwd } : {}),
      });

  if (!result.ok && result.busy) {
    dropPmImages(imageBatchId);
    return json(res, 409, { error: result.reason ?? "PM is busy" });
  }
  if (!result.ok) {
    dropPmImages(imageBatchId);
    return json(res, 400, {
      error: result.reason ?? "could not send message to PM",
    });
  }

  if (existing.needsInput && needsInputClearsOnPmMessage(existing.needsInputReason)) {
    const cleared = patchTaskFile(config, existing.absPath, {
      needsInput: false,
    });
    index.applyFileChange(cleared.absPath);
  }

  // 0381: the runner accepted the turn (running now, or queued behind
  // maxConcurrentAgents) — flag the task so its card and panel show "PM is
  // working". Cleared by the emit hook in server.ts when the runner reports
  // the session's exit (success, error, or user interrupt).
  markPmChatSession(pmSessionId, id);
  emitEvent({ type: "task.pmWorking", id, at: new Date().toISOString() });

  return json(res, 200, { ok: true, spawn: { ok: true, pid: result.pid } });
};

/**
 * Interrupt a running PM response about a task. Resolves the same per-user PM
 * session id as `pmMessage` and stops the in-flight agent turn. Idempotent.
 */
export const pmInterrupt: RouteHandler = (ctx, req, res, params) => {
  const { config, index, runner } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const currentUserEmail = getCurrentUser(req, config)?.email;
  const pmSessionId = currentUserEmail
    ? `pm-task-v2:${id}::${currentUserEmail}`
    : `pm-task-v2:${id}`;
  const result = runner.interrupt(pmSessionId);
  return json(res, 200, { ok: true, ...result });
};

export const getIntegrationJob: RouteHandler = (ctx, _req, res, params) => {
  const { jobCoordinator } = ctx;
  const id = params.param1;
  const job = jobCoordinator.getJob(id);
  if (!job) {
    return json(res, 404, { error: `No integration job for task #${id}` });
  }
  const pendingJobs = pendingCloseOutJobs(jobCoordinator.allJobs());
  const queuePos = pendingJobs.findIndex((j) => j.taskId === job.taskId);
  return json(res, 200, {
    ok: true,
    job: {
      taskId: job.taskId,
      phase: job.phase,
      enqueuedAt: job.enqueuedAt,
      startedAt: job.startedAt,
      baseMainSha: job.baseMainSha,
      branchSha: job.branchSha,
      candidateSha: job.candidateSha,
      reason: job.reason,
      logPath: job.logPath,
      queuePosition: queuePos,
      queueLength: pendingJobs.length,
    },
  });
};

/**
 * Durable close-out outcomes (#0640), newest first — the notices bell's
 * backstop for a tab that was closed while a Move to done ran. The live path
 * is the `close-out.outcome` SSE event; this hydrates on load and reconnect.
 */
export const getCloseOutOutcomes: RouteHandler = (ctx, _req, res) => {
  // Prefer the server's shared instance: it mirrors recorded events in memory,
  // so a failed disk write is still backfilled for the life of the process.
  const store =
    ctx.closeOutOutcomes ?? createCloseOutOutcomeStore(ctx.config.root, ctx.config.cacheDir);
  return json(res, 200, { ok: true, outcomes: store.list() });
};

export const getIntegrationJobs: RouteHandler = (ctx, _req, res) => {
  const allJobs = ctx.jobCoordinator.allJobs();
  const pendingJobs = pendingCloseOutJobs(allJobs);
  const pendingIndex = new Map(pendingJobs.map((job, idx) => [job.taskId, idx]));
  return json(res, 200, {
    ok: true,
    jobs: allJobs.map((job) => ({
      taskId: job.taskId,
      phase: job.phase,
      enqueuedAt: job.enqueuedAt,
      startedAt: job.startedAt,
      reason: job.reason,
      logPath: job.logPath,
      failedPhase: job.failedPhase,
      failedAt: job.failedAt,
      debugTldr: job.debugTldr,
      queuePosition: pendingIndex.get(job.taskId) ?? -1,
    })),
    queueLength: pendingJobs.length,
  });
};

/**
 * Full integration-pipeline snapshot for the pinned status bar (0207).
 * Reads the same live `reportedStages` map the SSE push path uses, so a
 * page refresh mid-pipeline shows the job's actual current sub-step (e.g.
 * "check", mid-test-run) rather than falling back to a coarse per-phase
 * guess (0207 follow-up — see RouteContext.reportedStages).
 */
export const getIntegrationPipeline: RouteHandler = (ctx, _req, res) => {
  return json(res, 200, {
    ok: true,
    pipeline: buildIntegrationSnapshot(
      ctx.jobCoordinator,
      ctx.reportedStages,
      resolvePipelineCheckPlan(ctx.config),
    ),
  });
};

/**
 * Retry a failed integration job (0207). Reuses the coordinator's existing
 * retry path: `enqueue` re-enqueues a `failed` job as a fresh queued job
 * (see integration-job.ts), then processing resumes from the queue.
 */
/**
 * Refresh the primary checkout's dependency install, then re-queue a failed
 * close-out (#0674). Used by the "Refresh install and retry" action on
 * environment-classified failures.
 */
export const refreshInstallAndRetryIntegration: RouteHandler = async (ctx, _req, res, params) => {
  const { jobCoordinator, config } = ctx;
  const id = params.param1;
  const task = ctx.index.getTask(id);
  if (!task) {
    return json(res, 404, { error: `Task #${id} not found` });
  }

  const { requeueCloseOutAfterEnvFix } = await import("../close-out-requeue.js");
  const result = await requeueCloseOutAfterEnvFix(config, jobCoordinator, task);
  if (!result.ok) {
    const status = result.reason.includes("not in a failed") ? 409 : 400;
    return json(res, status, { error: result.reason });
  }

  const reenqueued = jobCoordinator.getJob(id);
  ctx.emitEvent({
    type: "integration",
    pipeline: buildIntegrationSnapshot(jobCoordinator, {}, resolvePipelineCheckPlan(ctx.config)),
  });
  ctx.triggerJobProcessing();
  return json(res, 200, {
    ok: true,
    job: reenqueued
      ? {
          taskId: reenqueued.taskId,
          phase: reenqueued.phase,
          enqueuedAt: reenqueued.enqueuedAt,
        }
      : undefined,
  });
};

export const retryIntegration: RouteHandler = (ctx, _req, res, params) => {
  const { jobCoordinator } = ctx;
  const id = params.param1;
  const job = jobCoordinator.getJob(id);
  if (!job) {
    return json(res, 404, { error: `No integration job for task #${id}` });
  }
  if (job.phase !== "failed") {
    return json(res, 409, {
      error: `Task #${id} is not in a failed integration state (it is ${job.phase})`,
    });
  }
  const task = ctx.index.getTask(id);
  if (!task) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const reenqueued = jobCoordinator.enqueue(task);
  if (!reenqueued) {
    return json(res, 400, { error: `Task #${id} has no branch to integrate` });
  }
  ctx.emitEvent({
    type: "integration",
    pipeline: buildIntegrationSnapshot(jobCoordinator, {}, resolvePipelineCheckPlan(ctx.config)),
  });
  ctx.triggerJobProcessing();
  return json(res, 200, {
    ok: true,
    job: {
      taskId: reenqueued.taskId,
      phase: reenqueued.phase,
      enqueuedAt: reenqueued.enqueuedAt,
    },
  });
};

/**
 * Stop an in-flight close-out (#0459). Marks the integration job cancelled so
 * the running orchestrator aborts at its next checkpoint (killing any running
 * build/check child), and drops a not-yet-started job immediately. The task is
 * left in `review` with its feature branch/worktree intact — nothing is merged
 * — so "Move to done" can be clicked again.
 */
/** Discard post-handoff edits by resetting the feature worktree to the handoff SHA (#0598). */
export const discardWorktreeHandoff: RouteHandler = async (ctx, _req, res, params) => {
  const { config, index } = ctx;
  const id = params.param1;
  const task = index.getTask(id);
  if (!task?.branch) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const result = await discardWorktreeHandoffChanges(config, id, task.branch);
  if (!result.ok) {
    return json(res, 400, { error: result.reason });
  }
  return json(res, 200, { ok: true });
};

export const cancelDone: RouteHandler = (ctx, _req, res, params) => {
  const { jobCoordinator, index, config } = ctx;
  const id = params.param1;
  const task = index.getTask(id);
  if (!task) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const job = jobCoordinator.getJob(id);
  if (!job) {
    return json(res, 404, { error: `Task #${id} is not in the close-out pipeline` });
  }
  if (job.phase === "done") {
    return json(res, 409, { error: `Task #${id} already finished close-out` });
  }
  if (job.cancelled) {
    return json(res, 200, { ok: true, alreadyCancelled: true });
  }
  // Once the merge has committed, the close-out has effectively landed; all
  // that remains is bookkeeping. Refusing here is honest — cancelling would
  // not undo the merge.
  if (job.phase === "cleanup") {
    return json(res, 409, {
      error: `Task #${id} already merged into main and is finishing up; it cannot be stopped now`,
    });
  }

  jobCoordinator.requestCancel(id);
  // A queued job has no orchestrator watching it yet, so cancel it outright
  // rather than leaving it for a future drain to pick up and cancel.
  if (job.phase === "queued") {
    jobCoordinator.removeJob(id);
  }

  const snap =
    config.root && config.cacheDir ? readHandoffSnapshot(config.root, config.cacheDir, id) : null;
  if (snap) {
    writeWorktreeReviewLock(config.root, config.cacheDir, id, {
      status: "review",
      sha: snap.sha,
      at: snap.at,
    });
  }

  // The snapshot hides cancelled jobs, so this event drops the task out of the
  // pipeline bar (and re-enables the drawer's Move to done) immediately.
  ctx.emitEvent({
    type: "integration",
    pipeline: buildIntegrationSnapshot(jobCoordinator, {}, resolvePipelineCheckPlan(ctx.config)),
  });
  return json(res, 200, { ok: true });
};

// Session stats endpoints
export const getTaskStats: RouteHandler = (ctx, _req, res, params) => {
  const { runner } = ctx;
  const taskId = params.param1;
  const stats = runner.taskStats(taskId);
  if (!stats) {
    return json(res, 404, { error: `No stats found for task #${taskId}` });
  }
  return json(res, 200, { ok: true, stats });
};

export const getSessionTypeStats: RouteHandler = (ctx, _req, res) => {
  const { runner } = ctx;
  const stats = runner.sessionTypeStats();
  return json(res, 200, { ok: true, stats });
};

export const getBoardStats: RouteHandler = (ctx, req, res) => {
  const { runner } = ctx;
  // ?range=1d|7d|30d|all (0334) — trailing window on sessions.startedAt;
  // omitted or "all" means the unfiltered pre-range behavior.
  const raw = new URL(req.url ?? "/", "http://localhost").searchParams.get("range");
  let range: UsageRange = "all";
  if (raw !== null) {
    if (raw === "1d" || raw === "7d" || raw === "30d" || raw === "all") {
      range = raw;
    } else {
      return json(res, 400, {
        error: `Invalid range '${raw}' — expected 1d, 7d, 30d, or all`,
      });
    }
  }
  const stats = runner.boardStats(range);
  return json(res, 200, { ok: true, stats });
};

export const getDailyTotals: RouteHandler = (ctx, _req, res) => {
  const { runner } = ctx;
  const stats = runner.dailyTotals();
  return json(res, 200, { ok: true, stats });
};

// Diff stats endpoint
export const getDiffStatsForTask: RouteHandler = async (ctx, _req, res, params) => {
  const { index, config } = ctx;
  const id = params.param1;
  const task = index.getTask(id);
  if (!task) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  if (!task.branch) {
    return json(res, 200, {
      ok: true,
      stats: { filesChanged: 0, additions: 0, deletions: 0 },
      noBranch: true,
    });
  }
  const worktreePath = worktreePathForBranch(config.root, task.branch);
  if (!worktreePath) {
    const snapshot =
      task.status === "done" ? loadDiffSnapshot(config.root, config.cacheDir, task.id) : null;
    if (snapshot) {
      return json(res, 200, {
        ok: true,
        stats: snapshot.stats,
        snapshot: true,
      });
    }
    return json(res, 200, {
      ok: true,
      stats: { filesChanged: 0, additions: 0, deletions: 0 },
      noWorktree: true,
    });
  }
  // Async (spawn-based) rather than the sync/execFileSync getDiffStats: every
  // card on the Work board fires this on mount, and the synchronous version
  // blocked the whole event loop for each one serially — including whatever
  // GET /api/tasks/:id a drawer-opening click was waiting behind.
  const stats = await getDiffStatsAsync(worktreePath, "main");
  return json(res, 200, { ok: true, stats });
};

// Uncommitted files in a task's worktree, on demand (#0512).
//
// Deliberately a request-time `git status` and not a field on the task index:
// `dirty` already tells the UI that a restart needs a decision, and the boot
// index's per-worktree git fan-out is a known cost (#0271) that this must not
// grow. The restart dialog is opened by a human click, so one status call
// there is the right place to spend it — and it is the call that can say WHICH
// files "Start clean" would destroy.
export const getWorktreeDirtyForTask: RouteHandler = async (ctx, _req, res, params) => {
  const { index, config } = ctx;
  const id = params.param1;
  const task = index.getTask(id);
  if (!task) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  if (!task.branch) {
    return json(res, 200, { ok: true, path: null, files: [] });
  }
  const path = worktreePathForBranch(config.root, task.branch);
  if (!path) {
    return json(res, 200, { ok: true, path: null, files: [] });
  }
  try {
    const files = await uncommittedWorkFiles(path, workFileFilter(config));
    return json(res, 200, { ok: true, path, files });
  } catch (err) {
    if (err instanceof GitDirtyCheckError) {
      // Fails closed: "could not tell" must never read as "nothing to lose".
      return json(res, 200, {
        ok: false,
        path,
        files: [],
        reason: `could not read the worktree's dirty state (${err.message})`,
      });
    }
    throw err;
  }
};

// Diff endpoint — full patch
export const getDiffForTask: RouteHandler = async (ctx, _req, res, params) => {
  const { index, config } = ctx;
  const id = params.param1;
  const task = index.getTask(id);
  if (!task) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  if (!task.branch) {
    return json(res, 200, {
      ok: true,
      diff: { patch: "", truncated: false },
      noBranch: true,
    });
  }
  const worktreePath = worktreePathForBranch(config.root, task.branch);
  if (!worktreePath) {
    const snapshot =
      task.status === "done" ? loadDiffSnapshot(config.root, config.cacheDir, task.id) : null;
    if (snapshot) {
      return json(res, 200, { ok: true, diff: snapshot.diff, snapshot: true });
    }
    return json(res, 200, {
      ok: true,
      diff: { patch: "", truncated: false },
      noWorktree: true,
    });
  }
  const diff = await getDiff(worktreePath, "main");
  return json(res, 200, { ok: true, diff });
};

/**
 * The task branch's live merge conflict against main, as a diff-shaped patch
 * the Debug tab's "Merge conflict" view renders (empty once resolved).
 */
export const getMergeConflictForTask: RouteHandler = async (ctx, _req, res, params) => {
  const { index, config } = ctx;
  const task = index.getTask(params.param1);
  if (!task) return json(res, 404, { error: `Task #${params.param1} not found` });
  if (!task.branch) {
    return json(res, 200, {
      ok: true,
      conflict: { ok: true, conflicted: false, patch: "", files: [], truncated: false },
    });
  }
  // Task bookkeeping under `work/` is auto-resolved by close-out, never a real conflict.
  const conflict = await computeMergeConflict(config.root, task.branch, {
    ignorePrefixes: [`${config.workDir}/`],
  });
  return json(res, 200, { ok: true, conflict });
};

/** Return one file's committed contents from the task's before/after revisions. */
export const getTaskFile: RouteHandler = async (ctx, req, res, params) => {
  const { index, config } = ctx;
  const task = index.getTask(params.param1);
  if (!task) return json(res, 404, { error: `Task #${params.param1} not found` });
  if (!task.branch) return json(res, 200, { ok: true, content: "", exists: false, noBranch: true });

  const url = new URL(req.url ?? "/", "http://localhost");
  const rawPath = url.searchParams.get("path");
  const version = url.searchParams.get("version");
  if (!rawPath || (version !== "before" && version !== "after")) {
    return json(res, 400, { error: "path and version=before|after are required" });
  }

  const path = rawPath.replace(/^(?:a|b)\//, "");
  if (!path || path.startsWith("/") || path.split("/").some((part) => part === "..")) {
    return json(res, 400, { error: "Invalid file path" });
  }

  const worktreePath = worktreePathForBranch(config.root, task.branch);
  if (!worktreePath) {
    return json(res, 200, { ok: true, content: "", exists: false, noWorktree: true });
  }
  const ref = version === "before" ? "main" : "HEAD";
  const result = await runGit(worktreePath, ["show", `${ref}:${path}`], 10_000);
  if (result.status !== 0) {
    return json(res, 200, { ok: true, content: "", exists: false });
  }
  return json(res, 200, { ok: true, content: result.stdout, exists: true });
};
