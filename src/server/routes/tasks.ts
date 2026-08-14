import { readFileSync } from "node:fs";
import type { Status, Agent } from "../../core/types.js";
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
  runPrompt,
  deriveBranch,
} from "../agents.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "../freeform.js";
import { commitTaskFile, worktreePathForBranch, ensureWorktree, resetWorktree } from "../../core/git.js";
import { bootstrap } from "../../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../../core/context-pack.js";
import { appendScreenshotsSection, mimeForExtension, resolveScreenshot, saveScreenshot } from "../attachments.js";
import { STATUSES } from "../../core/types.js";

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
  const { config, repoos, index } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  if (!body.title || typeof body.title !== "string") {
    return json(res, 400, { error: "title is required" });
  }
  const created = repoos.createTask({
    title: body.title,
    type: body.type as string | undefined,
    area: body.area as string | undefined,
    priority: body.priority as string | undefined,
    assignedTo: body.assignedTo as string | undefined,
    status: body.status as Status | undefined,
    body: typeof body.body === "string" ? body.body : undefined,
  });
  index.applyFileChange(created.absPath);
  commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
  return json(res, 201, index.getTask(created.id));
};

export const createFreeformTask: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index, emitEvent } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const explanation = typeof body?.explanation === "string" ? body.explanation.trim() : "";
  if (!explanation) {
    return json(res, 400, { error: "explanation is required" });
  }
  const runId = typeof body?.runId === "string" && body.runId ? body.runId : null;

  const saveDraft = (fallbackReason: "no-pm-agent" | "agent-failed", detail?: string) => {
    const created = repoos.createTask({
      title: explanationTitle(explanation),
      body: explanation,
      status: "draft",
    });
    index.applyFileChange(created.absPath);
    commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
    return json(res, 201, {
      ok: true,
      fallback: true,
      fallbackReason,
      reason: detail,
      task: index.getTask(created.id),
    });
  };

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
  const hasFreeformOverride = freeformAgentName || freeformCli || freeformModel;

  let pm: Agent | null;
  if (hasFreeformOverride) {
    const list = agentsForConfig(config);
    const baseName = freeformAgentName || "pm";
    const base = list.find((a) => a.enabled && a.name === baseName) ?? null;
    pm = base
      ? {
          ...base,
          ...(freeformCli ? { cli: freeformCli } : {}),
          ...(freeformModel ? { model: freeformModel } : {}),
        }
      : null;
  } else {
    pm = resolvePmAgent(config);
  }
  if (!pm) {
    return saveDraft("no-pm-agent");
  }

  const result = await runPrompt(pm, pmPrompt(explanation), {
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
  if (!result.ok || !result.output) {
    return saveDraft(
      "agent-failed",
      result.error ?? "the PM agent returned no usable output",
    );
  }
  const fields = parseGeneratedTask(result.output);
  if (!fields.title || !fields.body) {
    return saveDraft("agent-failed", "the PM agent returned unusable output");
  }
  const created = repoos.createTask(fields);
  index.applyFileChange(created.absPath);
  commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
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
  const { config, index, reviews, runner, onServerStatusChange, syncTaskBranch } = ctx;
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

  const updated = patchTaskFile(config, existing.absPath, body, {
    onStatusChange: onServerStatusChange,
  });
  index.applyFileChange(updated.absPath);

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
  const { config, index, previews } = ctx;
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
  res.end(require("fs").readFileSync(abs));
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
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
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
    const body = (await readBody(req)) as { mode?: unknown };
    const clean = body?.mode === "clean";
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
    const wtRes = ensureWorktree(config.root, branch);
    const patch: TaskPatch = { status: "active", needsInput: false };
    if (!existing.branch) patch.branch = branch;
    const updated = patchTaskFile(config, existing.absPath, patch, {
      onStatusChange: onServerStatusChange,
    });
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
    const preamble =
      clean || !existing.branch
        ? undefined
        : resumePreamble(config, taskForLaunch, branch, cwd);

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
    if (existing.status !== "review") {
      return json(res, 400, {
        error: `Only review tasks can be completed (#${id} is ${existing.status})`,
      });
    }
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

    // Enqueue the close-out job (idempotent per task).
    const job = ctx.jobCoordinator.enqueue(taskStillExists);
    if (!job) {
      return json(res, 400, { error: `Task #${id} has no branch to merge` });
    }

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

export const pmMessage: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) {
    return json(res, 404, { error: `Task #${id} not found` });
  }

  const pmSessionId = `pm-task:${id}`;
  const body = (await readBody(req)) as Record<string, unknown>;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return json(res, 400, { error: "message text is required" });
  }

  // Build a one-shot agent override for this PM request
  const pmAgentName =
    typeof body?.agentOverride === "string" && body.agentOverride ? body.agentOverride : undefined;
  const pmCli = typeof body?.cliOverride === "string" && body.cliOverride ? body.cliOverride : undefined;
  const pmModel = typeof body?.modelOverride === "string" && body.modelOverride ? body.modelOverride : undefined;
  const hasPmOverride = pmAgentName || pmCli || pmModel;

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
          ...(pmModel ? { model: pmModel } : {}),
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
    : runner.startChat(pmSessionId, text, pm, taskContext);

  if (!result.ok && result.busy) {
    return json(res, 409, { error: result.reason ?? "PM is busy" });
  }
  if (!result.ok) {
    return json(res, 400, { error: result.reason ?? "could not send message to PM" });
  }
  return json(res, 200, { ok: true, spawn: { ok: true, pid: result.pid } });
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
