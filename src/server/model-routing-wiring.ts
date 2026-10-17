/**
 * Server-side wiring for automatic model routing (#0793).
 *
 * `resolveRoutedAgent` is the one entry point the run paths call. It resolves
 * the canonical base agent (via the caller's `resolveAgentForTask` /
 * `resolveReviewerForTask`), and — only when `[model_routing] mode` is not
 * `off` and the run is not an explicit human pin — builds the candidate set,
 * filters it deterministically, asks the decision provider, persists the
 * decision, records the call's usage, and returns the chosen configuration.
 *
 * Safety contract:
 * - `off` (the default) and pins return the base agent unchanged, with no
 *   provider call and no filesystem write, so existing behavior is untouched.
 * - `shadow` records the recommendation but always returns the base agent.
 * - `automatic` applies only a scored selection (or an eligible switch/escalate
 *   on handback) drawn from the filtered eligible set; a fallback, block or
 *   forbidden pair never changes the agent.
 * - The router can never widen the budget allowlist, permissions or roles.
 */
import { join } from "node:path";
import type { Agent, RepoOSConfig, Task } from "../core/types.js";
import { agentsForConfig } from "../core/config.js";
import { agentModelAllowRows } from "../core/budget-allowlist.js";
import { readDetectCache } from "../core/detect-cache.js";
import { getRepoOSDb } from "../core/db.js";
import { getDiffStats } from "../core/git.js";
import { DEFAULT_APPROVAL_UI_AREAS } from "../core/approval-policy.js";
import { parseTaskAreas } from "../core/areas.js";
import { parseShotPlan } from "../core/shot-plan.js";
import { listReviewPasses } from "../core/review-passes.js";
import { resolveEffectiveRouting, routingActiveFor } from "../core/model-routing/config.js";
import {
  candidateKey,
  filterCandidates,
  type HarnessAvailability,
  type RoutingCandidate,
} from "../core/model-routing/candidates.js";
import {
  billingForCli,
  candidateFactLine,
  lookupModelMetadata,
  normalizeModelId,
  resolveCandidateFacts,
  resolveDecisionContextTokens,
  type BillingKind,
  type CandidateFacts,
  type ModelMetadata,
  type ProjectRoleHistory,
} from "../core/model-routing/facts.js";
import { buildCandidateSet, candidateForAgent } from "../core/model-routing/candidate-set.js";
import { buildHarnessAvailability } from "../core/model-routing/harness.js";
import { decideRoutingForRun, type RoutingDecision } from "../core/model-routing/decide.js";
import { buildRoutingProvider } from "../core/model-routing/runtime.js";
import { ROUTING_POLICY_VERSION } from "../core/model-routing/policy.js";
import { candidateHistory } from "./candidate-history.js";
import {
  MAX_ROUTING_DECISIONS,
  type RoutingDecisionRecord,
} from "../core/model-routing/decisions.js";
import {
  createRoutingDecisionStore,
  type RoutingDecisionStore,
} from "../core/model-routing/decision-store.js";
import {
  evaluateHandback,
  type HandbackInput,
  type HandbackOutcome,
} from "../core/model-routing/handback.js";
import type { RoutingDecisionProvider, RoutingRole } from "../core/model-routing/types.js";
import { randomUUID } from "node:crypto";
import { mergeAgentOverride, recordOneShotSession, type PromptResult } from "./agents.js";

/**
 * Safe fallback for the brief when the decision model's context window is
 * unknown (#0812): the historical fixed cap.
 */
export const MAX_ROUTING_BRIEF_CHARS = 6000;

/**
 * Share of the decision model's context window the brief may use, when that
 * window is known. Deliberately conservative — the brief is one input to a
 * call that also carries questions and expects a structured answer, so it must
 * not crowd the response out. A policy constant, versioned with the questions.
 */
export const DEFAULT_ROUTING_BRIEF_SHARE = 0.25;

/** Rough characters per token for budgeting a text brief (conservative). */
export const BRIEF_CHARS_PER_TOKEN = 4;

/**
 * The brief character budget for a decision model: a fixed share of its context
 * window when known, else the safe fallback. Never below a small floor so a
 * tiny reported window cannot starve the brief.
 */
export function briefMaxChars(
  contextTokens: number | null | undefined,
  share: number = DEFAULT_ROUTING_BRIEF_SHARE,
): number {
  if (contextTokens == null || !Number.isFinite(contextTokens) || contextTokens <= 0) {
    return MAX_ROUTING_BRIEF_CHARS;
  }
  const safeShare =
    Number.isFinite(share) && share > 0 && share < 1 ? share : DEFAULT_ROUTING_BRIEF_SHARE;
  const budget = Math.floor(contextTokens * safeShare * BRIEF_CHARS_PER_TOKEN);
  return Math.max(MAX_ROUTING_BRIEF_CHARS, budget);
}

export interface RoutingWiringDeps {
  config: RepoOSConfig;
  /**
   * Decision provider. `undefined` builds one from the effective settings;
   * `null` forces "not configured" (the calibrated fallback path).
   */
  provider?: RoutingDecisionProvider | null;
  /** Harness availability; `undefined` reads the detection cache. */
  harnesses?: Record<string, HarnessAvailability>;
  /** Normalized cost/time keyed by candidateKey. Missing entries stay neutral. */
  costTime?: Record<string, { cost: number; time: number }>;
  /** Decision store; `undefined` creates the fs-backed store. */
  store?: RoutingDecisionStore;
  /** Persist decisions to disk (default true; tests may disable). */
  persist?: boolean;
  /** Record the provider call in session accounting (default true). */
  recordSession?: boolean;
  /** Injected clock, for deterministic tests. */
  now?: () => Date;
  /**
   * Provider metadata keyed by normalized model id (#0812). Overrides the
   * curated snapshot; `undefined` uses `PROVIDER_MODEL_METADATA`.
   */
  metadata?: Record<string, ModelMetadata>;
  /**
   * Per-candidate project history resolver (#0812). When provided it replaces
   * the sessions-DB lookup, so tests stay hermetic.
   */
  history?: (
    role: "pm" | "engineer" | "reviewer",
    candidate: RoutingCandidate,
  ) => ProjectRoleHistory | null;
  /** Explicit decision-model context window in tokens, overriding the lookup. */
  decisionContextTokens?: number | null;
  /** Share of the decision model's context window the brief may use. */
  briefContextShare?: number;
}

export interface RouteRunInput {
  role: RoutingRole;
  task: Task | null;
  /** The canonical base agent resolved by the caller. */
  base: Agent | null;
  /** True when the human explicitly pinned a config for this role. */
  pinned: boolean;
  /** Extra brief text (e.g. the review report for a handback). */
  briefExtra?: string;
  /** Handback re-evaluation to run in the same decision. */
  handback?: Omit<HandbackInput, "role" | "current" | "eligible">;
}

export interface RouteRunResult {
  agent: Agent | null;
  decision: RoutingDecisionRecord | null;
  /** The handback outcome, when a handback evaluation ran. */
  handback: HandbackOutcome | null;
}

/**
 * Task progress facts for the routing brief (#0812): how far the task has
 * already got. Any field that cannot be read stays null and is omitted.
 */
export interface TaskProgress {
  /** Engineer runs recorded for this task so far. */
  engineerRounds: number | null;
  /** Review passes recorded for this task so far. */
  reviewRounds: number | null;
  /** The latest review pass verdict, when one exists. */
  latestReviewVerdict: string | null;
  /** Files changed on the task branch vs main. */
  diffFiles: number | null;
  /** Lines added on the task branch vs main. */
  diffLinesAdded: number | null;
  /** Lines removed on the task branch vs main. */
  diffLinesRemoved: number | null;
  /** True when the task declares shots or sits in a UI area. */
  uiShots: boolean;
  /** Milliseconds since the task was created, when known. */
  openMs: number | null;
}

/** One line of task progress, with unknown parts omitted; null when empty. */
export function formatTaskProgress(progress: TaskProgress): string | null {
  const parts: string[] = [];
  if (progress.engineerRounds != null) parts.push(`engineer rounds ${progress.engineerRounds}`);
  if (progress.reviewRounds != null) parts.push(`review rounds ${progress.reviewRounds}`);
  if (progress.latestReviewVerdict) parts.push(`latest review: ${progress.latestReviewVerdict}`);
  if (progress.diffFiles != null) {
    const add = progress.diffLinesAdded ?? 0;
    const del = progress.diffLinesRemoved ?? 0;
    parts.push(
      `diff ${progress.diffFiles} file${progress.diffFiles === 1 ? "" : "s"}, +${add}/-${del}`,
    );
  }
  parts.push(`UI shots: ${progress.uiShots ? "yes" : "no"}`);
  if (progress.openMs != null) parts.push(`open ${formatDuration(progress.openMs)}`);
  return parts.length ? parts.join(" · ") : null;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(0, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}.${Math.floor((minutes % 60) / 6)}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Assemble task progress from the task, its sessions and its review passes.
 * Best-effort: any reader that fails leaves its fields null. Never throws.
 */
export function buildTaskProgress(
  task: Task | null,
  config: RepoOSConfig,
  opts: { now?: () => Date } = {},
): TaskProgress | null {
  if (!task) return null;
  const now = (opts.now ?? (() => new Date()))();

  let engineerRounds: number | null = null;
  let reviewRounds: number | null = null;
  try {
    const sessions = getRepoOSDb(config.root)?.getTaskSessions(task.id) ?? [];
    if (sessions.length > 0) {
      engineerRounds = sessions.filter((s) => s.sessionType === "engineer").length;
      reviewRounds = sessions.filter(
        (s) => s.sessionType === "reviewer" || s.sessionType === "review",
      ).length;
    }
  } catch {
    // Absent sessions DB — leave rounds unknown.
  }

  let latestReviewVerdict: string | null = null;
  try {
    const passes = listReviewPasses(config, task.id);
    reviewRounds ??= passes.length > 0 ? passes.length : null;
    latestReviewVerdict = passes.length > 0 ? passes[passes.length - 1]!.verdict : null;
  } catch {
    // No review artifacts — leave the verdict unknown.
  }

  let diffFiles: number | null = null;
  let diffLinesAdded: number | null = null;
  let diffLinesRemoved: number | null = null;
  const worktree = task.git?.worktreePath;
  if (worktree) {
    try {
      const stats = getDiffStats(worktree, "main");
      diffFiles = stats.filesChanged;
      diffLinesAdded = stats.additions;
      diffLinesRemoved = stats.deletions;
    } catch {
      // Not a git worktree (or git unavailable) — leave the diff unknown.
    }
  }

  const uiAreas = config.approval?.autoApprove?.uiAreas?.length
    ? config.approval.autoApprove.uiAreas.map((a) => a.trim().toLowerCase())
    : DEFAULT_APPROVAL_UI_AREAS;
  const areas = parseTaskAreas(task.area ?? task.areas).map((a) => a.toLowerCase());
  const declaredShots = parseShotPlan(task.body ?? "").shots.length;
  const uiShots = declaredShots > 0 || areas.some((a) => uiAreas.includes(a));

  let openMs: number | null = null;
  if (task.created_at) {
    const created = Date.parse(task.created_at);
    if (Number.isFinite(created)) openMs = Math.max(0, now.getTime() - created);
  }

  return {
    engineerRounds,
    reviewRounds,
    latestReviewVerdict,
    diffFiles,
    diffLinesAdded,
    diffLinesRemoved,
    uiShots,
    openMs,
  };
}

/**
 * Build the bounded state brief. Task/code text is data, never instructions.
 * `maxChars` budgets the brief to the decision model's context window (#0812);
 * it defaults to the safe fixed fallback.
 */
export function buildRoutingBrief(opts: {
  task: Task | null;
  role: RoutingRole;
  extra?: string;
  maxChars?: number;
  progress?: TaskProgress | null;
}): string {
  const { task, role } = opts;
  const parts: string[] = [`Role: ${role}`];
  if (task) {
    parts.push(`Task #${task.id}: ${task.title}`);
    parts.push(
      `Status: ${task.status} · Type: ${task.type ?? "unset"} · Priority: ${task.priority ?? "unset"} · Area: ${task.area ?? "unset"}`,
    );
    const progress = opts.progress ? formatTaskProgress(opts.progress) : null;
    if (progress) parts.push(`Progress: ${progress}`);
    if (task.body) parts.push(`Description:\n${task.body}`);
  }
  if (opts.extra) parts.push(opts.extra);
  const text = parts.join("\n\n");
  const maxChars = opts.maxChars ?? MAX_ROUTING_BRIEF_CHARS;
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (brief truncated)` : text;
}

/** Per-candidate facts plus the metadata needed to render the record summary. */
export interface CandidateFactsBundle {
  /** Facts keyed by candidateKey, for the decision questions. */
  facts: Record<string, CandidateFacts>;
  /** One-line summary per candidateKey, or null when nothing was known. */
  summaryByKey: Record<string, string | null>;
}

/**
 * Gather whatever facts are known for each candidate (#0812): model metadata
 * (price/context/billing) and the project's own history. History defaults to
 * the sessions DB; `deps.history` replaces it (tests). Never throws.
 */
export function buildCandidateFacts(opts: {
  candidates: RoutingCandidate[];
  role: RoutingRole;
  harnesses: Record<string, HarnessAvailability>;
  metadata?: Record<string, ModelMetadata>;
  history?: RoutingWiringDeps["history"];
  db?: ReturnType<typeof getRepoOSDb>;
  billing?: (cli: string) => BillingKind | null;
}): CandidateFactsBundle {
  const facts: Record<string, CandidateFacts> = {};
  const summaryByKey: Record<string, string | null> = {};
  for (const candidate of opts.candidates) {
    try {
      const key = candidateKey(candidate);
      const normalized = normalizeModelId(candidate.model);
      const injected = opts.metadata?.[normalized] ?? opts.metadata?.[key] ?? null;
      const metadata = injected ?? lookupModelMetadata(candidate.model);
      const history = opts.history
        ? opts.history(opts.role, candidate)
        : candidateHistory(opts.db ?? null, opts.role, candidate.cli, candidate.model);
      const resolved = resolveCandidateFacts({
        candidate,
        metadata,
        harnessContextTokens: opts.harnesses[candidate.cli]?.maxContextTokens ?? null,
        billing: opts.billing?.(candidate.cli) ?? billingForCli(candidate.cli),
        history,
      });
      facts[key] = resolved;
      summaryByKey[key] = candidateFactLine(resolved);
    } catch {
      // A fact-gathering failure must never remove a candidate from the set.
    }
  }
  return { facts, summaryByKey };
}

/** Resolve the harness availability map, preferring live detection data. */
export function resolveHarnessAvailability(
  config: RepoOSConfig,
  clis: Iterable<string>,
): Record<string, HarnessAvailability> {
  const detected = readDetectCache(config.root, config.cacheDir);
  if (detected && detected.agents.length > 0) {
    const byCli = new Map(detected.agents.filter((a) => !!a.cli).map((a) => [a.cli as string, a]));
    return buildHarnessAvailability(clis, (cli) => {
      const agent = byCli.get(cli);
      if (!agent) return false;
      // `auth === false` is a definite "not authenticated"; `null` means the
      // probe could not tell, which must not block candidate selection.
      return agent.installed && agent.auth !== false;
    });
  }
  // No detection data yet (fresh boot): do not block on missing evidence.
  return buildHarnessAvailability(clis, () => true);
}

function candidateClis(config: RepoOSConfig, candidates: RoutingCandidate[]): string[] {
  const clis = new Set<string>();
  for (const c of candidates) clis.add(c.cli);
  for (const row of agentModelAllowRows(config.budget?.allowlist)) clis.add(row.cli);
  for (const agent of agentsForConfig(config)) clis.add(agent.cli);
  return [...clis];
}

/** The synthetic Agent used only to record a decision call's usage. */
function decisionAccountingAgent(providerId: string | null, model: string | null): Agent {
  return {
    name: `Model router (${providerId ?? "none"})`,
    cli: providerId ?? "model-router",
    model: model ?? "unknown",
    enabled: true,
  };
}

function recordDecisionUsage(
  deps: RoutingWiringDeps,
  decision: RoutingDecision,
  taskId: string | null,
  durationMs: number,
): void {
  if (deps.recordSession === false) return;
  if (decision.kind !== "decided") return;
  const usage = decision.providerUsage;
  const inputTokens = usage?.inputTokens ?? undefined;
  const outputTokens = usage?.outputTokens ?? undefined;
  const totalTokens =
    inputTokens !== undefined || outputTokens !== undefined
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : undefined;
  const result: PromptResult = {
    ok: true,
    elapsedMs: durationMs,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
  const providerId = deps.config.modelRouting?.provider ?? null;
  const agent = decisionAccountingAgent(providerId, decision.providerModel);
  try {
    recordOneShotSession(deps.config.root, agent, result, {
      sessionType: "routing",
      taskId,
    });
  } catch {
    // Accounting must never break a run.
  }
}

function buildRecord(opts: {
  now: Date;
  taskId: string | null;
  role: RoutingRole;
  mode: "off" | "shadow" | "automatic";
  decision: RoutingDecision;
  actual: RoutingCandidate | null;
  eligible: string[];
  rejected: Array<{ candidate: RoutingCandidate; reason: string }>;
  durationMs: number;
  providerId: string | null;
  handback?: HandbackOutcome | null;
  /** Brief provenance (#0812). */
  brief?: RoutingDecisionRecord["brief"];
  /** Per-candidate facts offered (#0812). */
  facts?: RoutingDecisionRecord["facts"];
}): RoutingDecisionRecord {
  const { decision } = opts;
  const base: Omit<
    RoutingDecisionRecord,
    | "kind"
    | "selection"
    | "fallbackReason"
    | "blockReason"
    | "message"
    | "applied"
    | "recommendation"
  > = {
    id: randomUUID(),
    at: opts.now.toISOString(),
    taskId: opts.taskId,
    role: opts.role,
    mode: opts.mode,
    actual: opts.actual,
    eligible: opts.eligible,
    rejected: opts.rejected.map((r) => ({
      key: `${r.candidate.cli}\u0000${r.candidate.model}\u0000${r.candidate.reasoning ?? ""}`,
      reason: r.reason,
    })),
    provider: opts.providerId as RoutingDecisionRecord["provider"],
    providerModel: decision.kind === "decided" ? decision.providerModel : null,
    providerUsage: decision.kind === "decided" ? decision.providerUsage : null,
    policyVersion: ROUTING_POLICY_VERSION,
    durationMs: opts.durationMs,
    ...(opts.brief ? { brief: opts.brief } : {}),
    ...(opts.facts ? { facts: opts.facts } : {}),
    ...(opts.handback
      ? {
          handback: {
            action: opts.handback.action,
            reason: opts.handback.reason,
            category: opts.handback.category,
            candidate: opts.handback.candidate,
            attempts: 0,
            switches: 0,
            escalations: 0,
            bounded: opts.handback.bounded,
          },
        }
      : {}),
  };

  if (decision.kind !== "decided") {
    return {
      ...base,
      kind: decision.kind,
      applied: false,
      selection: opts.actual,
      recommendation: null,
      fallbackReason: null,
      blockReason: null,
      message: null,
    };
  }

  const outcome = decision.outcome;
  const selection = outcome.kind === "blocked" ? null : outcome.candidate;
  return {
    ...base,
    kind: outcome.kind,
    applied: decision.applied,
    selection,
    recommendation: selection,
    fallbackReason: outcome.kind === "fallback" ? outcome.reason : null,
    blockReason: outcome.kind === "blocked" ? outcome.reason : null,
    message: outcome.kind === "blocked" ? outcome.message : null,
  };
}

/**
 * Resolve the agent for a run, applying automatic routing when configured.
 *
 * Never throws: any failure inside routing returns the canonical base agent, so
 * a routing outage can never prevent a review or an engineer from running.
 */
export async function resolveRoutedAgent(
  deps: RoutingWiringDeps,
  input: RouteRunInput,
): Promise<RouteRunResult> {
  const { config } = deps;
  const effective = resolveEffectiveRouting(config.modelRouting);
  const base = input.base;
  if (!base) return { agent: null, decision: null, handback: null };

  // `off` is exactly today's behavior: no call, no record.
  if (!routingActiveFor(effective, input.role)) {
    return { agent: base, decision: null, handback: null };
  }

  const now = deps.now ?? (() => new Date());
  const startedAt = Date.now();

  // Pins win and are recorded so a later round can reconsider them.
  if (input.pinned) {
    const record: RoutingDecisionRecord = {
      id: randomUUID(),
      at: now().toISOString(),
      taskId: input.task?.id ?? null,
      role: input.role,
      mode: effective.mode,
      kind: "pinned",
      applied: false,
      selection: candidateForAgent(base),
      recommendation: null,
      actual: candidateForAgent(base),
      fallbackReason: null,
      blockReason: null,
      message: null,
      eligible: [],
      rejected: [],
      provider: null,
      providerModel: null,
      providerUsage: null,
      policyVersion: ROUTING_POLICY_VERSION,
      durationMs: 0,
    };
    persistRecord(deps, record);
    return { agent: base, decision: record, handback: null };
  }

  try {
    const candidates = buildCandidateSet({
      allowlist: agentModelAllowRows(config.budget?.allowlist),
      agentPairs: agentsForConfig(config)
        .filter((a) => a.enabled)
        .map((a) => ({ cli: a.cli, model: a.model })),
    });
    const harnesses =
      deps.harnesses ?? resolveHarnessAvailability(config, candidateClis(config, candidates));
    const filtered = filterCandidates({
      role: input.role,
      requiredContextTokens: 0,
      candidates,
      allowlist: agentModelAllowRows(config.budget?.allowlist),
      harnesses,
    });

    const provider =
      "provider" in deps
        ? (deps.provider ?? null)
        : buildRoutingProvider(effective, undefined, config);

    // Budget the brief to the decision model's real context window (#0812):
    // look the window up from provider metadata, take a fixed share, and fall
    // back to the safe fixed size when it is unknown.
    const decisionContextTokens = resolveDecisionContextTokens(
      effective.provider,
      effective.model,
      { override: deps.decisionContextTokens, metadata: deps.metadata },
    );
    const maxChars = briefMaxChars(decisionContextTokens, deps.briefContextShare);
    const progress = buildTaskProgress(input.task, config, { now });
    const brief = buildRoutingBrief({
      task: input.task,
      role: input.role,
      extra: input.briefExtra,
      maxChars,
      progress,
    });

    // Facts each candidate can be judged on (#0812): price, context, billing
    // and this project's own history for the role.
    const factBundle = buildCandidateFacts({
      candidates: filtered.eligible,
      role: input.role,
      harnesses,
      metadata: deps.metadata,
      history: deps.history,
      db: deps.history ? null : getRepoOSDb(config.root),
    });

    const decision = await decideRoutingForRun({
      effective,
      role: input.role,
      pinned: false,
      stateText: brief,
      filter: {
        role: input.role,
        requiredContextTokens: 0,
        candidates,
        allowlist: agentModelAllowRows(config.budget?.allowlist),
        harnesses,
      },
      fallback: candidateForAgent(base),
      costTime: deps.costTime ?? {},
      provider,
      candidateFacts: factBundle.facts,
    });

    const durationMs = Date.now() - startedAt;

    // Review handback compares continuing vs switching/escalating, using the
    // eligible set and attempt history. It never runs a provider call itself.
    // Only same-harness alternatives are considered: a cross-harness switch
    // cannot resume the engineer's session id, so it is not an actionable
    // "switch" and must not be recorded as the configuration actually used.
    const handbackInput = input.handback;
    const handbackEligible = handbackInput
      ? filtered.eligible.filter((c) => c.cli === base.cli)
      : filtered.eligible;
    let handback: HandbackOutcome | null = null;
    if (handbackInput) {
      handback = evaluateHandback({
        role: "engineer",
        current: candidateForAgent(base),
        eligible: handbackEligible,
        ...handbackInput,
      });
    }

    // Decide what (if anything) automatic mode applies.
    let appliedCandidate: RoutingCandidate | null = null;
    if (effective.mode === "automatic") {
      if (
        handback &&
        (handback.action === "switch" || handback.action === "escalate") &&
        handback.candidate &&
        handbackEligible.some(
          (c) =>
            c.cli === handback!.candidate!.cli &&
            c.model === handback!.candidate!.model &&
            c.reasoning === handback!.candidate!.reasoning,
        )
      ) {
        appliedCandidate = handback.candidate;
      } else if (
        decision.kind === "decided" &&
        decision.applied &&
        decision.outcome.kind === "selected"
      ) {
        appliedCandidate = decision.outcome.candidate;
      }
    }

    const record = buildRecord({
      now: now(),
      taskId: input.task?.id ?? null,
      role: input.role,
      mode: effective.mode,
      decision,
      actual: appliedCandidate ?? candidateForAgent(base),
      eligible: filtered.eligible.map((c) => `${c.cli}\u0000${c.model}\u0000${c.reasoning ?? ""}`),
      rejected: filtered.rejected,
      durationMs,
      providerId: config.modelRouting?.provider ?? null,
      handback,
      brief: { chars: brief.length, maxChars, contextTokens: decisionContextTokens },
      facts: filtered.eligible.map((c) => ({
        key: candidateKey(c),
        summary: factBundle.summaryByKey[candidateKey(c)] ?? null,
      })),
    });
    if (handback) {
      record.handback = {
        ...record.handback!,
        attempts: handbackInput!.attempts,
        switches: handbackInput!.switches,
        escalations: handbackInput!.escalations,
      };
    }
    persistRecord(deps, record);

    // Every decision call records its usage, in shadow and automatic mode alike
    // (the call happened even when the selection was not applied).
    recordDecisionUsage(deps, decision, input.task?.id ?? null, durationMs);

    if (!appliedCandidate) {
      return { agent: base, decision: record, handback };
    }
    const merged = mergeAgentOverride(base, appliedCandidate.cli, appliedCandidate.model);
    return { agent: merged, decision: record, handback };
  } catch {
    // Routing must never block a run: fall back to the canonical base agent.
    return { agent: base, decision: null, handback: null };
  }
}

function persistRecord(deps: RoutingWiringDeps, record: RoutingDecisionRecord): void {
  if (deps.persist === false) return;
  try {
    const store = deps.store ?? createRoutingDecisionStore(deps.config.root, deps.config.cacheDir);
    store.append(record);
  } catch {
    // Best-effort.
  }
}

/** The most recent decisions, for the API/UI. Never throws. */
export function listRecentRoutingDecisions(
  config: RepoOSConfig,
  limit = 25,
): RoutingDecisionRecord[] {
  try {
    const store = createRoutingDecisionStore(config.root, config.cacheDir);
    return store.list(Math.min(Math.max(1, limit), MAX_ROUTING_DECISIONS));
  } catch {
    return [];
  }
}

/** Convenience: the repoos.toml cache dir joined under root (used by tests). */
export function routingCacheRoot(config: RepoOSConfig): string {
  return join(config.root, config.cacheDir || ".repoos");
}
