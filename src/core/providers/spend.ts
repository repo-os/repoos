/**
 * Live spend/usage data for the Agents page's "Model providers" tab (0327).
 *
 * OpenRouter and opencode Go expose real spend APIs and render live (each
 * needs an API key the user pastes once — stored via `setDotEnvSecret`, never
 * logged, never echoed back). Cursor's CLI does not report usage, and its
 * public dashboard is the supported view for individual-account usage, so it
 * joins opencode Zen and DeepInfra as a dashboard link-out. All upstream calls
 * are plain `fetch` with a hard timeout — zero
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
const DEEPINFRA_BASE = "https://api.deepinfra.com/v1";
const GITHUB_API_BASE = "https://api.github.com";
const FETCH_TIMEOUT_MS = 8000;

export type ModelProviderId =
  | "openrouter"
  | "opencode-go"
  | "cursor"
  | "opencode-zen"
  | "deepinfra"
  | "claude-code"
  | "qwen-code"
  | "codex"
  | "github-copilot"
  | "antigravity"
  | "kiro";

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
  configKey:
    | "openrouterApiKey"
    | "opencodeGoApiKey"
    | "deepinfraApiKey"
    | "githubCopilotToken"
    | null;
  /**
   * Optional second stored value naming the billing scope — GitHub Copilot
   * only: empty means the token's own user (a personally billed plan),
   * `org:<slug>` or `enterprise:<slug>` selects the centrally billed plan's
   * billing endpoints. Stored in `.env` like the key, never in repoos.toml.
   */
  scopeEnvVar?: string;
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
    id: "cursor",
    label: "Cursor",
    kind: "link",
    dashboardUrl: "https://cursor.com/dashboard/spending",
    note: "Usage, remaining allowance, reset date, and any on-demand charges live in Cursor’s Spending dashboard.",
    envVar: null,
    configKey: null,
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
    kind: "live",
    dashboardUrl: "https://deepinfra.com/dash/billing",
    note: "Credit balance, spending limit and monthly spend, live from the DeepInfra billing API.",
    envVar: "REPOOS_DEEPINFRA_API_KEY",
    configKey: "deepinfraApiKey",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    kind: "link",
    dashboardUrl: "https://claude.ai/settings/usage",
    note: "Subscription usage and limits live in the Claude usage settings.",
    envVar: null,
    configKey: null,
  },
  {
    id: "qwen-code",
    label: "Qwen Code",
    kind: "link",
    dashboardUrl: "https://chat.qwen.ai/",
    note: "No account-wide usage source is connected here; account and plan details live in the Qwen console.",
    envVar: null,
    configKey: null,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "link",
    dashboardUrl: "https://chatgpt.com/codex/settings",
    note: "Codex subscription and usage details live in the ChatGPT Codex settings.",
    envVar: null,
    configKey: null,
  },
  {
    id: "github-copilot",
    label: "GitHub Copilot",
    kind: "live",
    dashboardUrl: "https://github.com/settings/copilot",
    note: "AI-credit usage billed to the account this period, live from GitHub's billing API. Reports billed usage — GitHub's API does not expose a remaining-quota figure.",
    envVar: "REPOOS_GITHUB_COPILOT_TOKEN",
    configKey: "githubCopilotToken",
    scopeEnvVar: "REPOOS_GITHUB_COPILOT_SCOPE",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    kind: "link",
    dashboardUrl: "https://antigravity.google/",
    note: "No individual usage source is connected here; account details live in the Antigravity console.",
    envVar: null,
    configKey: null,
  },
  {
    id: "kiro",
    label: "Kiro",
    kind: "link",
    dashboardUrl: "https://app.kiro.dev/account",
    note: "Kiro credits and subscription details live in the Kiro account console.",
    envVar: null,
    configKey: null,
  },
];

export function modelProviderById(id: string): ModelProviderRow | undefined {
  return MODEL_PROVIDERS.find((p) => p.id === id);
}

/** A number field that is actually a finite number (null/undefined/"12" all fail). */
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** A string field that is a non-empty string, else null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * Upstream error text from every error shape we've seen: the common
 * `{ error: { message } }` and `{ error: "..." }` forms, plus GitHub's
 * top-level `{ message: "..." }` and `{ message: "...", errors: [...] }`.
 */
function upstreamError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const obj = body as Record<string, unknown>;
    const err = obj.error;
    if (typeof err === "string" && err.trim()) return err.trim();
    if (typeof err === "object" && err !== null) {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    const top = str(obj.message);
    if (top && top.trim() && top.length <= 300) return top.trim();
  }
  return fallback;
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

// ---------------------------------------------------------------------------
// DeepInfra
// ---------------------------------------------------------------------------

export interface DeepInfraScopedCredit {
  name: string;
  grantedUsd: number | null;
  remainingUsd: number | null;
  expired: boolean;
}

export interface DeepInfraChecklist {
  /**
   * Ready-to-spend credit in USD. DeepInfra's `stripe_balance` is NEGATIVE
   * when the account holds funds ready to spend, so a usable balance is the
   * sign flipped positive; null when the balance is zero/absent.
   */
  availableUsd: number | null;
  /** Amount owed in USD — positive `stripe_balance` means money owed. */
  owedUsd: number | null;
  /** Usage since the most recent invoice, USD (as DeepInfra reports it). */
  recentUsd: number | null;
  /** Account spending limit, USD, when one is set. */
  limitUsd: number | null;
  suspended: boolean;
  suspendReason: string | null;
  /** Credits spendable only on certain models, converted to USD. */
  scopedCredits: DeepInfraScopedCredit[];
}

export interface DeepInfraUsageMonth {
  /** YYYY.MM period as reported. */
  period: string;
  /** Total cost for the month, converted from reported CENTS to USD. */
  totalUsd: number | null;
}

export interface DeepInfraSpend {
  checklist: DeepInfraChecklist | null;
  checklistError: string | null;
  usage: DeepInfraUsageMonth[] | null;
  usageError: string | null;
}

interface DeepInfraChecklistBody {
  stripe_balance?: unknown;
  recent?: unknown;
  limit?: unknown;
  suspended?: unknown;
  suspend_reason?: unknown;
  scoped_credits?: unknown;
}

/**
 * Parse the authenticated `GET /v1/payment/checklist` response
 * (https://docs.deepinfra.com/api-reference/billing/get-checklist). The sign
 * convention is the trap here: a NEGATIVE `stripe_balance` is credit ready to
 * spend, a POSITIVE one is debt — never render the raw value as a balance.
 * Checklist dollar fields are USD; scoped credits are reported in CENTS and
 * converted here.
 */
export function parseDeepInfraChecklist(body: unknown): DeepInfraChecklist {
  const c = (body as DeepInfraChecklistBody | null) ?? {};
  const stripeBalance = num(c.stripe_balance);
  const scoped: DeepInfraScopedCredit[] = Array.isArray(c.scoped_credits)
    ? c.scoped_credits.flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const sc = s as Record<string, unknown>;
        const name = str(sc.name);
        if (!name) return [];
        return [
          {
            name,
            grantedUsd:
              num(sc.granted_cents) != null ? (num(sc.granted_cents) as number) / 100 : null,
            remainingUsd:
              num(sc.remaining_cents) != null ? (num(sc.remaining_cents) as number) / 100 : null,
            expired: sc.expired === true,
          },
        ];
      })
    : [];
  return {
    availableUsd: stripeBalance != null && stripeBalance < 0 ? -stripeBalance : null,
    owedUsd: stripeBalance != null && stripeBalance > 0 ? stripeBalance : null,
    recentUsd: num(c.recent),
    limitUsd: num(c.limit),
    suspended: c.suspended === true,
    suspendReason: str(c.suspend_reason),
    scopedCredits: scoped,
  };
}

/**
 * Parse the authenticated `GET /v1/payment/usage?from=<YYYY.MM>&to=<YYYY.MM>`
 * response (https://docs.deepinfra.com/api-reference/billing/usage). The
 * documented `total_cost` is in CENTS; converted to USD here.
 */
export function parseDeepInfraUsage(body: unknown): {
  months: DeepInfraUsageMonth[];
  unrecognized: boolean;
} {
  const monthsRaw = (body as { months?: unknown } | null)?.months;
  if (!Array.isArray(monthsRaw)) return { months: [], unrecognized: true };
  const months = monthsRaw.flatMap((m) => {
    if (typeof m !== "object" || m === null) return [];
    const month = m as Record<string, unknown>;
    const period = str(month.period);
    if (!period) return [];
    const cents = num(month.total_cost);
    return [{ period, totalUsd: cents != null ? cents / 100 : null }];
  });
  return { months, unrecognized: false };
}

async function getDeepInfraJson(
  path: string,
  apiKey: string,
): Promise<{ body: unknown; status: number }> {
  const res = await fetch(`${DEEPINFRA_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = await parseJsonResponse<unknown>(res, "DeepInfra");
  return { body, status: res.status };
}

/** YYYY.MM of `date`, and of the month before it. */
function deepInfraMonthRanges(now = new Date()): { current: string; previous: string } {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const current = `${now.getUTCFullYear()}.${pad(now.getUTCMonth() + 1)}`;
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previous = `${prevDate.getUTCFullYear()}.${pad(prevDate.getUTCMonth() + 1)}`;
  return { current, previous };
}

/** Internal for tests: the YYYY.MM `from`/`to` the usage fetch covers. */
export function deepInfraUsageRange(now?: Date): string {
  const r = deepInfraMonthRanges(now);
  return `from=${r.previous}&to=${r.current}`;
}

/**
 * Fetch DeepInfra's checklist (balance/limit) and the current + previous
 * month's usage in parallel, isolating per-part failures the way OpenRouter
 * does: a checklist refusal still renders the usage half, and vice versa.
 */
export async function fetchDeepInfraSpend(apiKey: string): Promise<DeepInfraSpend> {
  const range = deepInfraUsageRange();
  const [checklist, usage] = await Promise.allSettled([
    getDeepInfraJson("/payment/checklist", apiKey),
    getDeepInfraJson(`/payment/usage?${range}`, apiKey),
  ]);

  const settle = (
    part: PromiseSettledResult<{ body: unknown; status: number }>,
    label: string,
  ): { data: unknown | null; error: string | null } => {
    if (part.status === "fulfilled") {
      const { body, status } = part.value;
      if (status === 401)
        return { data: null, error: upstreamError(body, `${label} rejected the API key.`) };
      if (status >= 400) {
        return { data: null, error: upstreamError(body, `${label} API returned ${status}`) };
      }
      return { data: body, error: null };
    }
    return {
      data: null,
      error: part.reason instanceof Error ? part.reason.message : `${label} request failed`,
    };
  };

  const checklistPart = settle(checklist, "DeepInfra");
  const usagePart = settle(usage, "DeepInfra");
  return {
    checklist: checklistPart.data != null ? parseDeepInfraChecklist(checklistPart.data) : null,
    checklistError: checklistPart.error,
    usage: usagePart.data != null ? parseDeepInfraUsage(usagePart.data).months : null,
    usageError: usagePart.error,
  };
}

// ---------------------------------------------------------------------------
// GitHub Copilot
// ---------------------------------------------------------------------------

export interface CopilotScope {
  /** personal = the token's own user (personally billed); org/enterprise = centrally billed. */
  kind: "personal" | "org" | "enterprise";
  slug: string | null;
}

/**
 * Parse a stored billing scope. Empty means the token's own user;
 * `org:<slug>` / `enterprise:<slug>` (case-insensitive prefix) selects the
 * centrally billed plan's endpoints. Anything unrecognized falls back to
 * personal — the route validates on save, this only has to be total.
 */
export function parseCopilotScope(raw: string): CopilotScope {
  const trimmed = raw.trim();
  const orgMatch = /^org:([A-Za-z0-9._-]+)$/i.exec(trimmed);
  if (orgMatch) return { kind: "org", slug: orgMatch[1] };
  const entMatch = /^enterprise:([A-Za-z0-9._-]+)$/i.exec(trimmed);
  if (entMatch) return { kind: "enterprise", slug: entMatch[1] };
  return { kind: "personal", slug: null };
}

/** True when the saved scope names a centrally billed plan. */
export function copilotScopeIsCentrallyBilled(raw: string): boolean {
  return parseCopilotScope(raw).kind !== "personal";
}

export interface CopilotUsageRow {
  product: string;
  sku: string;
  model: string | null;
  unitType: string | null;
  /** Usage covered by included quota or discounts (ai_credit shape only). */
  includedQuantity: number | null;
  /** Quantity actually billed — NOT a remaining entitlement of any kind. */
  billedQuantity: number | null;
  discountAmount: number | null;
  netAmount: number | null;
}

export interface CopilotUsage {
  scope: CopilotScope;
  /** Human period label, e.g. "October 2026". */
  periodLabel: string;
  /** The login the report was filed under, when GitHub returned it. */
  user: string | null;
  rows: CopilotUsageRow[];
  unrecognized: boolean;
}

interface CopilotUsageBody {
  timePeriod?: { year?: unknown; month?: unknown };
  user?: unknown;
  usageItems?: unknown;
}

/** Aggregate one usage line item, tolerating both documented shapes. */
function copilotRowFrom(item: Record<string, unknown>): CopilotUsageRow | null {
  const product = str(item.product);
  const sku = str(item.sku);
  if (!product || !sku) return null;
  // ai_credit / premium_request usage items split quantity into gross and
  // discount (included pool) with netQuantity billed; the enterprise
  // usage-report shape has a single `quantity` with discountAmount only.
  const gross = num(item.grossQuantity);
  const discount = num(item.discountQuantity);
  const net = num(item.netQuantity);
  const plain = num(item.quantity);
  return {
    product,
    sku,
    model: str(item.model),
    unitType: str(item.unitType),
    includedQuantity: discount ?? null,
    billedQuantity: net ?? plain ?? (gross != null && discount != null ? gross - discount : null),
    discountAmount: num(item.discountAmount),
    netAmount: num(item.netAmount),
  };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function copilotPeriodLabel(body: CopilotUsageBody): string {
  const tp = body.timePeriod;
  const year = typeof tp?.year === "number" && Number.isFinite(tp.year) ? tp.year : null;
  const month =
    typeof tp?.month === "number" && Number.isInteger(tp.month) && tp.month >= 1 && tp.month <= 12
      ? tp.month
      : null;
  if (year != null && month != null) return `${MONTH_NAMES[month - 1]} ${year}`;
  if (year != null) return String(year);
  return "this period";
}

/**
 * Parse the billing usage report response — the AI-credit
 * (`/settings/billing/ai_credit/usage`) and premium-request shapes share the
 * `usageItems[]` layout, and the enterprise `/settings/billing/usage` report
 * differs only in carrying a single `quantity` per item. Copilot line items
 * are amounts BILLED to the account in the period; nothing here is a
 * remaining quota and the UI must not present it as one.
 */
export function parseCopilotUsage(body: unknown, scope: CopilotScope): CopilotUsage {
  const b = (body as CopilotUsageBody | null) ?? {};
  if (!Array.isArray(b.usageItems)) {
    return { scope, periodLabel: copilotPeriodLabel(b), user: null, rows: [], unrecognized: true };
  }
  const rows = b.usageItems.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const row = copilotRowFrom(item as Record<string, unknown>);
    return row ? [row] : [];
  });
  return {
    scope,
    periodLabel: copilotPeriodLabel(b),
    user: str(b.user),
    rows,
    unrecognized: false,
  };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/**
 * GitHub's billing error body is a top-level `message`. Layer the account
 * type onto the common refusals so the UI can say what to fix: 403 with the
 * classic-PAT requirement, 404 when the scope slug doesn't exist.
 */
async function throwGithubError(res: Response, body: unknown, label: string): Promise<never> {
  const detail = upstreamError(body, `${label} API returned ${res.status}`);
  if (res.status === 401) throw new Error(`GitHub rejected the token (401): ${detail}`);
  if (res.status === 403)
    throw new Error(
      `GitHub refused the billing report (403): ${detail} — the billing usage endpoints require a classic personal access token, not a fine-grained one.`,
    );
  if (res.status === 404) throw new Error(`GitHub could not find that account (404): ${detail}`);
  throw new Error(detail);
}

async function getGithubJson(
  path: string,
  token: string,
  label: string,
): Promise<{ body: unknown; status: number }> {
  let res: Response;
  try {
    res = await fetch(`${GITHUB_API_BASE}${path}`, {
      headers: githubHeaders(token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Could not reach the GitHub API.`);
  }
  const body = await parseJsonResponse<unknown>(res, label);
  if (res.status >= 400) await throwGithubError(res, body, label);
  return { body, status: res.status };
}

/** Internal for tests: the path the usage fetch hits for a scope+login. */
export function copilotUsagePath(scopeRaw: string, login: string): string {
  const scope = parseCopilotScope(scopeRaw);
  const now = new Date();
  const qs = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
  if (scope.kind === "org") {
    return `/organizations/${scope.slug}/settings/billing/ai_credit/usage?${qs}`;
  }
  if (scope.kind === "enterprise") {
    // No dedicated enterprise AI-credit endpoint is documented, so report on
    // the enterprise usage report and filter to Copilot items in the parser.
    return `/enterprises/${scope.slug}/settings/billing/usage?${qs}`;
  }
  return `/users/${login}/settings/billing/ai_credit/usage?${qs}`;
}

/**
 * Fetch the Copilot AI-credit usage billed to the account this month.
 * Personal scope resolves the token's own login via `GET /user` first (the
 * usage path is per-username); org/enterprise scope goes straight to the
 * centrally billed endpoints with the stored slug. Throws with a clean,
 * actionable message on any failure — the route maps that to a 502.
 */
export async function fetchCopilotUsage(token: string, scopeRaw: string): Promise<CopilotUsage> {
  const scope = parseCopilotScope(scopeRaw);
  let login = scope.slug ?? "";
  if (scope.kind === "personal") {
    const me = await getGithubJson("/user", token, "GitHub");
    login = str((me.body as { login?: unknown }).login) ?? "";
    if (!login) throw new Error("GitHub did not report a login for this token.");
  }
  const path = copilotUsagePath(scopeRaw, login);
  const usage = await getGithubJson(path, token, "GitHub");
  return parseCopilotUsage(usage.body, scope);
}
