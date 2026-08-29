import { join } from "node:path";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  AGENT_CLIS,
  AGENT_MODELS,
  DEFAULT_AGENTS,
  agentsForConfig,
  getConfigSchema,
  patchTomlConfig,
  loadConfig,
  sanitizeBuiltInAgents,
  saveBuiltInAgentsConfig,
} from "../../core/config.js";
import { readTunnelConfig, writeTunnelConfig } from "../../core/tunnel.js";

/**
 * Config as the browser may see it: `whisper.apiKey` is stripped entirely and
 * the whisper state is exposed through the flat schema keys
 * (`whisper.provider`) plus a `whisperEnabled` boolean. The secret never
 * crosses the HTTP boundary. Auth secrets (sessionSecret, emailProvider.apiKey,
 * google.clientSecret) are also stripped.
 */
function safeConfigForBrowser(config: Record<string, unknown>): Record<string, unknown> {
  const whisper = (config.whisper ?? { provider: "none", apiKey: "" }) as {
    provider?: string;
    apiKey?: string;
  };
  const whisperEnabled = whisper.provider !== "none" && !!whisper.apiKey;
  const {
    whisper: _ignoredWhisper,
    theme: _ignoredTheme,
    uiTheme: _ignoredUiTheme,
    ...rest
  } = config;
  // Strip auth secrets
  const authRaw = rest.auth as Record<string, unknown> | undefined;
  let safeAuth: Record<string, unknown> | undefined;
  if (authRaw && typeof authRaw === "object") {
    safeAuth = { ...authRaw };
    delete safeAuth.sessionSecret;
    if (safeAuth.emailProvider && typeof safeAuth.emailProvider === "object") {
      safeAuth.emailProvider = {
        ...(safeAuth.emailProvider as Record<string, unknown>),
        apiKey: "***",
      };
    }
    if (safeAuth.google && typeof safeAuth.google === "object") {
      safeAuth.google = {
        ...(safeAuth.google as Record<string, unknown>),
        clientSecret: "***",
      };
    }
  }
  return {
    ...rest,
    auth: safeAuth,
    "whisper.provider": whisper.provider ?? "none",
    whisperEnabled,
  };
}

export const readConfig: RouteHandler = (ctx, _req, res) => {
  const { repoos } = ctx;
  const agents = agentsForConfig(repoos.config);
  const safeConfig = safeConfigForBrowser({ ...repoos.config, agents });
  return json(res, 200, {
    config: safeConfig,
    schema: getConfigSchema(),
    agentsMeta: { clis: AGENT_CLIS, models: AGENT_MODELS, defaults: DEFAULT_AGENTS },
  });
};

export const patchConfig: RouteHandler = async (ctx, req, res) => {
  const { config, repoos, index } = ctx;
  const body = (await readBody(req)) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.agents !== undefined) {
    if (!Array.isArray(body.agents)) {
      return json(res, 400, { error: "agents must be an array" });
    }
    const list: {
      name: string;
      cli: string;
      model: string;
      enabled: boolean;
      instructions?: string;
    }[] = [];
    for (const agent of body.agents) {
      const a = agent as Record<string, unknown>;
      if (typeof a?.name !== "string" || !a.name.trim()) {
        return json(res, 400, { error: "each agent needs a non-empty name" });
      }
      if (!AGENT_CLIS.includes(a.cli as (typeof AGENT_CLIS)[number])) {
        return json(res, 400, { error: `cli must be one of: ${AGENT_CLIS.join(", ")}` });
      }
      if (typeof a.model !== "string" || !a.model.trim()) {
        return json(res, 400, {
          error: `agent "${a.name}" model must be a non-empty string`,
        });
      }
      if (typeof a.enabled !== "boolean") {
        return json(res, 400, { error: `agent "${a.name}" enabled must be true or false` });
      }
      if (a.instructions !== undefined && typeof a.instructions !== "string") {
        return json(res, 400, { error: `agent "${a.name}" instructions must be a string` });
      }
      const entry: {
        name: string;
        cli: string;
        model: string;
        enabled: boolean;
        instructions?: string;
      } = {
        name: a.name.trim(),
        cli: a.cli as string,
        model: a.model as string,
        enabled: a.enabled,
      };
      if (typeof a.instructions === "string" && a.instructions.trim()) {
        entry.instructions = a.instructions.trim();
      }
      list.push(entry);
    }
    patch.agents = list;
  }

  // builtInAgents toggles (e.g. enabling the Debugger or Tech Debt Agent) are
  // persisted to the sidecar, NOT repoos.toml — mirroring how built-in agent
  // state is stored and read (see config.ts:saveBuiltInAgentsConfig).
  let builtInAgentsChanged = false;
  if (body.builtInAgents !== undefined) {
    if (
      typeof body.builtInAgents !== "object" ||
      body.builtInAgents === null ||
      Array.isArray(body.builtInAgents)
    ) {
      return json(res, 400, { error: "builtInAgents must be an object" });
    }
    const state = sanitizeBuiltInAgents(body.builtInAgents);
    const base = repoos.config.builtInAgents ?? {};
    const merged = { ...base, ...state };
    saveBuiltInAgentsConfig(config.root, merged, config.cacheDir);
    repoos.config.builtInAgents = merged;
    builtInAgentsChanged = true;
  }

  // Auth config patching — handle auth-specific fields that live in [auth]
  // section of repoos.toml. Secrets (sessionSecret, emailProvider.apiKey,
  // google.clientSecret) are never written to repoos.toml — that file is
  // git-tracked. They're rejected here even if a client sends them, and must
  // be set via REPOOS_RESEND_API_KEY / REPOOS_GOOGLE_CLIENT_SECRET in .env
  // instead (see docs/native-auth.md and the tracked .env.example).
  if (
    body["auth.emailProvider.apiKey"] !== undefined ||
    body["auth.google.clientSecret"] !== undefined
  ) {
    return json(res, 400, {
      error:
        "auth.emailProvider.apiKey and auth.google.clientSecret can't be set here — repoos.toml is git-tracked. " +
        "Set REPOOS_RESEND_API_KEY / REPOOS_GOOGLE_CLIENT_SECRET in .env instead (see .env.example).",
    });
  }

  let authEnabledChanged = false;
  if (body["auth.enabled"] !== undefined) {
    const val = body["auth.enabled"];
    if (typeof val !== "boolean") {
      return json(res, 400, { error: "auth.enabled must be true or false" });
    }
    patch["auth.enabled"] = val;
    authEnabledChanged = true;
  }
  if (body["auth.sessionMaxAge"] !== undefined) {
    const val = body["auth.sessionMaxAge"];
    if (typeof val === "string" || typeof val === "number") {
      const num = Number(val);
      if (Number.isInteger(num) && num >= 300) {
        patch["auth.sessionMaxAge"] = num;
      }
    }
  }
  if (body["auth.emailProvider.type"] !== undefined) {
    patch["auth.emailProvider.type"] = "resend";
  }
  if (body["auth.emailProvider.fromAddress"] !== undefined) {
    const val =
      typeof body["auth.emailProvider.fromAddress"] === "string"
        ? body["auth.emailProvider.fromAddress"].trim()
        : "";
    if (val) patch["auth.emailProvider.fromAddress"] = val;
  }
  if (body["auth.google.clientId"] !== undefined) {
    const val =
      typeof body["auth.google.clientId"] === "string" ? body["auth.google.clientId"].trim() : "";
    if (val) patch["auth.google.clientId"] = val;
  }

  // Guard: enabling auth requires a login provider to be configured. Secrets
  // only ever come from repoos.config (env-var-sourced), never from the
  // request body — see the rejection above.
  const enablingAuth = patch["auth.enabled"] === true;
  if (enablingAuth) {
    const hasEmailProvider = !!(
      repoos.config.auth?.emailProvider?.apiKey && repoos.config.auth?.emailProvider?.fromAddress
    );
    const hasGoogle = !!(
      repoos.config.auth?.google?.clientId && repoos.config.auth?.google?.clientSecret
    );
    if (!hasEmailProvider && !hasGoogle) {
      return json(res, 400, {
        error:
          "Cannot enable auth: configure at least one login provider (email OTP or Google OAuth) first",
      });
    }
  }

  const schema = getConfigSchema();
  for (const field of schema) {
    if (body[field.key] === undefined) continue;
    const val = body[field.key];

    if (field.type === "string") {
      if (field.key === "whisper.apiKey") {
        // The form always carries this field (default ""). An empty value means
        // "leave the existing key untouched" — never wipe a TOML/env key, and
        // never reject an unrelated settings save over it.
        const trimmed = typeof val === "string" ? val.trim() : "";
        if (trimmed) patch[field.key] = trimmed;
        continue;
      }
      if (typeof val !== "string" || (!val.toString().trim() && field.key !== "ntfyTopic")) {
        return json(res, 400, { error: `${field.label} must be a non-empty string` });
      }
      patch[field.key] = val.toString().trim();
    } else if (field.type === "boolean") {
      if (typeof val !== "boolean") {
        return json(res, 400, { error: `${field.label} must be true or false` });
      }
      patch[field.key] = val;
    } else if (field.type === "select") {
      const valid = field.options?.map((o) => o.value) ?? [];
      if (!valid.includes(val as string)) {
        return json(res, 400, {
          error: `${field.label} must be one of: ${valid.join(", ")}`,
        });
      }
      // Native/select components submit strings. These settings are numbers
      // in the runtime config, so persist them as TOML numeric syntax rather
      // than `maxActiveTasks = "5"`, which loadConfig intentionally rejects.
      patch[field.key] =
        field.key === "maxActiveTasks" ||
        field.key === "maxConcurrentAgents" ||
        field.key === "worktreeWarnThreshold"
          ? Number(val)
          : val;
    } else if (field.type === "array") {
      if (!Array.isArray(val) || !val.length) {
        return json(res, 400, { error: `${field.label} must be a non-empty array` });
      }
      for (const item of val) {
        if (typeof item !== "string" || !item.trim()) {
          return json(res, 400, {
            error: `${field.label} entries must be non-empty strings`,
          });
        }
      }
      patch[field.key] = (val as string[]).map((s) => s.trim());
    }
  }

  const tunnelEnabled = typeof patch.tunnelEnabled === "boolean" ? patch.tunnelEnabled : undefined;
  delete patch.tunnelEnabled;

  // An empty `whisper.apiKey` alone means "leave the key as-is" — a no-op
  // (e.g. the user cleared the field in Settings), not "nothing to update".
  const bodyKeys = Object.keys(body);
  const onlyEmptyWhisperKey =
    bodyKeys.length === 1 &&
    bodyKeys[0] === "whisper.apiKey" &&
    (typeof body["whisper.apiKey"] !== "string" || !body["whisper.apiKey"].trim());

  if (
    Object.keys(patch).length === 0 &&
    tunnelEnabled === undefined &&
    !builtInAgentsChanged &&
    !authEnabledChanged &&
    !onlyEmptyWhisperKey
  ) {
    return json(res, 400, { error: "No valid fields to update" });
  }

  if (Object.keys(patch).length > 0) {
    patchTomlConfig(join(config.root, "repoos.toml"), patch);
  }
  if (tunnelEnabled !== undefined) {
    const tunnel = readTunnelConfig(config.root);
    tunnel.enabled = tunnelEnabled;
    writeTunnelConfig(config.root, tunnel);
  }

  Object.assign(repoos.config, loadConfig(config.root));

  if (patch.workDir || patch.cacheDir || patch.taskExtensions) {
    index.refreshAll();
  }

  return json(res, 200, { ok: true, config: safeConfigForBrowser({ ...repoos.config }) });
};
