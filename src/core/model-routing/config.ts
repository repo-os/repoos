/**
 * `[model_routing]` config parsing and validation (#0791).
 *
 * Pure and node-free so the server, the CLI and the Settings UI share one
 * contract. Parsing is fail-soft like `[[budget.allowlist]]`: an invalid value
 * is dropped with a reason rather than blocking server boot, and the safe
 * default (`mode = "off"`) applies. An unset section is exactly off.
 *
 * Secrets are never read from or written to TOML. Keys use fixed env var names
 * from the model-providers registry and live in the gitignored `.env` store.
 */
import type { ModelRoutingConfig } from "../types.js";

export const ROUTING_MODES = ["off", "shadow", "automatic"] as const;
export const ROUTING_PROVIDERS = ["jev", "clef-flash", "openrouter"] as const;
export const ROUTING_ROLES = ["pm", "engineer", "reviewer"] as const;

/**
 * Providers the Model routing UI offers, in display order (#0809).
 *
 * Clef-Flash is deliberately absent: its adapter and fixture tests ship, but
 * there is no live user path, so it must never be selectable. `ROUTING_PROVIDERS`
 * keeps the value — and its credential env — so an existing `[model_routing]`
 * table still parses. OpenRouter carries a plain label on purpose: it exposes
 * many decision models, so the option must not enumerate any.
 */
export const ROUTING_PROVIDER_CHOICES = [
  { value: "jev", label: "TypeSafe Jev (direct)" },
  { value: "openrouter", label: "OpenRouter" },
] as const;

export const DEFAULT_ROUTING_TIMEOUT_MS = 8000;
export const MIN_ROUTING_TIMEOUT_MS = 500;
export const MAX_ROUTING_TIMEOUT_MS = 60000;

/** Default credential env var per provider, following the existing REPOOS_*_API_KEY convention. */
export const DEFAULT_CREDENTIAL_ENV: Record<RoutingProviderToml, string> = {
  jev: "TYPESAFE_API_KEY",
  "clef-flash": "REPOOS_CLEF_FLASH_API_KEY",
  openrouter: "REPOOS_OPENROUTER_API_KEY",
};

type RoutingProviderToml = (typeof ROUTING_PROVIDERS)[number];

export interface ModelRoutingParseResult {
  config: ModelRoutingConfig;
  /** Human-readable reasons for any dropped/defaulted values. */
  warnings: string[];
}

/** The resolved, effective routing settings used at decision time. */
export interface EffectiveRouting {
  mode: "off" | "shadow" | "automatic";
  provider: RoutingProviderToml | null;
  model: string | null;
  baseUrl: string | null;
  credentialEnv: string | null;
  roles: Array<"pm" | "engineer" | "reviewer">;
  timeoutMs: number;
}

/**
 * Parse a raw `[model_routing]` object (from `parseFlatToml` keys prefixed with
 * `model_routing.`, or a nested object). Unknown keys are ignored; invalid
 * values produce a warning and are omitted.
 */
export function parseModelRouting(raw: unknown): ModelRoutingParseResult {
  const warnings: string[] = [];
  const config: ModelRoutingConfig = {};
  if (raw === undefined || raw === null) return { config, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      config,
      warnings: ["[model_routing] must be a table — ignoring it, routing stays off"],
    };
  }
  const r = raw as Record<string, unknown>;

  if (r.mode !== undefined) {
    if (isOneOf(r.mode, ROUTING_MODES)) config.mode = r.mode;
    else
      warnings.push(`[model_routing] mode must be one of ${ROUTING_MODES.join(", ")} — using off`);
  }
  if (r.provider !== undefined) {
    if (isOneOf(r.provider, ROUTING_PROVIDERS)) config.provider = r.provider;
    else
      warnings.push(
        `[model_routing] provider must be one of ${ROUTING_PROVIDERS.join(", ")} — ignoring`,
      );
  }
  if (typeof r.model === "string" && r.model.trim()) config.model = r.model.trim();
  if (typeof r.baseUrl === "string" && r.baseUrl.trim()) config.baseUrl = r.baseUrl.trim();
  if (r.credentialEnv !== undefined) {
    warnings.push(
      "[model_routing] credentialEnv in repoos.toml is ignored — remove it and save API keys through Model providers or Model routing (.env only)",
    );
  }
  if (Array.isArray(r.roles)) {
    const roles = r.roles.filter((x): x is "pm" | "engineer" | "reviewer" =>
      isOneOf(x, ROUTING_ROLES),
    );
    if (roles.length !== r.roles.length) {
      warnings.push("[model_routing] roles contains an unknown role — dropped it");
    }
    config.roles = [...new Set(roles)];
  }
  if (r.humanStepCheck !== undefined) {
    if (typeof r.humanStepCheck === "boolean") config.humanStepCheck = r.humanStepCheck;
    else
      warnings.push(
        "[model_routing] humanStepCheck must be true or false — using off (the keyword check)",
      );
  }
  if (r.humanStepSticky !== undefined) {
    if (typeof r.humanStepSticky === "boolean") config.humanStepSticky = r.humanStepSticky;
    else
      warnings.push(
        "[model_routing] humanStepSticky must be true or false — using on (remember cleared flags)",
      );
  }
  if (r.timeoutMs !== undefined) {
    const n = Number(r.timeoutMs);
    if (Number.isFinite(n) && n >= MIN_ROUTING_TIMEOUT_MS && n <= MAX_ROUTING_TIMEOUT_MS) {
      config.timeoutMs = Math.round(n);
    } else {
      warnings.push(
        `[model_routing] timeoutMs must be between ${MIN_ROUTING_TIMEOUT_MS} and ${MAX_ROUTING_TIMEOUT_MS} — using ${DEFAULT_ROUTING_TIMEOUT_MS}`,
      );
    }
  }
  return { config, warnings };
}

/**
 * Resolve the effective settings. `off` (the default) short-circuits everything
 * else so an unset or disabled section can never change existing behavior.
 */
export function resolveEffectiveRouting(config: ModelRoutingConfig | undefined): EffectiveRouting {
  const mode = config?.mode ?? "off";
  const provider = config?.provider ?? null;
  return {
    mode,
    provider,
    model:
      config?.model ??
      (provider === "jev"
        ? "jev-latest"
        : provider === "clef-flash"
          ? "Cloudflare/clef-flash"
          : provider === "openrouter"
            ? "jev-latest"
            : null),
    baseUrl: config?.baseUrl ?? null,
    credentialEnv: provider ? DEFAULT_CREDENTIAL_ENV[provider] : null,
    roles: config?.roles ?? ["engineer", "reviewer", "pm"],
    timeoutMs: config?.timeoutMs ?? DEFAULT_ROUTING_TIMEOUT_MS,
  };
}

/** True when the router may be invoked at all for `role`. */
export function routingActiveFor(
  effective: EffectiveRouting,
  role: "pm" | "engineer" | "reviewer",
): boolean {
  return effective.mode !== "off" && effective.roles.includes(role);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
