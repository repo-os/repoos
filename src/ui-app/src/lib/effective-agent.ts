/**
 * Effective per-task agent assignment for display (#0684).
 *
 * The board card and the drawer's run header must show the agent, CLI and
 * model a run will ACTUALLY use, not the raw override strings. The resolution
 * mirrors the server's `mergeAgentOverride` / `resolveAgentForTask`
 * (`src/server/agents.ts`):
 *
 *  - `agentOverride` (or the role name by default) names the enabled base agent;
 *  - `cliOverride` replaces the base CLI when set;
 *  - `modelOverride` is a pin only when it is a real value — the literal
 *    `"default"` is a sentinel meaning "the base agent's own model";
 *  - a CLI override that changes the harness resets the model to `"default"`
 *    (the new harness's own default) unless a real model pin is given.
 *
 * Keeping it in one place stops the card and the drawer from drifting into
 * two different answers to "which agent is running this?".
 */

/** The minimal agent shape the resolver needs (matches the config `Agent`). */
export interface EffectiveAgentInput {
  name: string;
  cli: string;
  model: string;
  enabled: boolean;
}

/** The per-role override fields carried on a task. */
export interface RoleOverrides {
  agentOverride?: string | null;
  cliOverride?: string | null;
  modelOverride?: string | null;
}

export interface EffectiveAgent {
  name: string;
  cli: string;
  model: string;
  /** The base agent's own CLI, before any override. */
  baseCli: string;
  /** The base agent's own model, before any override. */
  baseModel: string;
}

/**
 * Resolve the effective agent for one role on one task. Returns null only when
 * there is no task — an unknown base name still resolves to a synthetic
 * assignment so the UI can show what the override string names rather than
 * silently falling back.
 */
export function resolveEffectiveAgent(
  agents: readonly EffectiveAgentInput[],
  overrides: RoleOverrides,
  role: "pm" | "engineer" | "reviewer",
): EffectiveAgent {
  const name = (overrides.agentOverride || role).toLowerCase();
  const base = agents.find((a) => a.enabled && a.name.toLowerCase() === name) ?? null;
  const baseCli = base?.cli ?? "default";
  const baseModel = base?.model ?? "default";
  const cli = overrides.cliOverride || baseCli;
  const model =
    overrides.modelOverride && overrides.modelOverride !== "default"
      ? overrides.modelOverride
      : cli !== baseCli
        ? "default"
        : baseModel;
  return { name: base?.name ?? name, cli, model, baseCli, baseModel };
}
