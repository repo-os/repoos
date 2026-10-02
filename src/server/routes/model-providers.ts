/**
 * Model providers tab routes (0327): the Agents-page "Model providers" tab's
 * backend. Three endpoints —
 *
 *   GET  /api/model-providers            static registry + per-row hasKey
 *   GET  /api/model-providers/:id/usage  live spend/usage for a "live" row
 *   POST /api/model-providers/:id/key    save (or clear) a provider API key
 *
 * Keys are stored ONLY in the gitignored `.env` via `setDotEnvSecret`, under
 * the fixed env-var names in the registry — the same env-var-secret pattern
 * as the auth/whisper secrets. They are never written to repoos.toml, never
 * logged, and never echoed back in any response (rows only ever see a
 * boolean `hasKey`).
 */
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { setDotEnvSecret } from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";
import {
  MODEL_PROVIDERS,
  modelProviderById,
  fetchOpenRouterSpend,
  fetchOpenCodeGoUsage,
  fetchDeepInfraSpend,
  fetchCopilotUsage,
} from "../../core/providers/spend.js";
import type { ModelProviderRow } from "../../core/providers/spend.js";

/** Cap on pasted key length — real provider keys are far shorter. */
const MAX_KEY_LEN = 500;

/** A GitHub Copilot billing scope: empty, or `org:<slug>` / `enterprise:<slug>`. */
const COPILOT_SCOPE_RE = /^(org|enterprise):[A-Za-z0-9._-]{1,80}$/i;

/**
 * The stored key for a live row, read through process.env FIRST so a save
 * (which updates process.env in place, see `setDotEnvSecret`) is visible
 * immediately, then the boot-time config snapshot. Empty string when unset.
 * Exported for tests.
 */
export function readProviderKey(config: RepoOSConfig, row: ModelProviderRow): string {
  const fromEnv = row.envVar ? process.env[row.envVar] : undefined;
  if (fromEnv) return fromEnv;
  if (row.configKey) return config.modelProviders?.[row.configKey] ?? "";
  return "";
}

/**
 * The stored billing scope for rows that take one (GitHub Copilot, #0625).
 * Env-first like the key; empty string when unset. An org slug is not
 * secret material, so it is safe to surface in the row payload.
 */
export function readProviderScope(row: ModelProviderRow): string {
  if (!row.scopeEnvVar) return "";
  return process.env[row.scopeEnvVar]?.trim() ?? "";
}

export const getModelProviders: RouteHandler = async (ctx, _req, res) => {
  const providers = MODEL_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    dashboardUrl: p.dashboardUrl,
    note: p.note,
    hasKey: readProviderKey(ctx.config, p).length > 0,
    scope: readProviderScope(p),
  }));
  return json(res, 200, { providers, at: new Date().toISOString() });
};

export const getModelProviderUsage: RouteHandler = async (ctx, _req, res, params) => {
  const row = modelProviderById(params.param1 ?? "");
  if (!row) return json(res, 404, { error: "Unknown model provider." });
  if (row.kind !== "live") {
    return json(res, 400, {
      error: `${row.label} has no live RepoOS usage integration — it renders as a dashboard link-out.`,
    });
  }
  const apiKey = readProviderKey(ctx.config, row);
  if (!apiKey) {
    return json(res, 400, {
      error: `No ${row.label} API key saved yet — paste one on its row first.`,
    });
  }
  try {
    if (row.id === "openrouter") {
      const spend = await fetchOpenRouterSpend(apiKey);
      if (!spend.credits && !spend.key) {
        return json(res, 502, {
          error: spend.creditsError ?? spend.keyError ?? "OpenRouter request failed.",
        });
      }
      return json(res, 200, { kind: row.id, ...spend, at: new Date().toISOString() });
    }
    if (row.id === "opencode-go") {
      const usage = await fetchOpenCodeGoUsage(apiKey);
      return json(res, 200, { kind: row.id, ...usage, at: new Date().toISOString() });
    }
    if (row.id === "deepinfra") {
      const spend = await fetchDeepInfraSpend(apiKey);
      if (!spend.checklist && !spend.usage) {
        return json(res, 502, {
          error: spend.checklistError ?? spend.usageError ?? "DeepInfra request failed.",
        });
      }
      return json(res, 200, { kind: row.id, ...spend, at: new Date().toISOString() });
    }
    if (row.id === "github-copilot") {
      const usage = await fetchCopilotUsage(apiKey, readProviderScope(row));
      return json(res, 200, { kind: row.id, ...usage, at: new Date().toISOString() });
    }
    return json(res, 400, { error: "Unknown model provider." });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return json(res, 502, { error: reason });
  }
};

export const setModelProviderKey: RouteHandler = async (ctx, req, res, params) => {
  const row = modelProviderById(params.param1 ?? "");
  if (!row) return json(res, 404, { error: "Unknown model provider." });
  if (row.kind !== "live" || !row.envVar) {
    return json(res, 400, {
      error: `${row.label} does not support saving an API key in RepoOS yet — it renders as a dashboard link-out.`,
    });
  }
  const body = (await readBody(req)) as { key?: unknown; scope?: unknown };
  if (typeof body.key !== "string") {
    return json(res, 400, { error: "key must be a string." });
  }
  const key = body.key.trim();
  if (key.length > MAX_KEY_LEN) {
    return json(res, 400, { error: "That API key is too long to be valid." });
  }
  // Optional scope for rows that take one (GitHub Copilot): stored as its own
  // .env line, never in repoos.toml, and validated so a typo can't silently
  // point billing queries at the wrong account level.
  if (typeof body.scope === "string" && row.scopeEnvVar) {
    const scope = body.scope.trim();
    if (scope && !COPILOT_SCOPE_RE.test(scope)) {
      return json(res, 400, {
        error: "Scope must be empty (personal plan) or org:<name> / enterprise:<name>.",
      });
    }
    try {
      setDotEnvSecret(ctx.config.root, row.scopeEnvVar, scope);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return json(res, 400, { error: `Could not save the scope: ${reason}` });
    }
  }
  // A save without a scope field simply leaves the stored scope untouched.
  try {
    setDotEnvSecret(ctx.config.root, row.envVar, key);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return json(res, 400, { error: `Could not save the key: ${reason}` });
  }
  // Deliberately no logging anywhere in this handler, and no echo of the
  // value — the response carries only the resulting hasKey boolean, plus the
  // scope label (an org slug, not secret material) when a scope exists.
  return json(res, 200, {
    ok: true,
    hasKey: key.length > 0,
    scope: row.scopeEnvVar ? readProviderScope(row) : "",
  });
};
