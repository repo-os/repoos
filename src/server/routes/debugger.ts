import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { debuggerAgent, debuggerSessionId } from "../agents.js";

export const getDebugger: RouteHandler = (ctx, _req, res) => {
  const { config, runner } = ctx;
  const state = config.builtInAgents?.debugger ?? {};
  const enabled = Boolean(state.enabled);
  const session = runner.output(debuggerSessionId);
  return json(res, 200, {
    ok: true,
    agent: debuggerAgent(),
    enabled,
    lines: session?.lines ?? [],
    running: runner.isRunning(debuggerSessionId),
    stats: runner.stats(debuggerSessionId),
  });
};

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

  const agent = debuggerAgent();
  const context = repoContextForDebugger(index);
  const existing = runner.output(debuggerSessionId);
  const firstTurn = !existing;
  const result = existing
    ? runner.send(debuggerSessionId, text, agent, {
        resumePreamble: `Updated repository context:\n${context}`,
      })
    : (runner as any).startChat(debuggerSessionId, text, agent, context);
  if (!result.ok && (result as any).busy) {
    return json(res, 409, { error: result.reason ?? "Debugger is busy" });
  }
  if (!result.ok) {
    // A concurrency race can create a session between the output check above
    // and startChat; in that case the caller should treat it as a busied
    // conversation and retry on the next message.
    if (!firstTurn && (result.reason ?? "").includes("already exists")) {
      return json(res, 409, {
        error: "Debugger is busy — wait for the current turn to finish",
      });
    }
    return json(res, 400, { error: result.reason ?? "could not send message" });
  }
  return json(res, 200, { ok: true });
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
