/**
 * Dev targets API (#0747).
 *
 * Routes for the user-declared dev targets in `[[dev.targets]]`: list with
 * state, start, stop and restart one by name. The command is ALWAYS resolved
 * from the committed `repoos.toml` by name — no request body ever carries a
 * command, which is the whole trust boundary of this feature.
 */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import type { DevTargetManager } from "../dev.js";

/** Resolve the dev target manager, or null for a partial (test) context. */
function manager(ctx: { devTargets?: DevTargetManager }): DevTargetManager | null {
  return ctx.devTargets ?? null;
}

/** GET /api/dev/targets — every declared target with its state and log tail. */
export const getDevTargets: RouteHandler = (ctx, _req, res) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  return json(res, 200, {
    ok: true,
    targets: dev.list(),
    errors: dev.configErrors(),
  });
};

/** GET /api/dev/targets/:name — one target with its state. */
export const getDevTarget: RouteHandler = (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const target = dev.get(name);
  if (!target) return json(res, 404, { error: `Unknown dev target "${name}"` });
  return json(res, 200, { ok: true, target });
};

/** POST /api/dev/targets/:name/start */
export const startDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.start(name);
  if (!result.ok) return json(res, result.target ? 502 : 404, { error: result.error });
  return json(res, 200, { ok: true, target: result.target });
};

/** POST /api/dev/targets/:name/stop */
export const stopDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.stop(name);
  if (!result.ok) return json(res, 404, { error: result.error });
  return json(res, 200, { ok: true, target: result.target });
};

/** POST /api/dev/targets/:name/restart */
export const restartDevTarget: RouteHandler = async (ctx, _req, res, params) => {
  const dev = manager(ctx);
  if (!dev) return json(res, 503, { error: "dev targets are not available" });
  const name = decodeURIComponent(params.param1);
  const result = await dev.restart(name);
  if (!result.ok) return json(res, result.target ? 502 : 404, { error: result.error });
  return json(res, 200, { ok: true, target: result.target });
};
