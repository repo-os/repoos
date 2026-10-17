/**
 * Shared System One wire codec (#0791).
 *
 * Jev (hosted, `POST https://api.typesafe.ai/v1/systemone`) and Clef-Flash
 * (self-hosted, served by SGLang at `/v1/systemone`) accept the same request
 * body and return the same response body: `model`, `answers` keyed by question
 * id, and `usage`. Verified against the TypeSafe API docs and the Clef-Flash
 * model card. This module is the one place that encodes and decodes that
 * shape, so both adapters are fixture-tested against a single contract.
 *
 * Parsing is strict and fails closed: an answer with an unknown type, a missing
 * required field, or a non-numeric probability is a `malformed` error, never a
 * partially-trusted answer.
 */
import {
  RoutingProviderError,
  type RoutingAnswer,
  type RoutingDecisionRequest,
  type RoutingDecisionResponse,
  type RoutingQuestion,
} from "./types.js";

/** Build the request body for `POST /v1/systemone`. */
export function encodeSystemOneRequest(
  model: string,
  request: RoutingDecisionRequest,
): Record<string, unknown> {
  const questions: Record<string, Record<string, unknown>> = {};
  for (const q of request.questions) questions[q.id] = encodeQuestion(q);
  return { model, state: request.brief.state, questions };
}

function encodeQuestion(q: RoutingQuestion): Record<string, unknown> {
  if (q.type === "noul") return { type: "noul", instructions: q.instructions };
  if (q.type === "choice") {
    return { type: "choice", instructions: q.instructions, criteria: q.criteria };
  }
  return { type: "score", instructions: q.instructions, criteria: q.criteria };
}

/** Decode and validate a System One response body. Throws `malformed` on any drift. */
export function decodeSystemOneResponse(
  body: unknown,
  questions: RoutingQuestion[],
): RoutingDecisionResponse {
  if (!isRecord(body)) throw malformed("response is not a JSON object");
  const model = typeof body.model === "string" ? body.model : "";
  if (!isRecord(body.answers)) throw malformed("response has no answers object");
  const answers: Record<string, RoutingAnswer> = {};
  for (const question of questions) {
    const raw = body.answers[question.id];
    if (raw === undefined) throw malformed(`answer missing for question "${question.id}"`);
    answers[question.id] = decodeAnswer(question, raw);
  }
  return { model, answers, usage: decodeUsage(body.usage) };
}

function decodeAnswer(question: RoutingQuestion, raw: unknown): RoutingAnswer {
  const id = question.id;
  if (!isRecord(raw)) throw malformed(`answer "${id}" is not an object`);
  if (question.type === "noul") {
    if (raw.type !== "noul") {
      throw malformed(`answer "${id}" must be type "noul", got "${String(raw.type)}"`);
    }
    const p = raw.noul;
    if (!isProbability(p)) throw malformed(`noul "${id}" has no probability in [0,1]`);
    return { id, type: "noul", probability: p };
  }
  if (question.type === "choice") {
    if (raw.type !== "choice") {
      throw malformed(`answer "${id}" must be type "choice", got "${String(raw.type)}"`);
    }
    if (typeof raw.choice !== "string" || !raw.choice) {
      throw malformed(`choice "${id}" has no choice`);
    }
    if (!(raw.choice in question.criteria)) {
      throw malformed(`choice "${id}" is not one of the offered criteria`);
    }
    const probabilities = decodeProbabilities(id, raw.probabilities);
    for (const key of Object.keys(probabilities)) {
      if (!(key in question.criteria)) {
        throw malformed(`probability key "${key}" for "${id}" is not a valid criterion`);
      }
    }
    return {
      id,
      type: "choice",
      choice: raw.choice,
      confidence: optionalProbability(raw.confidence),
      probabilities,
    };
  }
  if (question.type === "score") {
    if (raw.type !== "score") {
      throw malformed(`answer "${id}" must be type "score", got "${String(raw.type)}"`);
    }
    if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) {
      throw malformed(`score "${id}" has no finite score`);
    }
    const maxIndex = question.criteria.length - 1;
    if (!Number.isInteger(raw.score) || raw.score < 0 || raw.score > maxIndex) {
      throw malformed(`score "${id}" is not a valid index for this question`);
    }
    const probabilities = decodeProbabilities(id, raw.probabilities);
    for (const key of Object.keys(probabilities)) {
      const idx = Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx > maxIndex) {
        throw malformed(`probability key "${key}" for "${id}" is not a valid score index`);
      }
    }
    return {
      id,
      type: "score",
      score: raw.score,
      confidence: optionalProbability(raw.confidence),
      probabilities,
    };
  }
  throw malformed(`answer "${id}" has unknown question type`);
}

function decodeProbabilities(id: string, raw: unknown): Record<string, number> {
  if (!isRecord(raw)) throw malformed(`probabilities for "${id}" are not an object`);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isProbability(value)) throw malformed(`probability "${key}" for "${id}" is not in [0,1]`);
    out[key] = value;
  }
  return out;
}

function decodeUsage(raw: unknown): RoutingDecisionResponse["usage"] {
  if (!isRecord(raw)) return null;
  const cost = raw.cost ?? raw.total_cost ?? raw.cost_usd;
  return {
    inputTokens: typeof raw.input_tokens === "number" ? raw.input_tokens : null,
    outputTokens: typeof raw.output_tokens === "number" ? raw.output_tokens : null,
    ...(typeof cost === "number" && Number.isFinite(cost) ? { costUsd: cost } : {}),
  };
}

function optionalProbability(value: unknown): number | null {
  return isProbability(value) ? value : null;
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malformed(message: string): RoutingProviderError {
  return new RoutingProviderError("malformed", message);
}
