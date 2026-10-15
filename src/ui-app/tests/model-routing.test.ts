/**
 * #0791 — adaptive agent/model routing foundation.
 *
 * Covers the safety contract (off = no call, pins win, shadow never applies,
 * the budget allowlist is a hard ceiling, fallback never selects a forbidden
 * pair), the strict System One wire codec against the documented response
 * shape, both provider adapters via injected fetch, and `[model_routing]`
 * parsing. No test touches the network.
 */
import { describe, expect, it, vi } from "vitest";
import { parseModelRouting, resolveEffectiveRouting, routingActiveFor, DEFAULT_ROUTING_TIMEOUT_MS } from "../../core/model-routing/config.js";
import { candidateKey, filterCandidates, type RoutingCandidate } from "../../core/model-routing/candidates.js";
import { decideRouting, ROUTING_QUESTION_IDS, hasSufficientEvidence, MIN_ANSWER_CONFIDENCE } from "../../core/model-routing/policy.js";
import { decideRoutingForRun, buildRoutingQuestions, type DecideRoutingInput } from "../../core/model-routing/decide.js";
import { decodeSystemOneResponse, encodeSystemOneRequest } from "../../core/model-routing/system-one.js";
import { createJevProvider, createClefFlashProvider, JEV_ENDPOINT, JEV_DEFAULT_MODEL, CLEF_FLASH_DEFAULT_MODEL } from "../../core/model-routing/providers.js";
import { RoutingProviderError, type RoutingAnswer, type RoutingDecisionProvider } from "../../core/model-routing/types.js";
import { getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";

const claude: RoutingCandidate = { cli: "claude code", model: "default", reasoning: null };
const codex: RoutingCandidate = { cli: "codex", model: "gpt-5", reasoning: null };
const kiro: RoutingCandidate = { cli: "kiro", model: "default", reasoning: null };
const allHarnesses = {
  "claude code": { available: true, supportedReasoning: [] },
  codex: { available: true, supportedReasoning: ["low", "high"] },
  kiro: { available: true, supportedReasoning: [] },
};

/** A suitability answer where each candidate's probability is set explicitly. */
function suitabilityAnswer(probs: Record<string, number>, confidence: number | null = 0.9): RoutingAnswer {
  return { id: ROUTING_QUESTION_IDS.suitability, type: "choice", choice: Object.keys(probs)[0], confidence, probabilities: probs };
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
    const { config, warnings } = parseModelRouting({ mode: "shadow", provider: "clef-flash", baseUrl: "http://gpu:30000", roles: ["reviewer"], timeoutMs: 4000 });
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
    const { config, warnings } = parseModelRouting({ mode: "yolo", provider: "openai", roles: ["engineer", "wizard"], timeoutMs: 999999 });
    expect(config.mode).toBeUndefined();
    expect(config.provider).toBeUndefined();
    expect(config.roles).toEqual(["engineer"]);
    expect(config.timeoutMs).toBeUndefined();
    expect(warnings.length).toBeGreaterThanOrEqual(4);
    expect(resolveEffectiveRouting(config).mode).toBe("off");
  });

  it("rejects a credential that looks like a raw key rather than an env var name", () => {
    const { config, warnings } = parseModelRouting({ credentialEnv: "sk-live-abc123!" });
    expect(config.credentialEnv).toBeUndefined();
    expect(warnings.some((w) => w.includes("credentialEnv"))).toBe(true);
  });

  it("exposes every routing key in the schema and the TOML allowlist", () => {
    const keys = getConfigSchema().map((f) => f.key);
    for (const key of ["model_routing.mode", "model_routing.provider", "model_routing.model", "model_routing.baseUrl", "model_routing.credentialEnv", "model_routing.roles", "model_routing.timeoutMs"]) {
      expect(keys).toContain(key);
      expect(SUPPORTED_TOML_KEYS).toContain(key);
    }
  });

  it("defaults the routing timeout to the documented constant", () => {
    expect(resolveEffectiveRouting(undefined).timeoutMs).toBe(DEFAULT_ROUTING_TIMEOUT_MS);
  });
});

describe("candidate filtering", () => {
  it("an empty allowlist is the unrestricted no-op", () => {
    const { eligible, rejected } = filterCandidates({ candidates: [claude, codex], allowlist: [], harnesses: allHarnesses });
    expect(eligible.map((c) => c.cli).sort()).toEqual(["claude code", "codex"]);
    expect(rejected).toEqual([]);
  });

  it("a non-empty allowlist is a hard ceiling: unlisted CLIs and models are refused", () => {
    const { eligible, rejected } = filterCandidates({
      candidates: [claude, codex, kiro, { cli: "codex", model: "gpt-9", reasoning: null }],
      allowlist: BASE_ALLOW,
      harnesses: allHarnesses,
    });
    expect(eligible.map(candidateKey).sort()).toEqual([candidateKey(claude), candidateKey(codex)].sort());
    expect(rejected.find((r) => r.candidate.cli === "kiro")?.reason).toContain("allowlist");
    expect(rejected.find((r) => r.candidate.model === "gpt-9")?.reason).toContain("allowlist");
  });

  it("refuses a candidate whose harness is not installed or authenticated", () => {
    const { eligible, rejected } = filterCandidates({
      candidates: [claude],
      allowlist: [],
      harnesses: { "claude code": { available: false, supportedReasoning: [] } },
    });
    expect(eligible).toEqual([]);
    expect(rejected[0].reason).toContain("not installed");
  });

  it("refuses an unsupported reasoning setting rather than pairing it blindly", () => {
    const { eligible, rejected } = filterCandidates({
      candidates: [{ cli: "codex", model: "gpt-5", reasoning: "extreme" }],
      allowlist: [],
      harnesses: allHarnesses,
    });
    expect(eligible).toEqual([]);
    expect(rejected[0].reason).toContain("reasoning");
  });

  it("de-duplicates and returns a stable order", () => {
    const { eligible } = filterCandidates({ candidates: [codex, claude, codex, claude], allowlist: [], harnesses: allHarnesses });
    expect(eligible).toHaveLength(2);
    const again = filterCandidates({ candidates: [claude, codex], allowlist: [], harnesses: allHarnesses });
    expect(eligible.map(candidateKey)).toEqual(again.eligible.map(candidateKey));
  });
});

describe("policy", () => {
  const eligible = [claude, codex];
  const fallback = claude;
  const ok = answersWith(suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 }));

  it("with no candidates, blocks with an actionable message and never picks", () => {
    const out = decideRouting({ eligible: [], fallback, answers: ok, failure: null, costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out.kind).toBe("blocked");
    if (out.kind === "blocked") expect(out.reason).toBe("no-candidates");
  });

  it("selects the highest-suitability eligible candidate when evidence is sufficient", () => {
    const out = decideRouting({ eligible, fallback, answers: ok, failure: null, costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out.kind).toBe("selected");
    if (out.kind === "selected") expect(candidateKey(out.candidate)).toBe(candidateKey(codex));
  });

  it("falls back on provider failure when the fallback is eligible", () => {
    const out = decideRouting({ eligible, fallback, answers: null, failure: new RoutingProviderError("timeout", "slow"), costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out).toMatchObject({ kind: "fallback", reason: "provider-failure" });
  });

  it("classifies a malformed response as malformed-response, not a generic failure", () => {
    const out = decideRouting({ eligible, fallback, answers: null, failure: new RoutingProviderError("malformed", "bad"), costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out).toMatchObject({ kind: "fallback", reason: "malformed-response" });
  });

  it("blocks instead of picking a forbidden fallback when the fallback is not eligible", () => {
    const forbiddenFallback: RoutingCandidate = { cli: "kiro", model: "default", reasoning: null };
    const out = decideRouting({ eligible, fallback: forbiddenFallback, answers: null, failure: new RoutingProviderError("timeout", "x"), costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out.kind).toBe("blocked");
    if (out.kind === "blocked") expect(out.reason).toBe("no-eligible-fallback");
  });

  it("treats low-confidence suitability as insufficient evidence and falls back", () => {
    const weak = answersWith(suitabilityAnswer({ [candidateKey(codex)]: 0.4, [candidateKey(claude)]: 0.3 }, 0.9));
    expect(hasSufficientEvidence(weak)).toBe(false);
    const out = decideRouting({ eligible, fallback, answers: weak, failure: null, costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out).toMatchObject({ kind: "fallback", reason: "insufficient-evidence" });
  });

  it("treats a provider-reported low confidence as insufficient evidence even with a high top probability", () => {
    const lowConf = answersWith(suitabilityAnswer({ [candidateKey(codex)]: 0.95, [candidateKey(claude)]: 0.05 }, MIN_ANSWER_CONFIDENCE - 0.1));
    expect(hasSufficientEvidence(lowConf)).toBe(false);
  });

  it("missing suitability answer is insufficient evidence, never a guess", () => {
    const missing = { [ROUTING_QUESTION_IDS.ambiguity]: { id: "ambiguity", type: "noul" as const, probability: 0.1 } };
    expect(hasSufficientEvidence(missing as Record<string, RoutingAnswer>)).toBe(false);
  });

  it("a suitability answer for an unknown candidate never selects that candidate", () => {
    const stray = answersWith(suitabilityAnswer({ "ghost\u0000model\u0000": 0.99, [candidateKey(claude)]: 0.01 }));
    const out = decideRouting({ eligible, fallback, answers: stray, failure: null, costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } });
    expect(out.kind).toBe("selected");
    if (out.kind === "selected") expect(eligible.map(candidateKey)).toContain(candidateKey(out.candidate));
  });

  it("is deterministic: the same input always yields the same outcome", () => {
    const input = { eligible, fallback, answers: ok, failure: null, costTime: {}, weights: { costWeight: 0.5, timeWeight: 0.5 } };
    expect(decideRouting(input)).toEqual(decideRouting(input));
  });
});

describe("decideRoutingForRun (orchestration invariants)", () => {
  const baseInput = (over: Partial<DecideRoutingInput>): DecideRoutingInput => ({
    effective: resolveEffectiveRouting({ mode: "automatic", provider: "jev", roles: ["engineer"] }),
    role: "engineer",
    pinned: false,
    stateText: "task body",
    filter: { candidates: [claude, codex], allowlist: BASE_ALLOW, harnesses: allHarnesses },
    fallback: claude,
    costTime: {},
    provider: null,
    ...over,
  });

  it("off mode never calls the provider", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(baseInput({ effective: resolveEffectiveRouting({ mode: "off" }), provider: { id: "jev", decide } }));
    expect(out.kind).toBe("disabled");
    expect(decide).not.toHaveBeenCalled();
  });

  it("a role not in the enabled list is never routed", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(baseInput({ role: "reviewer", provider: { id: "jev", decide } }));
    expect(out.kind).toBe("disabled");
    expect(decide).not.toHaveBeenCalled();
  });

  it("an explicit human pin wins and the provider is never called", async () => {
    const decide = vi.fn();
    const out = await decideRoutingForRun(baseInput({ pinned: true, provider: { id: "jev", decide } }));
    expect(out.kind).toBe("pinned");
    expect(decide).not.toHaveBeenCalled();
  });

  it("shadow mode records a recommendation but never applies it", async () => {
    const decide = vi.fn(async () => ({ model: "jev-latest", answers: answersWith(suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 })), usage: null }));
    const out = await decideRoutingForRun(baseInput({ effective: resolveEffectiveRouting({ mode: "shadow", roles: ["engineer"] }), provider: { id: "jev", decide } }));
    expect(out.kind).toBe("decided");
    if (out.kind === "decided") {
      expect(out.applied).toBe(false);
      expect(out.outcome.kind).toBe("selected");
    }
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("automatic mode applies the decision", async () => {
    const decide = vi.fn(async () => ({ model: "jev-latest", answers: answersWith(suitabilityAnswer({ [candidateKey(codex)]: 0.9, [candidateKey(claude)]: 0.1 })), usage: null }));
    const out = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    expect(out.kind === "decided" && out.applied).toBe(true);
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
    const out = await decideRoutingForRun(baseInput({ filter: { candidates: [kiro], allowlist: BASE_ALLOW, harnesses: allHarnesses }, fallback: null, provider: { id: "jev", decide } }));
    expect(decide).not.toHaveBeenCalled();
    expect(out.kind === "decided" && out.outcome.kind === "blocked").toBe(true);
  });

  it("the fallback is never a forbidden pair even when the provider recommends one", async () => {
    const decide = vi.fn(async () => ({ model: "x", answers: answersWith(suitabilityAnswer({ [candidateKey(kiro)]: 0.99, [candidateKey(claude)]: 0.01 })), usage: null }));
    const out = await decideRoutingForRun(baseInput({ provider: { id: "jev", decide } }));
    if (out.kind === "decided" && out.outcome.kind !== "blocked") {
      expect(candidateKey(out.outcome.candidate)).not.toBe(candidateKey(kiro));
    }
  });

  it("the question set only ever offers eligible candidates to the provider", () => {
    const questions = buildRoutingQuestions([claude]);
    const suit = questions.find((q) => q.id === ROUTING_QUESTION_IDS.suitability);
    expect(suit && suit.type === "choice" ? Object.keys(suit.criteria) : []).toEqual([candidateKey(claude)]);
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
        scope: { type: "score", score: 0.67, confidence: 0.5, legend: {}, probabilities: { "0": 0.33, "1": 0.67 } },
        suitability: { type: "choice", choice: "codex", confidence: 1.0, probabilities: { codex: 1.0, "claude code": 0.0 } },
      },
      usage: { input_tokens: 428, output_tokens: 73 },
    };
    const ids = ["ambiguity", "risk", "scope", "suitability"];
    const out = decodeSystemOneResponse(wire, ids);
    expect(out.model).toBe("jev-1.13.0");
    expect(out.answers.ambiguity).toEqual({ id: "ambiguity", type: "noul", probability: 0.99 });
    expect(out.answers.suitability).toMatchObject({ type: "choice", choice: "codex", confidence: 1.0 });
    expect(out.usage).toEqual({ inputTokens: 428, outputTokens: 73 });
  });

  it("fails closed on a missing answer rather than silently dropping a question", () => {
    expect(() => decodeSystemOneResponse({ model: "m", answers: {} }, ["ambiguity"])).toThrow(RoutingProviderError);
  });

  it("fails closed on an unknown answer type", () => {
    const wire = { model: "m", answers: { q: { type: "essay", text: "hi" } } };
    expect(() => decodeSystemOneResponse(wire, ["q"])).toThrow(/unknown type/);
  });

  it("rejects an out-of-range noul probability", () => {
    const wire = { model: "m", answers: { q: { type: "noul", noul: 7 } } };
    expect(() => decodeSystemOneResponse(wire, ["q"])).toThrow(/probability/);
  });

  it("rejects a non-object response body", () => {
    expect(() => decodeSystemOneResponse("<html>", ["q"])).toThrow(/not a JSON object/);
  });
});

describe("provider adapters", () => {
  const request = { brief: { state: "s" }, questions: buildRoutingQuestions([claude]), timeoutMs: 1000 };
  const okBody = {
    model: "jev-latest",
    answers: {
      ambiguity: { type: "noul", noul: 0.1 },
      risk: { type: "noul", noul: 0.1 },
      scope: { type: "noul", noul: 0.1 },
      suitability: { type: "choice", choice: candidateKey(claude), confidence: 0.9, probabilities: { [candidateKey(claude)]: 1 } },
    },
  };

  function fetchReturning(status: number, body: unknown) {
    return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }

  it("Jev posts to the hosted endpoint with a bearer token and the default model", async () => {
    const f = fetchReturning(200, okBody);
    const provider = createJevProvider({ apiKey: "k-123", fetchImpl: f as unknown as typeof fetch });
    const out = await provider.decide(request);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer k-123");
    expect(JSON.parse(init.body as string).model).toBe(JEV_DEFAULT_MODEL);
    expect(out.answers.suitability).toMatchObject({ type: "choice" });
  });

  it("Clef-Flash posts to the self-hosted /v1/systemone with no auth header when no key is set", async () => {
    const f = fetchReturning(200, okBody);
    const provider = createClefFlashProvider({ baseUrl: "http://gpu:30000/", fetchImpl: f as unknown as typeof fetch });
    await provider.decide(request);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://gpu:30000/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string).model).toBe(CLEF_FLASH_DEFAULT_MODEL);
  });

  it("both adapters present the identical System One body, so switching is a config change", async () => {
    const f1 = fetchReturning(200, okBody);
    const f2 = fetchReturning(200, okBody);
    await createJevProvider({ apiKey: "k", model: "jev-latest", fetchImpl: f1 as unknown as typeof fetch }).decide(request);
    await createClefFlashProvider({ baseUrl: "http://x", model: "jev-latest", fetchImpl: f2 as unknown as typeof fetch }).decide(request);
    const b1 = JSON.parse((f1.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const b2 = JSON.parse((f2.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(b1).toEqual(b2);
  });

  it("maps 401/403 to an auth failure, never a silent success", async () => {
    const provider = createJevProvider({ apiKey: "bad", fetchImpl: fetchReturning(401, {}) as unknown as typeof fetch });
    await expect(provider.decide(request)).rejects.toMatchObject({ kind: "auth" });
  });

  it("maps a 500 to an http failure", async () => {
    const provider = createClefFlashProvider({ baseUrl: "http://x", fetchImpl: fetchReturning(500, {}) as unknown as typeof fetch });
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
    await expect(provider.decide({ ...request, timeoutMs: 20 })).rejects.toMatchObject({ kind: "timeout" });
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

  it("a provider failure routed through decideRoutingForRun still produces a safe outcome", async () => {
    const f = fetchReturning(503, {});
    const provider: RoutingDecisionProvider = createClefFlashProvider({ baseUrl: "http://x", fetchImpl: f as unknown as typeof fetch });
    const out = await decideRoutingForRun({
      effective: resolveEffectiveRouting({ mode: "automatic", provider: "clef-flash", baseUrl: "http://x", roles: ["engineer"] }),
      role: "engineer",
      pinned: false,
      stateText: "s",
      filter: { candidates: [claude], allowlist: [], harnesses: allHarnesses },
      fallback: claude,
      costTime: {},
      provider,
    });
    expect(out.kind === "decided" && out.outcome).toMatchObject({ kind: "fallback", reason: "provider-failure" });
  });
});
