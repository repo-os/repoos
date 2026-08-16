import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { detectAgents, type DetectedAgent } from "../../core/detect.js";

export const runningAgents: RouteHandler = (ctx, _req, res) => {
  const { runner } = ctx;
  return json(res, 200, { tasks: runner.running() });
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

export const getAgentLogs: RouteHandler = (ctx, _req, res, params) => {
  const { logger } = ctx;
  const id = params.param1;
  const limit = 1000;
  const logs = logger.getAgentLogs(id, limit);
  return json(res, 200, { ok: true, logs });
};
