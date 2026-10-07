/** CTO "needs a decision" digest (#0730). */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { assembleDecisionDigest } from "../decision-digest.js";

export const getDecisions: RouteHandler = async (ctx, _req, res) => {
  await ctx.indexReady;
  const digest = await assembleDecisionDigest({
    config: ctx.config,
    index: ctx.index,
    runner: ctx.runner,
    jobCoordinator: ctx.jobCoordinator,
    reviews: ctx.reviews,
    attentionEvents: ctx.attentionEvents,
  });
  return json(res, 200, { ok: true, ...digest });
};
