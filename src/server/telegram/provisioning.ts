/**
 * Managed-provisioning client boundary (#0531) — the contract #0559 implements
 * on the hosted side.
 *
 * The service (#0559) owns the official RepoOS manager bot and securely hands
 * each new project bot to the right repository instance. A repository
 * instance NEVER holds a manager bot credential: it only makes these three
 * server-to-server calls over HTTPS:
 *
 *   POST {base}/v1/provisioning/requests              → begin a request
 *   GET  {base}/v1/provisioning/requests/{id}         → inspect its state
 *   POST {base}/v1/provisioning/requests/{id}/redeem  → redeem the credential
 *
 * Contract rules (documented at length in docs/telegram-adapter.md):
 *  - `begin` returns an id, a deep link (the admin opens it in Telegram), a
 *    one-time `linkCode` (send `/link <code>` to the manager bot first), and
 *    an expiry. The service binds the request to this repository + instance +
 *    the initiating admin; correlation is a service-side decision and is never
 *    inferred from a username or callback URL here.
 *  - `getStatus` returns the current state and, once ready, the ProvisionedBot
 *    summary — never a token.
 *  - `redeem` is single-use and idempotent-on-retry, returns the project bot
 *    token exactly once (200), and refuses a second redemption (410) unless
 *    replaying the original result within a short grace window. The token
 *    goes straight into the encrypted secret store — it is never logged,
 *    echoed in an HTTP response, or placed on any path to the browser.
 *  - Until #0559 deploys the service, "not configured" and "unavailable" are
 *    reported honestly, and Bring Your Own Bot Token keeps working (#0531).
 */
import type { TelegramFetcher } from "./api.js";
import { makeTokenRedactor } from "./redact.js";
import type {
  ProvisioningBeginInput,
  ProvisioningRequestState,
  ProvisioningRequestView,
  ProvisionedBot,
  ManagedProvisioningClient,
} from "./types.js";

export class ManagedProvisioningUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedProvisioningUnavailableError";
  }
}

/**
 * Distinguishes "no service configured" (a deliberate local state — 501 at
 * the route) from a configured service failing (502): the two must never be
 * told apart by matching error text.
 */
export class ManagedProvisioningNotConfiguredError extends ManagedProvisioningUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = "ManagedProvisioningNotConfiguredError";
  }
}

/**
 * The redeem call succeeded — a single-use credential was delivered — but the
 * follow-up (validate with `getMe`, store encrypted) failed. The token is
 * already consumed, so the honest answer names the service's grace-window
 * replay as the recovery instead of pretending nothing happened. Routes map
 * this to 502 with `byoAvailable: true`.
 */
export class ManagedRedemptionFollowUpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagedRedemptionFollowUpError";
  }
}

/** The failure text when no service is configured. Says exactly what to do. */
export const PROVISIONING_NOT_CONFIGURED_MESSAGE =
  "Managed provisioning is not configured for this repository — set [telegram] provisioningUrl in " +
  "repoos.toml (the service ships with task #0559). Bring Your Own Bot Token works now.";

/** Service response shape; token-carrying fields are validated away. */
interface ServiceRequestResponse {
  id?: unknown;
  state?: unknown;
  deep_link?: unknown;
  deepLink?: unknown;
  link_code?: unknown;
  linkCode?: unknown;
  expires_at?: unknown;
  expiresAt?: unknown;
  bot?: {
    id?: unknown;
    username?: unknown;
    display_name?: unknown;
    displayName?: unknown;
    source?: unknown;
  };
  error?: unknown;
}

interface RedeemResponse {
  token?: unknown;
  bot?: ServiceRequestResponse["bot"];
}

const VALID_STATES: readonly ProvisioningRequestState[] = [
  "pending",
  "awaiting_bot_creation",
  "ready",
  "redeemed",
  "expired",
  "failed",
];

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string" || !value) {
    throw new ManagedProvisioningUnavailableError(
      `managed provisioning service returned an unexpected response (missing ${what})`,
    );
  }
  return value;
}

/** A service base URL with no auth key still works for anonymous endpoints. */
export interface ManagedProvisioningServiceConfig {
  /** The #0559 service base URL, e.g. https://provision.repoos.org. Empty = not configured. */
  baseUrl: string;
  /** Bearer credential the instance authenticates itself with (#0559 secret). */
  authKey?: string;
  fetcher?: TelegramFetcher;
  timeoutMs?: number;
}

class HttpProvisioningClient implements ManagedProvisioningClient {
  readonly baseUrl: string;
  private readonly authKey?: string;
  private readonly fetcher: TelegramFetcher;
  private readonly timeoutMs: number;
  private readonly redact: (text: string) => string;

  constructor(config: ManagedProvisioningServiceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.authKey = config.authKey;
    this.fetcher = config.fetcher ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 15_000;
    // The auth key is a credential for the service; redact it from any text.
    this.redact = makeTokenRedactor(this.authKey ?? "", "");
  }

  isConfigured(): boolean {
    return true;
  }

  private headers(): Record<string, string> {
    return this.authKey ? { Authorization: `Bearer ${this.authKey}` } : {};
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", ...this.headers() },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      throw new ManagedProvisioningUnavailableError(
        `managed provisioning service unreachable (${this.redact(raw)})`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new ManagedProvisioningUnavailableError(
        `managed provisioning service rejected this instance (HTTP ${response.status}) — ` +
          "check REPOOS_TELEGRAM_PROVISIONING_KEY",
      );
    }
    if (response.status >= 500) {
      throw new ManagedProvisioningUnavailableError(
        `managed provisioning service failed (HTTP ${response.status})`,
      );
    }
    let payload: Record<string, unknown>;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ManagedProvisioningUnavailableError(
        `managed provisioning service returned a non-JSON response (HTTP ${response.status})`,
      );
    }
    if (response.status >= 400) {
      const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
      throw new ManagedProvisioningUnavailableError(
        `managed provisioning service refused the request (${this.redact(detail)})`,
      );
    }
    return payload;
  }

  async begin(
    input: ProvisioningBeginInput,
  ): Promise<{ id: string; deepLink: string; expiresAt: string; linkCode: string }> {
    const payload = await this.request("POST", "/v1/provisioning/requests", {
      repository: input.repository,
      instance: { id: input.instanceId },
      requestedBy: input.adminEmail,
      ...(input.botNameHint ? { botNameHint: input.botNameHint } : {}),
    });
    return {
      id: requireString(payload.id, "request id"),
      deepLink: requireString(payload.deep_link ?? payload.deepLink, "deep link"),
      expiresAt: requireString(payload.expires_at ?? payload.expiresAt, "expiry"),
      linkCode: requireString(payload.link_code ?? payload.linkCode, "link code"),
    };
  }

  async getStatus(id: string): Promise<ProvisioningRequestView> {
    const payload = await this.request(
      "GET",
      `/v1/provisioning/requests/${encodeURIComponent(id)}`,
    );
    const state = payload.state as ProvisioningRequestState;
    if (!VALID_STATES.includes(state)) {
      throw new ManagedProvisioningUnavailableError(
        `managed provisioning service returned an unknown request state (${String(payload.state)})`,
      );
    }
    const linkCodeRaw = payload.link_code ?? payload.linkCode;
    const view: ProvisioningRequestView = {
      id: requireString(payload.id, "request id"),
      state: state,
      deepLink: requireString(payload.deep_link ?? payload.deepLink, "deep link"),
      expiresAt: requireString(payload.expires_at ?? payload.expiresAt, "expiry"),
      ...(typeof linkCodeRaw === "string" && linkCodeRaw ? { linkCode: linkCodeRaw } : {}),
      ...(typeof payload.error === "string" ? { error: this.redact(payload.error) } : {}),
    };
    const bot = await requireServiceBot(payload);
    if (bot) view.bot = bot;
    return view;
  }

  async redeem(id: string): Promise<{ token: string }> {
    const payload = (await this.request(
      "POST",
      `/v1/provisioning/requests/${encodeURIComponent(id)}/redeem`,
    )) as unknown as RedeemResponse;
    const token = typeof payload?.token === "string" && payload.token ? payload.token : null;
    if (!token) {
      // The service answered 200 without a credential: the request may
      // already be consumed server-side, so the honest error is the
      // redemption follow-up one (grace-window replay), not a bare refusal.
      throw new ManagedRedemptionFollowUpError(
        "managed provisioning service did not return a credential — nothing was stored. " +
          "The request may already be consumed: redeem the same request again within the " +
          "service's grace window to retry, or ask the service admin to reset it.",
      );
    }
    // The response's bot summary is OPTIONAL and informational: the provider
    // re-derives the authoritative ProvisionedBot from `getMe` with the
    // delivered token. A malformed summary must never discard an
    // already-delivered single-use credential (review round 2) — it is
    // ignored here, and `getStatus` keeps the strict validation for the view
    // the browser renders.
    return { token };
  }

  async rotateToken(id: string): Promise<{ token: string }> {
    const payload = (await this.request(
      "POST",
      `/v1/provisioning/requests/${encodeURIComponent(id)}/rotate-token`,
    )) as unknown as RedeemResponse;
    const token = typeof payload?.token === "string" && payload.token ? payload.token : null;
    if (!token) {
      throw new ManagedProvisioningUnavailableError(
        "managed provisioning service did not return a rotated credential",
      );
    }
    return { token };
  }

  async revokeBot(
    botId: number,
    repository: string,
    instanceId: string,
  ): Promise<{ confirmed: boolean }> {
    const payload = await this.request(
      "POST",
      `/v1/provisioning/bots/${encodeURIComponent(String(botId))}/revoke`,
      { repository, instance: { id: instanceId } },
    );
    return { confirmed: payload.confirmed === true };
  }
}

/** Validate the service's bot summary; null when the response carries none. */
async function requireServiceBot(payload: ServiceRequestResponse): Promise<ProvisionedBot | null> {
  const bot = payload?.bot;
  if (!bot || typeof bot !== "object") return null;
  const id = typeof bot.id === "number" ? bot.id : null;
  if (id === null) {
    throw new ManagedProvisioningUnavailableError(
      "managed provisioning service returned a bot without an id",
    );
  }
  const username = typeof bot.username === "string" ? bot.username.replace(/^@/, "") : "";
  const displayName =
    typeof bot.display_name === "string"
      ? bot.display_name
      : typeof bot.displayName === "string"
        ? bot.displayName
        : username;
  return {
    id,
    username,
    displayName: displayName || username || String(id),
    canReadAllGroupMessages: null,
    canJoinGroups: null,
    supportsInlineQueries: null,
    source: "managed",
    connectedAt: new Date().toISOString(),
  };
}

class UnconfiguredProvisioningClient implements ManagedProvisioningClient {
  isConfigured(): boolean {
    return false;
  }

  private fail(): never {
    throw new ManagedProvisioningNotConfiguredError(PROVISIONING_NOT_CONFIGURED_MESSAGE);
  }

  async begin(): Promise<{ id: string; deepLink: string; expiresAt: string; linkCode: string }> {
    this.fail();
  }

  async getStatus(): Promise<ProvisioningRequestView> {
    this.fail();
  }

  async redeem(): Promise<{ token: string }> {
    this.fail();
  }

  async rotateToken(): Promise<{ token: string }> {
    this.fail();
  }

  async revokeBot(): Promise<{ confirmed: boolean }> {
    this.fail();
  }
}

/**
 * Build the client the provider uses. An empty base URL is the "not
 * configured" case — calls fail with honest wording and BYO keeps working.
 */
export function createManagedProvisioningClient(
  config?: ManagedProvisioningServiceConfig,
): ManagedProvisioningClient {
  if (!config || !config.baseUrl || !/^https?:\/\//i.test(config.baseUrl)) {
    return new UnconfiguredProvisioningClient();
  }
  return new HttpProvisioningClient(config);
}
