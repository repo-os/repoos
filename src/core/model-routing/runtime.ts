/**
 * Server-side wiring for adaptive model routing (#0792): resolve config into a
 * provider instance and run config/credential probes without echoing secrets.
 */
import type { ModelRoutingConfig, RepoOSConfig } from "../types.js";
import { modelProviderById } from "../providers/spend.js";
import { resolveEffectiveRouting, type EffectiveRouting } from "./config.js";
import {
  createClefFlashProvider,
  createJevProvider,
  createOpenRouterProvider,
} from "./providers.js";
import { buildRoutingQuestions } from "./decide.js";
import type { RoutingCandidate } from "./candidates.js";
import type {
  RoutingAnswer,
  RoutingDecisionProvider,
  RoutingFailureKind,
  RoutingQuestion,
  RoutingUsage,
} from "./types.js";
import { RoutingProviderError } from "./types.js";
import { readProviderKey } from "../providers/provider-keys.js";

/** Plain-language credential status for the Model routing UI. */
export type RoutingCredentialLabel = "saved" | "not_set" | "not_needed";

function routingProviderRow(provider: EffectiveRouting["provider"]) {
  if (!provider) return null;
  if (provider === "jev") return modelProviderById("jev");
  if (provider === "openrouter") return modelProviderById("openrouter");
  if (provider === "clef-flash") return modelProviderById("clef-flash");
  return null;
}

/**
 * Read the configured provider key (never log it).
 *
 * Routing reads through the SAME path the Model providers tab uses (#0809):
 * `readProviderKey` checks `process.env` first (a save updates it in place),
 * then the config snapshot, then the harness auth stores. That is what keeps
 * the routing status and the Model providers tab agreeing on whether a key is
 * present — a key saved there is a key routing sees, and vice versa. When no
 * config is supplied (e.g. a bare probe) the fixed env var is read directly,
 * which is the same first step.
 */
export function readRoutingCredential(
  config: RepoOSConfig | undefined,
  effective: EffectiveRouting,
): string {
  const row = routingProviderRow(effective.provider);
  if (!row) return "";
  if (!config) {
    return row.envVar ? (process.env[row.envVar] ?? "").trim() : "";
  }
  return readProviderKey(config, row).trim();
}

/**
 * Construct a decision provider from effective settings, or null when routing
 * cannot run (missing key, base URL, etc.). Never throws.
 */
export function buildRoutingProvider(
  effective: EffectiveRouting,
  fetchImpl?: typeof fetch,
  config?: RepoOSConfig,
): RoutingDecisionProvider | null {
  if (effective.mode === "off" || !effective.provider) return null;
  const apiKey = readRoutingCredential(config, effective);
  try {
    switch (effective.provider) {
      case "jev":
        if (!apiKey) return null;
        return createJevProvider({
          apiKey,
          model: effective.model ?? undefined,
          fetchImpl,
        });
      case "openrouter":
        if (!apiKey) return null;
        return createOpenRouterProvider({
          apiKey,
          model: effective.model ?? undefined,
          fetchImpl,
        });
      case "clef-flash":
        if (!effective.baseUrl) return null;
        return createClefFlashProvider({
          baseUrl: effective.baseUrl,
          apiKey: apiKey || undefined,
          model: effective.model ?? undefined,
          fetchImpl,
        });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export interface ModelRoutingStatus {
  effective: EffectiveRouting;
  /** Model-providers row id used to save keys for this provider, when applicable. */
  keyProviderId: "jev" | "openrouter" | "clef-flash" | null;
  credentialPresent: boolean;
  credentialLabel: RoutingCredentialLabel;
  /** True when a provider instance could be constructed right now. */
  providerReady: boolean;
  /** Human-readable blockers when mode is not off but routing cannot run. */
  issues: string[];
}

function credentialLabelFor(effective: EffectiveRouting, present: boolean): RoutingCredentialLabel {
  if (effective.provider === "clef-flash") {
    return present ? "saved" : "not_needed";
  }
  if (effective.provider === "openrouter" || effective.provider === "jev") {
    return present ? "saved" : "not_set";
  }
  return "not_needed";
}

export function modelRoutingStatus(config: RepoOSConfig | undefined): ModelRoutingStatus {
  const effective = resolveEffectiveRouting(config?.modelRouting);
  const row = routingProviderRow(effective.provider);
  const keyProviderId =
    row?.id === "jev" || row?.id === "openrouter" || row?.id === "clef-flash" ? row.id : null;
  // One read drives both the credential label and provider readiness, so the
  // two can never disagree (the #0809 inconsistency).
  const credentialPresent =
    effective.provider === "jev" ||
    effective.provider === "openrouter" ||
    effective.provider === "clef-flash"
      ? readRoutingCredential(config, effective).length > 0
      : false;
  const credentialLabel = credentialLabelFor(effective, credentialPresent);
  const issues: string[] = [];

  if (effective.mode !== "off") {
    if (!effective.provider) {
      issues.push("Choose a decision provider.");
    } else if (effective.provider === "clef-flash") {
      if (!effective.baseUrl) {
        issues.push(
          "Set your self-hosted Clef-Flash server URL above (for example http://localhost:30000).",
        );
      }
    } else if (effective.provider === "openrouter") {
      if (!credentialPresent) {
        issues.push(
          "Save your OpenRouter API key on the Model providers tab — routing reuses that key (System One is only the request format).",
        );
      }
    } else if (effective.provider === "jev" && !credentialPresent) {
      issues.push("Save your TypeSafe Jev API key below (stored in .env only).");
    }
  }

  const providerReady = buildRoutingProvider(effective, undefined, config) !== null;

  return {
    effective,
    keyProviderId,
    credentialPresent,
    credentialLabel,
    providerReady,
    issues,
  };
}

export interface ModelRoutingProbeResult extends ModelRoutingStatus {
  ok: boolean;
  live?: ModelRoutingLiveResult;
}

/** One option the probe's provider could choose, with its probability. */
export interface RoutingLiveOption {
  /** Stable option key (a candidate key for a choice question). */
  key: string;
  /** Human-readable label, e.g. "claude code / default". */
  label: string;
  /** Probability in [0,1]. */
  probability: number;
}

/** One question/answer pair from the live probe, labeled for display. */
export interface RoutingLiveAnswer {
  id: string;
  type: "noul" | "choice" | "score";
  /** The question that was asked. */
  question: string;
  /** For a choice/score answer: the label of the chosen option. */
  chosen?: string;
  /** The provider's own confidence, when reported. */
  confidence?: number | null;
  /** For a noul answer: the probability. */
  probability?: number;
  /** For choice/score answers: options ordered by probability, highest first. */
  options?: RoutingLiveOption[];
}

/** The result of the optional live decision call, rendered by the UI. */
export interface ModelRoutingLiveResult {
  ok: boolean;
  /** Success summary, or the plain-language failure reason. */
  message: string;
  /** What to check next, on failure. */
  hint?: string;
  /** The model id the provider reported back. */
  model?: string;
  /** Wall-clock duration of the provider call, in milliseconds. */
  durationMs: number;
  /** Provider-reported usage, when it reported any. */
  usage?: RoutingUsage | null;
  /** The context brief sent (the test question, in plain terms). */
  prompt?: string;
  /** The provider's answers, labeled for display. */
  answers?: RoutingLiveAnswer[];
}

const PROBE_CANDIDATE: RoutingCandidate = {
  cli: "probe",
  model: "connection",
  reasoning: null,
};

/** Order options by probability, highest first, with a display label. */
function orderedOptions(
  probabilities: Record<string, number>,
  label: (key: string) => string,
): RoutingLiveOption[] {
  return Object.entries(probabilities)
    .map(([key, probability]) => ({ key, label: label(key), probability }))
    .sort((a, b) => b.probability - a.probability);
}

/** Label the probe's normalized answers from the questions that produced them. */
export function liveAnswers(
  questions: RoutingQuestion[],
  answers: Record<string, RoutingAnswer>,
): RoutingLiveAnswer[] {
  return questions.map((q) => {
    const a = answers[q.id];
    if (a.type === "choice") {
      const criteria = q.type === "choice" ? q.criteria : {};
      return {
        id: q.id,
        type: "choice" as const,
        question: q.instructions,
        chosen: criteria[a.choice] ?? a.choice,
        confidence: a.confidence,
        options: orderedOptions(a.probabilities, (k) => criteria[k] ?? k),
      };
    }
    if (a.type === "score") {
      const criteria = q.type === "score" ? q.criteria : [];
      return {
        id: q.id,
        type: "score" as const,
        question: q.instructions,
        confidence: a.confidence,
        options: orderedOptions(a.probabilities, (k) => criteria[Number(k)] ?? k),
      };
    }
    return {
      id: q.id,
      type: "noul" as const,
      question: q.instructions,
      probability: a.probability,
    };
  });
}

/** Plain-language "what to check" for a failed live call. */
function liveFailureHint(kind: RoutingFailureKind | null): string {
  switch (kind) {
    case "auth":
      return "Check the API key is saved and still valid for the selected provider.";
    case "timeout":
      return "The provider did not answer in time. Raise the decision timeout or try again.";
    case "not-configured":
      return "Finish the routing settings above: choose a provider and save its API key.";
    case "malformed":
    case "unsupported":
      return "The provider returned an answer the router could not read. Confirm it speaks the System One format.";
    case "http":
      return "The provider returned an error. Check the provider's status and your account.";
    case "transport":
      return "The provider could not be reached. Check your network connection and try again.";
    default:
      return "Check the provider settings above and try again.";
  }
}

const PROBE_PROMPT = "RepoOS routing connection test.";

/**
 * Validate routing configuration and credential presence. When `live` is true,
 * also issues one minimal System One decision call (for the UI "Test live"
 * button — automated tests must keep `live` false).
 */
export async function probeModelRouting(
  config: RepoOSConfig | undefined,
  opts?: { live?: boolean; fetchImpl?: typeof fetch },
): Promise<ModelRoutingProbeResult> {
  const status = modelRoutingStatus(config);
  const { effective } = status;

  if (effective.mode === "off") {
    return { ...status, ok: true };
  }

  const ok = status.issues.length === 0 && status.providerReady;
  const out: ModelRoutingProbeResult = { ...status, ok };

  if (!opts?.live) return out;

  const provider = buildRoutingProvider(effective, opts.fetchImpl, config);
  if (!provider) {
    out.live = {
      ok: false,
      message: status.issues[0] ?? "Routing provider is not ready.",
      hint: liveFailureHint("not-configured"),
      durationMs: 0,
    };
    out.ok = false;
    return out;
  }

  const questions = buildRoutingQuestions([PROBE_CANDIDATE]);
  const startedAt = Date.now();
  try {
    const response = await provider.decide({
      brief: { state: PROBE_PROMPT },
      questions,
      timeoutMs: Math.min(effective.timeoutMs, 5000),
    });
    out.live = {
      ok: true,
      message: "Live decision call succeeded.",
      model: response.model || undefined,
      durationMs: Date.now() - startedAt,
      usage: response.usage,
      prompt: PROBE_PROMPT,
      answers: liveAnswers(questions, response.answers),
    };
  } catch (err) {
    const kind = err instanceof RoutingProviderError ? err.kind : null;
    const message =
      err instanceof RoutingProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Live decision call failed.";
    out.live = {
      ok: false,
      message,
      hint: liveFailureHint(kind),
      durationMs: Date.now() - startedAt,
      prompt: PROBE_PROMPT,
    };
    out.ok = false;
  }

  return out;
}

/** Resolve effective routing from a flat browser config payload or nested modelRouting. */
export function effectiveFromConfigLike(config: ModelRoutingConfig | undefined): EffectiveRouting {
  return resolveEffectiveRouting(config);
}
