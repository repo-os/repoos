/**
 * Agent-driver budget enforcement (#0764).
 *
 * A human in the UI keeps the full agent+model list; an *agent driver* — a
 * CLI/API caller operating RepoOS — is steered to a human-approved subset.
 * `repoos override` and a direct `PATCH /api/tasks/:id` with
 * `cliOverride`/`modelOverride` are the two ways an engineer/reviewer override
 * is set; when the caller is an agent driver and the pair is not on the
 * allowlist, the server refuses and lists the allowed pairs.
 *
 * The empty/unset allowlist is a deliberate no-op: nothing is restricted and
 * agent drivers behave exactly as before.
 */
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  allowlistIsEmpty,
  describeAllowlistPairs,
  isPairOnAllowlist,
  pairPauseInfo,
} from "../core/budget-allowlist.js";
import { isModelOverridePinned, resolveAgentForTask } from "./agents.js";

export interface OverrideInput {
  cliOverride?: string | null;
  modelOverride?: string | null;
}

/**
 * The refusal message when `input` would set an engineer/reviewer override the
 * allowlist forbids, or `null` when it is allowed (including when no override
 * is actually being set, or the allowlist is empty).
 *
 * Resolution goes through `resolveAgentForTask`, the same code path the run
 * uses, so "which pair would this actually run" can't drift: a CLI-only
 * override against a listed CLI is allowed (its model resets to the base
 * default, which the allowlist need not pin), while a non-listed CLI or a
 * listed CLI with an unlisted model is refused.
 */
export function overrideRefusal(
  config: RepoOSConfig,
  task: Task,
  input: OverrideInput,
): string | null {
  const rows = config.budget?.allowlist ?? [];
  if (allowlistIsEmpty(rows)) return null;
  const settingCli = typeof input.cliOverride === "string" && !!input.cliOverride;
  const settingModel = isModelOverridePinned(input.modelOverride);
  if (!settingCli && !settingModel) return null;

  const merged = resolveAgentForTask(config, {
    ...task,
    cliOverride: settingCli ? (input.cliOverride as string) : task.cliOverride,
    modelOverride: settingModel ? (input.modelOverride as string) : task.modelOverride,
  });
  if (!merged) return null;
  const requestedModel =
    merged.model && merged.model !== "default" ? merged.model : "(its default model)";
  if (!isPairOnAllowlist(rows, merged.cli, merged.model)) {
    return (
      `Agent driver override not allowed: ${merged.cli} + ${requestedModel} is not on the ` +
      `budget allowlist. Allowed pairs: ${describeAllowlistPairs(rows)}. ` +
      `A human can change the allowlist on the Agents page's Budget Controls tab.`
    );
  }
  // Pausing is enforced like the allowlist itself (#0850): an agent driver may
  // not pin a paused pair, and the refusal names the pause and how to resume it.
  const pause = pairPauseInfo(rows, merged.cli, merged.model);
  if (pause.paused) {
    return (
      `Agent driver override not allowed: ${merged.cli} + ${requestedModel} is paused` +
      `${pause.reason ? ` (${pause.reason})` : ""}` +
      `${pause.until ? ` until ${pause.until}` : ""}. ` +
      `Allowed pairs: ${describeAllowlistPairs(rows)}. ` +
      `A human can resume it on the Agents page's Budget Controls tab.`
    );
  }
  return null;
}
