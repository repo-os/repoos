import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { detectAgents, type DetectedAgent } from "../../core/detect.js";
import { readDetectCache, writeDetectCache } from "../../core/detect-cache.js";
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

/**
 * Returns cached detection results (or empty) immediately, plus a `cachedAt`
 * timestamp. The client should follow up with the streaming endpoint to get
 * fresh results that update each agent row as the probe settles.
 */
export const detectInstalledAgents: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;
  const cached = readDetectCache(config.root, config.cacheDir);
  return json(res, 200, {
    agents: cached?.agents ?? [],
    cachedAt: cached?.cachedAt ?? null,
  });
};

/**
 * SSE stream: emits one `agent` event per detected agent as its probe settles,
 * then a `done` event. Writes the results to the detect cache on completion so
 * the next page load gets an instant response from `detectInstalledAgents`.
 *
 * Event format (each line is a separate SSE field):
 *   event: agent
 *   data: <JSON DetectedAgent>
 *
 *   event: done
 *   data: {"cachedAt":"<ISO>"}
 */
export const streamDetectAgents: RouteHandler = (ctx, _req, res) => {
  const { config } = ctx;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const collected: DetectedAgent[] = [];

  void detectAgents({
    onResult(agent) {
      collected.push(agent);
      if (!res.writableEnded) {
        res.write(`event: agent\ndata: ${JSON.stringify(agent)}\n\n`);
      }
    },
  }).then(() => {
    const cachedAt = new Date().toISOString();
    writeDetectCache(config.root, config.cacheDir, collected);
    if (!res.writableEnded) {
      res.write(`event: done\ndata: ${JSON.stringify({ cachedAt })}\n\n`);
      res.end();
    }
  });

  // If the client disconnects, let the detection run to completion so the
  // cache is still populated — just stop writing to the closed socket.
};

/** Explicit, user-initiated network check. Detection itself never calls this. */
export const checkInstalledAgentUpdates: RouteHandler = async (ctx, req, res) => {
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
