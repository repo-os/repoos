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
import type { RoutingDecisionProvider } from "./types.js";
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

/** Read the configured provider key (never log it). */
export function readRoutingCredential(
  config: RepoOSConfig | undefined,
  effective: EffectiveRouting,
): string {
  const row = routingProviderRow(effective.provider);
  if (!row) return "";
  return readProviderKey(config ?? { root: process.cwd() }, row).trim();
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

function credentialLabelFor(
  effective: EffectiveRouting,
  present: boolean,
): RoutingCredentialLabel {
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
  const keyProviderId = routingProviderRow(effective.provider)?.id ?? null;
  const credentialPresent =
    effective.provider === "clef-flash"
      ? readRoutingCredential(config, effective).length > 0
      : effective.provider === "openrouter" || effective.provider === "jev"
        ? readRoutingCredential(config, effective).length > 0
        : false;
  const credentialLabel = credentialLabelFor(effective, credentialPresent);
  const issues: string[] = [];

  if (effective.mode !== "off") {
    if (!effective.provider) {
      issues.push("Choose a decision provider.");
    } else if (effective.provider === "clef-flash") {
      if (!effective.baseUrl) {
        issues.push("Set your self-hosted Clef-Flash server URL above (for example http://localhost:30000).");
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

  const provider = buildRoutingProvider(effective, opts.fetchImpl, config);
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
export function effectiveFromConfigLike(config: ModelRoutingConfig | undefined): EffectiveRouting {
  return resolveEffectiveRouting(config);
}
