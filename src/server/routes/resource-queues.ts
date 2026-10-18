import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { readQueueMarkers } from "../../core/local-queue-marker.js";

export const getResourceQueues: RouteHandler = (ctx, _req, res) => {
  const markers = readQueueMarkers(ctx.config.root, ctx.config.cacheDir ?? ".repoos");
  return json(res, 200, { markers });
};
