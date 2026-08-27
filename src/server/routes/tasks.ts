import type { Status, Agent, Task } from "../../core/types.js";
import type { RouteHandler } from "./types.js";
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
  runPrompt,
  deriveBranch,
  isModelOverridePinned,
  estimateCostUsd,
  type PromptResult,
} from "../agents.js";
import { getRepoOSDb } from "../../core/db.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "../freeform.js";
import { getCurrentUser } from "./auth.js";
import { withOriginalPromptSection } from "../../core/repoos.js";
import { commitTaskFile, commitDirtyFiles, dirtyFiles, worktreePathForBranch, ensureWorktree, resetWorktree, getDiffStatsAsync, getDiff, GitDirtyCheckError, ensureHotfix, agentTouchedFiles } from "../../core/git.js";
import { guardReviewTransition } from "../review-guard.js";
import { checkGenericStatusPatch } from "../task-transitions.js";
import { readFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { releaseBranchless, isBranchlessReleaseEligible } from "../branchless-release.js";
import { bootstrap } from "../../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../../core/context-pack.js";
import { appendScreenshotsSection, mimeForExtension, resolveScreenshot, saveScreenshot } from "../attachments.js";
import { STATUSES } from "../../core/types.js";
import { parseTask } from "../../core/task.js";
import { buildIntegrationSnapshot } from "../integration-status.js";
import { loadDiffSnapshot } from "../diff-snapshot.js";

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

export const getTasks: RouteHandler = (ctx, req, res) => {
  const { index, reviews } = ctx;
  const url = new URL(req.url ?? "/", "http://localhost");
  const status = url.searchParams.get("status") as Status | null;
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return json(res, 400, { error: `Invalid status "${status}"` });
  }
  const tasks = index.getTasks(status ?? undefined).map((t) => withReviewStatus(t, reviews));
  return json(res, 200, tasks);
};

export const createTask: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index, logger } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  if (!body.title || typeof body.title !== "string") {
    return json(res, 400, { error: "title is required" });
  }
  const taskBody = typeof body.body === "string" ? body.body : undefined;
  // The client-side "Save as draft" freeform path posts the raw prompt as the
  // body with status `draft` (no client change allowed, see #0251). Treat that
  // as `originalPrompt` so the raw capture is stored under `## Original prompt`.
  const originalPrompt =
    body.status === "draft"
      ? (typeof body.originalPrompt === "string" && body.originalPrompt
          ? body.originalPrompt
          : taskBody)
      : undefined;
  const created = repoos.createTask({
    title: body.title,
    type: body.type as string | undefined,
    area: body.area as string | undefined,
    priority: body.priority as string | undefined,
    assignedTo: body.assignedTo as string | undefined,
    status: body.status as Status | undefined,
    body: taskBody,
    originalPrompt,
    createdBy: getCurrentUser(req, config)?.email,
  });
  logger.task(created.id, "info", "Task created", {
    title: created.title,
    type: created.type,
    area: created.area,
  });
  index.applyFileChange(created.absPath);
  commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
  return json(res, 201, index.getTask(created.id));
};

/**
 * Persist the freeform task-creation PM pass to the sessions DB (0311). This
 * run goes through `runPrompt`, not the AgentRunner, so — unlike per-task PM
 * chats — nothing books it under the task. Mirror what the reviewer/CTO
 * one-shots do: record a `pm` session from the returned usage so the drawer's
 * "by role" breakdown includes the PM that authored the task. Best-effort.
 */
export function recordFreeformPmSession(
  repoRoot: string,
  taskId: string,
  agent: Agent,
  result: PromptResult,
): void {
  const db = getRepoOSDb(repoRoot);
  if (!db) return;
  try {
    const endedAt = new Date().toISOString();
    const elapsedMs = result.elapsedMs ?? 0;
    const totalTokens = result.totalTokens ?? undefined;
    let costUsd = result.costUsd ?? undefined;
    let costSource = "none";
    if (totalTokens && !costUsd) {
      costUsd = estimateCostUsd(totalTokens);
      costSource = "estimate";
    } else if (result.costUsd) {
      costSource = agent.cli === "kiro" ? "kiro-credits" : "extractUsage";
    }
    db.upsertSession({
      sessionId: `pm-freeform:${taskId}:${endedAt}`,
      sessionType: "pm",
      taskId,
      agent: agent.name,
      model: agent.model,
      codingAgent: agent.cli,
      startedAt: new Date(Date.parse(endedAt) - elapsedMs).toISOString(),
      endedAt,
      elapsedMs,
      inputTokens: result.inputTokens ?? undefined,
      outputTokens: result.outputTokens ?? undefined,
      totalTokens,
      costUsd,
      costSource,
      status: result.ok ? "finished" : "errored",
      lastActivityAt: endedAt,
    });
  } catch {
    // Database recording is best-effort and must never crash the request.
  }
}

export const createFreeformTask: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index, logger, emitEvent } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
  if (!explanation) {
    return json(res, 400, { error: "explanation is required" });
  }
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;

  // #0251: create a draft task with the raw prompt preserved FIRST, then spawn
  // the PM agent asynchronously to flesh it out. The draft survives a PM
  // failure, a slow/unavailable agent, or a bad response — the user's capture
  // is never lost.
  const created = repoos.createTask({
    title: explanationTitle(explanation),
    body: explanation,
    originalPrompt: explanation,
    status: "draft",
    createdBy: getCurrentUser(req, config)?.email,
  });
  logger.task(created.id, "info", "Task created as draft, PM agent will flesh it out", {
    title: created.title,
  });
  index.applyFileChange(created.absPath);
  commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);

  const freeformAgentName =
    typeof body?.agentOverride === "string" && body.agentOverride
      ? body.agentOverride
      : undefined;
  const freeformCli =
    typeof body?.cliOverride === "string" && body.cliOverride ? body.cliOverride : undefined;
  const freeformModel =
    typeof body?.modelOverride === "string" && body.modelOverride
      ? body.modelOverride
      : undefined;
  // "default" is the sentinel for "use the configured pm agent's own
  // model" — not a real pin (same bug class as resolveAgentForTask /
  // resolveReviewerForTask / the PM-message override above).
  const freeformModelPinned = isModelOverridePinned(freeformModel);
  const hasFreeformOverride = freeformAgentName || freeformCli || freeformModelPinned;

  let pm: Agent | null;
  if (hasFreeformOverride) {
    const list = agentsForConfig(config);
    const baseName = freeformAgentName || "pm";
    const base = list.find((a) => a.enabled && a.name === baseName) ?? null;
    pm = base
      ? {
          ...base,
          ...(freeformCli ? { cli: freeformCli } : {}),
          ...(freeformModelPinned ? { model: freeformModel as string } : {}),
        }
      : null;
  } else {
    pm = resolvePmAgent(config);
  }

  // No PM agent configured: leave the draft exactly as created (the fallback
  // behavior — the original prompt is already preserved under its heading).
  if (!pm) {
    return json(res, 201, {
      ok: true,
      fallback: true,
      fallbackReason: "no-pm-agent",
      task: index.getTask(created.id),
    });
  }

  // Spawn the PM agent asynchronously to replace the draft body with the
  // structured version, keeping the `## Original prompt` section intact. The
  // response is returned immediately so the user gets their draft right away.
  void (async () => {
    try {
      const result = await runPrompt(pm!, pmPrompt(explanation), {
        cwd: config.root,
        onLine: runId
          ? (line) => {
              emitEvent({
                type: "agent.output",
                id: runId,
                entry: { s: "out", d: line },
                stream: "out",
                at: new Date().toISOString(),
              });
            }
          : undefined,
      });
      // Book the PM authoring pass under the task (0311) — it aggregates into
      // the drawer's "by role" breakdown like per-task PM chats already do.
      recordFreeformPmSession(config.root, created.id, pm!, result);
      if (!result.ok || !result.output) {
        logger.task(created.id, "warn", "PM agent failed; keeping draft with original prompt", {
          reason: result.error ?? "the PM agent returned no usable output",
        });
        return;
      }
      const fields = parseGeneratedTask(result.output);
      if (!fields.title || !fields.body) {
        logger.task(created.id, "warn", "PM agent returned unusable output; keeping draft", {});
        return;
      }
      // Keep the raw prompt section, then promote the fleshed-out task to the
      // config's default status (usually "inbox") so it lands on the board like
      // the pre-0251 flow did, instead of lingering as a draft.
      const finalBody = withOriginalPromptSection(fields.body, explanation);
      const updated = patchTaskFile(
        config,
        created.absPath,
        {
          title: fields.title,
          type: fields.type,
          priority: fields.priority,
          area: fields.area,
          assignedTo: fields.assignedTo,
          body: finalBody,
          status: config.defaultStatus,
        },
        { onStatusChange: ctx.onServerStatusChange },
      );
      index.applyFileChange(updated.absPath);
      logger.task(created.id, "info", "PM agent fleshed out draft task", {
        title: updated.title,
      });
    } catch (err) {
      logger.task(
        created.id,
        "warn",
        "PM agent update failed; keeping draft with original prompt",
        { reason: err instanceof Error ? err.message : String(err) },
      );
    }
  })();

  return json(res, 201, {
    ok: true,
    fallback: false,
    task: index.getTask(created.id),
  });
};

export const getTask: RouteHandler = (ctx, _req, res, params) => {
  const { index, previews, reviews } = ctx;
  const id = params.param1;
  const t = index.getTask(id);
  return t
    ? json(res, 200, {
        ...withReviewStatus(t, reviews),
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
  const body = (await readBody(req)) as TaskPatch;
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
      return json(res, 400, { error: `Cannot move task #${existing.id} from ${prevStatus} to ${body.status}: ${check.reason}` });
    }
  }

  if (body.status === "review" && prevStatus !== "review") {
    // #0210: any transition into `review` must pass the same commit+validate
    // gate the trusted handoff path enforces — never silently leave an
    // uncommitted worktree, and never allow a vacuous (zero source changes)
    // transition unless the task opts out via no_source_change.
    const gate = await guardReviewTransition(config, existing);
    if (!gate.ok) {
      return json(res, 400, { error: `Cannot move task #${existing.id} to review: ${gate.detail}` });
    }
  }

  const updated = patchTaskFile(config, existing.absPath, body, {
    onStatusChange: onServerStatusChange,
  });

  if (body.status && body.status !== prevStatus) {
    logger.task(id, "info", `Task status changed`, {
      from: prevStatus,
      to: body.status,
    });
  }

  // Guarded: the #0210 gate already ran above for transitions into review.
  index.applyFileChange(updated.absPath, { guarded: true });

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
  const abs = resolveScreenshot(config, taskId, filename);
  if (!abs) {
    return json(res, 404, { error: "Attachment not found" });
  }
  const mime = mimeForExtension(abs);
  res.writeHead(200, {
    "Content-Type": mime ?? "application/octet-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(readFileSync(abs));
};

export const uploadScreenshot: RouteHandler = async (ctx, req, res, params) => {
  const { config, index } = ctx;
  const taskId = params.param1;
  const task = index.getTask(taskId);
  if (!task) {
    return json(res, 404, { error: `Task #${taskId} not found` });
  }
  const body = (await readBody(req)) as { name?: unknown; mime?: unknown; data?: unknown };
  const result = saveScreenshot(config, task, body ?? {});
  if ("error" in result) {
    return json(res, 400, { error: result.error });
  }
  const updated = patchTaskFile(config, task.absPath, {
    body: appendScreenshotsSection(task.body, [result]),
  });
  index.applyFileChange(updated.absPath);
  return json(res, 201, { ok: true, attachment: result });
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

// Task actions: start, pause, message, done, sync
export const taskAction: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner, previews, reviews, syncTaskBranch, onServerStatusChange } = ctx;
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
      return json(res, 500, { error: `Could not refresh task #${id} before starting: ${(error as Error).message}` });
    }
  }

  if (action === "start") {
    if (existing.status !== "ready" && existing.status !== "active") {
      return json(res, 400, {
        error: `Only ready or paused tasks can be started (#${id} is ${existing.status})`,
      });
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
    const body = (await readBody(req)) as { mode?: unknown; instruction?: unknown };
    const clean = body?.mode === "clean" && !existing.hotfix;
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
    const patch: TaskPatch = { status: "active", needsInput: false };
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
      clean || !existing.branch
        ? undefined
        : resumePreamble(config, taskForLaunch, branch, cwd);
    const preamble = [resumeContext, instruction].filter(Boolean).join("\n\n") || undefined;

    const spawnRes = runner.start(taskForLaunch, branch, agent, {
      cwd,
      contextPack: pack.content,
      resumePreamble: preamble,
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
        return json(res, 409, { error: `Task #${id} has an agent turn in progress` });
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
      dirty = await dirtyFiles(config.root);
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
        dirtyFiles: dirty,
      });
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

    // Enqueue the close-out job (idempotent per task).
    const job = ctx.jobCoordinator.enqueue(taskStillExists);
    if (!job) {
      return json(res, 400, { error: `Task #${id} has no branch to merge` });
    }

    // Reflect the new queue entry in the pinned status bar immediately (0207),
    // even before job processing's own snapshot emission picks it up.
    ctx.emitEvent({ type: "integration", pipeline: buildIntegrationSnapshot(ctx.jobCoordinator, {}) });

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
        queuePosition: ctx.jobCoordinator.allJobs().findIndex((j) => j.taskId === job.taskId),
      },
    });
  }

  if (action === "sync") {
    if (existing.status !== "review") {
      return json(res, 400, {
        error: `Only review tasks can be synced (#${id} is ${existing.status})`,
      });
    }
    if (!existing.branch) {
      return json(res, 400, { error: `Task #${id} has no branch to sync` });
    }
    if (runner.isRunning(id)) {
      return json(res, 409, {
        error: `Task #${id} has an agent turn in progress`,
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
    const body = (await readBody(req)) as { text?: unknown };
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return json(res, 400, { error: "message text is required" });
    }
    if (existing.needsInput) {
      const cleared = patchTaskFile(config, existing.absPath, { needsInput: false });
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
      return json(res, 400, { error: sendRes.reason ?? "could not send message" });
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
      { status: "ready", needsInput: false },
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
    const hotfixTarget: "branch" | "main" =
      body?.hotfixTarget === "main" ? "main" : "branch";

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
      dirty = await dirtyFiles(config.root);
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
      updated = patchTaskFile(config, existing.absPath, {
        hotfix: true,
        hotfixTarget,
        branch,
      }, {
        onStatusChange: onServerStatusChange,
      });
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
export const startPreview: RouteHandler = async (ctx, _req, res, params) => {
  const { index, previews } = ctx;
  const id = params.param1;
  const t = index.getTask(id);
  if (!t) {
    return json(res, 404, { error: `Task #${id} not found` });
  }
  const result = await previews.start(t);
  if (!result.ok) {
    return json(res, 400, { error: result.error ?? "could not start preview" });
  }
  return json(res, 200, { ok: true, port: result.port, url: result.url });
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
    lines: reviews.session(id),
  });
};

export const reviewAgain: RouteHandler = async (ctx, _req, res, params) => {
  const { index, runner, reviews } = ctx;
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
  if (runner.isRunning(id)) {
    return json(res, 409, {
      error: `Task #${id} has an agent turn in progress — wait for it to finish`,
    });
  }
  const gate = reviews.canRun(existing);
  if (!gate.ok) {
    return json(res, 400, { error: gate.reason ?? "could not start the review" });
  }
  void reviews.run(existing);
  return json(res, 200, { ok: true });
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
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }
  const gate = reviews.canSend(existing);
  if (!gate.ok) {
    return json(res, 400, { error: gate.reason ?? "could not send to the reviewer" });
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

export const pmMessage: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner } = ctx;
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
  const pmSessionId = currentUserEmail ? `pm-task-v2:${id}::${currentUserEmail}` : `pm-task-v2:${id}`;
  const body = (await readBody(req)) as Record<string, unknown>;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }

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
    pm = base
      ? {
          ...base,
          ...(pmCli ? { cli: pmCli } : {}),
          ...(pmModelPinned ? { model: pmModel as string } : {}),
        }
      : null;
  } else {
    pm = resolvePmAgent(config);
  }
  if (!pm) {
    return json(res, 400, {
      error: "PM agent is not configured — enable it on the Agents page",
    });
  }

  // Build context about the current task for the PM
  const taskContext = `Task #${id}: ${existing.title}
Status: ${existing.status}
Priority: ${existing.priority || "unset"}
Area: ${existing.area || "unset"}
Type: ${existing.type || "unset"}

Description:
${existing.body || "(no description)"}`;

  const existing_session = runner.output(pmSessionId);
  const result = existing_session
    ? runner.send(pmSessionId, text, pm, {
        resumePreamble: `Task context:\n${taskContext}`,
      })
    : runner.startChat(pmSessionId, text, pm, taskContext, taskPmPrompt);

  if (!result.ok && result.busy) {
    return json(res, 409, { error: result.reason ?? "PM is busy" });
  }
  if (!result.ok) {
    return json(res, 400, { error: result.reason ?? "could not send message to PM" });
  }
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
  const allJobs = jobCoordinator.allJobs();
  const queuePos = allJobs.findIndex((j) => j.taskId === job.taskId);
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
      queuePosition: queuePos,
      queueLength: allJobs.length,
    },
  });
};

export const getIntegrationJobs: RouteHandler = (ctx, _req, res) => {
  const allJobs = ctx.jobCoordinator.allJobs();
  return json(res, 200, {
    ok: true,
    jobs: allJobs.map((job, idx) => ({
      taskId: job.taskId,
      phase: job.phase,
      enqueuedAt: job.enqueuedAt,
      startedAt: job.startedAt,
      reason: job.reason,
      queuePosition: idx,
    })),
    queueLength: allJobs.length,
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
    pipeline: buildIntegrationSnapshot(ctx.jobCoordinator, ctx.reportedStages),
  });
};

/**
 * Retry a failed integration job (0207). Reuses the coordinator's existing
 * retry path: `enqueue` re-enqueues a `failed` job as a fresh queued job
 * (see integration-job.ts), then processing resumes from the queue.
 */
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
  ctx.emitEvent({ type: "integration", pipeline: buildIntegrationSnapshot(jobCoordinator, {}) });
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

export const getBoardStats: RouteHandler = (ctx, _req, res) => {
  const { runner } = ctx;
  const stats = runner.boardStats();
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
    return json(res, 200, { ok: true, stats: { filesChanged: 0, additions: 0, deletions: 0 }, noBranch: true });
  }
  const worktreePath = worktreePathForBranch(config.root, task.branch);
  if (!worktreePath) {
    const snapshot = task.status === "done"
      ? loadDiffSnapshot(config.root, config.cacheDir, task.id)
      : null;
    if (snapshot) {
      return json(res, 200, { ok: true, stats: snapshot.stats, snapshot: true });
    }
    return json(res, 200, { ok: true, stats: { filesChanged: 0, additions: 0, deletions: 0 }, noWorktree: true });
  }
  // Async (spawn-based) rather than the sync/execFileSync getDiffStats: every
  // card on the Work board fires this on mount, and the synchronous version
  // blocked the whole event loop for each one serially — including whatever
  // GET /api/tasks/:id a drawer-opening click was waiting behind.
  const stats = await getDiffStatsAsync(worktreePath, "main");
  return json(res, 200, { ok: true, stats });
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
    return json(res, 200, { ok: true, diff: { patch: "", truncated: false }, noBranch: true });
  }
  const worktreePath = worktreePathForBranch(config.root, task.branch);
  if (!worktreePath) {
    const snapshot = task.status === "done"
      ? loadDiffSnapshot(config.root, config.cacheDir, task.id)
      : null;
    if (snapshot) {
      return json(res, 200, { ok: true, diff: snapshot.diff, snapshot: true });
    }
    return json(res, 200, { ok: true, diff: { patch: "", truncated: false }, noWorktree: true });
  }
  const diff = await getDiff(worktreePath, "main");
  return json(res, 200, { ok: true, diff });
};
