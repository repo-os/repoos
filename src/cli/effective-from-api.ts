/**
 * Resolve the engineer a task will run with, from server API payloads (#0723).
 * Uses the same rules as the UI (`effective-agent.ts`), not a local disk reindex.
 */
import {
  resolveEffectiveAgent,
  type EffectiveAgent,
  type EffectiveAgentInput,
} from "../ui-app/src/lib/effective-agent.js";

export interface ApiTaskOverrides {
  agentOverride?: string | null;
  cliOverride?: string | null;
  modelOverride?: string | null;
}

export function effectiveEngineerFromApi(
  agents: readonly EffectiveAgentInput[],
  task: ApiTaskOverrides,
): EffectiveAgent {
  return resolveEffectiveAgent(
    agents,
    {
      agentOverride: task.agentOverride ?? null,
      cliOverride: task.cliOverride ?? null,
      modelOverride: task.modelOverride ?? null,
    },
    "engineer",
  );
}
