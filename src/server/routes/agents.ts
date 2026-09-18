import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { detectAgents, type DetectedAgent } from "../../core/detect.js";
import { checkAgentUpdates } from "../../core/agent-updates.js";

export const runningAgents: RouteHandler = (ctx, _req, res) => {
  const { runner } = ctx;
  return json(res, 200, { tasks: runner.running() });
};

/** Tasks/chats waiting for a free maxConcurrentAgents slot — reconciliation source alongside the agent.queued/agent.dequeued SSE events. */
export const queuedAgents: RouteHandler = (ctx, _req, res) => {
  const { runner } = ctx;
  return json(res, 200, { tasks: runner.queued() });
};

export const detectInstalledAgents: RouteHandler = async (_ctx, _req, res) => {
  let agents: DetectedAgent[] = [];
  try {
    agents = await detectAgents();
  } catch {
    agents = [];
  }
  return json(res, 200, { agents });
};

/** Explicit, user-initiated network check. Detection itself never calls this. */
export const checkInstalledAgentUpdates: RouteHandler = async (_ctx, req, res) => {
  let force = false;
  try {
    const body = (await new Promise<string>((resolve) => {
      let value = "";
      req.on("data", (chunk) => (value += chunk.toString()));
      req.on("end", () => resolve(value));
    })) as string;
    if (body) force = Boolean((JSON.parse(body) as { refresh?: unknown }).refresh);
  } catch {
    return json(res, 400, { error: "Invalid update-check request." });
  }
  try {
    const agents = await detectAgents();
    const updates = await checkAgentUpdates(agents, force);
    return json(res, 200, { updates, checkedAt: new Date().toISOString() });
  } catch {
    return json(res, 200, { updates: {}, checkedAt: new Date().toISOString() });
  }
};

export const getAgentLogs: RouteHandler = (ctx, _req, res, params) => {
  const { logger } = ctx;
  const id = params.param1;
  const limit = 1000;
  const logs = logger.getAgentLogs(id, limit);
  return json(res, 200, { ok: true, logs });
};
