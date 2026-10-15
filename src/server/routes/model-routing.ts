/**
 * Model routing settings API (#0792): credential presence and connection probes.
 * Secrets are never echoed — only booleans and env var names.
 */
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { setDotEnvSecret } from "../../core/config.js";
import { modelRoutingStatus, probeModelRouting } from "../../core/model-routing/runtime.js";
import { resolveEffectiveRouting } from "../../core/model-routing/config.js";

const MAX_KEY_LEN = 500;

export const getModelRoutingStatus: RouteHandler = async (ctx, _req, res) => {
  const status = modelRoutingStatus(ctx.config);
  return json(res, 200, {
    ...status,
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

/** Save (or clear) the API key for the configured `credentialEnv` variable. */
export const postModelRoutingKey: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as { key?: unknown };
  if (typeof body.key !== "string") {
    return json(res, 400, { error: "key must be a string." });
  }
  const key = body.key.trim();
  if (key.length > MAX_KEY_LEN) {
    return json(res, 400, { error: "That API key is too long to be valid." });
  }
  const effective = resolveEffectiveRouting(ctx.config.modelRouting);
  const envVar = effective.credentialEnv;
  if (!envVar) {
    return json(res, 400, { error: "No credential environment variable is configured." });
  }
  try {
    setDotEnvSecret(ctx.config.root, envVar, key);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return json(res, 400, { error: `Could not save the key: ${reason}` });
  }
  const present = key.length > 0;
  return json(res, 200, { ok: true, credentialEnv: envVar, credentialPresent: present });
};
