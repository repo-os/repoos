/**
 * #0804 — the optional decision-model human-step check.
 *
 * All provider answers are fakes; no test touches the network. The point of
 * these tests is the bounded contract: a fixed question set, a deterministic
 * verdict, and a deterministic explanation assembled from structured answers
 * (never free model text).
 */
import { describe, expect, it } from "vitest";
import {
  HUMAN_STEP_QUESTION_ID,
  HUMAN_STEP_REASON_QUESTION_ID,
  buildHumanStepQuestions,
  decideHumanStep,
  interpretHumanStepAnswers,
  humanStepExplanation,
  type HumanStepReason,
} from "../../core/human-step-decision.js";
import {
  RoutingProviderError,
  type RoutingAnswer,
  type RoutingDecisionProvider,
} from "../../core/model-routing/types.js";

function answers(probability: number, reason: HumanStepReason): Record<string, RoutingAnswer> {
  return {
    [HUMAN_STEP_QUESTION_ID]: {
      id: HUMAN_STEP_QUESTION_ID,
      type: "noul",
      probability,
    },
    [HUMAN_STEP_REASON_QUESTION_ID]: {
      id: HUMAN_STEP_REASON_QUESTION_ID,
      type: "choice",
      choice: reason,
      confidence: 0.9,
      probabilities: { [reason]: 0.9 },
    },
  };
}

function fakeProvider(
  answer: Record<string, RoutingAnswer> | (() => never),
): RoutingDecisionProvider {
  return {
    id: "jev",
    decide: async () => {
      if (typeof answer === "function") answer();
      return {
        model: "fake-decision-model",
        answers: answer as Record<string, RoutingAnswer>,
        usage: { inputTokens: 12, outputTokens: 3 },
      };
    },
  };
}

describe("human-step decision questions (#0804)", () => {
  it("asks one boolean question plus a bounded reason choice", () => {
    const questions = buildHumanStepQuestions();
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      id: HUMAN_STEP_QUESTION_ID,
      type: "noul",
    });
    const reason = questions[1];
    expect(reason).toMatchObject({ id: HUMAN_STEP_REASON_QUESTION_ID, type: "choice" });
    expect(Object.keys((reason as { criteria: Record<string, string> }).criteria).sort()).toEqual([
      "account",
      "device",
      "external",
      "none",
      "registration",
    ]);
  });
});

describe("interpretHumanStepAnswers (#0804)", () => {
  it("reads a high probability as needing a human-only step and explains the reason", () => {
    const decision = interpretHumanStepAnswers(answers(0.92, "device"));
    expect(decision.needsHumanStep).toBe(true);
    expect(decision.reason).toBe("device");
    expect(decision.explanation).toContain("real device");
    expect(decision.explanation).toContain("split");
  });

  it("reads a low probability as agent-doable — an agent-doable task mentioning 'keys' is not flagged", () => {
    // The #0803 false positive: the acceptance criteria say "keys", but the
    // model judged the task agent-doable.
    const decision = interpretHumanStepAnswers(answers(0.08, "none"));
    expect(decision.needsHumanStep).toBe(false);
    expect(decision.explanation).toContain("an AI agent can do this task");
  });

  it("treats exactly the threshold as needing a human", () => {
    expect(interpretHumanStepAnswers(answers(0.5, "account")).needsHumanStep).toBe(true);
    expect(interpretHumanStepAnswers(answers(0.499, "account")).needsHumanStep).toBe(false);
  });

  it("is total on a malformed reason answer", () => {
    const decision = interpretHumanStepAnswers({
      [HUMAN_STEP_QUESTION_ID]: { id: HUMAN_STEP_QUESTION_ID, type: "noul", probability: 0.9 },
    });
    expect(decision.needsHumanStep).toBe(true);
    expect(decision.reason).toBe("none");
    expect(decision.explanation).toContain("a step only a human can do");
  });

  it("fails closed when the boolean answer is missing", () => {
    expect(() =>
      interpretHumanStepAnswers({
        [HUMAN_STEP_REASON_QUESTION_ID]: {
          id: HUMAN_STEP_REASON_QUESTION_ID,
          type: "choice",
          choice: "device",
          confidence: null,
          probabilities: {},
        },
      }),
    ).toThrow(RoutingProviderError);
  });
});

describe("humanStepExplanation (#0804)", () => {
  it("is deterministic and names the chosen reason for a human verdict", () => {
    expect(humanStepExplanation(true, "registration", 0.8)).toBe(
      "Decision model (80%): split this into an AI task and a human task — it needs a third-party sign-up or external registration.",
    );
  });
});

describe("decideHumanStep (#0804)", () => {
  it("returns a decided verdict from the provider", async () => {
    const result = await decideHumanStep({
      provider: fakeProvider(answers(0.95, "account")),
      brief: { title: "Key rotation", body: "- [ ] use production credentials" },
    });
    expect(result.status).toBe("decided");
    if (result.status !== "decided") return;
    expect(result.decision.needsHumanStep).toBe(true);
    expect(result.decision.reason).toBe("account");
    expect(result.model).toBe("fake-decision-model");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
  });

  it("is unavailable without a provider — the caller falls back to the keyword check", async () => {
    const result = await decideHumanStep({ provider: null, brief: { body: "" } });
    expect(result.status).toBe("unavailable");
  });

  it("reports a provider failure instead of throwing", async () => {
    const provider = fakeProvider(() => {
      throw new RoutingProviderError("timeout", "decision timed out");
    });
    const result = await decideHumanStep({ provider, brief: { body: "anything" } });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.error).toContain("timed out");
  });
});
