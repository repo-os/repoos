/**
 * #0812 — decision-model inputs: model facts, project history, task progress
 * and a clear objective.
 *
 * Fixture-backed: provider metadata and history are injected, the decision
 * provider is fake, and the one database test uses a throwaway temp root. No
 * test touches the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoOSDb, resetDbInstance, type SessionRecord } from "../../core/db.js";
import {
  candidateKey,
  type HarnessAvailability,
  type RoutingCandidate,
} from "../../core/model-routing/candidates.js";
import { buildRoutingQuestions, ROUTING_OBJECTIVE } from "../../core/model-routing/decide.js";
import { ROUTING_QUESTION_IDS } from "../../core/model-routing/policy.js";
import {
  candidateFactLine,
  effectiveCostUsd,
  formatTokenCount,
  lookupModelMetadata,
  resolveCandidateFacts,
  resolveDecisionContextTokens,
  type ModelMetadata,
  type ProjectRoleHistory,
} from "../../core/model-routing/facts.js";
import { historyFromSessions, candidateHistory } from "../../server/candidate-history.js";
import {
  MAX_ROUTING_BRIEF_CHARS,
  MIN_ROUTING_BRIEF_CHARS,
  buildCandidateFacts,
  buildRoutingBrief,
  briefMaxChars,
  resolveRoutedAgent,
  type RoutingWiringDeps,
} from "../../server/model-routing-wiring.js";
import type { RoutingDecisionRecord } from "../../core/model-routing/decisions.js";
import type { RoutingAnswer, RoutingDecisionProvider } from "../../core/model-routing/types.js";
import type { RoutingDecisionStore } from "../../core/model-routing/decision-store.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

const ALL_ROLES = ["pm", "engineer", "reviewer"] as const;

const HARNESSES: Record<string, HarnessAvailability> = {
  "claude code": {
    available: true,
    supportedReasoning: [],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: 200_000,
  },
  codex: {
    available: true,
    supportedReasoning: ["low", "medium", "high"],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: 200_000,
  },
};

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-routing-facts-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDbInstance();
  for (const r of roots.splice(0)) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* already gone */
    }
  }
});

function meta(over: Partial<ModelMetadata> = {}): ModelMetadata {
  return {
    inputPricePerM: 3,
    outputPricePerM: 15,
    cacheReadPricePerM: 0.3,
    contextWindow: 400_000,
    source: "test",
    ...over,
  };
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "0812",
    title: "Decision model inputs",
    status: "active",
    type: "feature",
    priority: "p2",
    area: "server, core",
    body: "Add facts.",
    created_at: "2026-10-17T00:00:00Z",
    absPath: "/tmp/0812.md",
    path: "work/0812.md",
    ...over,
  } as unknown as Task;
}

function session(over: Partial<SessionRecord>): SessionRecord {
  return {
    sessionId: over.sessionId ?? `s-${Math.random().toString(36).slice(2)}`,
    sessionType: "engineer",
    taskId: "0001",
    agent: "engineer",
    model: "gpt-5",
    codingAgent: "opencode",
    startedAt: "2026-10-17T00:00:00Z",
    endedAt: "2026-10-17T00:10:00Z",
    elapsedMs: 600_000,
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    cacheReadTokens: null,
    cacheCreationTokens: null,
    turns: 2,
    costUsd: 0.1,
    costSource: "extractUsage",
    status: "finished",
    lastActivityAt: "2026-10-17T00:10:00Z",
    trigger: null,
    errorReason: null,
    ...over,
  };
}

describe("brief budget (#0812)", () => {
  it("uses a fixed share of the decision model's window and falls back safely", () => {
    // Unknown window → the historical fixed fallback.
    expect(briefMaxChars(null)).toBe(MAX_ROUTING_BRIEF_CHARS);
    expect(briefMaxChars(0)).toBe(MAX_ROUTING_BRIEF_CHARS);
    expect(briefMaxChars(undefined)).toBe(MAX_ROUTING_BRIEF_CHARS);
    // Known window → a fixed share (25%) of it, converted at 4 chars/token.
    expect(briefMaxChars(200_000)).toBe(200_000 * 0.25 * 4);
    // A tiny window still yields the floor, not a degenerate budget.
    expect(briefMaxChars(1_000)).toBe(MIN_ROUTING_BRIEF_CHARS);
  });

  it("truncates the brief to the supplied budget", () => {
    const task = makeTask({ body: "x".repeat(50_000) });
    const brief = buildRoutingBrief({ task, role: "engineer", maxChars: 500 });
    expect(brief.length).toBeLessThanOrEqual(500 + "\n… (brief truncated)".length);
    expect(brief.endsWith("(brief truncated)")).toBe(true);

    const unbudgeted = buildRoutingBrief({ task, role: "engineer" });
    expect(unbudgeted.length).toBeLessThanOrEqual(MAX_ROUTING_BRIEF_CHARS + 30);
  });

  it("resolves the decision window from provider metadata, then the curated floor", () => {
    expect(resolveDecisionContextTokens("jev", "jev-latest")).toBe(128_000);
    expect(resolveDecisionContextTokens(null, "totally-unknown")).toBeNull();
    expect(resolveDecisionContextTokens("openrouter", "some/model", { override: 555_000 })).toBe(
      555_000,
    );
    expect(
      resolveDecisionContextTokens("openrouter", "acme/model", {
        metadata: { "acme/model": meta({ contextWindow: 300_000 }) },
      }),
    ).toBe(300_000);
  });
});

describe("candidate facts (#0812)", () => {
  const history: ProjectRoleHistory = {
    runs: 4,
    successRate: 0.75,
    failureRate: 0.25,
    avgTokens: 42_000,
    avgTurns: 6,
    avgCostUsd: 0.42,
    avgReviewPasses: 1.5,
  };

  const rich: RoutingCandidate = { cli: "opencode", model: "gpt-5", reasoning: null };
  const plain: RoutingCandidate = { cli: "mystery", model: "who-knows", reasoning: null };
  const withReasoning: RoutingCandidate = {
    cli: "codex",
    model: "gpt-5",
    reasoning: "high",
  };

  function bundle() {
    return buildCandidateFacts({
      candidates: [rich, plain, withReasoning],
      role: "engineer",
      harnesses: HARNESSES,
      history: (_role, c) => (candidateKey(c) === candidateKey(rich) ? history : null),
      billing: () => null,
    });
  }

  it("adds price, context and project history when known, omitting unknown fields", () => {
    const { facts } = bundle();
    const richLine = candidateFactLine(facts[candidateKey(rich)]!);
    expect(richLine).toContain("price");
    expect(richLine).toContain("context");
    expect(richLine).toContain("history:");
    expect(richLine).toContain("75% pass");

    // Nothing is known about this candidate, so it carries no fact line at all.
    expect(candidateFactLine(facts[candidateKey(plain)]!)).toBeNull();
  });

  it("only shows a reasoning field when the candidate has a real level", () => {
    const { facts } = bundle();
    const questions = buildRoutingQuestions([rich, plain, withReasoning], { facts });
    const suit = questions.find((q) => q.id === ROUTING_QUESTION_IDS.suitability);
    expect(suit?.type).toBe("choice");
    if (!suit || suit.type !== "choice") throw new Error("unreachable");
    expect(suit.criteria[candidateKey(rich)]).not.toMatch(/reasoning/i);
    expect(suit.criteria[candidateKey(plain)]).not.toMatch(/reasoning/i);
    expect(suit.criteria[candidateKey(withReasoning)]).toContain("reasoning high");
  });

  it("states the objective in the decision question", () => {
    const questions = buildRoutingQuestions([rich]);
    const suit = questions.find((q) => q.id === ROUTING_QUESTION_IDS.suitability);
    expect(suit && suit.type === "choice" ? suit.instructions : "").toContain(ROUTING_OBJECTIVE);
  });

  it("keeps the criteria keys equal to candidateKey so the provider can answer", () => {
    const questions = buildRoutingQuestions([rich, plain], { facts: bundle().facts });
    const suit = questions.find((q) => q.id === ROUTING_QUESTION_IDS.suitability);
    expect(suit && suit.type === "choice" ? Object.keys(suit.criteria) : []).toEqual([
      candidateKey(rich),
      candidateKey(plain),
    ]);
  });

  it("uses the harness context floor when the model window is unknown", () => {
    const facts = resolveCandidateFacts({
      candidate: { cli: "codex", model: "totally-unknown", reasoning: null },
      metadata: null,
      harnessContextTokens: 200_000,
    });
    expect(facts.contextTokens).toBe(200_000);
    expect(facts.inputPricePerM).toBeNull();
  });

  it("looks curated model metadata up by normalized id", () => {
    expect(lookupModelMetadata("opencode/gpt-5")?.inputPricePerM).toBe(1.25);
    expect(lookupModelMetadata("nope")).toBeNull();
  });

  it("computes effective cost with the cache-read rate when available", () => {
    const facts = resolveCandidateFacts({
      candidate: { cli: "opencode", model: "gpt-5", reasoning: null },
      metadata: meta({ inputPricePerM: 1, outputPricePerM: 10, cacheReadPricePerM: 0.1 }),
    });
    // 1M uncached input at $1 + 1M output at $10 = $11.
    expect(
      effectiveCostUsd(facts, { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(11);
    // 1M input, all cache-read at $0.1, no output = $0.1.
    expect(
      effectiveCostUsd(facts, {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.1);
    // A missing price yields no estimate.
    expect(
      effectiveCostUsd(resolveCandidateFacts({ candidate: plain, metadata: null }), {
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toBeNull();
  });

  it("formats token counts compactly", () => {
    expect(formatTokenCount(200_000)).toBe("200k");
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
  });
});

describe("project history (#0812)", () => {
  it("aggregates success/failure, tokens, turns, cost and review passes", () => {
    const rows = [
      session({ taskId: "1", totalTokens: 1_000, turns: 2, costUsd: 0.1 }),
      session({ taskId: "1", totalTokens: 3_000, turns: 4, costUsd: 0.3, status: "errored" }),
      session({ taskId: "2", totalTokens: 2_000, turns: 6, costUsd: 0.2 }),
    ];
    const h = historyFromSessions(
      rows,
      new Map([
        ["1", 2],
        ["2", 1],
      ]),
    );
    expect(h).not.toBeNull();
    expect(h!.runs).toBe(3);
    expect(h!.successRate).toBeCloseTo(2 / 3);
    expect(h!.failureRate).toBeCloseTo(1 / 3);
    expect(h!.avgTokens).toBeCloseTo(2_000);
    expect(h!.avgTurns).toBeCloseTo(4);
    expect(h!.avgCostUsd).toBeCloseTo(0.2);
    expect(h!.avgReviewPasses).toBeCloseTo(1.5);
    expect(historyFromSessions([])).toBeNull();
  });

  it("reads history from the project's own sessions database", () => {
    const root = tempRoot();
    const db = new RepoOSDb(root);
    db.upsertSession({
      sessionId: "eng-1",
      sessionType: "engineer",
      taskId: "0001",
      agent: "engineer",
      model: "big-pickle",
      codingAgent: "opencode",
      startedAt: "2026-10-17T00:00:00Z",
      endedAt: "2026-10-17T00:10:00Z",
      elapsedMs: 600_000,
      totalTokens: 1_000,
      turns: 3,
      costUsd: 0.2,
      costSource: "extractUsage",
      status: "finished",
      lastActivityAt: "2026-10-17T00:10:00Z",
    });
    db.upsertSession({
      sessionId: "rev-1",
      sessionType: "reviewer",
      taskId: "0001",
      agent: "reviewer",
      model: "big-pickle",
      codingAgent: "opencode",
      startedAt: "2026-10-17T00:20:00Z",
      endedAt: "2026-10-17T00:25:00Z",
      elapsedMs: 300_000,
      status: "finished",
      lastActivityAt: "2026-10-17T00:25:00Z",
    });
    const h = candidateHistory(db, "engineer", "opencode", "big-pickle");
    expect(h).not.toBeNull();
    expect(h!.runs).toBe(1);
    expect(h!.avgReviewPasses).toBe(1);
    expect(candidateHistory(db, "engineer", "opencode", "never-run")).toBeNull();
    db.close();
  });
});

describe("resolveRoutedAgent records the brief and facts (#0812)", () => {
  const base = { name: "engineer", cli: "claude code", model: "default", enabled: true };

  function makeConfig(over: Partial<RepoOSConfig> = {}): RepoOSConfig {
    return {
      root: tempRoot(),
      cacheDir: ".repoos",
      modelRouting: { mode: "automatic", provider: "jev", roles: ["engineer", "reviewer", "pm"] },
      budget: { allowlist: [{ cli: "codex", models: ["gpt-5"] }] },
      agents: [{ name: "engineer", cli: "codex", model: "gpt-5", enabled: true }],
      ...over,
    } as unknown as RepoOSConfig;
  }

  function memStore(): RoutingDecisionStore & { records: RoutingDecisionRecord[] } {
    const records: RoutingDecisionRecord[] = [];
    return {
      records,
      list: (limit?: number) => (typeof limit === "number" ? records.slice(0, limit) : records),
      listForTask: (taskId: string, limit?: number) =>
        records.filter((r) => r.taskId === taskId).slice(0, limit),
      append: (record: RoutingDecisionRecord) => {
        records.unshift(record);
      },
      clear: () => {
        records.length = 0;
      },
    };
  }

  function providerChoosing(key: string): RoutingDecisionProvider {
    const answers: Record<string, RoutingAnswer> = {
      [ROUTING_QUESTION_IDS.ambiguity]: { id: "ambiguity", type: "noul", probability: 0.1 },
      [ROUTING_QUESTION_IDS.risk]: { id: "risk", type: "noul", probability: 0.1 },
      [ROUTING_QUESTION_IDS.scope]: { id: "scope", type: "noul", probability: 0.1 },
      [ROUTING_QUESTION_IDS.suitability]: {
        id: ROUTING_QUESTION_IDS.suitability,
        type: "choice",
        choice: key,
        confidence: 0.9,
        probabilities: { [key]: 0.9 },
      },
    };
    return {
      id: "jev",
      decide: vi.fn(async () => ({ model: "jev-latest", answers, usage: null })),
    };
  }

  it("logs the brief size and the facts it used on the decision", async () => {
    const store = memStore();
    const deps: RoutingWiringDeps = {
      config: makeConfig(),
      provider: providerChoosing(candidateKey({ cli: "codex", model: "gpt-5", reasoning: null })),
      harnesses: HARNESSES,
      store,
      recordSession: false,
      decisionContextTokens: 100_000,
      history: () => ({
        runs: 2,
        successRate: 1,
        failureRate: 0,
        avgTokens: 1_000,
        avgTurns: 2,
        avgCostUsd: 0.1,
        avgReviewPasses: 1,
      }),
    };
    const out = await resolveRoutedAgent(deps, {
      role: "engineer",
      task: makeTask(),
      base,
      pinned: false,
    });
    expect(out.decision?.brief).toBeDefined();
    expect(out.decision!.brief!.contextTokens).toBe(100_000);
    expect(out.decision!.brief!.maxChars).toBe(100_000);
    expect(out.decision!.brief!.chars).toBeGreaterThan(0);
    expect(out.decision!.brief!.chars).toBeLessThanOrEqual(100_000);
    expect(out.decision!.facts?.some((f) => f.summary?.includes("history:"))).toBe(true);
  });
});
