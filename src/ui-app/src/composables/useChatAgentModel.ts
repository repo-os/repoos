/**
 * Persisted coding agent + model for a chat surface's agent (#0669).
 *
 * Two kinds of chat back onto different config:
 *
 *  - `agents[]`: the CTO and Ross are ordinary entries in `config.agents`, the
 *    same list the Agents page edits. Changing one persists the whole list via
 *    `config.saveAgents()`.
 *  - `builtInAgents.<name>`: the Debugger is a built-in agent toggled on the
 *    Agents page, persisted with a `PATCH /api/config` of that one entry.
 *
 * Both paths are exactly what the Agents page itself does, so a pick made from
 * a chat header lands in the same place a pick on the Agents page would — the
 * change takes effect for the next turn and survives a reload.
 */
import { computed, type ComputedRef } from "vue";
import { api, JSON_OPTS } from "../api";
import { useConfigStore } from "../stores/config";
import type { Agent } from "../types";

/** One option in the model picker — structurally the modal's `SelectSearchOption`. */
export interface ModelOption {
  value: string;
  label: string;
  disabled: boolean;
}

export interface ChatAgentModel {
  /** The agent's current CLI, or "" before it resolves. */
  cli: ComputedRef<string>;
  /** The agent's current model, or "" before it resolves. */
  model: ComputedRef<string>;
  /** CLI options for the picker, filtered the way the Agents page filters. */
  cliOptions: ComputedRef<string[]>;
  /** Model options for the selected CLI. */
  modelOptions: ComputedRef<ModelOption[]>;
  /** Persist a new cli/model (either may be omitted to keep the current one). */
  setAgentModel: (cli: string, model: string) => Promise<void>;
}

const CTO_MEMORY_KEY = "builtin-chat:cto";
const GUIDE_MEMORY_KEY = "builtin-chat:ross";
const DEBUGGER_MEMORY_KEY = "builtin:debugger";

function cliOptionsFrom(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [current, ...list] : list;
}

/**
 * A chat agent backed by an entry in `config.agents` (CTO, Ross). Name matching
 * mirrors the server's `resolveCto` / `resolveRepoGuide`: the CTO by its role
 * name, Ross by "Ross" or the legacy "RepoOS Guide".
 */
export function useAgentsListChatAgent(nameMatcher: (a: Agent) => boolean): ChatAgentModel {
  const config = useConfigStore();
  const agent = computed(
    () => (config.agents ?? []).find(nameMatcher) ?? (config.agents ?? [])[0] ?? null,
  );

  const cli = computed(() => agent.value?.cli ?? "");
  const model = computed(() => agent.value?.model ?? "");

  const cliOptions = computed(() => cliOptionsFrom(config.agentsMeta.clis ?? [], cli.value));
  const modelOptions = computed(() => config.modelsFor(cli.value, model.value || undefined));

  async function setAgentModel(nextCli: string, nextModel: string): Promise<void> {
    const list = config.agents ?? [];
    if (!list.length) return;
    await config.saveAgents(
      list.map((a) =>
        a === agent.value ? { ...a, cli: nextCli || a.cli, model: nextModel || a.model } : a,
      ),
    );
  }

  return { cli, model, cliOptions, modelOptions, setAgentModel };
}

/** The CTO chat's agent + model, from `config.agents`. */
export function useCtoChatAgent(): ChatAgentModel {
  return useAgentsListChatAgent((a) => a.enabled && a.name.toLowerCase() === "cto");
}

/** Ross's agent + model, from `config.agents`. */
export function useRossChatAgent(): ChatAgentModel {
  return useAgentsListChatAgent(
    (a) =>
      a.enabled && (a.name.toLowerCase() === "ross" || a.name.toLowerCase() === "repoos guide"),
  );
}

/**
 * The Debugger's agent + model, from `builtInAgents.debugger`. Mirrors the
 * Debugger's default pair (agents.ts `debuggerAgent`) until the user picks one.
 */
export function useDebuggerChatAgent(): ChatAgentModel {
  const config = useConfigStore();
  const defaults = { cli: "opencode", model: "deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731" };
  const state = computed(() => {
    const data = config.data as Record<string, unknown> | null;
    const agents = (data?.builtInAgents ?? {}) as Record<string, { cli?: string; model?: string }>;
    return agents.debugger ?? {};
  });

  const cli = computed(() => state.value.cli?.trim() || defaults.cli);
  const model = computed(() => state.value.model?.trim() || defaults.model);

  const cliOptions = computed(() => cliOptionsFrom(config.agentsMeta.clis ?? [], cli.value));
  const modelOptions = computed(() => config.modelsFor(cli.value, model.value || undefined));

  async function setAgentModel(nextCli: string, nextModel: string): Promise<void> {
    const data = config.data as Record<string, unknown> | null;
    const existing = (data?.builtInAgents as Record<string, unknown>) || {};
    const prev = (existing.debugger as Record<string, unknown>) || {};
    await api(
      "/api/config",
      JSON_OPTS("PATCH", {
        builtInAgents: {
          ...existing,
          debugger: { ...prev, cli: nextCli || cli.value, model: nextModel || model.value },
        },
      }),
    );
    const res = (await api("/api/config")) as Record<string, unknown>;
    config.data = res.config as Record<string, unknown>;
  }

  return { cli, model, cliOptions, modelOptions, setAgentModel };
}

export const CHAT_AGENT_MEMORY_KEYS = {
  cto: CTO_MEMORY_KEY,
  ross: GUIDE_MEMORY_KEY,
  debugger: DEBUGGER_MEMORY_KEY,
} as const;
