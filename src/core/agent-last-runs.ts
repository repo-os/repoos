/** Per-agent last-run status shown inline on the Agents page cards (#1133). */

export interface AgentLastRunRow {
  name: string;
  status: string;
  at: string;
  taskId: string | null;
  reason: string | null;
  /** Coding agent CLI recorded for the run; absent on older API responses. */
  codingAgent?: string | null;
  /** Model recorded for the run; absent on older API responses. */
  model?: string | null;
}

/** Does this run belong to the agent's current coding agent + model? */
export type AgentRunSetupMatch = "current" | "previous" | "unknown";

/** Visual tone for the status dot. */
export type AgentRunTone = "ok" | "error" | "running" | "muted";

const CLI_ALIASES: Record<string, string> = {
  claude: "claude code",
  "claude-code": "claude code",
  copilot: "github copilot",
  agy: "antigravity",
  qwen: "qwen code",
  "qwen-code": "qwen code",
  "open-code": "opencode",
  "open code": "opencode",
};

/** Compare CLI labels without caring about case, spacing or common aliases. */
export function normalizeCodingAgent(cli: string | null | undefined): string {
  const normalized = (cli ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");
  return CLI_ALIASES[normalized] ?? normalized;
}

/** Model names are compared case-insensitively, with incidental spacing trimmed. */
export function normalizeModelName(model: string | null | undefined): string {
  return (model ?? "").trim().toLowerCase();
}

/**
 * A run from a different CLI/model than the agent now uses is a *previous
 * setup* — useful history, but never the agent's current status.
 */
export function matchAgentRunSetup(
  run: Pick<AgentLastRunRow, "codingAgent" | "model">,
  current: { cli: string; model: string },
): AgentRunSetupMatch {
  const runCli = normalizeCodingAgent(run.codingAgent);
  const runModel = normalizeModelName(run.model);
  // Without both values we cannot judge the setup; show the run's own status
  // rather than claiming it used a different one.
  if (!runCli || !runModel) return "unknown";
  if (
    runCli === normalizeCodingAgent(current.cli) &&
    runModel === normalizeModelName(current.model)
  ) {
    return "current";
  }
  return "previous";
}

/** "opencode + glm-5.3-flash" — the pair a previous-setup label names. */
export function describeAgentRunSetup(run: Pick<AgentLastRunRow, "codingAgent" | "model">): string {
  const cli = (run.codingAgent ?? "").trim() || "unknown CLI";
  const model = (run.model ?? "").trim() || "unknown model";
  return `${cli} + ${model}`;
}

function statusWord(status: string): "failed" | "running" | "finished" {
  switch (status.trim().toLowerCase()) {
    case "errored":
    case "failed":
      return "failed";
    case "active":
    case "running":
      return "running";
    default:
      return "finished";
  }
}

/**
 * Short inline label: "Failed 21:36", "Last run 21:40", or
 * "Previous setup (opencode + glm-5.3-flash)".
 */
export function formatAgentRunLabel(
  run: Pick<AgentLastRunRow, "status" | "codingAgent" | "model">,
  match: AgentRunSetupMatch,
  clock: string,
): string {
  if (match === "previous") return `Previous setup (${describeAgentRunSetup(run)})`;
  const word = statusWord(run.status);
  if (word === "failed") return `Failed ${clock}`;
  if (word === "running") return `Running ${clock}`;
  return `Last run ${clock}`;
}

/** Colour the dot by the run's outcome; previous setups stay muted. */
export function agentRunTone(status: string, match: AgentRunSetupMatch): AgentRunTone {
  if (match === "previous") return "muted";
  const word = statusWord(status);
  if (word === "failed") return "error";
  if (word === "running") return "running";
  return "ok";
}
