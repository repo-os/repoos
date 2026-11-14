/** Plain language summaries for common CLI failures. Raw CLI output remains in the transcript. */
import { stripAnsi } from "./close-out-failure.js";

export type AgentFailureReasonId =
  | "auth"
  | "model-unavailable"
  | "out-of-credit"
  | "usage-limit"
  | "network";

export interface AgentFailureReason {
  id: AgentFailureReasonId;
  summary: string;
  fix: string;
}

const AUTH =
  /(?:not logged in|not authenticated|unauthenticated|authentication (?:failed|expired)|token expired|sign(?:ed)? out|please log in|oauth.*expired)/i;
const MODEL =
  /(?:cannot use this model|model.{0,40}(?:unavailable|not available|not found|unsupported)|unknown model)/i;
const CREDIT =
  /(?:you need positive balance|insufficient (?:credit|balance)|payment required|\b402\b)/i;
const LIMIT =
  /(?:usage limit|rate limit|quota exceeded|out of usage|too many requests|individual quota reached|resource_exhausted|\b429\b)/i;
const NETWORK =
  /(?:ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network unreachable|fetch failed|socket hang up|connection timed out)/i;

const RAW_CLI_CAP = 8000;
const SUMMARY_LINE_MAX = 120;
const CLI_DETAIL_MARKER = " (CLI: ";

function cliName(cli: string): string {
  const names: Record<string, string> = {
    cursor: "Cursor",
    "claude code": "Claude",
    "github copilot": "Copilot",
    codex: "Codex",
    opencode: "OpenCode",
    "qwen code": "Qwen Code",
    antigravity: "Antigravity",
    crush: "Crush",
    muse: "Muse",
  };
  return (
    names[cli.trim().toLowerCase()] ??
    (cli ? `${cli[0]!.toUpperCase()}${cli.slice(1)}` : "This agent")
  );
}

function usageLimitTiming(text: string): { until?: string; resetsIn?: string } {
  const resetIn = /\bresets in ([^\s.,)]+)/i.exec(text)?.[1];
  if (resetIn) return { resetsIn: resetIn };
  const until = /\buntil\s+(\d{1,2}:\d{2}(?:\s*[ap]m)?)/i.exec(text)?.[1];
  if (until) return { until };
  return {};
}

function looksLikeJsonOrStack(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("{") || t.startsWith("[")) return true;
  if (/agy_error:|"short_error"/i.test(t)) return true;
  if (/\bat\s+\S+\(.+:\d+:\d+\)/.test(t)) return true;
  return false;
}

function capRawCli(text: string): string {
  if (text.length <= RAW_CLI_CAP) return text;
  return `${text.slice(0, RAW_CLI_CAP)}…`;
}

function pickFallbackSummary(detail: string, cli: string): string {
  const lines = detail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? "";
  const multiLineOpaque = lines.length > 1 && lines.some(looksLikeJsonOrStack);
  if (
    !multiLineOpaque &&
    firstLine.length > 0 &&
    firstLine.length <= SUMMARY_LINE_MAX &&
    !looksLikeJsonOrStack(firstLine)
  ) {
    return firstLine.endsWith(".") ? firstLine : `${firstLine}.`;
  }
  return `${cliName(cli)} exited with an error.`;
}

/** Classify known CLI failures; null means callers should use the generic fallback. */
export function classifyAgentFailure(detail: string, cli = ""): AgentFailureReason | null {
  const text = stripAnsi(detail).trim();
  if (!text) return null;
  if (
    /github copilot/i.test(cli) &&
    /(?:Auto (?:profile|preference)|Set --auto-tier\b|auto-tier\s+(?:to|profile|preference))/i.test(
      text,
    )
  ) {
    return {
      id: "model-unavailable",
      summary: "Copilot Auto tier is not available for this account.",
      fix: "Choose another model on the Agents page.",
    };
  }
  if (AUTH.test(text))
    return {
      id: "auth",
      summary: `${cliName(cli)} is signed out.`,
      fix: `Re-authenticate ${cli ? cliName(cli) : "this agent"} on this computer.`,
    };
  if (MODEL.test(text)) {
    const model = /Cannot use this model:\s*([^\s.,]+)/i.exec(text)?.[1];
    return {
      id: "model-unavailable",
      summary: model
        ? `Model ${model} is not available for this account.`
        : "The selected model is not available for this account.",
      fix: "Choose another model on the Agents page.",
    };
  }
  if (CREDIT.test(text))
    return {
      id: "out-of-credit",
      summary: `${cliName(cli)} is out of credit.`,
      fix: "Add balance, or pick another model.",
    };
  if (LIMIT.test(text)) {
    const timing = usageLimitTiming(text);
    const summary = /\busage limit reached\b/i.test(text)
      ? `${cliName(cli)} usage limit reached${timing.until ? ` until ${timing.until}` : ""}.`
      : `${cliName(cli)} hit a provider quota or rate limit.${
          timing.resetsIn ? ` Resets in ${timing.resetsIn}.` : ""
        }`;
    return {
      id: "usage-limit",
      summary,
      fix: "Wait for the provider limit to reset, then retry.",
    };
  }
  if (NETWORK.test(text))
    return {
      id: "network",
      summary: `${cliName(cli)} cannot reach its service.`,
      fix: "Check this computer's network connection, then retry.",
    };
  return null;
}

export function formatAgentFailure(detail: string, cli = ""): string {
  const raw = capRawCli(stripAnsi(detail).trim());
  const reason = classifyAgentFailure(raw, cli);
  if (reason) return `${reason.summary} ${reason.fix}${CLI_DETAIL_MARKER}${raw})`;
  const summary = pickFallbackSummary(raw, cli);
  return `${summary} Open Raw CLI error for details.${CLI_DETAIL_MARKER}${raw})`;
}

/** Separate the concise guidance from the retained CLI tail for disclosure UI. */
export function splitAgentFailureDetail(detail: string): { summary: string; raw: string | null } {
  const marker = detail.lastIndexOf(CLI_DETAIL_MARKER);
  if (marker < 0 || !detail.endsWith(")")) return { summary: detail, raw: null };
  return { summary: detail.slice(0, marker), raw: detail.slice(marker + CLI_DETAIL_MARKER.length, -1) };
}