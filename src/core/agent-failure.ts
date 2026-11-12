/** Plain language summaries for common CLI failures. Raw CLI output remains in the transcript. */
export type AgentFailureReasonId = "auth" | "model-unavailable" | "usage-limit" | "network";

export interface AgentFailureReason {
  id: AgentFailureReasonId;
  summary: string;
  fix: string;
}

const AUTH = /(?:not logged in|not authenticated|unauthenticated|authentication (?:failed|expired)|token expired|sign(?:ed)? out|please log in|oauth.*expired)/i;
const MODEL = /(?:cannot use this model|model.{0,40}(?:unavailable|not available|not found|unsupported)|unknown model)/i;
const LIMIT = /(?:usage limit|rate limit|quota exceeded|out of usage|too many requests)/i;
const NETWORK = /(?:ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network unreachable|fetch failed|socket hang up|connection timed out)/i;

/** Classify known CLI failures; null means callers should preserve/show the raw tail. */
export function classifyAgentFailure(detail: string, cli = ""): AgentFailureReason | null {
  const text = detail.trim();
  if (!text) return null;
  if (/github copilot/i.test(cli) && /(?:Auto (?:profile|preference)|Set --auto-tier\b|auto-tier\s+(?:to|profile|preference))/i.test(text)) {
    return { id: "model-unavailable", summary: "Copilot Auto tier is not available for this account.", fix: "Choose another model on the Agents page." };
  }
  if (AUTH.test(text)) return { id: "auth", summary: `${cli || "This agent"} is signed out.`, fix: `Re-authenticate ${cli || "the agent"} on this computer.` };
  if (MODEL.test(text)) {
    const model = /Cannot use this model:\s*([^\s.,]+)/i.exec(text)?.[1];
    return { id: "model-unavailable", summary: model ? `Model ${model} is not available for this account.` : "The selected model is not available for this account.", fix: "Choose another model on the Agents page." };
  }
  if (LIMIT.test(text)) return { id: "usage-limit", summary: `${cli || "Agent"} usage limit reached.`, fix: "Wait for the provider limit to reset, then retry." };
  if (NETWORK.test(text)) return { id: "network", summary: `${cli || "Agent"} cannot reach its service.`, fix: "Check this computer's network connection, then retry." };
  return null;
}

export function formatAgentFailure(detail: string, cli?: string): string {
  const reason = classifyAgentFailure(detail, cli);
  return reason ? `${reason.summary} ${reason.fix} (CLI: ${detail.trim()})` : detail;
}
