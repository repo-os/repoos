/** Unified attention feed (#0687) for agents, scripts and the web UI. */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { assembleAttentionFeed } from "../attention-feed.js";
import { getReleaseRunState } from "./release.js";

export const getAttention: RouteHandler = async (ctx, _req, res) => {
  await ctx.indexReady;
  const previewTargetAreas =
    ctx.config.preview?.targets?.flatMap((t) => t.areas ?? []) ??
    ctx.config.preview?.targets?.map((t) => t.name) ??
    [];
  const feed = assembleAttentionFeed({
    config: ctx.config,
    index: ctx.index,
    runner: ctx.runner,
    closeOutOutcomes: ctx.closeOutOutcomes,
    attentionEvents: ctx.attentionEvents,
    getReleaseRun: () => getReleaseRunState(),
    previewTargetAreas,
  });
  return json(res, 200, { ok: true, ...feed });
};
