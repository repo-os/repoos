/**
 * #0791 — adaptive agent/model routing foundation.
 *
 * Covers the safety contract (off = no call, pins win, shadow never applies,
 * the budget allowlist is a hard ceiling, fallback never selects a forbidden
 * pair), the strict System One wire codec against the documented response
 * shape, both provider adapters via injected fetch, and `[model_routing]`
 * parsing. No test touches the network.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseModelRouting,
  resolveEffectiveRouting,
  routingActiveFor,
  ROUTING_PROVIDER_CHOICES,
  DEFAULT_ROUTING_TIMEOUT_MS,
} from "../../core/model-routing/config.js";
import {
  candidateKey,
  filterCandidates,
  type RoutingCandidate,
} from "../../core/model-routing/candidates.js";
import {
  decideRouting,
  ROUTING_QUESTION_IDS,
  hasSufficientEvidence,
  MIN_ANSWER_CONFIDENCE,
  ROUTING_NEUTRAL_COST_TIME,
} from "../../core/model-routing/policy.js";
import {
  decideRoutingForRun,
  buildRoutingQuestions,
  type DecideRoutingInput,
} from "../../core/model-routing/decide.js";
import {
  decodeSystemOneResponse,
  encodeSystemOneRequest,
} from "../../core/model-routing/system-one.js";
import {
  createJevProvider,
  createClefFlashProvider,
  createOpenRouterProvider,
  mapOpenRouterSystemOneModel,
  OPENROUTER_SYSTEMONE_ENDPOINT,
  JEV_ENDPOINT,
  JEV_DEFAULT_MODEL,
  CLEF_FLASH_DEFAULT_MODEL,
} from "../../core/model-routing/providers.js";
import {
  RoutingProviderError,
  type RoutingAnswer,
  type RoutingDecisionProvider,
  type RoutingRole,
} from "../../core/model-routing/types.js";
import { getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { probeModelRouting } from "../../core/model-routing/runtime.js";
import type { RepoOSConfig } from "../../core/types.js";

const claude: RoutingCandidate = { cli: "claude code", model: "default", reasoning: null };
const codex: RoutingCandidate = { cli: "codex", model: "gpt-5", reasoning: null };
const kiro: RoutingCandidate = { cli: "kiro", model: "default", reasoning: null };
const ALL_ROLES = ["pm", "engineer", "reviewer"] as const;
const LARGE_CONTEXT = 1_000_000;

const allHarnesses = {
  "claude code": {
    available: true,
    supportedReasoning: [],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: LARGE_CONTEXT,
  },
  codex: {
    available: true,
    supportedReasoning: ["low", "high"],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: LARGE_CONTEXT,
  },
  kiro: {
    available: true,
    supportedReasoning: [],
    supportedRoles: [...ALL_ROLES],
    maxContextTokens: LARGE_CONTEXT,
  },
};

const defaultFilter = {
  role: "engineer" as const,
  requiredContextTokens: 0,
};

/** A suitability answer where each candidate's probability is set explicitly. */
function suitabilityAnswer(
  probs: Record<string, number>,
  confidence: number | null = 0.9,
): RoutingAnswer {
  return {
    id: ROUTING_QUESTION_IDS.suitability,
    type: "choice",
    choice: Object.keys(probs)[0],
    confidence,
    probabilities: probs,
  };
}

function answersWith(suit: RoutingAnswer): Record<string, RoutingAnswer> {
  return {
    [ROUTING_QUESTION_IDS.ambiguity]: { id: "ambiguity", type: "noul", probability: 0.1 },
    [ROUTING_QUESTION_IDS.risk]: { id: "risk", type: "noul", probability: 0.1 },
    [ROUTING_QUESTION_IDS.scope]: { id: "scope", type: "noul", probability: 0.1 },
    [ROUTING_QUESTION_IDS.suitability]: suit,
  };
}

const BASE_ALLOW = [
  { cli: "claude code", models: ["default"] },
  { cli: "codex", models: ["gpt-5"] },
];

describe("routing config", () => {
  it("is off by default: an unset section resolves to off and never routes", () => {
    const eff = resolveEffectiveRouting(undefined);
    expect(eff.mode).toBe("off");
    for (const role of ["pm", "engineer", "reviewer"] as const) {
      expect(routingActiveFor(eff, role)).toBe(false);
    }
  });

  it("parses a valid section and resolves provider defaults", () => {
    const { config, warnings } = parseModelRouting({
      mode: "shadow",
      provider: "clef-flash",
      baseUrl: "http://gpu:30000",
      roles: ["reviewer"],
      timeoutMs: 4000,
    });
    expect(warnings).toEqual([]);
    const eff = resolveEffectiveRouting(config);
    expect(eff.mode).toBe("shadow");
    expect(eff.provider).toBe("clef-flash");
    expect(eff.model).toBe(CLEF_FLASH_DEFAULT_MODEL);
    expect(eff.credentialEnv).toBe("REPOOS_CLEF_FLASH_API_KEY");
    expect(eff.timeoutMs).toBe(4000);
    expect(routingActiveFor(eff, "reviewer")).toBe(true);
    expect(routingActiveFor(eff, "engineer")).toBe(false);
  });

  it("drops invalid values with a warning instead of failing, falling back to off", () => {
    const { config, warnings } = parseModelRouting({
      mode: "yolo",
      provider: "openai",
      roles: ["engineer", "wizard"],
      timeoutMs: 999999,
    });
    expect(config.mode).toBeUndefined();
    expect(config.provider).toBeUndefined();
    expect(config.roles).toEqual(["engineer"]);
    expect(config.timeoutMs).toBeUndefined();
    expect(warnings.length).toBeGreaterThanOrEqual(4);
    expect(resolveEffectiveRouting(config).mode).toBe("off");
  });

  it("ignores legacy credentialEnv in repoos.toml with a warning", () => {
    const { config, warnings } = parseModelRouting({ credentialEnv: "TYPESAFE_API_KEY" });
    expect("credentialEnv" in config).toBe(false);
    expect(warnings.some((w) => w.includes("credentialEnv"))).toBe(true);
  });

  it("exposes every routing key in the schema and the TOML allowlist", () => {
    const keys = getConfigSchema().map((f) => f.key);
    for (const key of [
      "model_routing.mode",
      "model_routing.provider",
      "model_routing.model",
      "model_routing.baseUrl",
      "model_routing.roles",
      "model_routing.timeoutMs",
      "model_routing.humanStepCheck",
    ]) {
      expect(keys).toContain(key);
      expect(SUPPORTED_TOML_KEYS).toContain(key);
    }
  });

  it("defaults the routing timeout to the documented constant", () => {
    expect(resolveEffectiveRouting(undefined).timeoutMs).toBe(DEFAULT_ROUTING_TIMEOUT_MS);
  });

  // #0809 — Clef-Flash is retained in the schema so existing configs parse, but
  // the UI must offer exactly Jev and OpenRouter, with OpenRouter plain.
  it("offers exactly Jev and OpenRouter as selectable providers, plainly labelled", () => {
    expect(ROUTING_PROVIDER_CHOICES.map((p) => p.value)).toEqual(["jev", "openrouter"]);
    expect(ROUTING_PROVIDER_CHOICES.map((p) => p.label)).toEqual([
      "TypeSafe Jev (direct)",
      "OpenRouter",
    ]);
    // The label must not enumerate decision models.
    expect(ROUTING_PROVIDER_CHOICES.some((p) => /clef/i.test(p.label))).toBe(false);
    expect(ROUTING_PROVIDER_CHOICES.some((p) => /model/i.test(p.label))).toBe(false);
  });

  it("still parses a legacy clef-flash provider so existing configs do not break", () => {
    const { config, warnings } = parseModelRouting({ provider: "clef-flash" });
    expect(warnings).toEqual([]);
    expect(resolveEffectiveRouting(config).provider).toBe("clef-flash");
  });
});

describe("candidate filtering", () => {
  it("an empty allowlist is the unrestricted no-op", () => {
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      candidates: [claude, codex],
      allowlist: [],
      harnesses: allHarnesses,
    });
    expect(eligible.map((c) => c.cli).sort()).toEqual(["claude code", "codex"]);
    expect(rejected).toEqual([]);
  });

  it("a non-empty allowlist is a hard ceiling: unlisted CLIs and models are refused", () => {
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      candidates: [claude, codex, kiro, { cli: "codex", model: "gpt-9", reasoning: null }],
      allowlist: BASE_ALLOW,
      harnesses: allHarnesses,
    });
    expect(eligible.map(candidateKey).sort()).toEqual(
      [candidateKey(claude), candidateKey(codex)].sort(),
    );
    expect(rejected.find((r) => r.candidate.cli === "kiro")?.reason).toContain("allowlist");
    expect(rejected.find((r) => r.candidate.model === "gpt-9")?.reason).toContain("allowlist");
  });

  it("skips a paused allowlist pair and explains why (#0850)", () => {
    const paused = [
      { cli: "claude code", models: ["default"], paused: true, pausedReason: "credits exhausted" },
      { cli: "codex", models: ["gpt-5"] },
    ];
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      candidates: [claude, codex],
      allowlist: paused,
      harnesses: allHarnesses,
    });
    expect(eligible.map(candidateKey)).toEqual([candidateKey(codex)]);
    expect(rejected.find((r) => r.candidate.cli === "claude code")?.reason).toContain("paused");
  });

  it("skips a paused model while keeping the rest of its row selectable (#0850)", () => {
    const paused = [
      { cli: "codex", models: ["gpt-5"], pausedModels: [{ model: "gpt-5" }] },
      { cli: "claude code", models: ["default"] },
    ];
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      candidates: [claude, codex],
      allowlist: paused,
      harnesses: allHarnesses,
    });
    expect(eligible.map(candidateKey)).toEqual([candidateKey(claude)]);
    expect(rejected.find((r) => r.candidate.cli === "codex")?.reason).toContain("paused");
  });

  it("refuses a candidate whose harness is not installed or authenticated", () => {
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      candidates: [claude],
      allowlist: [],
      harnesses: {
        "claude code": {
          available: false,
          supportedReasoning: [],
          supportedRoles: [...ALL_ROLES],
          maxContextTokens: LARGE_CONTEXT,
        },
      },
    });
    expect(eligible).toEqual([]);
    expect(rejected[0].reason).toContain("not installed");
  });

  it("refuses an unsupported reasoning setting rather than pairing it blindly", () => {
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      candidates: [{ cli: "codex", model: "gpt-5", reasoning: "extreme" }],
      allowlist: [],
      harnesses: allHarnesses,
    });
    expect(eligible).toEqual([]);
    expect(rejected[0].reason).toContain("reasoning");
  });

  it("de-duplicates and returns a stable order", () => {
    const { eligible } = filterCandidates({
      ...defaultFilter,
      candidates: [codex, claude, codex, claude],
      allowlist: [],
      harnesses: allHarnesses,
    });
    expect(eligible).toHaveLength(2);
    const again = filterCandidates({
      ...defaultFilter,
      candidates: [claude, codex],
      allowlist: [],
      harnesses: allHarnesses,
    });
    expect(eligible.map(candidateKey)).toEqual(again.eligible.map(candidateKey));
  });

  it("excludes an available harness that does not support the run role before scoring", () => {
    const engineerOnly = {
      ...allHarnesses,
      codex: {
        ...allHarnesses.codex,
        supportedRoles: ["engineer"] satisfies RoutingRole[],
      },
      "claude code": {
        ...allHarnesses["claude code"],
        supportedRoles: ["pm", "reviewer"] satisfies RoutingRole[],
      },
    };
    const { eligible, rejected } = filterCandidates({
      ...defaultFilter,
      role: "engineer",
      candidates: [claude, codex],
      allowlist: [],
      harnesses: engineerOnly,
    });
    expect(eligible.map(candidateKey)).toEqual([candidateKey(codex)]);
    expect(rejected.find((r) => r.candidate.cli === "claude code")?.reason).toContain("engineer");

    const answers = answersWith(suitabilityAnswer({ [candidateKey(codex)]: 0.9 }));
    const out = decideRouting({
      eligible,
      fallback: codex,
      answers,
      failure: null,
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out.kind).toBe("selected");
    if (out.kind === "selected") expect(out.candidate.cli).toBe("codex");
  });
});

describe("policy", () => {
  const eligible = [claude, codex];
  const fallback = claude;
  const ok = answersWith(
    suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 }),
  );

  it("with no candidates, blocks with an actionable message and never picks", () => {
    const out = decideRouting({
      eligible: [],
      fallback,
      answers: ok,
      failure: null,
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out.kind).toBe("blocked");
    if (out.kind === "blocked") expect(out.reason).toBe("no-candidates");
  });

  it("selects the highest-suitability eligible candidate when evidence is sufficient", () => {
    const out = decideRouting({
      eligible,
      fallback,
      answers: ok,
      failure: null,
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out.kind).toBe("selected");
    if (out.kind === "selected") expect(candidateKey(out.candidate)).toBe(candidateKey(codex));
  });

  it("falls back on provider failure when the fallback is eligible", () => {
    const out = decideRouting({
      eligible,
      fallback,
      answers: null,
      failure: new RoutingProviderError("timeout", "slow"),
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out).toMatchObject({ kind: "fallback", reason: "provider-failure" });
  });

  it("classifies a malformed response as malformed-response, not a generic failure", () => {
    const out = decideRouting({
      eligible,
      fallback,
      answers: null,
      failure: new RoutingProviderError("malformed", "bad"),
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out).toMatchObject({ kind: "fallback", reason: "malformed-response" });
  });

  it("blocks instead of picking a forbidden fallback when the fallback is not eligible", () => {
    const forbiddenFallback: RoutingCandidate = { cli: "kiro", model: "default", reasoning: null };
    const out = decideRouting({
      eligible,
      fallback: forbiddenFallback,
      answers: null,
      failure: new RoutingProviderError("timeout", "x"),
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out.kind).toBe("blocked");
    if (out.kind === "blocked") expect(out.reason).toBe("no-eligible-fallback");
  });

  it("treats low-confidence suitability as insufficient evidence and falls back", () => {
    const weak = answersWith(
      suitabilityAnswer({ [candidateKey(codex)]: 0.4, [candidateKey(claude)]: 0.3 }, 0.9),
    );
    expect(hasSufficientEvidence(weak, eligible.map(candidateKey))).toBe(false);
    const out = decideRouting({
      eligible,
      fallback,
      answers: weak,
      failure: null,
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out).toMatchObject({ kind: "fallback", reason: "insufficient-evidence" });
  });

  it("treats a provider-reported low confidence as insufficient evidence even with a high top probability", () => {
    const lowConf = answersWith(
      suitabilityAnswer(
        { [candidateKey(codex)]: 0.95, [candidateKey(claude)]: 0.05 },
        MIN_ANSWER_CONFIDENCE - 0.1,
      ),
    );
    expect(hasSufficientEvidence(lowConf, eligible.map(candidateKey))).toBe(false);
  });

  it("missing suitability answer is insufficient evidence, never a guess", () => {
    const missing = {
      [ROUTING_QUESTION_IDS.ambiguity]: {
        id: "ambiguity",
        type: "noul" as const,
        probability: 0.1,
      },
    };
    expect(
      hasSufficientEvidence(missing as Record<string, RoutingAnswer>, eligible.map(candidateKey)),
    ).toBe(false);
  });

  it("a suitability answer for an unknown candidate is insufficient evidence and falls back", () => {
    const stray = answersWith(
      suitabilityAnswer({ "ghost\u0000model\u0000": 0.99, [candidateKey(claude)]: 0.01 }),
    );
    expect(hasSufficientEvidence(stray, eligible.map(candidateKey))).toBe(false);
    const out = decideRouting({
      eligible,
      fallback,
      answers: stray,
      failure: null,
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out).toMatchObject({ kind: "fallback", reason: "insufficient-evidence" });
  });

  it("treats missing cost/time as a neutral midpoint so suitability ties are not broken", () => {
    const tied = answersWith(
      suitabilityAnswer({ [candidateKey(codex)]: 0.5, [candidateKey(claude)]: 0.5 }),
    );
    const weights = { costWeight: 0.5, timeWeight: 0.5 };
    const codexMeasuredClaudeMissing = decideRouting({
      eligible,
      fallback,
      answers: tied,
      failure: null,
      costTime: { [candidateKey(codex)]: { cost: 0.1, time: 0.1 } },
      weights,
    });
    const codexMeasuredClaudeNeutral = decideRouting({
      eligible,
      fallback,
      answers: tied,
      failure: null,
      costTime: {
        [candidateKey(codex)]: { cost: 0.1, time: 0.1 },
        [candidateKey(claude)]: {
          cost: ROUTING_NEUTRAL_COST_TIME,
          time: ROUTING_NEUTRAL_COST_TIME,
        },
      },
      weights,
    });
    expect(codexMeasuredClaudeMissing.kind).toBe("selected");
    expect(codexMeasuredClaudeNeutral.kind).toBe("selected");
    if (
      codexMeasuredClaudeMissing.kind === "selected" &&
      codexMeasuredClaudeNeutral.kind === "selected"
    ) {
      expect(candidateKey(codexMeasuredClaudeMissing.candidate)).toBe(
        candidateKey(codexMeasuredClaudeNeutral.candidate),
      );
    }
  });

  it("high risk/ambiguity/scope tilts toward a more capable (higher-cost) candidate when suitability is tied", () => {
    const tied = answersWith(
      suitabilityAnswer({ [candidateKey(codex)]: 0.5, [candidateKey(claude)]: 0.5 }),
    );
    tied[ROUTING_QUESTION_IDS.risk] = { id: "risk", type: "noul", probability: 0.95 };
    tied[ROUTING_QUESTION_IDS.ambiguity] = { id: "ambiguity", type: "noul", probability: 0.9 };
    tied[ROUTING_QUESTION_IDS.scope] = { id: "scope", type: "noul", probability: 0.85 };
    const out = decideRouting({
      eligible,
      fallback,
      answers: tied,
      failure: null,
      costTime: {
        [candidateKey(claude)]: { cost: 0.2, time: 0.2 },
        [candidateKey(codex)]: { cost: 0.9, time: 0.8 },
      },
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    });
    expect(out.kind).toBe("selected");
    if (out.kind === "selected") expect(candidateKey(out.candidate)).toBe(candidateKey(codex));
  });

  it("is deterministic: the same input always yields the same outcome", () => {
    const input = {
      eligible,
      fallback,
      answers: ok,
      failure: null,
      costTime: {},
      weights: { costWeight: 0.5, timeWeight: 0.5 },
    };
    expect(decideRouting(input)).toEqual(decideRouting(input));
  });
});

describe("decideRoutingForRun (orchestration invariants)", () => {
  const baseInput = (over: Partial<DecideRoutingInput>): DecideRoutingInput => ({
    effective: resolveEffectiveRouting({ mode: "automatic", provider: "jev", roles: ["engineer"] }),
    role: "engineer",
    pinned: false,
    stateText: "task body",
    filter: {
      ...defaultFilter,
      candidates: [claude, codex],
      allowlist: BASE_ALLOW,
      harnesses: allHarnesses,
    },
    fallback: claude,
    costTime: {},
    provider: null,
    ...over,
  });

  it("off mode never calls the provider", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(
      baseInput({
        effective: resolveEffectiveRouting({ mode: "off" }),
        provider: { id: "jev", decide },
      }),
    );
    expect(out.kind).toBe("disabled");
    expect(decide).not.toHaveBeenCalled();
  });

  it("a role not in the enabled list is never routed", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(
      baseInput({ role: "reviewer", provider: { id: "jev", decide } }),
    );
    expect(out.kind).toBe("disabled");
    expect(decide).not.toHaveBeenCalled();
  });

  it("an explicit human pin wins and the provider is never called", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(
      baseInput({ pinned: true, provider: { id: "jev", decide } }),
    );
    expect(out.kind).toBe("pinned");
    expect(decide).not.toHaveBeenCalled();
  });

  it("shadow mode records a recommendation but never applies it", async () => {
    const decide = vi.fn(async () => ({
      model: "jev-latest",
      answers: answersWith(
        suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 }),
      ),
      usage: null,
    }));
    const out = await decideRoutingForRun(
      baseInput({
        effective: resolveEffectiveRouting({ mode: "shadow", roles: ["engineer"] }),
        provider: { id: "jev", decide },
      }),
    );
    expect(out.kind).toBe("decided");
    if (out.kind === "decided") {
      expect(out.applied).toBe(false);
      expect(out.outcome.kind).toBe("selected");
    }
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("automatic mode applies only a scored selection, not a fallback or block", async () => {
    const decide = vi.fn(async () => ({
      model: "jev-latest",
      answers: answersWith(
        suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 }),
      ),
      usage: null,
    }));
    const selected = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    expect(selected.kind === "decided" && selected.applied).toBe(true);
    if (selected.kind === "decided") expect(selected.outcome.kind).toBe("selected");

    const timeout = await decideRoutingForRun(
      baseInput({
        provider: {
          id: "jev",
          decide: vi.fn(async () => {
            throw new RoutingProviderError("timeout", "slow");
          }),
        },
      }),
    );
    expect(timeout.kind === "decided" && timeout.applied).toBe(false);
    if (timeout.kind === "decided") expect(timeout.outcome.kind).toBe("fallback");

    const blocked = await decideRoutingForRun(
      baseInput({
        filter: {
          ...defaultFilter,
          candidates: [kiro],
          allowlist: BASE_ALLOW,
          harnesses: allHarnesses,
        },
        fallback: null,
        provider: { id: "jev", decide },
      }),
    );
    expect(blocked.kind === "decided" && blocked.applied).toBe(false);
    if (blocked.kind === "decided") expect(blocked.outcome.kind).toBe("blocked");
  });

  it("preserves provider-reported token usage on the decision result", async () => {
    const decide = vi.fn(async () => ({
      model: "jev-latest",
      answers: answersWith(
        suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 }),
      ),
      usage: { inputTokens: 120, outputTokens: 40 },
    }));
    const out = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    expect(out.kind).toBe("decided");
    if (out.kind === "decided") {
      expect(out.providerUsage).toEqual({ inputTokens: 120, outputTokens: 40 });
    }
  });

  it("a provider that throws never escapes: it becomes a fallback outcome", async () => {
    const decide = vi.fn(async () => {
      throw new RoutingProviderError("timeout", "decision timed out");
    });
    const out = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    expect(out.kind === "decided" && out.outcome.kind === "fallback").toBe(true);
  });

  it("a non-typed error from the provider is still contained as a transport failure", async () => {
    const decide = vi.fn(async () => {
      throw new TypeError("boom");
    });
    const out = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    expect(out.kind === "decided" && out.outcome.kind === "fallback").toBe(true);
  });

  it("with no eligible candidates the provider is not called and the run is blocked", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(
      baseInput({
        filter: {
          ...defaultFilter,
          candidates: [kiro],
          allowlist: BASE_ALLOW,
          harnesses: allHarnesses,
        },
        fallback: null,
        provider: { id: "jev", decide },
      }),
    );
    expect(decide).not.toHaveBeenCalled();
    expect(out.kind === "decided" && out.outcome.kind === "blocked").toBe(true);
  });

  it("the fallback is never a forbidden pair even when the provider recommends one", async () => {
    const decide = vi.fn(async () => ({
      model: "x",
      answers: answersWith(
        suitabilityAnswer({ [candidateKey(kiro)]: 0.99, [candidateKey(claude)]: 0.01 }),
      ),
      usage: null,
    }));
    const out = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    if (out.kind === "decided" && out.outcome.kind !== "blocked") {
      expect(candidateKey(out.outcome.candidate)).not.toBe(candidateKey(kiro));
    }
  });

  it("the question set only ever offers eligible candidates to the provider", () => {
    const questions = buildRoutingQuestions([claude]);
    const suit = questions.find((q) => q.id === ROUTING_QUESTION_IDS.suitability);
    expect(suit && suit.type === "choice" ? Object.keys(suit.criteria) : []).toEqual([
      candidateKey(claude),
    ]);
  });
});

describe("System One wire codec", () => {
  const request = {
    brief: { state: "fix the bug" },
    questions: buildRoutingQuestions([claude, codex]),
    timeoutMs: 1000,
  };

  it("encodes the documented request body: model, state, and keyed questions", () => {
    const body = encodeSystemOneRequest("jev-latest", request);
    expect(body.model).toBe("jev-latest");
    expect(body.state).toBe("fix the bug");
    expect(Object.keys(body.questions as object)).toEqual(request.questions.map((q) => q.id));
  });

  it("decodes the documented Jev response shape (choice, score, noul) into typed answers", () => {
    const wire = {
      model: "jev-1.13.0",
      answers: {
        ambiguity: { type: "noul", noul: 0.99 },
        risk: { type: "noul", noul: 0.2 },
        scope: { type: "noul", noul: 0.67 },
        suitability: {
          type: "choice",
          choice: candidateKey(codex),
          confidence: 1.0,
          probabilities: {
            [candidateKey(codex)]: 1.0,
            [candidateKey(claude)]: 0.0,
          },
        },
      },
      usage: { input_tokens: 428, output_tokens: 73 },
    };
    const out = decodeSystemOneResponse(wire, request.questions);
    expect(out.model).toBe("jev-1.13.0");
    expect(out.answers.ambiguity).toEqual({ id: "ambiguity", type: "noul", probability: 0.99 });
    expect(out.answers.scope).toEqual({ id: "scope", type: "noul", probability: 0.67 });
    expect(out.answers.suitability).toMatchObject({
      type: "choice",
      choice: candidateKey(codex),
      confidence: 1.0,
    });
    expect(out.usage).toEqual({ inputTokens: 428, outputTokens: 73 });
  });

  it("fails closed on a missing answer rather than silently dropping a question", () => {
    const questions = buildRoutingQuestions([claude]);
    expect(() => decodeSystemOneResponse({ model: "m", answers: {} }, questions)).toThrow(
      RoutingProviderError,
    );
  });

  it("rejects a well-formed answer whose type does not match the question", () => {
    const wire = {
      model: "m",
      answers: {
        ambiguity: { type: "noul", noul: 0.1 },
        risk: { type: "noul", noul: 0.1 },
        scope: {
          type: "score",
          score: 1,
          confidence: 0.5,
          probabilities: { "0": 0.5, "1": 0.5 },
        },
        suitability: {
          type: "choice",
          choice: candidateKey(claude),
          confidence: 0.9,
          probabilities: { [candidateKey(claude)]: 1 },
        },
      },
    };
    expect(() => decodeSystemOneResponse(wire, request.questions)).toThrow(/scope.*noul/i);
  });

  it("fails closed on an unknown answer type", () => {
    const wire = { model: "m", answers: { q: { type: "essay", text: "hi" } } };
    const questions = [{ id: "q", type: "noul" as const, instructions: "?" }];
    expect(() => decodeSystemOneResponse(wire, questions)).toThrow(/must be type "noul"/);
  });

  it("rejects an out-of-range noul probability", () => {
    const wire = { model: "m", answers: { q: { type: "noul", noul: 7 } } };
    const questions = [{ id: "q", type: "noul" as const, instructions: "?" }];
    expect(() => decodeSystemOneResponse(wire, questions)).toThrow(/probability/);
  });

  it("rejects a non-object response body", () => {
    const questions = [{ id: "q", type: "noul" as const, instructions: "?" }];
    expect(() => decodeSystemOneResponse("<html>", questions)).toThrow(/not a JSON object/);
  });
});

describe("provider adapters", () => {
  const request = {
    brief: { state: "s" },
    questions: buildRoutingQuestions([claude]),
    timeoutMs: 1000,
  };
  const okBody = {
    model: "jev-latest",
    answers: {
      ambiguity: { type: "noul", noul: 0.1 },
      risk: { type: "noul", noul: 0.1 },
      scope: { type: "noul", noul: 0.1 },
      suitability: {
        type: "choice",
        choice: candidateKey(claude),
        confidence: 0.9,
        probabilities: { [candidateKey(claude)]: 1 },
      },
    },
  };

  function fetchReturning(status: number, body: unknown) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
  }

  it("Jev posts to the hosted endpoint with a bearer token and the default model", async () => {
    const f = fetchReturning(200, okBody);
    const provider = createJevProvider({
      apiKey: "k-123",
      fetchImpl: f as unknown as typeof fetch,
    });
    const out = await provider.decide(request);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k-123");
    expect(JSON.parse(init.body as string).model).toBe(JEV_DEFAULT_MODEL);
    expect(out.answers.suitability).toMatchObject({ type: "choice" });
  });

  it("OpenRouter posts to the System One proxy with the OpenRouter bearer token", async () => {
    const f = fetchReturning(200, okBody);
    const provider = createOpenRouterProvider({
      apiKey: "or-key",
      fetchImpl: f as unknown as typeof fetch,
    });
    await provider.decide(request);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(OPENROUTER_SYSTEMONE_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer or-key");
    expect(JSON.parse(init.body as string).model).toBe("~typesafe/jev-latest");
  });

  it("mapOpenRouterSystemOneModel maps bare Jev ids and leaves qualified ids alone", () => {
    expect(mapOpenRouterSystemOneModel("jev-latest")).toBe("~typesafe/jev-latest");
    expect(mapOpenRouterSystemOneModel("jev-1.14")).toBe("typesafe/jev-1.14");
    expect(mapOpenRouterSystemOneModel("typesafe/jev-1.14")).toBe("typesafe/jev-1.14");
    expect(mapOpenRouterSystemOneModel("~typesafe/jev-latest")).toBe("~typesafe/jev-latest");
    expect(mapOpenRouterSystemOneModel("Cloudflare/clef-flash")).toBe("Cloudflare/clef-flash");
  });

  it("Clef-Flash posts to the self-hosted /v1/systemone with no auth header when no key is set", async () => {
    const f = fetchReturning(200, okBody);
    const provider = createClefFlashProvider({
      baseUrl: "http://gpu:30000/",
      fetchImpl: f as unknown as typeof fetch,
    });
    await provider.decide(request);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://gpu:30000/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string).model).toBe(CLEF_FLASH_DEFAULT_MODEL);
  });

  it("both adapters present the identical System One body, so switching is a config change", async () => {
    const f1 = fetchReturning(200, okBody);
    const f2 = fetchReturning(200, okBody);
    await createJevProvider({
      apiKey: "k",
      model: "jev-latest",
      fetchImpl: f1 as unknown as typeof fetch,
    }).decide(request);
    await createClefFlashProvider({
      baseUrl: "http://x",
      model: "jev-latest",
      fetchImpl: f2 as unknown as typeof fetch,
    }).decide(request);
    const b1 = JSON.parse((f1.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const b2 = JSON.parse((f2.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(b1).toEqual(b2);
  });

  it("maps 401/403 to an auth failure, never a silent success", async () => {
    const provider = createJevProvider({
      apiKey: "bad",
      fetchImpl: fetchReturning(401, {}) as unknown as typeof fetch,
    });
    await expect(provider.decide(request)).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps a 500 to an http failure", async () => {
    const provider = createClefFlashProvider({
      baseUrl: "http://x",
      fetchImpl: fetchReturning(500, {}) as unknown as typeof fetch,
    });
    await expect(provider.decide(request)).rejects.toMatchObject({ kind: "http" });
  });

  it("maps an aborted request to a timeout", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      return await new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    });
    const provider = createJevProvider({ apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    await expect(provider.decide({ ...request, timeoutMs: 20 })).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("times out while the response body is still pending, not only before headers arrive", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => ({
      status: 200,
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
    }));
    const provider = createJevProvider({ apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    await expect(provider.decide({ ...request, timeoutMs: 30 })).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("maps a non-JSON 200 body to malformed, never a partial answer", async () => {
    const f = vi.fn(async () => new Response("<html>blocked</html>", { status: 200 }));
    const provider = createJevProvider({ apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    await expect(provider.decide(request)).rejects.toMatchObject({ kind: "malformed" });
  });

  it("refuses to construct a Jev provider without a key (not-configured)", () => {
    expect(() => createJevProvider({ apiKey: "" })).toThrow(RoutingProviderError);
  });

  it("refuses to construct a Clef-Flash provider without a base URL", () => {
    expect(() => createClefFlashProvider({ baseUrl: "" })).toThrow(RoutingProviderError);
  });

  it("refuses to construct an OpenRouter provider without a key", () => {
    expect(() => createOpenRouterProvider({ apiKey: "" })).toThrow(RoutingProviderError);
  });

  it("a provider failure routed through decideRoutingForRun still produces a safe outcome", async () => {
    const f = fetchReturning(503, {});
    const provider: RoutingDecisionProvider = createClefFlashProvider({
      baseUrl: "http://x",
      fetchImpl: f as unknown as typeof fetch,
    });
    const out = await decideRoutingForRun({
      effective: resolveEffectiveRouting({
        mode: "automatic",
        provider: "clef-flash",
        baseUrl: "http://x",
        roles: ["engineer"],
      }),
      role: "engineer",
      pinned: false,
      stateText: "s",
      filter: {
        ...defaultFilter,
        candidates: [claude],
        allowlist: [],
        harnesses: allHarnesses,
      },
      fallback: claude,
      costTime: {},
      provider,
    });
    expect(out.kind === "decided" && out.outcome).toMatchObject({
      kind: "fallback",
      reason: "provider-failure",
    });
  });
});

describe("live routing probe", () => {
  const probeCandidateKey = "probe\u0000connection\u0000";
  const cfg = {
    modelRouting: { mode: "automatic", provider: "jev", roles: ["engineer"] },
  } as unknown as RepoOSConfig;

  function systemOneBody() {
    return {
      model: "jev-latest",
      answers: {
        ambiguity: { type: "noul", noul: 0.1 },
        risk: { type: "noul", noul: 0.2 },
        scope: { type: "noul", noul: 0.3 },
        suitability: {
          type: "choice",
          choice: probeCandidateKey,
          confidence: 0.9,
          probabilities: { [probeCandidateKey]: 1 },
        },
      },
      usage: { input_tokens: 428, output_tokens: 73 },
    };
  }

  afterEach(() => {
    delete process.env.TYPESAFE_API_KEY;
  });

  it("returns the question, answer, model, time and usage on success", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(systemOneBody()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const out = await probeModelRouting(cfg, {
      live: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.live?.ok).toBe(true);
    expect(out.live?.message).toBe("Live decision call succeeded.");
    expect(out.live?.model).toBe("jev-latest");
    expect(out.live?.durationMs).toBeGreaterThanOrEqual(0);
    expect(out.live?.usage).toEqual({ inputTokens: 428, outputTokens: 73 });
    expect(out.live?.prompt).toBe("RepoOS routing connection test.");
    const suit = out.live?.answers?.find((a) => a.id === "suitability");
    expect(suit?.question).toMatch(/best suited/i);
    expect(suit?.chosen).toBe("probe / connection");
    expect(suit?.options?.[0]).toMatchObject({ label: "probe / connection", probability: 1 });
  });

  it("sends the probe candidate under a readable label, not a raw key", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(systemOneBody()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    await probeModelRouting(cfg, { live: true, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      questions: { suitability: { criteria: Record<string, string> } };
    };
    expect(Object.values(body.questions.suitability.criteria)).toEqual(["probe / connection"]);
  });

  it("returns a plain reason and what to check on an auth failure", async () => {
    process.env.TYPESAFE_API_KEY = "bad";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 401 }));
    const out = await probeModelRouting(cfg, {
      live: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.live?.ok).toBe(false);
    expect(out.live?.message).toMatch(/credentials/i);
    expect(out.live?.hint).toMatch(/API key/i);
  });

  it("reports an unconfigured provider with a plain reason, without a call", async () => {
    delete process.env.TYPESAFE_API_KEY;
    const fetchImpl = vi.fn();
    const out = await probeModelRouting(cfg, {
      live: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.live?.ok).toBe(false);
    expect(out.live?.durationMs).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a provider-reported dollar cost when the provider gives one", async () => {
    process.env.TYPESAFE_API_KEY = "test-key";
    const body = systemOneBody();
    (body.usage as Record<string, unknown>).cost = 0.0004;
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const out = await probeModelRouting(cfg, {
      live: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.live?.usage?.costUsd).toBeCloseTo(0.0004);
  });
});
