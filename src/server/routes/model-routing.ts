/**
 * Model routing settings API (#0792): credential presence and connection probes.
 * Secrets are never echoed — only booleans and plain-language status.
 */
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { modelRoutingStatus, probeModelRouting } from "../../core/model-routing/runtime.js";
import { listRecentRoutingDecisions } from "../model-routing-wiring.js";

export const getModelRoutingStatus: RouteHandler = async (ctx, _req, res) => {
  const status = modelRoutingStatus(ctx.config);
  return json(res, 200, {
    ...status,
    at: new Date().toISOString(),
  });
};

/**
 * Recent routing decisions (#0793), newest first. Rendered straight from the
 * recorded factors — the UI never fabricates an explanation.
 */
export const getModelRoutingDecisions: RouteHandler = (ctx, req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 25;
  return json(res, 200, {
    decisions: listRecentRoutingDecisions(ctx.config, limit),
    at: new Date().toISOString(),
  });
};

export const postModelRoutingProbe: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as { live?: unknown };
  const live = body.live === true;
  const result = await probeModelRouting(ctx.config, { live });
  return json(res, 200, {
    ...result,
    at: new Date().toISOString(),
  });
};
