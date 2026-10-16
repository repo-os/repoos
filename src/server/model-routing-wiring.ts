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
import { resolveEffectiveRouting, routingActiveFor } from "../core/model-routing/config.js";
import { filterCandidates, type HarnessAvailability, type RoutingCandidate } from "../core/model-routing/candidates.js";
import { buildCandidateSet, candidateForAgent } from "../core/model-routing/candidate-set.js";
import { buildHarnessAvailability } from "../core/model-routing/harness.js";
import { decideRoutingForRun, type RoutingDecision } from "../core/model-routing/decide.js";
import { buildRoutingProvider } from "../core/model-routing/runtime.js";
import { ROUTING_POLICY_VERSION } from "../core/model-routing/policy.js";
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
import {
  mergeAgentOverride,
  recordOneShotSession,
  type PromptResult,
} from "./agents.js";

/** Upper bound on the brief handed to the provider. */
export const MAX_ROUTING_BRIEF_CHARS = 6000;

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

/** Build the bounded state brief. Task/code text is data, never instructions. */
export function buildRoutingBrief(opts: {
  task: Task | null;
  role: RoutingRole;
  extra?: string;
}): string {
  const { task, role } = opts;
  const parts: string[] = [`Role: ${role}`];
  if (task) {
    parts.push(`Task #${task.id}: ${task.title}`);
    parts.push(
      `Status: ${task.status} · Type: ${task.type ?? "unset"} · Priority: ${task.priority ?? "unset"} · Area: ${task.area ?? "unset"}`,
    );
    if (task.body) parts.push(`Description:\n${task.body}`);
  }
  if (opts.extra) parts.push(opts.extra);
  const text = parts.join("\n\n");
  return text.length > MAX_ROUTING_BRIEF_CHARS
    ? `${text.slice(0, MAX_ROUTING_BRIEF_CHARS)}\n… (brief truncated)`
    : text;
}

/** Resolve the harness availability map, preferring live detection data. */
export function resolveHarnessAvailability(
  config: RepoOSConfig,
  clis: Iterable<string>,
): Record<string, HarnessAvailability> {
  const detected = readDetectCache(config.root, config.cacheDir);
  if (detected && detected.agents.length > 0) {
    const byCli = new Map(
      detected.agents.filter((a) => !!a.cli).map((a) => [a.cli as string, a]),
    );
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
function decisionAccountingAgent(
  providerId: string | null,
  model: string | null,
): Agent {
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
}): RoutingDecisionRecord {
  const { decision } = opts;
  const base: Omit<RoutingDecisionRecord, "kind" | "selection" | "fallbackReason" | "blockReason" | "message" | "applied" | "recommendation"> = {
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
      "provider" in deps ? (deps.provider ?? null) : buildRoutingProvider(effective);

    const decision = await decideRoutingForRun({
      effective,
      role: input.role,
      pinned: false,
      stateText: buildRoutingBrief({
        task: input.task,
        role: input.role,
        extra: input.briefExtra,
      }),
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
    });

    const durationMs = Date.now() - startedAt;

    // Review handback compares continuing vs switching/escalating, using the
    // eligible set and attempt history. It never runs a provider call itself.
    const handbackInput = input.handback;
    let handback: HandbackOutcome | null = null;
    if (handbackInput) {
      handback = evaluateHandback({
        role: "engineer",
        current: candidateForAgent(base),
        eligible: filtered.eligible,
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
        filtered.eligible.some(
          (c) =>
            c.cli === handback!.candidate!.cli &&
            c.model === handback!.candidate!.model &&
            c.reasoning === handback!.candidate!.reasoning,
        )
      ) {
        appliedCandidate = handback.candidate;
      } else if (decision.kind === "decided" && decision.applied && decision.outcome.kind === "selected") {
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
    });
    if (handback) {
      record.handback = {
        ...(record.handback!),
        attempts: handbackInput!.attempts,
        switches: handbackInput!.switches,
        escalations: handbackInput!.escalations,
      };
    }
    persistRecord(deps, record);

    if (effective.mode === "automatic") {
      recordDecisionUsage(deps, decision, input.task?.id ?? null, durationMs);
    }

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
    const store =
      deps.store ?? createRoutingDecisionStore(deps.config.root, deps.config.cacheDir);
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
