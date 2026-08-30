import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { cutNewRelease, getReleaseStatus } from "../release.js";

export const getRelease: RouteHandler = async (ctx, _req, res) =>
  json(res, 200, await getReleaseStatus(ctx.config));

export const runRelease: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as { version?: unknown; confirmTag?: unknown };
  if (typeof body.version !== "string" || typeof body.confirmTag !== "string")
    return json(res, 400, { error: "version and confirmTag are required" });
  const result = await cutNewRelease(ctx.config, body.version, body.confirmTag);
  return json(res, result.ok ? 200 : 409, result.ok ? result : { error: result.output, ...result });
};
