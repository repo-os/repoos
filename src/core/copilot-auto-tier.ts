/**
 * GitHub Copilot CLI Auto tiers (`--model auto --auto-tier <id>`).
 *
 * GitHub retired the `efficiency` tier for many accounts (Copilot CLI 1.0.109+).
 * RepoOS keeps the `copilot-auto-efficiency` model id as a persisted alias but maps
 * it (and `default`) to `balance`, the cheapest tier that remains in common catalogs.
 * Valid tier ids are account-specific; the CLI validates against the user's catalog
 * and may suggest alternatives in error text — do not treat tier ids as a closed list.
 */

/** RepoOS model ids that select Copilot Auto with a specific tier. */
export const COPILOT_AUTO_TIER_MODEL_IDS = [
  "default",
  "copilot-auto-efficiency",
  "copilot-auto-balance",
  "copilot-auto-intelligence",
] as const;

/**
 * Copilot CLI `--auto-tier` value for a RepoOS model id, or null when the id is a
 * named model rather than an Auto tier selection.
 */
export function resolveCopilotAutoTier(model: string): string | null {
  if (
    model === "default" ||
    !model ||
    model === "copilot-auto-efficiency" ||
    model === "copilot-auto-balance"
  ) {
    return "balance";
  }
  if (model === "copilot-auto-intelligence") return "intelligence";
  return null;
}

/** argv fragment for Copilot Auto tier models; empty when `model` is a named model id. */
export function copilotAutoTierModelArgs(model: string): string[] {
  const tier = resolveCopilotAutoTier(model);
  if (!tier) return [];
  return ["--model", "auto", "--auto-tier", tier];
}

const COPILOT_AUTO_TIER_FAILURE =
  /Auto (?:profile|preference)|auto-tier|no longer available|is unavailable/i;

/**
 * Plain-English guidance when Copilot rejects an Auto tier. Returns null when the
 * text does not look like a tier/catalog failure. When the CLI suggests tier ids,
 * those are quoted verbatim instead of assuming a fixed catalog.
 */
export function formatCopilotAutoTierFailure(detail: string): string | null {
  const text = detail.trim();
  if (!text || !COPILOT_AUTO_TIER_FAILURE.test(text)) return null;

  const tier =
    /The [`']?(\w+)[`']? Auto profile is no longer available/i.exec(text)?.[1] ??
    /Auto preference [`']?(\w+)[`']? is unavailable/i.exec(text)?.[1] ??
    /[`']?(\w+)[`']? Auto profile is no longer available/i.exec(text)?.[1];

  const suggestMatch = /Set --auto-tier to (.+?)(?:\.|$)/i.exec(text);
  const fromCli = suggestMatch
    ? suggestMatch[1]
        .split(/\s+or\s+/i)
        .map((part) => part.trim().replace(/^[`']|[`']$/g, ""))
        .filter(Boolean)
    : [];

  const suggestions =
    fromCli.length > 0
      ? fromCli.map((id) => `\`${id}\``).join(" or ")
      : "`balance` or `intelligence` (see `copilot --help` for your account catalog)";

  const tierPhrase = tier
    ? `The Copilot Auto tier \`${tier}\` is not available for this account.`
    : "The selected Copilot Auto tier is not available for this account.";

  return (
    `${tierPhrase} In Settings → Agents, pick Auto · Balance or Auto · Intelligence, ` +
    `or pass --auto-tier with an id your CLI accepts (for example ${suggestions.replace(/`/g, "")}). ` +
    `RepoOS maps default and the legacy copilot-auto-efficiency model id to Balance.`
  );
}
