/**
 * Server-side wiring for adaptive model routing (#0792): resolve config into a
 * provider instance and run config/credential probes without echoing secrets.
 */
import type { ModelRoutingConfig, RepoOSConfig } from "../types.js";
import {
  resolveEffectiveRouting,
  type EffectiveRouting,
} from "./config.js";
import {
  createClefFlashProvider,
  createJevProvider,
  createOpenRouterProvider,
} from "./providers.js";
import { buildRoutingQuestions } from "./decide.js";
import type { RoutingCandidate } from "./candidates.js";
import type { RoutingDecisionProvider } from "./types.js";
import { RoutingProviderError } from "./types.js";

/** Read the named credential from the process environment (never log it). */
export function readRoutingCredential(envName: string | null | undefined): string {
  if (!envName) return "";
  return (process.env[envName] ?? "").trim();
}

/**
 * Construct a decision provider from effective settings, or null when routing
 * cannot run (missing key, base URL, etc.). Never throws.
 */
export function buildRoutingProvider(
  effective: EffectiveRouting,
  fetchImpl?: typeof fetch,
): RoutingDecisionProvider | null {
  if (effective.mode === "off" || !effective.provider) return null;
  const apiKey = readRoutingCredential(effective.credentialEnv);
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
  credentialEnv: string | null;
  credentialPresent: boolean;
  /** True when a provider instance could be constructed right now. */
  providerReady: boolean;
  /** Human-readable blockers when mode is not off but routing cannot run. */
  issues: string[];
}

export function modelRoutingStatus(config: RepoOSConfig | undefined): ModelRoutingStatus {
  const effective = resolveEffectiveRouting(config?.modelRouting);
  const credentialEnv = effective.credentialEnv;
  const credentialPresent = credentialEnv ? readRoutingCredential(credentialEnv).length > 0 : false;
  const issues: string[] = [];

  if (effective.mode !== "off") {
    if (!effective.provider) {
      issues.push("Choose a routing provider.");
    } else if (effective.provider === "clef-flash") {
      if (!effective.baseUrl) issues.push("Clef-Flash needs a self-hosted server base URL.");
    } else if (!credentialPresent) {
      issues.push(
        `Set ${credentialEnv ?? "the API key variable"} in your gitignored .env file (or export it in the shell).`,
      );
    }
  }

  const providerReady = buildRoutingProvider(effective) !== null;

  return {
    effective,
    credentialEnv,
    credentialPresent,
    providerReady,
    issues,
  };
}

export interface ModelRoutingProbeResult extends ModelRoutingStatus {
  ok: boolean;
  live?: { ok: boolean; message: string };
}

const PROBE_CANDIDATE: RoutingCandidate = {
  cli: "probe",
  model: "probe",
  reasoning: null,
};

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

  const provider = buildRoutingProvider(effective, opts.fetchImpl);
  if (!provider) {
    out.live = { ok: false, message: status.issues[0] ?? "Routing provider is not ready." };
    out.ok = false;
    return out;
  }

  try {
    await provider.decide({
      brief: { state: "RepoOS routing connection test." },
      questions: buildRoutingQuestions([PROBE_CANDIDATE]),
      timeoutMs: Math.min(effective.timeoutMs, 5000),
    });
    out.live = { ok: true, message: "Live decision call succeeded." };
  } catch (err) {
    const message =
      err instanceof RoutingProviderError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Live decision call failed.";
    out.live = { ok: false, message };
    out.ok = false;
  }

  return out;
}

/** Resolve effective routing from a flat browser config payload or nested modelRouting. */
export function effectiveFromConfigLike(
  config: ModelRoutingConfig | undefined,
): EffectiveRouting {
  return resolveEffectiveRouting(config);
}
