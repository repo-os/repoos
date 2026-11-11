/**
 * GitHub Copilot CLI Auto tiers (`--model auto --auto-tier <id>`).
 *
 * GitHub retired the `efficiency` tier for many accounts (Copilot CLI 1.0.109+).
 * RepoOS keeps the `copilot-auto-efficiency` model id as a persisted alias but maps
 * it (and `default`) to `balance` (the economical Auto tier RepoOS targets as default).
 * Valid tier ids are account-specific; the CLI validates against the user's catalog
 * and may suggest alternatives in error text — do not treat tier ids as a closed list.
 */

const COPILOT_AUTO_TIER_CLI_ID: Record<string, string> = {
  default: "balance",
  "copilot-auto-efficiency": "balance",
  "copilot-auto-balance": "balance",
  "copilot-auto-intelligence": "intelligence",
};

/**
 * Copilot CLI `--auto-tier` value for a RepoOS model id, or null when the id is a
 * named model rather than an Auto tier selection.
 */
export function resolveCopilotAutoTier(model: string): string | null {
  if (!model || model === "default") return "balance";
  return COPILOT_AUTO_TIER_CLI_ID[model] ?? null;
}

/** argv fragment for Copilot Auto tier models; empty when `model` is a named model id. */
export function copilotAutoTierModelArgs(model: string): string[] {
  const tier = resolveCopilotAutoTier(model);
  if (!tier) return [];
  return ["--model", "auto", "--auto-tier", tier];
}

/** Copilot-specific tier/catalog errors — must not match generic "unavailable" alone. */
const COPILOT_AUTO_TIER_FAILURE =
  /(?:Auto (?:profile|preference)|Set --auto-tier\b|auto-tier\s+(?:to|profile|preference))/i;

/**
 * Apply Copilot Auto tier guidance when `cli` is GitHub Copilot; otherwise return
 * the detail unchanged. Shared by one-shot, engineer, and review failure paths.
 */
export function enrichAgentFailureDetail(detail: string, cli?: string): string {
  if (cli !== "github copilot") return detail;
  return formatCopilotAutoTierFailure(detail) ?? detail;
}

/**
 * Plain-English guidance when Copilot rejects an Auto tier. Returns null when the
 * text does not look like a tier/catalog failure. When the CLI suggests tier ids,
 * those are quoted verbatim instead of assuming a fixed catalog.
 */
export function formatCopilotAutoTierFailure(detail: string): string | null {
  const text = detail.trim();
  if (!text) return null;
  if (/unknown option.*--auto-tier/i.test(text)) return null;
  if (!COPILOT_AUTO_TIER_FAILURE.test(text)) return null;

  const tier =
    /The [`']?(\w+)[`']? Auto profile is no longer available/i.exec(text)?.[1] ??
    /Auto preference [`']?(\w+)[`']? is unavailable/i.exec(text)?.[1] ??
    /[`']?(\w+)[`']? Auto profile is no longer available/i.exec(text)?.[1];

  const suggestMatch = /Set --auto-tier to (.+?)(?:\.|$)/i.exec(text);
  const fromCli = suggestMatch
    ? suggestMatch[1]
        .split(/\s*,\s*|\s+or\s+/i)
        .map((part) => part.trim().replace(/^[`']|[`']$/g, ""))
        .filter(Boolean)
    : [];

  const tierPhrase = tier
    ? `The Copilot Auto tier \`${tier}\` is not available for this account.`
    : "The selected Copilot Auto tier is not available for this account.";

  // Never suggest the tier that just failed (e.g. "`balance` is unavailable"
  // followed by "pick Balance").
  const failed = tier?.toLowerCase();
  const known = ["balance", "intelligence"].filter((t) => t !== failed);
  const cliOthers = fromCli.filter((t) => t.toLowerCase() !== failed);
  const options = cliOthers.length > 0 ? cliOthers : known;
  const optionText = options.length > 0 ? options.join(" or ") : "another Auto tier";

  const tierHint =
    fromCli.length > 0
      ? ` Your Copilot CLI suggested: ${cliOthers.length > 0 ? cliOthers.join(" or ") : "(nothing other than the tier that failed)"}.`
      : " Valid tier ids depend on your Copilot account.";

  return (
    `${tierPhrase} Open the Agents page and pick a different model for this agent (try ${optionText}).${tierHint} ` +
    `RepoOS maps default and the legacy copilot-auto-efficiency model id to Balance.`
  );
}
