/**
 * Run docs: the durable receipt every built-in agent leaves behind (0439).
 *
 * Before this, a built-in agent's output was whatever its own code happened to
 * do — one inbox task per finding for some agents, an ad-hoc markdown report
 * under `docs/agents/<Name>/` for others, nothing at all when a run found
 * nothing. The human had no way to see what an agent found without watching it
 * run.
 *
 * Now every run writes exactly one run doc to
 * `docs/agent-runs/<agent>/<ISO-timestamp>.md`, whatever it found — including
 * a run that found nothing, which records "ran clean". Only the last
 * {@link AGENT_RUN_DOC_HISTORY} docs per agent are kept; older ones are pruned
 * on each new run so the directory never grows without bound.
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

/** Run docs live here, one directory per agent. */
export const AGENT_RUN_DOC_ROOT = join("docs", "agent-runs");

/** How many run docs per agent are kept; older ones are pruned on each run. */
export const AGENT_RUN_DOC_HISTORY = 10;

/** One finding as it appears in a run doc. */
export interface AgentRunFinding {
  /** Agent-specific issue type (e.g. "outdated-dependency", "ui-bug"). */
  type?: string;
  /** Repo-relative path of the affected file, if the finding has one. */
  file?: string;
  /** Line number in the affected file, if known. */
  line?: number;
  /** What the agent found. */
  description: string;
  /** Why the agent believes it — the evidence a human needs to triage it. */
  evidence?: string;
  /** What the agent suggests doing about it. */
  recommendation?: string;
  severity?: "high" | "medium" | "low";
}

export interface AgentRunDocInput {
  /** Repository root. */
  root: string;
  /** Agent slug, e.g. "tech-debt". Also the run doc's directory name. */
  agent: string;
  /** Human-facing agent name for the heading, e.g. "Tech Debt Agent". */
  label?: string;
  /** ISO timestamp the run started. */
  startedAt: string;
  /** Wall-clock duration of the run. */
  durationMs?: number;
  /** Total tokens billed for the run, when the runner reported them. */
  totalTokens?: number;
  /** Cost of the run in USD, when the runner reported it. */
  costUsd?: number;
  /** Files (or docs) the agent actually reviewed. */
  scannedFiles?: number;
  /** Every finding, including ones that produced no task. */
  findings: AgentRunFinding[];
  /** The single inbox task this run created, if any. */
  taskId?: string | null;
  /**
   * Extra context that isn't a finding — e.g. "no web UI detected", or the
   * docs this run corrected on its own. Rendered under "Notes".
   */
  notes?: string[];
  /** Injectable clock so tests (and the doc itself) are deterministic. */
  now?: Date;
}

export interface AgentRunDocResult {
  /** Repo-relative path of the run doc. */
  path: string;
  /** Absolute path of the run doc. */
  absPath: string;
  /** File name only, e.g. `2026-09-19T11-07-11Z.md`. */
  fileName: string;
  /** Number of findings recorded. */
  findingsCount: number;
  /** Run docs deleted this run by the history cap. */
  pruned: number;
}

/**
 * Filename-safe ISO-8601 timestamp: `2026-09-19T11:07:11.123Z` becomes
 * `2026-09-19T11-07-11Z`. Colons are illegal in file names on macOS/Windows,
 * and dropping them this way keeps the names sorting chronologically.
 */
export function runDocTimestamp(now: Date = new Date()): string {
  return now
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Directory (repo-relative) holding one agent's run docs. */
export function agentRunDocDir(agent: string): string {
  return join(AGENT_RUN_DOC_ROOT, agent);
}

/** `4200` → `4.2s`, `125000` → `2m 5s`. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "unknown";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** `0.012345` → `$0.0123`. */
function formatCost(usd: number | undefined): string {
  if (usd === undefined || !Number.isFinite(usd)) return "unknown";
  return `$${usd.toFixed(4)}`;
}

function formatTokens(total: number | undefined): string {
  if (total === undefined || !Number.isFinite(total)) return "unknown";
  return total.toLocaleString("en-US");
}

/**
 * The run's one-line verdict: `3 findings — 1 task created`, or `ran clean`
 * when the agent found nothing. A run whose findings produced no task says so
 * rather than implying the board was updated.
 */
export function runDocSummary(findingsCount: number, taskId: string | null | undefined): string {
  if (findingsCount === 0) return "ran clean";
  const noun = findingsCount === 1 ? "1 finding" : `${findingsCount} findings`;
  if (taskId) return `${noun} — 1 task created`;
  return `${noun} — no task created`;
}

/** Render the run doc body for the given run. */
export function renderAgentRunDoc(input: AgentRunDocInput): string {
  const label = input.label ?? input.agent;
  const lines: string[] = [];
  lines.push(`# ${label} run — ${input.startedAt}`);
  lines.push("");
  lines.push(`- **Agent**: ${input.agent}`);
  lines.push(`- **Run started**: ${input.startedAt}`);
  lines.push(`- **Duration**: ${formatDuration(input.durationMs)}`);
  lines.push(
    `- **Tokens**: ${formatTokens(input.totalTokens)} (cost ${formatCost(input.costUsd)})`,
  );
  if (input.scannedFiles !== undefined) lines.push(`- **Files reviewed**: ${input.scannedFiles}`);
  lines.push(`- **Task created**: ${input.taskId ? `#${input.taskId}` : "none"}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(runDocSummary(input.findings.length, input.taskId));
  lines.push("");

  if (input.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");
    input.findings.forEach((finding, index) => {
      const parts = [finding.type ?? "finding", finding.severity ?? "unrated"].filter(Boolean);
      lines.push(`### ${index + 1}. ${parts.join(" · ")}`);
      lines.push("");
      lines.push(finding.description);
      lines.push("");
      if (finding.file) {
        lines.push(`- **File**: \`${finding.file}\`${finding.line ? `:${finding.line}` : ""}`);
      }
      if (finding.evidence) lines.push(`- **Evidence**: ${finding.evidence}`);
      if (finding.recommendation) lines.push(`- **Recommendation**: ${finding.recommendation}`);
      lines.push("");
    });
  }

  const notes = (input.notes ?? []).filter((n) => n.trim().length > 0);
  if (notes.length > 0) {
    lines.push("## Notes");
    lines.push("");
    for (const note of notes) lines.push(`- ${note}`);
    lines.push("");
  }

  return lines.join("\n");
}

/** Append `-2`, `-3`… before the extension when a run doc already exists. */
function uniqueFileName(dir: string, stamp: string): string {
  const base = `${stamp}.md`;
  if (!existsSync(join(dir, base))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${stamp}-${n}.md`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  return `${stamp}-${Date.now()}.md`;
}

/**
 * Delete every run doc beyond the newest {@link AGENT_RUN_DOC_HISTORY} for one
 * agent. Names are sortable ISO timestamps, so a lexicographic sort is a
 * chronological one. Returns the number deleted; never throws.
 */
export function pruneAgentRunDocs(
  root: string,
  agent: string,
  keep: number = AGENT_RUN_DOC_HISTORY,
): number {
  const dir = join(root, agentRunDocDir(agent));
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return 0;
  }
  const docs = files.filter((f) => f.endsWith(".md")).sort();
  const stale = docs.slice(0, Math.max(0, docs.length - keep));
  for (const doc of stale) {
    try {
      rmSync(join(dir, doc), { force: true });
    } catch {
      /* a locked or already-gone file must never fail the run */
    }
  }
  return stale.length;
}

/**
 * Write this run's doc and prune the agent's history. Best-effort by design:
 * a run doc is a receipt, not a transaction, so a filesystem failure here is
 * reported back to the caller instead of failing the whole agent run.
 *
 * @throws Only if the run doc directory itself cannot be created — in that
 *         case there is no receipt to write and the caller must decide.
 */
export function writeAgentRunDoc(input: AgentRunDocInput): AgentRunDocResult {
  const relDir = agentRunDocDir(input.agent);
  const dir = join(input.root, relDir);
  mkdirSync(dir, { recursive: true });

  const fileName = uniqueFileName(dir, runDocTimestamp(input.now ?? new Date()));
  const absPath = join(dir, fileName);
  writeFileSync(absPath, renderAgentRunDoc(input), "utf8");
  const pruned = pruneAgentRunDocs(input.root, input.agent);

  return {
    // Repo-relative, always forward-slashed — this is what the UI and the SSE
    // event quote, not a filesystem path.
    path: join(relDir, fileName).split(sep).join("/"),
    absPath,
    fileName,
    findingsCount: input.findings.length,
    pruned,
  };
}
