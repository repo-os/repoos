/**
 * CTO board brief (#0731).
 *
 * A snapshot of live board state a driver (the CTO, or a human/external agent
 * session rotating in) can read in one shot instead of hand-writing a handoff
 * doc: what merged since the last tag, the board by status with the cause of
 * anything stuck, running agents, queued close-outs, host health and recent
 * slow/hung runs, config keys changed since a baseline, the repo's AGENTS.md
 * rules that matter to a driver, and the next recommended actions.
 *
 * Pure — callers (the server assembler) supply every input. Machine-readable
 * via `--json`; the human renderer lives in the CLI.
 */
import type { Status } from "./types.js";

export interface BriefMergedTask {
  taskId: string | null;
  sha: string;
  shortSha: string;
  subject: string;
  /** Repo-relative paths the commit touched (bounded). */
  paths: string[];
}

export interface BriefTaskEntry {
  id: string;
  title: string;
  status: Status;
  priority: string;
  area: string;
  /** Human-readable reason the task is where it is, when there is one. */
  cause: string | null;
  /** Machine reason for a needs-input task, when set. */
  needsInputReason?: string;
  /** ISO timestamp of the task's last update. */
  at: string | null;
}

export interface BriefStatusGroup {
  status: Status;
  count: number;
  tasks: BriefTaskEntry[];
}

export interface BriefRunningAgent {
  taskId: string;
  role: string;
  pid: number;
  startedAt: string;
  /** True when the agent's output has gone quiet while the process runs. */
  stalled: boolean;
  lastOutputAt: string | null;
}

export interface BriefCloseOutJob {
  taskId: string;
  title: string;
  phase: string;
  enqueuedAt: string | null;
  queuePosition: number;
  reason: string | null;
  failedAt: string | null;
}

export interface BriefHostHealth {
  host: string;
  healthy: boolean;
  probed: boolean;
  inFlight: number;
  queued: number;
  maxConcurrent: number;
  detail: string | null;
  /** Runs killed as hung on this host, most recent first. */
  hungRuns: { taskId: string; at: string; detail?: string }[];
  loadAverage: number[] | null;
}

export interface BriefSlowRun {
  taskId: string | null;
  label: string;
  elapsedMs: number;
  medianMs: number;
  ratio: number;
  machine: string | null;
  likelyCause: string | null;
}

export interface BriefRunSummary {
  recentRuns: number;
  hung: number;
  failed: number;
  slowRuns: BriefSlowRun[];
}

export interface BriefConfigChange {
  sha: string;
  shortSha: string;
  subject: string;
  date: string;
}

export interface BriefConfigChangeSet {
  /** Baseline ref the changes are measured against (a tag or SHA), when known. */
  baseline: string | null;
  changes: BriefConfigChange[];
  /** Config keys the live config differs from a baseline snapshot on. */
  changedKeys: string[];
}

export interface BriefRule {
  heading: string;
  text: string;
}

export interface BriefRecommendation {
  id: string;
  /** "cto" when policy/CTO can take it, "human" when a person must. */
  owner: "cto" | "human";
  title: string;
  detail: string;
  taskId: string | null;
}

export interface DriverBrief {
  generatedAt: string;
  /** Root the brief was produced from. */
  root: string;
  /** Latest release tag the merged list is measured from, when any. */
  sinceTag: string | null;
  automationPaused: boolean;
  approvalEnabled: boolean;
  mergedSinceTag: BriefMergedTask[];
  tasksByStatus: BriefStatusGroup[];
  runningAgents: BriefRunningAgent[];
  queuedCloseOuts: BriefCloseOutJob[];
  failedCloseOuts: BriefCloseOutJob[];
  recentCloseOutOutcomes: { taskId: string; outcome: string; at: string; reason: string }[];
  hosts: BriefHostHealth[];
  runs: BriefRunSummary;
  configChanges: BriefConfigChangeSet;
  rules: BriefRule[];
  recommendations: BriefRecommendation[];
}

/** Input the pure builder consumes. Live collectors fill this in. */
export interface DriverBriefInput {
  root: string;
  generatedAt?: string;
  sinceTag: string | null;
  automationPaused: boolean;
  approvalEnabled: boolean;
  mergedSinceTag: BriefMergedTask[];
  tasks: {
    id: string;
    title: string;
    status: Status;
    priority: string;
    area: string;
    needsInput: boolean;
    needsInputReason?: string;
    needsMerge: boolean;
    assignee: string;
    isArchived: boolean;
    updatedAt: string | null;
  }[];
  runningAgents: BriefRunningAgent[];
  closeOutJobs: BriefCloseOutJob[];
  closeOutOutcomes: { taskId: string; outcome: string; at: string; reason: string }[];
  hosts: BriefHostHealth[];
  recentRuns: {
    total: number;
    hung: number;
    failed: number;
  };
  slowRuns: BriefSlowRun[];
  configChanges: BriefConfigChangeSet;
  rules: BriefRule[];
}

const STATUS_ORDER: Status[] = ["draft", "inbox", "ready", "active", "review", "done"];

/** Human cause for a task, from the layered flags. */
export function taskCause(t: DriverBriefInput["tasks"][number]): string | null {
  if (t.needsInput) {
    const reason = t.needsInputReason?.replace(/-/g, " ") ?? "needs input";
    return `Waiting on a human: ${reason}`;
  }
  if (t.needsMerge) return "Branch has drifted from main";
  if (t.status === "review") return "Awaiting sign-off";
  if (t.status === "active") return "In progress";
  if (t.assignee === "human" && t.status !== "done") return "Assigned to you";
  if (t.status === "ready") return "Ready to start";
  if (t.status === "inbox") return "In the inbox, not yet triaged";
  return null;
}

function groupTasks(input: DriverBriefInput): BriefStatusGroup[] {
  const groups: BriefStatusGroup[] = [];
  for (const status of STATUS_ORDER) {
    const tasks = input.tasks
      .filter((t) => t.status === status && !t.isArchived)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (tasks.length === 0) continue;
    groups.push({
      status,
      count: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        area: t.area,
        cause: taskCause(t),
        needsInputReason: t.needsInput ? t.needsInputReason : undefined,
        at: t.updatedAt,
      })),
    });
  }
  return groups;
}

function runningAgentIds(input: DriverBriefInput): Set<string> {
  return new Set(input.runningAgents.map((r) => r.taskId));
}

function activeJobTaskIds(input: DriverBriefInput): Set<string> {
  return new Set(input.closeOutJobs.map((j) => j.taskId));
}

/**
 * The board's next moves: prefer what only policy/CTO can take (clears the
 * routine), then what needs a human. Kept short and deduped by id.
 */
export function recommendActions(input: DriverBriefInput): BriefRecommendation[] {
  const out: BriefRecommendation[] = [];
  const seen = new Set<string>();
  const push = (r: BriefRecommendation) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
  };

  const running = runningAgentIds(input);
  const inCloseOut = activeJobTaskIds(input);
  const stalled = input.runningAgents.filter((a) => a.stalled).map((a) => a.taskId);

  // Stalled agents first — the CTO clears these under policy.
  for (const taskId of stalled) {
    push({
      id: `restart-stalled:${taskId}`,
      owner: "cto",
      title: `Restart the stuck engineer on #${taskId}`,
      detail: "Its process is running but output has gone quiet.",
      taskId,
    });
  }

  // Failed close-outs: retry (CTO for env failures, otherwise a human).
  for (const job of input.closeOutJobs) {
    if (job.phase !== "failed") continue;
    push({
      id: `retry-close-out:${job.taskId}`,
      owner: "cto",
      title: `Retry the failed close-out on #${job.taskId}`,
      detail: job.reason ?? "The close-out integration job failed.",
      taskId: job.taskId,
    });
  }

  // Handoff failures waiting on a human.
  for (const t of input.tasks) {
    if (t.isArchived || !t.needsInput) continue;
    push({
      id: `handoff-failed:${t.id}`,
      owner: "human",
      title: `#${t.id} needs input`,
      detail: t.needsInputReason?.replace(/-/g, " ") ?? "The engineer is waiting on you.",
      taskId: t.id,
    });
  }

  // Review queue with no active handoff/close-out.
  for (const t of input.tasks) {
    if (t.isArchived || t.status !== "review" || t.needsInput) continue;
    if (inCloseOut.has(t.id)) continue;
    push({
      id: `approve:${t.id}`,
      owner: input.approvalEnabled ? "cto" : "human",
      title: input.approvalEnabled
        ? `Approve #${t.id} (policy may auto-approve if clean)`
        : `Approve or send back #${t.id}`,
      detail: "A green review is waiting at the sign-off gate.",
      taskId: t.id,
    });
  }

  // Ready tasks with no engineer and nothing queued — start work.
  for (const t of input.tasks) {
    if (t.isArchived || t.status !== "ready") continue;
    if (running.has(t.id) || inCloseOut.has(t.id)) continue;
    push({
      id: `start:${t.id}`,
      owner: "cto",
      title: `Start #${t.id}`,
      detail: "Ready and not running.",
      taskId: t.id,
    });
  }

  // Hung / failed runs are infra, not board logic.
  if (input.recentRuns.hung > 0) {
    push({
      id: "hosts:recent-hung",
      owner: "human",
      title: "Review recent hung validation runs",
      detail: `${input.recentRuns.hung} run(s) were killed as hung — check host health before the next close-out.`,
      taskId: null,
    });
  }

  // When nothing is waiting, say so rather than leaving the list empty.
  if (out.length === 0) {
    push({
      id: "clear",
      owner: "cto",
      title: "Board is clear — no action needed",
      detail: "No stalled runs, failed close-outs, or tasks waiting on a person.",
      taskId: null,
    });
  }

  return out;
}

/**
 * Build the brief. Pure — every collection is supplied by the caller so this
 * is testable with a fixture board and never touches the server or git.
 */
export function buildDriverBrief(input: DriverBriefInput): DriverBrief {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const tasksByStatus = groupTasks(input);

  const queuedCloseOuts = input.closeOutJobs.filter(
    (j) => j.phase !== "failed" && j.phase !== "done",
  );
  const failedCloseOuts = input.closeOutJobs.filter((j) => j.phase === "failed");

  return {
    generatedAt,
    root: input.root,
    sinceTag: input.sinceTag,
    automationPaused: input.automationPaused,
    approvalEnabled: input.approvalEnabled,
    mergedSinceTag: input.mergedSinceTag,
    tasksByStatus,
    runningAgents: input.runningAgents,
    queuedCloseOuts,
    failedCloseOuts,
    recentCloseOutOutcomes: input.closeOutOutcomes,
    hosts: input.hosts,
    runs: {
      recentRuns: input.recentRuns.total,
      hung: input.recentRuns.hung,
      failed: input.recentRuns.failed,
      slowRuns: input.slowRuns,
    },
    configChanges: input.configChanges,
    rules: input.rules,
    recommendations: recommendActions(input),
  };
}

// ---------------------------------------------------------------------------
// AGENTS.md rules extraction
// ---------------------------------------------------------------------------

/**
 * Heading keywords whose section holds an operating rule a driver must follow.
 * Deliberately narrow: the brief should surface the handful of rules that bite
 * a driver (merging, status, task files, review), not reproduce the whole file.
 */
const RULE_SECTION_KEYWORDS = [
  "operating loop",
  "rules",
  "review and sign-off",
  "definition of done",
  "git setup",
  "conventions",
  "who this file is for",
];

/** A single `-` bullet is a rule; long bullets are clipped so the brief stays short. */
const MAX_RULE_CHARS = 320;

/**
 * Extract the driver-relevant rules from an AGENTS.md body. Returns the bullet
 * text of each matching section, with the nearest `##`/`###` heading as context.
 * Pure so it is testable without touching the filesystem.
 */
export function extractDriverRules(agentsMd: string): BriefRule[] {
  const rules: BriefRule[] = [];
  const lines = agentsMd.split("\n");
  let heading = "";
  let inRuleSection = false;
  let currentRule: string | null = null;

  const flush = () => {
    if (!currentRule) return;
    const text = currentRule.trim().replace(/\s+/g, " ");
    if (text) rules.push({ heading, text: text.slice(0, MAX_RULE_CHARS) });
    currentRule = null;
  };

  for (const line of lines) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1]!.trim();
      const lower = heading.toLowerCase();
      inRuleSection = RULE_SECTION_KEYWORDS.some((k) => lower.includes(k));
      continue;
    }
    if (!inRuleSection) continue;
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      currentRule = line.replace(/^\s*[-*]\s+/, "");
    } else if (currentRule && line.trim() && /^\s{2,}\S/.test(line)) {
      // Continuation line of the current bullet.
      currentRule += " " + line.trim();
    } else if (line.trim() === "") {
      // Blank line ends a bullet only when the next non-blank starts a heading
      // or a new bullet; keep accumulating so wrapped bullets stay whole.
    } else {
      flush();
    }
  }
  flush();
  return rules;
}

// ---------------------------------------------------------------------------
// Config change diffing
// ---------------------------------------------------------------------------

/** Flatten a nested config object to dotted keys mapped to JSON scalars. */
export function flattenConfig(value: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || typeof value !== "object") {
    out[prefix || "<root>"] = JSON.stringify(value);
    return out;
  }
  if (Array.isArray(value)) {
    out[prefix || "<root>"] = JSON.stringify(value);
    return out;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      Object.assign(out, flattenConfig(v, key));
    } else {
      out[key] = JSON.stringify(v);
    }
  }
  return out;
}

/**
 * Dotted config keys whose value differs between a baseline snapshot and the
 * live config. A key present on only one side counts as changed.
 */
export function diffConfigKeys(
  baseline: Record<string, string>,
  live: Record<string, string>,
): string[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(live)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (baseline[key] !== live[key]) changed.push(key);
  }
  changed.sort();
  return changed;
}
