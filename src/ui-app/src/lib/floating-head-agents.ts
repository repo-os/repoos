export type FloatingHeadId = "cto" | "ross" | "debugger";

interface AgentRow {
  name: string;
  enabled: boolean;
}

/** Whether a floating-head launcher should appear (preview builds show all). */
export function floatingHeadEnabled(
  head: FloatingHeadId,
  opts: {
    agents: AgentRow[];
    configData: Record<string, unknown> | null;
    previewBuild: boolean;
  },
): boolean {
  if (opts.previewBuild) return true;
  if (head === "cto") {
    return opts.agents.some((a) => a.name.toLowerCase() === "cto" && a.enabled);
  }
  if (head === "ross") {
    return opts.agents.some(
      (a) =>
        (a.name.toLowerCase() === "ross" || a.name.toLowerCase() === "repoos guide") && a.enabled,
    );
  }
  const agents = opts.configData?.builtInAgents as
    | Record<string, { enabled?: boolean }>
    | undefined;
  return Boolean(agents?.debugger?.enabled);
}
