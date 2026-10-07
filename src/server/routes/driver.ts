/** CTO board brief (#0731) — the live handoff snapshot. */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { assembleDriverBrief } from "../driver-brief.js";

export const getDriverBrief: RouteHandler = async (ctx, _req, res) => {
  await ctx.indexReady;
  const brief = await assembleDriverBrief({
    config: ctx.config,
    index: ctx.index,
    runner: ctx.runner,
    jobCoordinator: ctx.jobCoordinator,
    closeOutOutcomes: ctx.closeOutOutcomes,
    remoteValidator: ctx.remoteValidator,
    awakeClock: ctx.awakeClock,
  });
  return json(res, 200, { ok: true, ...brief });
};
