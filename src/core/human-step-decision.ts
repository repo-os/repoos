/**
 * Optional decision-model check before a task starts (#0804).
 *
 * The start path already has a keyword heuristic (`assessTaskNeedsHumanStep`)
 * that flags acceptance criteria mentioning a device, account, key, or
 * registration. It cannot tell a real human-only step from a word that merely
 * appears in the criteria (see #0803, stopped for the word "keys"), so the user
 * can ask the decision model instead.
 *
 * The provider contract is the same one adaptive routing uses (#0791/#0792):
 * a decision provider answers a small set of typed questions and the
 * deterministic code here — never the model — decides and explains. The model
 * is asked exactly one boolean question plus one bounded "why" choice, and the
 * explanation is assembled from those structured answers. There is no free-text
 * action the model can smuggle back into the app.
 */
import {
  RoutingProviderError,
  type RoutingAnswer,
  type RoutingDecisionProvider,
  type RoutingQuestion,
} from "./model-routing/types.js";

/** The fixed question ids the decision check sends. */
export const HUMAN_STEP_QUESTION_ID = "needs-human-step";
export const HUMAN_STEP_REASON_QUESTION_ID = "needs-human-step-reason";

/** Probability at or above which the model's answer counts as "needs a human". */
export const HUMAN_STEP_DECISION_THRESHOLD = 0.5;

/** Default hard timeout for the decision call, in milliseconds. */
export const HUMAN_STEP_DECISION_TIMEOUT_MS = 5000;

/** Upper bound on the brief handed to the provider. */
export const MAX_HUMAN_STEP_BRIEF_CHARS = 6000;

/** The bounded set of reasons the model may choose from. */
export type HumanStepReason = "none" | "device" | "account" | "registration" | "external";

export const HUMAN_STEP_REASON_LABELS: Record<HumanStepReason, string> = {
  none: "no human-only step — an AI agent can do all of it",
  device: "a real device or physical hardware",
  account: "a real account, credential, or API key",
  registration: "a third-party sign-up or external registration",
  external: "another external system or a human action",
};

const HUMAN_STEP_REASON_KEYS = Object.keys(HUMAN_STEP_REASON_LABELS) as HumanStepReason[];

/** The fixed question set, sent to whichever routing provider is configured. */
export function buildHumanStepQuestions(): RoutingQuestion[] {
  return [
    {
      id: HUMAN_STEP_QUESTION_ID,
      type: "noul",
      instructions:
        "Does this task contain steps only a human can perform — using a real device or physical " +
        "hardware, a real account or credential, or a third-party sign-up — such that it should be " +
        "split into a separate AI task and a human task?",
    },
    {
      id: HUMAN_STEP_REASON_QUESTION_ID,
      type: "choice",
      instructions: "What is the main reason a human is needed?",
      criteria: Object.fromEntries(
        HUMAN_STEP_REASON_KEYS.map((key) => [key, HUMAN_STEP_REASON_LABELS[key]]),
      ),
    },
  ];
}

export interface HumanStepDecision {
  /** True when the model judged the task needs a separate human-only step. */
  needsHumanStep: boolean;
  /** The model's probability that a human step is needed, in [0, 1]. */
  probability: number;
  /** The bounded reason the model chose. */
  reason: HumanStepReason;
  /** A short, deterministic explanation assembled from the answer. */
  explanation: string;
}

/** Build the bounded explanation shown as the flag's detail. Never model text. */
export function humanStepExplanation(
  needsHumanStep: boolean,
  reason: HumanStepReason,
  probability: number,
): string {
  const pct = Math.round(probability * 100);
  if (!needsHumanStep) {
    return `Decision model (${pct}%): no step only a human can do — an AI agent can do this task.`;
  }
  const why = reason === "none" ? "a step only a human can do" : HUMAN_STEP_REASON_LABELS[reason];
  return `Decision model (${pct}%): split this into an AI task and a human task — it needs ${why}.`;
}

/**
 * Turn the provider's structured answers into a bounded decision. Pure: the
 * same answers always produce the same verdict and explanation.
 *
 * Throws a typed `malformed` error when the boolean answer is missing or the
 * wrong shape, so the caller falls back to the keyword check rather than
 * trusting a partial answer.
 */
export function interpretHumanStepAnswers(
  answers: Record<string, RoutingAnswer>,
): HumanStepDecision {
  const probAnswer = answers[HUMAN_STEP_QUESTION_ID];
  if (!probAnswer || probAnswer.type !== "noul" || !Number.isFinite(probAnswer.probability)) {
    throw new RoutingProviderError(
      "malformed",
      `decision response is missing the "${HUMAN_STEP_QUESTION_ID}" answer`,
    );
  }
  const probability = Math.min(1, Math.max(0, probAnswer.probability));
  const needsHumanStep = probability >= HUMAN_STEP_DECISION_THRESHOLD;

  const reasonAnswer = answers[HUMAN_STEP_REASON_QUESTION_ID];
  const reason: HumanStepReason =
    reasonAnswer?.type === "choice" &&
    HUMAN_STEP_REASON_KEYS.includes(reasonAnswer.choice as HumanStepReason)
      ? (reasonAnswer.choice as HumanStepReason)
      : "none";

  return {
    needsHumanStep,
    probability,
    reason,
    explanation: humanStepExplanation(needsHumanStep, reason, probability),
  };
}

export interface HumanStepBrief {
  title?: string;
  body: string;
  /**
   * The criterion line the keyword scan matched (#0909). Quoted to the model so
   * it judges the sentence that actually tripped the tripwire, not the whole
   * task in the abstract.
   */
  matchedSentence?: string;
}

/** Build the bounded state brief. Task text is data, never instructions. */
export function buildHumanStepBrief(brief: HumanStepBrief): string {
  const parts: string[] = [];
  if (brief.title?.trim()) parts.push(`Task: ${brief.title.trim()}`);
  if (brief.body.trim()) parts.push(brief.body.trim());
  if (brief.matchedSentence?.trim()) {
    parts.push(`Keyword scan matched this acceptance criterion: "${brief.matchedSentence.trim()}"`);
  }
  const text = parts.join("\n\n");
  return text.length > MAX_HUMAN_STEP_BRIEF_CHARS
    ? `${text.slice(0, MAX_HUMAN_STEP_BRIEF_CHARS)}\n… (brief truncated)`
    : text;
}

/**
 * Flag detail that names the exact criterion and the model's bounded one-line
 * reason (#0909). Never model free text — `explanation` is assembled from the
 * structured answer.
 */
export function humanStepFlagDetail(sentence: string | undefined, explanation: string): string {
  if (!sentence?.trim()) return explanation;
  return `Criterion "${sentence.trim()}" — ${explanation}`;
}

export type HumanStepDecisionResult =
  | {
      status: "decided";
      decision: HumanStepDecision;
      model: string;
      usage: { inputTokens: number | null; outputTokens: number | null } | null;
    }
  | { status: "unavailable" }
  | { status: "failed"; error: string };

/**
 * Run one human-step decision. Never throws: an absent provider is
 * `unavailable`, and any provider failure (timeout, auth, malformed) is
 * `failed`, so the caller can fall back to the keyword check deterministically.
 */
export async function decideHumanStep(input: {
  provider: RoutingDecisionProvider | null;
  brief: HumanStepBrief;
  timeoutMs?: number;
}): Promise<HumanStepDecisionResult> {
  if (!input.provider) return { status: "unavailable" };
  const timeoutMs = input.timeoutMs ?? HUMAN_STEP_DECISION_TIMEOUT_MS;
  try {
    const response = await input.provider.decide({
      brief: { state: buildHumanStepBrief(input.brief) },
      questions: buildHumanStepQuestions(),
      timeoutMs,
    });
    return {
      status: "decided",
      decision: interpretHumanStepAnswers(response.answers),
      model: response.model,
      usage: response.usage,
    };
  } catch (err) {
    const error =
      err instanceof RoutingProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "decision check failed";
    return { status: "failed", error };
  }
}
