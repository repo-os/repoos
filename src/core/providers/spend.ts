/**
 * Live spend/usage data for the Agents page's "Model providers" tab (0327).
 *
 * Scoped to the four v1 providers: OpenRouter and opencode Go expose real
 * spend APIs and render live (each needs an API key the user pastes once —
 * stored via `setDotEnvSecret`, never logged, never echoed back); opencode
 * Zen and DeepInfra have no public balance/usage API and render as dashboard
 * link-outs. All upstream calls are plain `fetch` with a hard timeout — zero
 * runtime dependencies, same rule as the playground adapters next door.
 *
 * The parsers (`parseOpenRouterCredits`, `parseOpenRouterKey`,
 * `parseOpenCodeGoUsage`) are separated from the fetchers so tests can pin
 * the response shapes without stubbing global fetch, and so an upstream
 * response shape change fails as a typed null instead of a crash.
 */
import { parseJsonResponse } from "./types.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const FETCH_TIMEOUT_MS = 8000;

export type ModelProviderId = "openrouter" | "opencode-go" | "opencode-zen" | "deepinfra";

/**
 * One row of the Model providers tab. `kind: "live"` rows have a real spend
 * API behind a user-pasted key (`envVar` names the `.env` variable and
 * `configKey` the loadConfig section field the key is read back through);
 * `kind: "link"` rows are dashboard link-outs with no key collection at all.
 */
export interface ModelProviderRow {
  id: ModelProviderId;
  label: string;
  kind: "live" | "link";
  dashboardUrl: string;
  /** One line under the label explaining what the row shows and why. */
  note: string;
  envVar: string | null;
  configKey: "openrouterApiKey" | "opencodeGoApiKey" | null;
}

export const MODEL_PROVIDERS: ModelProviderRow[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "live",
    dashboardUrl: "https://openrouter.ai/credits",
    note: "Credit balance, daily/weekly/monthly spend and rate limits, live from the OpenRouter API.",
    envVar: "REPOOS_OPENROUTER_API_KEY",
    configKey: "openrouterApiKey",
  },
  {
    id: "opencode-go",
    label: "opencode Go",
    kind: "live",
    dashboardUrl: "https://opencode.ai/auth",
    note: "Rolling usage windows (5-hour / weekly / monthly), live from the Go usage API. No dollar balance exists.",
    envVar: "REPOOS_OPENCODE_GO_API_KEY",
    configKey: "opencodeGoApiKey",
  },
  {
    id: "opencode-zen",
    label: "opencode Zen",
    kind: "link",
    dashboardUrl: "https://opencode.ai/auth",
    note: "No public balance API yet — balance and usage live in the Zen console.",
    envVar: null,
    configKey: null,
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    kind: "link",
    dashboardUrl: "https://deepinfra.com/dash/billing",
    note: "No public billing/usage API — credit balance lives in the DeepInfra dashboard.",
    envVar: null,
    configKey: null,
  },
];

export function modelProviderById(id: string): ModelProviderRow | undefined {
  return MODEL_PROVIDERS.find((p) => p.id === id);
}

/** Upstream error text, extracted from the common `{ error: { message } }` shapes. */
function upstreamError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err.trim();
    if (typeof err === "object" && err !== null) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
  }
  return fallback;
}

/** A number field that is actually a finite number (null/undefined/"12" all fail). */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// ---------------------------------------------------------------------------
// OpenRouter
// ---------------------------------------------------------------------------

export interface OpenRouterCredits {
  totalCredits: number | null;
  totalUsage: number | null;
  remaining: number | null;
}

export interface OpenRouterKeyInfo {
  label: string | null;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  /** null = this key has no spend limit set. */
  limit: number | null;
  limitRemaining: number | null;
  rateLimit: { requests: number | null; interval: string | null } | null;
}

interface OpenRouterCreditsBody {
  data?: { total_credits?: unknown; total_usage?: unknown };
}

interface OpenRouterKeyBody {
  data?: {
    label?: unknown;
    usage_daily?: unknown;
    usage_weekly?: unknown;
    usage_monthly?: unknown;
    limit?: unknown;
    limit_remaining?: unknown;
    rate_limit?: { requests?: unknown; interval?: unknown } | null;
  };
}

export function parseOpenRouterCredits(body: unknown): OpenRouterCredits {
  const data = (body as OpenRouterCreditsBody | null)?.data ?? {};
  const totalCredits = num(data.total_credits);
  const totalUsage = num(data.total_usage);
  return {
    totalCredits,
    totalUsage,
    remaining: totalCredits != null && totalUsage != null ? totalCredits - totalUsage : null,
  };
}

export function parseOpenRouterKey(body: unknown): OpenRouterKeyInfo {
  const data = (body as OpenRouterKeyBody | null)?.data ?? {};
  const rateLimit = data.rate_limit;
  return {
    label: typeof data.label === "string" && data.label ? data.label : null,
    usageDaily: num(data.usage_daily),
    usageWeekly: num(data.usage_weekly),
    usageMonthly: num(data.usage_monthly),
    limit: num(data.limit),
    limitRemaining: num(data.limit_remaining),
    rateLimit:
      rateLimit && typeof rateLimit === "object"
        ? {
            requests: num(rateLimit.requests),
            interval: typeof rateLimit.interval === "string" ? rateLimit.interval : null,
          }
        : null,
  };
}

async function getOpenRouterJson(
  path: string,
  apiKey: string,
): Promise<{ body: unknown; status: number }> {
  const res = await fetch(`${OPENROUTER_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = await parseJsonResponse<unknown>(res, "OpenRouter");
  return { body, status: res.status };
}

export interface OpenRouterSpend {
  credits: OpenRouterCredits | null;
  creditsError: string | null;
  key: OpenRouterKeyInfo | null;
  keyError: string | null;
}

/**
 * Fetch both OpenRouter endpoints in parallel. Per-endpoint failures are
 * isolated: a key that can read `/key` but is refused by `/credits` (the
 * credits endpoint requires an OpenRouter management key) still renders its
 * key-side data with a clear note about the failed half, instead of losing
 * everything to one upstream restriction.
 */
export async function fetchOpenRouterSpend(apiKey: string): Promise<OpenRouterSpend> {
  const [credits, key] = await Promise.allSettled([
    getOpenRouterJson("/credits", apiKey),
    getOpenRouterJson("/key", apiKey),
  ]);

  const settle = (
    part: PromiseSettledResult<{ body: unknown; status: number }>,
  ): { data: unknown | null; error: string | null } => {
    if (part.status === "fulfilled") {
      const { body, status } = part.value;
      if (status >= 400) {
        return { data: null, error: upstreamError(body, `OpenRouter API returned ${status}`) };
      }
      return { data: body, error: null };
    }
    return {
      data: null,
      error: part.reason instanceof Error ? part.reason.message : "OpenRouter request failed",
    };
  };

  const creditsPart = settle(credits);
  const keyPart = settle(key);
  return {
    credits: creditsPart.data != null ? parseOpenRouterCredits(creditsPart.data) : null,
    creditsError: creditsPart.error,
    key: keyPart.data != null ? parseOpenRouterKey(keyPart.data) : null,
    keyError: keyPart.error,
  };
}

// ---------------------------------------------------------------------------
// opencode Go
// ---------------------------------------------------------------------------

export interface OpenCodeGoWindow {
  /** Stable window id, e.g. "five_hour" | "weekly" | "monthly". */
  id: string;
  label: string;
  /** 0–100, percent of this rolling window consumed. */
  usedPct: number | null;
  /** Dollar spend inside the window, when the API reports one. */
  usedUsd: number | null;
  /** Window's dollar limit, when the API reports one. */
  limitUsd: number | null;
  /** ISO timestamp for when the window resets, when reported. */
  resetsAt: string | null;
}

export interface OpenCodeGoUsage {
  windows: OpenCodeGoWindow[];
  /** True when the response parsed but no window shape was recognized. */
  unrecognized: boolean;
}

const GO_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour window",
  "5h": "5-hour window",
  fivehour: "5-hour window",
  daily: "Daily window",
  weekly: "Weekly window",
  monthly: "Monthly window",
};

function windowLabel(id: string): string {
  const known = GO_WINDOW_LABELS[id.toLowerCase().replace(/[-_\s]/g, "")] ?? null;
  if (known) return known;
  const text = id.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Usage window";
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** Percent out of a window object, tolerating 0–1 ratios and 0–100 percents. */
function windowPct(win: Record<string, unknown>): number | null {
  for (const k of ["utilization", "used_percent", "usedPercent", "percent_used", "percentUsed"]) {
    const v = num(win[k]);
    if (v != null) return clampPct(v <= 1 ? v * 100 : v);
  }
  for (const k of ["percent", "percentage", "pct", "usedPct"]) {
    const v = num(win[k]);
    if (v != null) return clampPct(v);
  }
  const used = num(win.used) ?? num(win.usage) ?? num(win.spent) ?? num(win.cost);
  const limit = num(win.limit) ?? num(win.cap) ?? num(win.allowance) ?? num(win.max);
  if (used != null && limit != null && limit > 0) return clampPct((used / limit) * 100);
  return null;
}

function windowResetsAt(win: Record<string, unknown>): string | null {
  for (const k of ["resets_at", "reset_at", "resetsAt", "resetAt"]) {
    const v = win[k];
    if (typeof v === "string" && v && !Number.isNaN(Date.parse(v)))
      return new Date(v).toISOString();
  }
  const unix = num(win.resets_at_unix) ?? num(win.reset_at_unix) ?? num(win.resetsAtUnix);
  if (unix != null && unix > 0) {
    return new Date(unix < 1e12 ? unix * 1000 : unix).toISOString();
  }
  return null;
}

/** One recognized window entry from an id/name-ish key and a window object. */
function windowFromEntry(id: string, win: Record<string, unknown>): OpenCodeGoWindow {
  const used = num(win.used) ?? num(win.usage) ?? num(win.spent) ?? num(win.cost);
  const limit = num(win.limit) ?? num(win.cap) ?? num(win.allowance) ?? num(win.max);
  return {
    id,
    label: typeof win.label === "string" && win.label ? win.label : windowLabel(id),
    usedPct: windowPct(win),
    usedUsd: used != null && used <= 10_000 ? used : null,
    limitUsd: limit != null && limit <= 10_000 ? limit : null,
    resetsAt: windowResetsAt(win),
  };
}

const WINDOW_ID_KEYS = ["id", "type", "window", "name", "key", "period", "granularity"] as const;

/**
 * Extract rolling usage windows from the Go usage response. The endpoint has
 * no published response schema, so this accepts the plausible shapes —
 * `{ windows: [...] }`, `{ data: { windows: [...] } }`, or a keyed object of
 * window entries (`five_hour` / `weekly` / `monthly`, optionally nested under
 * `usage`) — and reports `unrecognized` instead of guessing when none match.
 */
export function parseOpenCodeGoUsage(body: unknown): OpenCodeGoUsage {
  const windows: OpenCodeGoWindow[] = [];
  const push = (id: string, win: unknown): void => {
    if (!id || typeof win !== "object" || win === null || Array.isArray(win)) return;
    windows.push(windowFromEntry(id, win as Record<string, unknown>));
  };

  const scopes: unknown[] = [body];
  if (typeof body === "object" && body !== null) scopes.push((body as { data?: unknown }).data);
  for (const scope of scopes) {
    if (typeof scope !== "object" || scope === null) continue;
    const obj = scope as Record<string, unknown>;

    const list = obj.windows;
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as Record<string, unknown>;
        const id = WINDOW_ID_KEYS.map((k) => e[k]).find(
          (v): v is string => typeof v === "string" && !!v,
        );
        push(id ?? `window-${windows.length}`, e);
      }
      if (windows.length) return { windows, unrecognized: false };
    }

    const usageScope =
      typeof obj.usage === "object" && obj.usage !== null && !Array.isArray(obj.usage)
        ? (obj.usage as Record<string, unknown>)
        : obj;
    for (const [key, value] of Object.entries(usageScope)) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
      const win = value as Record<string, unknown>;
      // Only trust an entry when the KEY names a known window or the object
      // itself carries explicit window signals (a percent/utilization field
      // or a reset timestamp). A bare `{ cost: 0.05 }` must not become a row.
      const keyIsWindow = GO_WINDOW_LABELS[key.toLowerCase().replace(/[-_\s]/g, "")] != null;
      if (keyIsWindow || windowPct(win) != null || windowResetsAt(win) != null) push(key, win);
    }
    if (windows.length) return { windows, unrecognized: false };
  }

  return { windows: [], unrecognized: true };
}

/**
 * Fetch opencode Go's rolling usage windows. Throws with a clean message on
 * any failure — the route maps that to a 502 and the row shows a retryable
 * error. Unlike OpenRouter there is exactly one endpoint, so there is no
 * per-part error isolation to preserve.
 */
export async function fetchOpenCodeGoUsage(apiKey: string): Promise<OpenCodeGoUsage> {
  let res: Response;
  try {
    res = await fetch(OPENCODE_GO_USAGE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Could not reach the opencode Go usage API.");
  }
  const body = await parseJsonResponse<unknown>(res, "opencode Go");
  if (res.status === 401) throw new Error(upstreamError(body, "opencode rejected the API key."));
  if (res.status >= 400)
    throw new Error(upstreamError(body, `opencode Go API returned ${res.status}`));
  return parseOpenCodeGoUsage(body);
}
