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

export const readConfig: RouteHandler = (ctx, _req, res) => {
  const { repoos } = ctx;
  const agents = agentsForConfig(repoos.config);
  return json(res, 200, {
    config: { ...repoos.config, agents },
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

  const schema = getConfigSchema();
  for (const field of schema) {
    if (body[field.key] === undefined) continue;
    const val = body[field.key];

    if (field.type === "string") {
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
      patch[field.key] = val;
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

  const tunnelEnabled =
    typeof patch.tunnelEnabled === "boolean" ? patch.tunnelEnabled : undefined;
  delete patch.tunnelEnabled;

  if (Object.keys(patch).length === 0 && tunnelEnabled === undefined && !builtInAgentsChanged) {
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

  return json(res, 200, { ok: true, config: repoos.config });
};
