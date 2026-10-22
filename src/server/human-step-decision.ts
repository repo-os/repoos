/**
 * Server wiring for the optional human-step decision check (#0804).
 *
 * Runs `decideHumanStep` against the same provider path adaptive routing uses
 * (#0791/#0792) and folds the result into a start/fallback outcome:
 *
 * - `off`        — the setting is off (or routing is); the keyword check runs.
 * - `unavailable`— no provider could be built (routing off, missing key); the
 *                  keyword check runs.
 * - `failed`     — the provider call failed; the keyword check runs.
 * - `shadow`     — routing is in shadow mode; the verdict is recorded only and
 *                  never blocks.
 * - `agent`      — automatic mode decided an AI agent can do it; suppress the
 *                  keyword check for this task.
 * - `human`      — automatic mode decided a human-only step is needed; block
 *                  the start and flag the task with the explanation.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import { resolveEffectiveRouting } from "../core/model-routing/config.js";
import { buildRoutingProvider } from "../core/model-routing/runtime.js";
import type { RoutingDecisionProvider } from "../core/model-routing/types.js";
import { decideHumanStep, type HumanStepDecision } from "../core/human-step-decision.js";
import { recordOneShotSession, type PromptResult } from "./agents.js";

export type HumanStepCheckOutcome = "off" | "unavailable" | "failed" | "shadow" | "agent" | "human";

export interface HumanStepCheckResult {
  outcome: HumanStepCheckOutcome;
  decision?: HumanStepDecision;
  /** The bounded explanation to show as the flag detail, when a verdict landed. */
  detail?: string;
  /** The provider failure message, when `outcome === "failed"`. */
  error?: string;
}

/** The synthetic Agent used only to record the decision call's usage. */
function decisionAccountingAgent(providerId: string | null, model: string | null) {
  return {
    name: `Decision check (${providerId ?? "none"})`,
    cli: providerId ?? "model-router",
    model: model ?? "unknown",
    enabled: true,
  };
}

function recordDecisionUsage(
  config: RepoOSConfig,
  taskId: string | null,
  model: string,
  usage: { inputTokens: number | null; outputTokens: number | null } | null,
  elapsedMs: number,
): void {
  const inputTokens = usage?.inputTokens ?? undefined;
  const outputTokens = usage?.outputTokens ?? undefined;
  const totalTokens =
    inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;
  const result: PromptResult = {
    ok: true,
    elapsedMs,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
  try {
    recordOneShotSession(
      config.root,
      decisionAccountingAgent(config.modelRouting?.provider ?? null, model),
      result,
      { sessionType: "routing", taskId },
    );
  } catch {
    // Accounting must never break a start.
  }
}

/**
 * Run the decision check for a task about to start. Never throws: any provider
 * problem maps to a fallback outcome so the caller runs the keyword check.
 */
export async function runHumanStepDecisionCheck(
  config: RepoOSConfig,
  task: Pick<Task, "id" | "title" | "body"> & { matchedSentence?: string },
  deps: { provider?: RoutingDecisionProvider | null; recordUsage?: boolean } = {},
): Promise<HumanStepCheckResult> {
  if (config.modelRouting?.humanStepCheck !== true) return { outcome: "off" };

  const effective = resolveEffectiveRouting(config.modelRouting);
  const provider = "provider" in deps ? (deps.provider ?? null) : buildRoutingProvider(effective);
  if (!provider) return { outcome: "unavailable" };

  const startedAt = Date.now();
  const result = await decideHumanStep({
    provider,
    brief: { title: task.title, body: task.body, matchedSentence: task.matchedSentence },
    timeoutMs: effective.timeoutMs,
  });
  if (result.status === "unavailable") return { outcome: "unavailable" };
  if (result.status === "failed") return { outcome: "failed", error: result.error };

  if (deps.recordUsage !== false) {
    recordDecisionUsage(
      config,
      task.id ?? null,
      result.model,
      result.usage,
      Date.now() - startedAt,
    );
  }

  const { decision } = result;
  const detail = decision.explanation;
  if (effective.mode !== "automatic") {
    return { outcome: "shadow", decision, detail };
  }
  return { outcome: decision.needsHumanStep ? "human" : "agent", decision, detail };
}
