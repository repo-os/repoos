/**
 * Assemble the CTO board brief (#0731) from live server state.
 *
 * Reads the same live inputs the rest of the control plane does — the index,
 * the agent runner, the close-out job coordinator, the durable outcome store,
 * `.repoos/checks.db`, the remote validator's host status, and git history —
 * and hands a pure `DriverBriefInput` to `buildDriverBrief`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDriverBrief,
  diffConfigKeys,
  extractDriverRules,
  flattenConfig,
  type BriefCloseOutJob,
  type BriefConfigChange,
  type BriefConfigChangeSet,
  type BriefHostHealth,
  type BriefMergedTask,
  type BriefRule,
  type BriefRunningAgent,
  type BriefSlowRun,
  type DriverBrief,
} from "../core/driver-brief.js";
import { getCheckStore } from "../core/check-store.js";
import { runGit } from "../core/git.js";
import { extractTaskId } from "../core/repo-log.js";
import type { RepoOSConfig } from "../core/types.js";
import type { AgentRunner } from "./agents.js";
import { pendingCloseOutJobs, type JobCoordinator } from "./integration-job.js";
import type { CloseOutOutcomeStore } from "./close-out-outcome.js";
import type { LiveIndex } from "./live-index.js";
import type { RemoteValidator } from "./remote-validation.js";
import {
  computeSlowRunFlags,
  type AwakeClock,
  type RemoteActiveRunInfoLike,
} from "./attention-feed.js";

export interface DriverBriefDeps {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  jobCoordinator: JobCoordinator;
  closeOutOutcomes?: CloseOutOutcomeStore;
  remoteValidator?: RemoteValidator;
  awakeClock?: () => AwakeClock;
}

/** Recent run history rows the brief summarises. */
const HISTORY_LIMIT = 60;
/** How many merged commits to list. */
const MERGED_LIMIT = 40;
/** How many `chore(config):` commits to name. */
const CONFIG_COMMIT_LIMIT = 12;

/** Task ids referenced by `type(NNNN):` subjects, for merged-since-tag lookup. */
interface CommitRecord {
  sha: string;
  shortSha: string;
  subject: string;
  date: string;
  taskId: string | null;
  paths: string[];
}

/** Resolve the newest tag reachable from HEAD, or null when there are none. */
async function latestTag(root: string): Promise<string | null> {
  const res = await runGit(root, ["describe", "--tags", "--abbrev=0"], 5000);
  if (res.status !== 0 || res.timedOut) return null;
  return res.stdout.trim() || null;
}

/** Read commits in `range`, oldest-last, with their first-line subject + touched paths. */
async function readCommits(root: string, range: string, limit: number): Promise<CommitRecord[]> {
  const res = await runGit(
    root,
    ["log", range, "-n", String(limit), "--pretty=format:%x1e%H%x1f%h%x1f%s%x1f%cI", "--name-only"],
    8000,
  );
  if (res.status !== 0 || res.timedOut) return [];
  const records: CommitRecord[] = [];
  for (const block of res.stdout.split("\x1e")) {
    const lines = block.split("\n");
    const header = lines[0] ?? "";
    const [sha, shortSha, subject, date] = header.split("\x1f");
    if (!sha?.trim()) continue;
    records.push({
      sha: sha.trim(),
      shortSha: (shortSha ?? "").trim() || sha.trim().slice(0, 7),
      subject: (subject ?? "").trim(),
      date: (date ?? "").trim(),
      taskId: extractTaskId((subject ?? "").trim()),
      paths: lines
        .slice(1)
        .map((l) => l.trim())
        .filter((p) => p !== ""),
    });
  }
  return records;
}

async function collectMergedSinceTag(
  root: string,
  sinceTag: string | null,
): Promise<BriefMergedTask[]> {
  const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
  const commits = await readCommits(root, range, MERGED_LIMIT);
  return commits.map((c) => ({
    taskId: c.taskId,
    sha: c.sha,
    shortSha: c.shortSha,
    subject: c.subject,
    paths: c.paths.slice(0, 12),
  }));
}

/**
 * Config keys changed since the release baseline. The `chore(config):` commits
 * since the last tag name what moved (audit trail); `changedKeys` diffs the
 * live config against `repoos.toml` at that same baseline so the brief can
 * point at the keys themselves, not just the commits.
 */
async function collectConfigChanges(
  root: string,
  sinceTag: string | null,
  liveConfig: unknown,
): Promise<BriefConfigChangeSet> {
  const range = sinceTag ? `${sinceTag}..HEAD` : "HEAD";
  const commits = await readCommits(root, range, CONFIG_COMMIT_LIMIT * 4);
  const changes: BriefConfigChange[] = commits
    .filter((c) => c.subject.startsWith("chore(config):") && c.paths.includes("repoos.toml"))
    .slice(0, CONFIG_COMMIT_LIMIT)
    .map((c) => ({
      sha: c.sha,
      shortSha: c.shortSha,
      subject: c.subject,
      date: c.date,
    }));

  let changedKeys: string[] = [];
  if (sinceTag) {
    const show = await runGit(root, ["show", `${sinceTag}:repoos.toml`], 5000);
    if (show.status === 0 && !show.timedOut) {
      changedKeys = diffConfigKeys(
        flattenConfig(parseTomlLoose(show.stdout)),
        flattenConfig(liveConfig),
      );
    }
  }
  return { baseline: sinceTag, changes, changedKeys };
}

/**
 * Best-effort parse of a TOML config for key comparison. We only need scalars
 * and simple nesting to name changed keys — a full parser is overkill and would
 * add a runtime dependency. Returns `{}` when the text is unparseable.
 */
function parseTomlLoose(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let section: Record<string, unknown> = out;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      const path = table[1]!.split(".").map((s) => s.trim().replace(/^"|"$/g, ""));
      let node = out;
      for (const part of path) {
        if (typeof node[part] !== "object" || node[part] === null) node[part] = {};
        node = node[part] as Record<string, unknown>;
      }
      section = node;
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!kv) continue;
    section[kv[1]!] = parseTomlValue(kv[2]!);
  }
  return out;
}

function parseTomlValue(raw: string): unknown {
  const v = raw.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  const str = v.match(/^"(.*)"$/) ?? v.match(/^'(.*)'$/);
  if (str) return str[1];
  if (v.startsWith("[") || v.startsWith("{")) {
    try {
      return JSON.parse(v.replace(/'/g, '"'));
    } catch {
      return v;
    }
  }
  return v;
}

function readAgentsMd(root: string): string {
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const text = readFileSync(join(root, name), "utf8");
      if (name === "CLAUDE.md" && text.trim() === "@AGENTS.md") continue;
      return text;
    } catch {
      /* try the next */
    }
  }
  return "";
}

function hostHealth(remoteValidator: RemoteValidator | undefined): BriefHostHealth[] {
  const hosts = remoteValidator?.hostStatus?.() ?? [];
  return hosts.map((h) => ({
    host: h.host,
    healthy: h.healthy,
    probed: h.probed,
    inFlight: h.inFlight,
    queued: h.queued,
    maxConcurrent: h.maxConcurrent,
    detail: h.detail ?? null,
    hungRuns: (h.hungRuns ?? []).slice(0, 5),
    loadAverage: h.serverStats?.loadAverage ?? null,
  }));
}

/** Recent slow/hung runs from history plus the in-flight detector (#0720/#0729). */
function collectRuns(deps: DriverBriefDeps): {
  total: number;
  hung: number;
  failed: number;
  slowRuns: BriefSlowRun[];
} {
  let total = 0;
  let hung = 0;
  let failed = 0;
  try {
    const rows = getCheckStore(deps.config.root, deps.config.cacheDir).list({
      limit: HISTORY_LIMIT,
    });
    total = rows.length;
    for (const r of rows) {
      if (r.outcome === "hung") hung++;
      else if (r.outcome === "fail") failed++;
    }
  } catch {
    /* visibility only — never let history break the brief */
  }

  const remoteRuns: RemoteActiveRunInfoLike[] = (
    deps.remoteValidator?.activeRemoteRuns?.() ?? []
  ).map((r) => ({
    taskId: r.taskId,
    host: r.host,
    phase: r.phase,
    scope: r.scope,
    startedAt: r.startedAt,
    stage: r.stage,
    uploadBytes: r.uploadBytes,
    uploadSeconds: r.uploadSeconds,
  }));
  const flags = computeSlowRunFlags({
    config: deps.config,
    remoteRuns,
    awakeClock: deps.awakeClock?.(),
  });
  const slowRuns: BriefSlowRun[] = flags.map((f) => ({
    taskId: f.taskId,
    label: f.kindLabel,
    elapsedMs: f.elapsedMs,
    medianMs: f.medianMs,
    ratio: f.ratio,
    machine: f.machine,
    likelyCause: f.likelyCause,
  }));
  return { total, hung, failed, slowRuns };
}

export async function assembleDriverBrief(deps: DriverBriefDeps): Promise<DriverBrief> {
  const { config, index, runner, jobCoordinator } = deps;
  const root = config.root;

  const sinceTag = await latestTag(root);

  const tasks = index.getTasks().map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    area: t.area ?? "",
    needsInput: t.needsInput,
    needsInputReason: t.needsInputReason,
    needsMerge: t.needsMerge,
    assignee: t.assignee,
    isArchived: t.isArchived === true,
    updatedAt: t.updated_at ?? null,
  }));

  const tasksById = new Map(tasks.map((t) => [t.id, t]));

  const runningAgents: BriefRunningAgent[] = runner.running().map((run) => {
    const stats = runner.stats(run.id);
    return {
      taskId: run.id,
      role: "engineer",
      pid: run.pid,
      startedAt: run.startedAt,
      stalled: stats.stalled,
      lastOutputAt: stats.lastOutputAt,
    };
  });

  const allJobs = jobCoordinator.allJobs();
  const pending = pendingCloseOutJobs(allJobs);
  const pendingIndex = new Map(pending.map((j, i) => [j.taskId, i]));
  const closeOutJobs: BriefCloseOutJob[] = allJobs.map((job) => ({
    taskId: job.taskId,
    title: tasksById.get(job.taskId)?.title ?? `Task #${job.taskId}`,
    phase: job.phase,
    enqueuedAt: job.enqueuedAt ?? null,
    queuePosition: pendingIndex.get(job.taskId) ?? -1,
    reason: job.reason ?? job.debugTldr ?? null,
    failedAt: job.failedAt ?? null,
  }));

  const closeOutOutcomes = (deps.closeOutOutcomes?.list() ?? []).slice(0, 15).map((o) => ({
    taskId: o.taskId,
    outcome: o.outcome,
    at: o.finishedAt,
    reason: o.reason,
  }));

  const mergedSinceTag = await collectMergedSinceTag(root, sinceTag);
  const configChanges = await collectConfigChanges(root, sinceTag, config);
  const rules: BriefRule[] = extractDriverRules(readAgentsMd(root));

  const remoteValidator = deps.remoteValidator;
  const hosts = hostHealth(remoteValidator);
  const runs = collectRuns(deps);

  return buildDriverBrief({
    root,
    sinceTag,
    automationPaused: config.automation?.paused === true,
    approvalEnabled: config.approval?.enabled === true && config.automation?.paused !== true,
    mergedSinceTag,
    tasks,
    runningAgents,
    closeOutJobs,
    closeOutOutcomes,
    hosts,
    recentRuns: { total: runs.total, hung: runs.hung, failed: runs.failed },
    slowRuns: runs.slowRuns,
    configChanges,
    rules,
    generatedAt: new Date().toISOString(),
  });
}
