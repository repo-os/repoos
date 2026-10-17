/** Unified attention feed (#0687) for agents, scripts and the web UI. */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { assembleAttentionFeed } from "../attention-feed.js";
import { getReleaseNotesRunState, getReleaseRunState } from "./release.js";

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
    taskChecks: ctx.taskChecks,
    remoteActiveRuns: ctx.remoteValidator?.activeRemoteRuns
      ? () => ctx.remoteValidator!.activeRemoteRuns!()
      : undefined,
    remoteHostStatus: ctx.remoteValidator?.hostStatus
      ? () => ctx.remoteValidator!.hostStatus!()
      : undefined,
    awakeClock: ctx.awakeClock,
    getReleaseRun: () => getReleaseRunState(),
    getReleaseNotesRun: () => getReleaseNotesRunState(),
    previewTargetAreas,
    ctoHeartbeat: ctx.ctoHeartbeat,
  });
  // #0819: the durable close-out outcomes ride along as RAW events (newest
  // first), not only folded into `items`. The item shape drops `startedAt`/
  // `durationMs`, and the UI's integration timer needs those to build its
  // recent-run median on a fresh page load — the attention fetch it already
  // makes at startup is the natural carrier. The separate
  // `GET /api/close-out/outcomes` route stays for the notice-backfill path.
  return json(res, 200, {
    ok: true,
    ...feed,
    closeOutOutcomes: ctx.closeOutOutcomes?.list() ?? [],
  });
};
