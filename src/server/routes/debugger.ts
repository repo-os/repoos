import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  debuggerAgent,
  debuggerSessionId,
  deriveBranch,
  resolveAgentForTask,
  resolvePmAgent,
  taskPmPrompt,
} from "../agents.js";
import { patchTaskFile } from "../write.js";
import { getCurrentUser } from "./auth.js";
import { ensureWorktree } from "../../core/git.js";
import { bootstrap } from "../../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../../core/context-pack.js";
import type { AgentOutputEntry, Task } from "../../core/types.js";

export const getDebugger: RouteHandler = (ctx, _req, res) => {
  const { config, runner } = ctx;
  const state = config.builtInAgents?.debugger ?? {};
  const enabled = Boolean(state.enabled);
  const session = runner.output(debuggerSessionId);
  return json(res, 200, {
    ok: true,
    agent: debuggerAgent(fromPersisted(state)),
    enabled,
    lines: session?.lines ?? [],
    running: runner.isRunning(debuggerSessionId),
    stats: runner.stats(debuggerSessionId),
  });
};

/** Persisted cli/model overrides for the Debugger, sanitized to non-empty strings. */
function fromPersisted(state: { cli?: string; model?: string }): { cli?: string; model?: string } {
  const cli = typeof state.cli === "string" && state.cli.trim() ? state.cli.trim() : undefined;
  const model =
    typeof state.model === "string" && state.model.trim() ? state.model.trim() : undefined;
  return { cli, model };
}

export const sendDebuggerMessage: RouteHandler = async (ctx, req, res) => {
  const { config, index, runner } = ctx;
  const state = config.builtInAgents?.debugger ?? {};
  if (!state.enabled) {
    return json(res, 400, {
      error: "Debugger is disabled — enable it on the Agents page to chat",
    });
  }
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json(res, 400, { error: "message text is required" });

  const agent = debuggerAgent(fromPersisted(state));
  const context = repoContextForDebugger(index);
  const existing = runner.output(debuggerSessionId);
  const result = existing
    ? runner.send(debuggerSessionId, text, agent, {
        resumePreamble: `Updated repository context:\n${context}`,
      })
    : (runner as any).startChat(debuggerSessionId, text, agent, context);
  if (!result.ok) {
    const reason = result.reason ?? "could not send message";
    // Both a busy turn (`busy`) and the concurrency race where another request
    // created the session between the output check above and startChat
    // ("conversation already exists") mean the conversation is in flight — the
    // caller should surface a retry, not a hard failure.
    if ((result as any).busy || reason.includes("already exists")) {
      return json(res, 409, {
        error: "Debugger is busy — wait for the current turn to finish",
      });
    }
    return json(res, 400, { error: reason });
  }
  return json(res, 200, { ok: true });
};

/** Interrupt a running Debugger response. Idempotent. */
export const interruptDebugger: RouteHandler = (ctx, _req, res) => {
  const result = ctx.runner.interrupt(debuggerSessionId);
  return json(res, 200, { ok: true, ...result });
};

/** Hand an explicit debugger diagnosis to the task's existing engineering session. */
export const repairWithDebugger: RouteHandler = async (ctx, req, res) => {
  const { config, index, runner } = ctx;
  const body = (await readBody(req)) as { taskId?: unknown; diagnosis?: unknown };
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  const diagnosis = typeof body.diagnosis === "string" ? body.diagnosis.trim() : "";
  const task = index.getTask(taskId);
  if (!task) return json(res, 404, { error: "Task not found" });
  if (task.status !== "review")
    return json(res, 400, { error: "Only review tasks can be repaired" });
  if (!diagnosis) return json(res, 400, { error: "Debugger diagnosis is required" });
  const engineer = resolveAgentForTask(config, task);
  if (!engineer) return json(res, 400, { error: "No enabled engineer is configured" });
  const sent = runner.send(
    task.id,
    [
      "The Debugger diagnosed a failed Move-to-done operation. Apply the smallest safe repair in this existing worktree, run repoos check, then hand off to review.",
      diagnosis,
    ].join("\n\n"),
    engineer,
    { skipBoardDivergence: true },
  );
  if (!sent.ok)
    return json(res, sent.busy ? 409 : 400, { error: sent.reason ?? "Could not start engineer" });
  const updated = patchTaskFile(config, task.absPath, { status: "active" });
  index.applyFileChange(updated.absPath);
  return json(res, 200, { ok: true, task: index.getTask(task.id) });
};

/** Minimal repository context for the Debugger (bug paste vs. config surface). */
function repoContextForDebugger(index: {
  getTasks(): { id: string; title: string; status: string }[];
}): string {
  const tasks = index.getTasks();
  const lines = tasks.map((t) => `#${t.id} ${t.title} (${t.status})`);
  return [
    `RepoOS repository with ${tasks.length} task(s).`,
    ...(lines.length ? lines : ["No tasks yet."]),
  ].join("\n");
}

/**
 * Per-task Debugger chat (task #0337). The session is keyed by
 * `debugger:<taskId>` so it lives alongside — but does not collide with — the
 * global bug-paste Debugger (`__repoos-debugger__`) and the task's own
 * engineer/PM/reviewer sessions.
 */
export const taskDebuggerSessionId = (taskId: string): string => `debugger:${taskId}`;

/**
 * Redact obvious secrets/credentials from text before it is handed to the
 * Debugger. The agent is instructed never to surface secrets too, but defense
 * in depth: a stray API key or password in a log line should never reach the
 * model's prompt (and therefore the user's screen).
 */
function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "***REDACTED***")
    .replace(/AKIA[0-9A-Z]{16}/g, "***REDACTED***")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "***REDACTED***")
    .replace(/\bBearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***REDACTED***")
    .replace(
      /\b(api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|password|passwd|token)\b\s*[:=]\s*['"]?[^\s'"`}]{6,}/gi,
      (m) => {
        const eq = m.match(/[:=]\s*['"]?/);
        const sep = eq ? eq[0] : ": ";
        const key = m.slice(0, m.length - (eq ? eq[0].length : 0));
        return `${key}${sep}***REDACTED***`;
      },
    );
}

/** Render one agent transcript entry to a single-line-ish readable string. */
function entryText(e: AgentOutputEntry): string {
  if ("type" in e) {
    switch (e.type) {
      case "human":
        return `User: ${e.text}`;
      case "text":
        return `Assistant: ${e.text}`;
      case "sys":
        return `[system] ${e.d}`;
      case "tool": {
        const input = e.input ? `\n    input: ${e.input}` : "";
        const output = e.output ? `\n    output: ${e.output}` : "";
        const state = e.state ? ` (${e.state})` : "";
        return `[tool ${e.tool}${state}]${input}${output}`;
      }
      case "step":
        return "";
      default:
        return "";
    }
  }
  return e.s === "sys" ? `[system] ${e.d}` : e.d;
}

function transcriptFor(label: string, session: { lines?: AgentOutputEntry[] } | null): string {
  if (!session || !session.lines || session.lines.length === 0) {
    return `(${label}: no conversation yet)`;
  }
  return session.lines.map(entryText).filter(Boolean).join("\n");
}

/**
 * Aggregate the full task context the Debugger reasons over: the task's
 * metadata/body, every agent conversation thread (engineer/developer, PM,
 * reviewer), and the task's own logs. Secrets are redacted before returning.
 */
function buildTaskDebuggerContext(
  ctx: RouteContextLike,
  taskId: string,
  currentUserEmail?: string,
): string {
  const task = ctx.index.getTask(taskId) as Task | undefined;
  if (!task) return "(task not found)";
  const parts: string[] = [];
  parts.push(`# Task #${task.id}: ${task.title}`);
  parts.push(
    `Status: ${task.status} | Priority: ${task.priority ?? "unset"} | Area: ${task.area ?? "unset"} | Type: ${task.type ?? "unset"}`,
  );
  if (task.branch) parts.push(`Branch: ${task.branch}`);
  if (task.body) parts.push(`\n## Task specification\n${task.body}`);

  const logs = ctx.logger.getTaskLogs(taskId, 800);
  if (logs.length) {
    const rendered = logs
      .map(
        (l) =>
          `[${l.timestamp}] ${l.level}: ${l.message}${l.context ? " " + JSON.stringify(l.context) : ""}`,
      )
      .join("\n");
    parts.push(`\n## Task logs (most recent first)\n${rendered}`);
  }

  parts.push(
    `\n## Engineer (developer) conversation\n${transcriptFor("engineer", ctx.runner.output(task.id) as any)}`,
  );

  const pmSessionId = currentUserEmail
    ? `pm-task-v2:${task.id}::${currentUserEmail}`
    : `pm-task-v2:${task.id}`;
  parts.push(
    `\n## PM (product manager) conversation\n${transcriptFor("PM", ctx.runner.output(pmSessionId) as any)}`,
  );

  parts.push(
    `\n## Reviewer conversation\n${transcriptFor("reviewer", ctx.runner.output(`review:${task.id}`) as any)}`,
  );

  return redactSecrets(parts.join("\n"));
}

type RouteContextLike = Parameters<RouteHandler>[0];

/** Read the Debugger's enabled state for a specific task's debug chat. */
export const getTaskDebugger: RouteHandler = (ctx, _req, res, params) => {
  const id = params.param1;
  const task = ctx.index.getTask(id);
  if (!task) return json(res, 404, { error: `Task #${id} not found` });
  const state = ctx.config.builtInAgents?.debugger ?? {};
  const enabled = Boolean(state.enabled);
  const sessionId = taskDebuggerSessionId(id);
  const session = ctx.runner.output(sessionId) as { lines?: AgentOutputEntry[] } | null;
  return json(res, 200, {
    ok: true,
    enabled,
    lines: session?.lines ?? [],
    running: ctx.runner.isRunning(sessionId),
  });
};

/** Start or continue a task-scoped Debugger conversation with full context. */
export const sendTaskDebuggerMessage: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner } = ctx;
  const id = params.param1;
  const state = config.builtInAgents?.debugger ?? {};
  if (!state.enabled) {
    return json(res, 400, {
      error: "Debugger is disabled — enable it on the Agents page to chat",
    });
  }
  const task = index.getTask(id);
  if (!task) return json(res, 404, { error: `Task #${id} not found` });
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json(res, 400, { error: "message text is required" });

  const agent = debuggerAgent(fromPersisted(state));
  const currentUserEmail = getCurrentUser(req, config)?.email;
  const context = buildTaskDebuggerContext(ctx, id, currentUserEmail);
  const sessionId = taskDebuggerSessionId(id);
  const existing = runner.output(sessionId) as { lines?: AgentOutputEntry[] } | null;
  const result = existing
    ? runner.send(sessionId, text, agent, {
        resumePreamble: `Latest task context:\n${context}`,
      })
    : runner.startChat(sessionId, text, agent, context);
  if (!result.ok) {
    if ((result as { busy?: boolean }).busy) {
      return json(res, 409, { error: "Debugger is busy — wait for the current turn to finish" });
    }
    return json(res, 400, { error: result.reason ?? "could not send message" });
  }
  return json(res, 200, { ok: true });
};

/** Interrupt a running task-scoped Debugger response. Idempotent. */
export const interruptTaskDebugger: RouteHandler = (ctx, _req, res, params) => {
  const result = ctx.runner.interrupt(taskDebuggerSessionId(params.param1));
  return json(res, 200, { ok: true, ...result });
};

/**
 * Dispatch a follow-up instruction from the task Debugger chat straight to the
 * engineer: resume the task's existing engineering session with the instruction,
 * or start the engineer fresh when it has never run. Sets the task `active` so
 * the agent can act on the diagnosis.
 */
export const sendTaskDebuggerToEngineer: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner, onServerStatusChange } = ctx;
  const id = params.param1;
  const task = index.getTask(id);
  if (!task) return json(res, 404, { error: `Task #${id} not found` });
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json(res, 400, { error: "instruction text is required" });

  const engineer = resolveAgentForTask(config, task);
  if (!engineer) {
    return json(res, 400, { error: "No enabled engineer agent is configured on the Agents page" });
  }

  const existing = runner.output(id) as { lines?: AgentOutputEntry[] } | null;
  if (existing) {
    if (task.status !== "active") {
      const updated = patchTaskFile(config, task.absPath, { status: "active" });
      index.applyFileChange(updated.absPath);
    }
    const sent = runner.send(id, text, engineer, { skipBoardDivergence: true });
    if (!sent.ok) {
      return json(res, sent.busy ? 409 : 400, { error: sent.reason ?? "Could not reach engineer" });
    }
    return json(res, 200, { ok: true, task: index.getTask(id) });
  }

  // Engineer never ran for this task — boot it fresh with the instruction.
  if (task.status !== "ready" && task.status !== "active") {
    return json(res, 400, {
      error: `Only ready or active tasks can be started (#${id} is ${task.status})`,
    });
  }
  if (runner.isRunning(id)) {
    return json(res, 400, { error: `Task #${id} is already running` });
  }
  const branch = task.branch || deriveBranch(task.title);
  const patch: Record<string, unknown> = { status: "active", needsInput: false };
  if (!task.branch) patch.branch = branch;
  const updated = patchTaskFile(config, task.absPath, patch as any, {
    onStatusChange: onServerStatusChange,
  });
  const wtRes = ensureWorktree(config.root, branch);
  index.applyFileChange(updated.absPath);
  index.refreshBranches();
  const cwd = wtRes.ok ? wtRes.path : config.root;
  const taskForLaunch = index.getTask(updated.id) ?? updated;
  const bootResult = await bootstrap(config, taskForLaunch, branch, cwd);
  if (!bootResult.ok) {
    return json(res, 500, { error: `Bootstrap failed: ${bootResult.reason ?? "unknown error"}` });
  }
  const pack = generateContextPack(config, taskForLaunch, branch, cwd, bootResult);
  const resumeContext =
    !task.branch || !wtRes.ok ? undefined : resumePreamble(config, taskForLaunch, branch, cwd);
  const preamble = [resumeContext, text].filter(Boolean).join("\n\n") || undefined;
  const spawnRes = runner.start(taskForLaunch, branch, engineer, {
    cwd,
    contextPack: pack.content,
    resumePreamble: preamble,
  });
  return json(res, 200, {
    ok: true,
    task: index.getTask(updated.id),
    branch,
    spawn: { ok: spawnRes.ok, pid: spawnRes.pid, queued: spawnRes.queued, reason: spawnRes.reason },
  });
};

/**
 * Dispatch a follow-up instruction from the task Debugger chat to the PM. Opens
 * (or resumes) the task's PM conversation with the instruction and the full
 * task context, so the PM can update the task on the diagnosis.
 */
export const sendTaskDebuggerToPm: RouteHandler = async (ctx, req, res, params) => {
  const { config, index, runner } = ctx;
  const id = params.param1;
  const existing = index.getTask(id);
  if (!existing) return json(res, 404, { error: `Task #${id} not found` });
  const body = (await readBody(req)) as { text?: unknown };
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json(res, 400, { error: "instruction text is required" });

  const pm = resolvePmAgent(config);
  if (!pm) {
    return json(res, 400, { error: "PM agent is not configured — enable it on the Agents page" });
  }

  const currentUserEmail = getCurrentUser(req, config)?.email;
  const pmSessionId = currentUserEmail
    ? `pm-task-v2:${id}::${currentUserEmail}`
    : `pm-task-v2:${id}`;
  const taskContext = `Task #${id}: ${existing.title}
Status: ${existing.status}
Priority: ${existing.priority || "unset"}
Area: ${existing.area || "unset"}
Type: ${existing.type || "unset"}

Description:
${existing.body || "(no description)"}`;

  const result = runner.output(pmSessionId)
    ? runner.send(pmSessionId, text, pm, { resumePreamble: `Task context:\n${taskContext}` })
    : runner.startChat(pmSessionId, text, pm, taskContext, taskPmPrompt);
  if (!result.ok && result.busy) {
    return json(res, 409, { error: result.reason ?? "PM is busy" });
  }
  if (!result.ok) {
    return json(res, 400, { error: result.reason ?? "could not send message to PM" });
  }
  return json(res, 200, { ok: true });
};
