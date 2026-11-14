/**
 * GitHub Copilot CLI named `--model` ids and per-model `--reasoning-effort` support.
 *
 * Source: Copilot CLI 1.0.109 (`copilot --version`) on 2026-11-15 — verified with
 * `copilot --model <id> -p hi` for each id and `copilot --model <id>
 * --reasoning-effort <level> -p x` for unsupported levels (fast rejection,
 * no prompt when unsupported). Invalid `--model` ids fail with "Model … is not
 * available." Auto tiers do not accept `--reasoning-effort` (CLI: model "auto"
 * does not support reasoning effort configuration). The interactive picker also
 * lists Gemini, Grok, Kimi, Sonnet, etc.; only the cheap named models Nick
 * approved are in `COPILOT_NAMED_MODELS`.
 */

/** Named models RepoOS exposes and forwards as `copilot --model <id>`. */
export const COPILOT_NAMED_MODELS = ["gpt-6-luna", "gpt-6.1-terra", "claude-haiku-5.5"] as const;

/** Every Copilot model id offered in the Agents model picker (Auto + named). */
export const COPILOT_MODEL_IDS = [
  "default",
  "copilot-auto-efficiency",
  "copilot-auto-balance",
  "copilot-auto-intelligence",
  ...COPILOT_NAMED_MODELS,
] as const;

/**
 * Per-model reasoning levels the CLI accepts (`--reasoning-effort`). Absent keys
 * are Auto tiers — they must not receive `--reasoning-effort`.
 */
export const COPILOT_MODEL_REASONING: Record<string, readonly string[]> = {
  "gpt-6-luna": ["none", "low", "medium", "high", "xhigh", "max"],
  "gpt-6.1-terra": ["low", "medium", "high", "xhigh", "max"],
  "claude-haiku-5.5": ["low", "medium", "high", "xhigh", "max"],
};

/** RepoOS default for named Copilot models (economical). */
export const COPILOT_DEFAULT_REASONING_EFFORT = "low";

const ALL_CLI_REASONING_LEVELS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export function isCopilotNamedModel(model: string): boolean {
  return (COPILOT_NAMED_MODELS as readonly string[]).includes(model);
}

export function copilotReasoningLevels(model: string): readonly string[] | null {
  return COPILOT_MODEL_REASONING[model] ?? null;
}

export function isCopilotReasoningSupported(model: string, level: string): boolean {
  const levels = copilotReasoningLevels(model);
  if (!levels) return false;
  return levels.includes(level);
}

/** Short picker subtitle: supported reasoning range for a Copilot model id. */
export function copilotModelReasoningHint(model: string): string | null {
  const levels = copilotReasoningLevels(model);
  if (!levels?.length) return null;
  if (levels.length === 1) return `reasoning ${levels[0]}`;
  return `reasoning ${levels[0]}–${levels[levels.length - 1]}`;
}

export function formatUnsupportedCopilotReasoning(model: string, level: string): string {
  const levels = copilotReasoningLevels(model);
  const valid =
    levels && levels.length > 0 ? levels.join(", ") : ALL_CLI_REASONING_LEVELS.join(", ");
  return (
    `Reasoning effort "${level}" is not supported for GitHub Copilot model "${model}". ` +
    `Valid levels for this model: ${valid}.`
  );
}

const COPILOT_MODEL_UNAVAILABLE =
  /(?:Execution failed:\s*)?Model ["'`]([^"'`]+)["'`] is not available/i;

const COPILOT_REASONING_UNSUPPORTED =
  /Reasoning effort ["'`]([^"'`]+)["'`] is not supported for model ["'`]([^"'`]+)["'`]/i;

/**
 * Plain-English guidance when Copilot rejects a model id. Returns null when the
 * text does not look like a model-catalog failure.
 */
export function formatCopilotModelFailure(detail: string): string | null {
  const text = detail.trim();
  if (!text) return null;
  const model = COPILOT_MODEL_UNAVAILABLE.exec(text)?.[1];
  if (!model) return null;
  const named = (COPILOT_NAMED_MODELS as readonly string[]).includes(model);
  const knownList = COPILOT_MODEL_IDS.filter((id) => id !== "default").join(", ");
  const accountNote = named
    ? `The model id "${model}" is in RepoOS's catalog but is not enabled for your Copilot account.`
    : `The model id "${model}" is not available for your Copilot account.`;
  return (
    `${accountNote} Open the Agents page, pick another GitHub Copilot model, and run Test again. ` +
    `RepoOS offers: ${knownList} (plus default / Auto · Balance).`
  );
}

/**
 * Plain-English guidance when Copilot rejects a reasoning level. Returns null when
 * the text does not match.
 */
export function formatCopilotReasoningFailure(detail: string): string | null {
  const text = detail.trim();
  if (!text) return null;
  const match = COPILOT_REASONING_UNSUPPORTED.exec(text);
  if (!match) return null;
  const [, level, model] = match;
  if (!level || !model) return null;
  if (isCopilotReasoningSupported(model, level)) return null;
  return formatUnsupportedCopilotReasoning(model, level);
}

/**
 * argv for a named Copilot model: `--model` plus economical `--reasoning-effort`
 * when the catalog lists levels. Auto tiers must use `copilotAutoTierModelArgs`
 * instead. Unknown ids pass through with `--model` only (saved pins).
 */
export function copilotNamedModelArgs(
  model: string,
  reasoningEffort: string = COPILOT_DEFAULT_REASONING_EFFORT,
): string[] {
  if (!model || model === "default") return [];
  const base = ["--model", model];
  const levels = copilotReasoningLevels(model);
  if (!levels) return base;
  if (!isCopilotReasoningSupported(model, reasoningEffort)) {
    throw new Error(formatUnsupportedCopilotReasoning(model, reasoningEffort));
  }
  return [...base, "--reasoning-effort", reasoningEffort];
}
