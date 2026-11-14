/** Agents page last-runs list: recency window and configured-agent filtering. */

export const AGENT_LAST_RUN_RECENT_MS = 14 * 24 * 60 * 60 * 1000;

export interface AgentLastRunRow {
  name: string;
  status: string;
  at: string;
  taskId: string | null;
  reason: string | null;
}

/** Model-routing one-shots are not task-engine defaults — keep them out of the primary list. */
export function isAuxiliaryRoutingAgent(name: string): boolean {
  const n = name.trim();
  return /^Model router\b/i.test(n) || /^Decision check\b/i.test(n);
}

export function filterAgentLastRuns(
  runs: AgentLastRunRow[],
  configuredNames: ReadonlySet<string>,
  nowMs: number,
  showAll: boolean,
): { visible: AgentLastRunRow[]; hiddenCount: number } {
  const recentCutoff = nowMs - AGENT_LAST_RUN_RECENT_MS;
  const primary: AgentLastRunRow[] = [];
  const other: AgentLastRunRow[] = [];

  for (const run of runs) {
    const known = configuredNames.has(run.name.toLowerCase());
    const recent = Date.parse(run.at) >= recentCutoff;
    const routing = isAuxiliaryRoutingAgent(run.name);
    if (known && recent && !routing) primary.push(run);
    else other.push(run);
  }

  if (showAll) return { visible: [...primary, ...other], hiddenCount: 0 };
  return { visible: primary, hiddenCount: other.length };
}

/** Names that count as configured agents for the Default agents last-runs panel. */
export function buildConfiguredAgentLastRunNames(
  roleNames: string[],
  builtInAgentIds: string[],
): Set<string> {
  const names = new Set<string>();
  for (const name of roleNames) names.add(name.toLowerCase());
  for (const id of builtInAgentIds) names.add(id.toLowerCase());
  return names;
}
