import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { debuggerAgent, debuggerSessionId } from "../agents.js";
import { resolveAgentForTask } from "../agents.js";
import { patchTaskFile } from "../write.js";

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
