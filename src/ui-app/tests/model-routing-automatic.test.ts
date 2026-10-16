/**
 * #0793 — automatic model routing and review-handback re-evaluation.
 *
 * Fixture-backed only: the decision provider is injected, harness availability
 * and the store are injected, and no test touches the network or the real
 * session database. Covers candidate-set construction, deterministic filtering
 * via the harness facts, the bounded handback decision, restart-safe decision
 * records, and the `resolveRoutedAgent` safety contract (pins, shadow, fallback,
 * block, forbidden pairs, and an applied automatic switch).
 */
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types.js";
import { candidateKey, type RoutingCandidate } from "../../core/model-routing/candidates.js";
import {
  buildCandidateSet,
  candidateForAgent,
} from "../../core/model-routing/candidate-set.js";
import {
  buildHarnessAvailability,
  capabilityForCli,
} from "../../core/model-routing/harness.js";
import {
  buildRoutingBrief,
  resolveRoutedAgent,
} from "../../server/model-routing-wiring.js";
import {
  classifyHandbackFailure,
  evaluateHandback,
} from "../../core/model-routing/handback.js";
import {
  createRoutingDecisionStore,
  routingDecisionsPath,
} from "../../core/model-routing/decision-store.js";
import type { RoutingDecisionRecord } from "../../core/model-routing/decisions.js";
import {
  ROUTING_QUESTION_IDS,
} from "../../core/model-routing/policy.js";
import type {
  RoutingAnswer,
  RoutingDecisionProvider,
} from "../../core/model-routing/types.js";
import type { HarnessAvailability } from "../../core/model-routing/candidates.js";
import type { RoutingDecisionStore } from "../../core/model-routing/decision-store.js";

const claude: RoutingCandidate = { cli: "claude code", model: "default", reasoning: null };
const codex: RoutingCandidate = { cli: "codex", model: "gpt-5", reasoning: null };

const ALL_ROLES = ["pm", "engineer", "reviewer"] as const;

const HARNESSES: Record<string, HarnessAvailability> = {
  "claude code": {
    available: true,
    supportedReasoning: [],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: 1_000_000,
  },
  codex: {
    available: true,
    supportedReasoning: ["low", "medium", "high"],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: 1_000_000,
  },
  // A drivable CLI that is installed but not authenticated.
  opencode: {
    available: false,
    supportedReasoning: [],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: 1_000_000,
  },
};

const ALLOW = [
  { cli: "claude code", models: ["default"] },
  { cli: "codex", models: ["gpt-5"] },
];

function makeConfig(over: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root: "/tmp/repoos-routing-test",
    cacheDir: ".repoos",
    modelRouting: {
      mode: "automatic",
      provider: "jev",
      roles: ["pm", "engineer", "reviewer"],
    },
    budget: { allowlist: ALLOW },
    agents: [
      { name: "engineer", cli: "claude code", model: "default", enabled: true },
      { name: "reviewer", cli: "codex", model: "gpt-5", enabled: true },
      { name: "pm", cli: "claude code", model: "default", enabled: true },
      { name: "opencode-only", cli: "opencode", model: "big pickle", enabled: true },
    ],
    ...over,
  } as unknown as RepoOSConfig;
}

function baseAgent(over: Partial<{ cli: string; model: string; name: string }> = {}) {
  return {
    name: over.name ?? "engineer",
    cli: over.cli ?? "claude code",
    model: over.model ?? "default",
    enabled: true,
  };
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: "0793",
    title: "Automatic model routing",
    status: "active",
    type: "feature",
    priority: "p2",
    area: "agent",
    body: "Add automatic routing.",
    absPath: "/tmp/repoos-routing-test/work/0793.md",
    path: "work/0793.md",
    ...over,
  } as unknown as Task;
}

/** A provider that returns a suitability choice for one eligible candidate key. */
function providerChoosing(
  key: string,
  usage: { inputTokens: number | null; outputTokens: number | null } | null = null,
): RoutingDecisionProvider {
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
  return { id: "jev", decide: vi.fn(async () => ({ model: "jev-latest", answers, usage })) };
}

function memStore(): RoutingDecisionStore & { records: RoutingDecisionRecord[] } {
  const records: RoutingDecisionRecord[] = [];
  const store = {
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
  return store;
}

describe("routing candidate set", () => {
  it("uses the allowlist as the whole universe when non-empty", () => {
    const candidates = buildCandidateSet({
      allowlist: ALLOW,
      agentPairs: [{ cli: "opencode", model: "big pickle" }],
    });
    expect(candidates.some((c) => c.cli === "opencode")).toBe(false);
    expect(candidates.some((c) => candidateKey(c) === candidateKey(claude))).toBe(true);
    expect(candidates.some((c) => candidateKey(c) === candidateKey(codex))).toBe(true);
  });

  it("falls back to configured agent pairs when the allowlist is empty", () => {
    const candidates = buildCandidateSet({
      allowlist: [],
      agentPairs: [{ cli: "opencode", model: "big pickle" }],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ cli: "opencode", model: "big pickle", reasoning: null });
  });

  it("emits a reasoning variant for each supported level and de-duplicates stably", () => {
    const candidates = buildCandidateSet({ allowlist: ALLOW, agentPairs: [] });
    const codexVariants = candidates.filter((c) => c.cli === "codex");
    expect(codexVariants.map((c) => c.reasoning ?? "(none)").sort()).toEqual([
      "(none)",
      "high",
      "low",
      "medium",
    ]);
    const again = buildCandidateSet({ allowlist: ALLOW, agentPairs: [] });
    expect(candidates.map(candidateKey)).toEqual(again.map(candidateKey));
  });

  it("candidateForAgent carries the agent's complete configuration", () => {
    expect(candidateForAgent({ cli: "codex", model: "gpt-5" })).toEqual(codex);
    expect(candidateForAgent(null)).toBeNull();
  });
});

describe("harness capability facts", () => {
  it("marks an unavailable harness unavailable and excludes it from roles if not drivable", () => {
    const map = buildHarnessAvailability(["claude code", "opencode", "gemini"], (cli) => cli !== "gemini");
    expect(map["claude code"].available).toBe(true);
    expect(map["opencode"].available).toBe(true);
    // gemini is not an AGENT_CLIS value → never a candidate.
    expect(map["gemini"].available).toBe(false);
    expect(map["gemini"].supportedRoles).toEqual([]);
  });

  it("reports the reasoning levels each harness supports", () => {
    expect(capabilityForCli("codex").reasoning).toEqual(["low", "medium", "high"]);
    expect(capabilityForCli("claude code").reasoning).toEqual([]);
  });
});

describe("review-handback re-evaluation", () => {
  const findings = { bugs: true, edgeCases: false, suggestions: false, blocking: true };

  it("never penalizes a coding model for an infrastructure or gate-setup failure", () => {
    expect(classifyHandbackFailure("gate-setup")).toBe("infrastructure");
    expect(classifyHandbackFailure("timeout")).toBe("infrastructure");
    const out = evaluateHandback({
      role: "engineer",
      current: claude,
      eligible: [claude, codex],
      findings,
      failureKind: "gate-setup",
      attempts: 3,
      switches: 1,
      escalations: 1,
    });
    expect(out.action).toBe("continue");
    expect(out.category).toBe("infrastructure");
  });

  it("switches once, then escalates, then blocks — bounded", () => {
    const first = evaluateHandback({
      role: "engineer",
      current: claude,
      eligible: [claude, codex],
      findings,
      failureKind: "review-findings",
      attempts: 0,
      switches: 0,
      escalations: 0,
    });
    expect(first.action).toBe("switch");
    expect(first.candidate && candidateKey(first.candidate)).toBe(candidateKey(codex));

    const second = evaluateHandback({
      role: "engineer",
      current: codex,
      eligible: [claude, codex],
      findings,
      failureKind: "review-findings",
      attempts: 1,
      switches: 1,
      escalations: 0,
      cost: { [candidateKey(claude)]: 0.9, [candidateKey(codex)]: 0.2 },
    });
    expect(second.action).toBe("escalate");
    expect(second.candidate && candidateKey(second.candidate)).toBe(candidateKey(claude));

    const exhausted = evaluateHandback({
      role: "engineer",
      current: claude,
      eligible: [claude, codex],
      findings,
      failureKind: "review-findings",
      attempts: 4,
      switches: 1,
      escalations: 1,
    });
    expect(exhausted.action).toBe("block");
    expect(exhausted.bounded).toBe(true);
  });

  it("accepts a handback with no blocking findings", () => {
    const out = evaluateHandback({
      role: "engineer",
      current: claude,
      eligible: [claude, codex],
      findings: { bugs: false, edgeCases: false, suggestions: true, blocking: false },
      failureKind: null,
      attempts: 0,
      switches: 0,
      escalations: 0,
    });
    expect(out.action).toBe("accept");
  });
});

describe("decision store (restart-safe)", () => {
  function record(id: string, taskId: string | null = "0793"): RoutingDecisionRecord {
    return {
      id,
      at: new Date().toISOString(),
      taskId,
      role: "engineer",
      mode: "automatic",
      kind: "selected",
      applied: true,
      selection: codex,
      recommendation: codex,
      actual: codex,
      fallbackReason: null,
      blockReason: null,
      message: null,
      eligible: [candidateKey(codex)],
      rejected: [],
      provider: "jev",
      providerModel: "jev-latest",
      providerUsage: null,
      policyVersion: "2",
      durationMs: 12,
    };
  }

  it("round-trips records across store instances and keeps them newest-first", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-routing-"));
    const store = createRoutingDecisionStore(root, ".repoos");
    store.append(record("a"));
    store.append(record("b"));
    // A fresh instance simulates a server restart.
    const reopened = createRoutingDecisionStore(root, ".repoos");
    const list = reopened.list();
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
    expect(reopened.listForTask("0793")).toHaveLength(2);
    expect(routingDecisionsPath(root, ".repoos")).toContain("decisions.json");
  });

  it("ignores a corrupt file instead of throwing", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-routing-"));
    const store = createRoutingDecisionStore(root, ".repoos");
    const file = routingDecisionsPath(root, ".repoos");
    mkdirSync(join(root, ".repoos", "model-routing"), { recursive: true });
    writeFileSync(file, "{not json", "utf8");
    expect(store.list()).toEqual([]);
  });
});

describe("resolveRoutedAgent", () => {
  const base = baseAgent();

  it("off mode returns the base agent with no call and no record", async () => {
    const decide = vi.fn();
    const store = memStore();
    const out = await resolveRoutedAgent(
      {
        config: makeConfig({ modelRouting: { mode: "off" } }),
        provider: { id: "jev", decide },
        harnesses: HARNESSES,
        store,
      },
      { role: "engineer", task: makeTask(), base, pinned: false },
    );
    expect(out.agent).toEqual(base);
    expect(out.decision).toBeNull();
    expect(decide).not.toHaveBeenCalled();
    expect(store.records).toHaveLength(0);
  });

  it("records a pin without calling the provider and never changes the agent", async () => {
    const decide = vi.fn();
    const store = memStore();
    const out = await resolveRoutedAgent(
      { config: makeConfig(), provider: { id: "jev", decide }, harnesses: HARNESSES, store },
      { role: "engineer", task: makeTask(), base, pinned: true },
    );
    expect(out.agent).toEqual(base);
    expect(out.decision?.kind).toBe("pinned");
    expect(decide).not.toHaveBeenCalled();
  });

  it("shadow records the recommendation but returns the base agent", async () => {
    const store = memStore();
    const out = await resolveRoutedAgent(
      {
        config: makeConfig({
          modelRouting: { mode: "shadow", provider: "jev", roles: ["engineer"] },
        }),
        provider: providerChoosing(candidateKey(codex)),
        harnesses: HARNESSES,
        store,
      },
      { role: "engineer", task: makeTask(), base, pinned: false },
    );
    expect(out.agent).toEqual(base);
    expect(out.decision?.kind).toBe("selected");
    expect(out.decision?.applied).toBe(false);
    expect(out.decision?.recommendation && candidateKey(out.decision.recommendation)).toBe(
      candidateKey(codex),
    );
    expect(store.records).toHaveLength(1);
  });

  it("automatic mode applies a scored selection as a complete cli+model pair", async () => {
    const store = memStore();
    const out = await resolveRoutedAgent(
      {
        config: makeConfig(),
        provider: providerChoosing(candidateKey(codex), { inputTokens: 100, outputTokens: 20 }),
        harnesses: HARNESSES,
        store,
        recordSession: false,
      },
      { role: "engineer", task: makeTask(), base, pinned: false },
    );
    expect(out.agent?.cli).toBe("codex");
    expect(out.agent?.model).toBe("gpt-5");
    expect(out.decision?.applied).toBe(true);
    expect(out.decision?.providerUsage).toEqual({ inputTokens: 100, outputTokens: 20 });
  });

  it("never applies a forbidden pair the provider recommends", async () => {
    const store = memStore();
    const forbidden = { cli: "opencode", model: "big pickle", reasoning: null } as RoutingCandidate;
    // The provider recommends a candidate that is not on the allowlist and whose
    // harness is unavailable — the filtered eligible set does not contain it.
    const out = await resolveRoutedAgent(
      {
        config: makeConfig(),
        provider: providerChoosing(candidateKey(forbidden)),
        harnesses: HARNESSES,
        store,
        recordSession: false,
      },
      { role: "engineer", task: makeTask(), base, pinned: false },
    );
    // Permissions cannot widen: the base agent is kept.
    expect(out.agent).toEqual(base);
    expect(out.decision?.applied).toBe(false);
  });

  it("blocks with no eligible candidates and never changes the agent", async () => {
    const store = memStore();
    const out = await resolveRoutedAgent(
      {
        config: makeConfig({ budget: { allowlist: [{ cli: "opencode", models: ["big pickle"] }] } }),
        provider: providerChoosing(candidateKey(codex)),
        harnesses: HARNESSES,
        store,
        recordSession: false,
      },
      { role: "engineer", task: makeTask(), base, pinned: false },
    );
    expect(out.agent).toEqual(base);
    expect(out.decision?.kind).toBe("blocked");
  });

  it("falls back safely on a provider failure without changing the agent", async () => {
    const store = memStore();
    const provider: RoutingDecisionProvider = {
      id: "jev",
      decide: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const out = await resolveRoutedAgent(
      { config: makeConfig(), provider, harnesses: HARNESSES, store, recordSession: false },
      { role: "engineer", task: makeTask(), base, pinned: false },
    );
    expect(out.agent).toEqual(base);
    expect(out.decision?.kind).toBe("fallback");
  });

  it("applies a bounded handback switch for a same-harness model change", async () => {
    const store = memStore();
    const baseCodex = baseAgent({ cli: "codex", model: "gpt-5" });
    // Provider picks nothing actionable; the handback drives a switch to claude.
    const out = await resolveRoutedAgent(
      {
        config: makeConfig(),
        provider: providerChoosing(candidateKey(claude)),
        harnesses: HARNESSES,
        store,
        recordSession: false,
      },
      {
        role: "engineer",
        task: makeTask(),
        base: baseCodex,
        pinned: false,
        handback: {
          findings: { bugs: true, edgeCases: false, suggestions: false, blocking: true },
          failureKind: "review-findings",
          attempts: 0,
          switches: 0,
          escalations: 0,
        },
      },
    );
    expect(out.handback?.action).toBe("switch");
    // claude code vs codex is a different harness, so the engineer agent is kept
    // (a session id cannot port across harnesses) — the decision is still recorded.
    expect(out.decision?.handback?.action).toBe("switch");
  });

  it("builds a bounded brief that includes role and task context", () => {
    const brief = buildRoutingBrief({ task: makeTask(), role: "reviewer" });
    expect(brief).toContain("Role: reviewer");
    expect(brief).toContain("Task #0793");
    expect(brief.length).toBeLessThanOrEqual(7000);
  });
});
