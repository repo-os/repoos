/**
 * Telegram Bot API client (#0531) — the only outbound Telegram call site.
 *
 * Zero runtime dependencies: requests use the platform `fetch` (Node ≥ 18 /
 * Bun). All methods POST JSON to `<base>/bot<token>/<Method>` and unwrap the
 * uniform Bot API envelope `{ ok, result, description?, error_code?,
 * parameters? }`.
 *
 * Security notes:
 *  - The token never appears in an error message. Error strings are built
 *    from the method name and the API's own description, then passed through
 *    the value-based token redactor; request URLs are never logged.
 *  - The client is fetch-injectable so tests can exercise every failure mode
 *    without a network.
 */
import { TELEGRAM_API_BASE, makeTokenRedactor, redactTokenText } from "./redact.js";
import type { ProvisionedBot, TelegramBotCommand, TelegramSentMessage } from "./types.js";

/** Bot API `User` object (superset of the fields this adapter consumes). */
export interface BotApiUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
}

/** Bot API `WebhookInfo`. */
export interface WebhookInfo {
  url: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_message?: string;
  allowed_updates?: string[];
}

/** Bot API `Message`, narrowed to what normalization consumes. */
export type BotApiMessage = Record<string, unknown>;

/**
 * A raw Bot API update as Telegram serializes it: snake_case (`update_id`),
 * one optional payload field, none of the adapter's normalized shape. This is
 * what `getUpdates` hands to the polling loop and what #0532 will receive in
 * a webhook body — normalization into `TelegramUpdate` happens exactly once,
 * in `normalize.ts`. Do not consume these fields directly above the adapter.
 */
export interface BotApiUpdate {
  update_id: number;
  [key: string]: unknown;
}

export interface ApiCallOptions {
  /**
   * HTTP timeout in ms. Long polling passes its own, larger-than-poll-timeout
   * value; everything else uses the client default.
   */
  timeoutMs?: number;
  /**
   * Caller abort signal, combined with the timeout (whichever fires first
   * rejects the request). Long polling uses this so stop() does not have to
   * wait out a 25s request.
   */
  signal?: AbortSignal;
}

/** Minimal fetch signature this client needs (Node 18+ / Bun global). */
export type TelegramFetcher = typeof fetch;

export class TelegramApiError extends Error {
  /** Bot API `error_code`, or the HTTP status when the body is not usable. */
  readonly code: number;
  /** The API's human-readable description, redacted. */
  readonly description: string;
  /** Parsed from `parameters.retry_after` (429 rate limiting). Milliseconds. */
  readonly retryAfterMs: number | null;

  constructor(code: number, description: string, retryAfterMs: number | null = null) {
    super(description || `Telegram API error ${code}`);
    this.name = "TelegramApiError";
    this.code = code;
    this.description = description;
    this.retryAfterMs = retryAfterMs;
  }
}

export class TelegramNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramNetworkError";
  }
}

/** The uniform Bot API response envelope: `{ ok, result?, description?, error_code?, parameters? }`. */
export interface BotApiEnvelope<T = unknown> {
  ok?: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

const DEFAULT_TIMEOUT_MS = 30_000;

export interface TelegramApiClientOptions {
  /** Override the cloud API base (e.g. a self-hosted Local Bot API server). */
  baseUrl?: string;
  fetcher?: TelegramFetcher;
  timeoutMs?: number;
}

/** Error text we can attach when a map is needed upstream (429 → retry info). */
export interface MessageExtras {
  sendMessage?: { chatId: number };
}

export class TelegramApiClient {
  readonly baseUrl: string;
  private readonly token: string;
  private readonly fetcher: TelegramFetcher;
  private readonly timeoutMs: number;
  private readonly redact: (text: string) => string;

  constructor(token: string, options: TelegramApiClientOptions = {}) {
    this.token = token;
    this.baseUrl = (options.baseUrl || TELEGRAM_API_BASE).replace(/\/+$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.redact = makeTokenRedactor(token, this.baseUrl);
  }

  /**
   * The request URL is built with the token and never logged, returned, or
   * included in an error — errors reach the user only through `redact`.
   */
  private urlFor(method: string): string {
    return `${this.baseUrl}/bot${this.token}/${method}`;
  }

  async call<T>(
    method: string,
    params?: Record<string, unknown>,
    options?: ApiCallOptions,
  ): Promise<T> {
    let response: Response;
    const signal = options?.signal;
    try {
      response = await this.fetcher(this.urlFor(method), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params ?? {}),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(options?.timeoutMs ?? this.timeoutMs)])
          : AbortSignal.timeout(options?.timeoutMs ?? this.timeoutMs),
      });
    } catch (e) {
      // Timeouts surface as TimeoutError/AbortError; network failures as
      // TypeError. All are equally un-detailed fates of a fetch whose URL we
      // will not repeat — report the method name, redact anything attached.
      const raw = e instanceof Error ? e.message : String(e);
      throw new TelegramNetworkError(this.redact(`Telegram ${method} failed (${raw})`));
    }

    let envelope: BotApiEnvelope;
    try {
      envelope = (await response.json()) as BotApiEnvelope;
    } catch {
      throw new TelegramApiError(
        response.status,
        this.redact(`Telegram ${method} returned a non-JSON response (HTTP ${response.status})`),
      );
    }

    if (envelope?.ok !== true) {
      const description =
        typeof envelope?.description === "string" && envelope.description
          ? envelope.description
          : `Telegram ${method} failed`;
      const code = typeof envelope?.error_code === "number" ? envelope.error_code : response.status;
      const retry = envelope?.parameters?.retry_after;
      throw new TelegramApiError(
        code,
        this.redact(description),
        typeof retry === "number" ? retry * 1000 : null,
      );
    }
    return envelope.result as T;
  }

  // ── Bot identity ───────────────────────────────────────────────────────────

  async getMe(): Promise<BotApiUser> {
    return this.call<BotApiUser>("getMe");
  }

  // ── Profile & commands (#0531's configurable surface; no unsupported
  //    toggles are attempted — privacy mode and profile photo are
  //    BotFather-only, see docs/telegram-adapter.md.) ──────────────────────────

  async setMyCommands(commands: TelegramBotCommand[], languageCode?: string): Promise<boolean> {
    return this.call("setMyCommands", {
      commands: commands.map((c) => ({ command: c.command, description: c.description })),
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  async getMyCommands(languageCode?: string): Promise<TelegramBotCommand[]> {
    return this.call("getMyCommands", {
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  async setMyName(name: string, languageCode?: string): Promise<boolean> {
    return this.call("setMyName", {
      name,
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  async setMyDescription(description: string, languageCode?: string): Promise<boolean> {
    return this.call("setMyDescription", {
      description,
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  async setMyShortDescription(shortDescription: string, languageCode?: string): Promise<boolean> {
    return this.call("setMyShortDescription", {
      short_description: shortDescription,
      ...(languageCode ? { language_code: languageCode } : {}),
    });
  }

  // ── Update transport ───────────────────────────────────────────────────────

  async setWebhook(input: {
    url: string;
    secretToken: string;
    allowedUpdates?: string[];
    maxConnections?: number;
  }): Promise<boolean> {
    return this.call("setWebhook", {
      url: input.url,
      secret_token: input.secretToken,
      allowed_updates: input.allowedUpdates ?? DEFAULT_ALLOWED_UPDATES,
      ...(input.maxConnections !== undefined ? { max_connections: input.maxConnections } : {}),
    });
  }

  async deleteWebhook(dropPendingUpdates = false): Promise<boolean> {
    return this.call("deleteWebhook", { drop_pending_updates: dropPendingUpdates });
  }

  async getWebhookInfo(): Promise<WebhookInfo> {
    return this.call("getWebhookInfo");
  }

  async logOut(): Promise<boolean> {
    return this.call("logOut");
  }

  async close(): Promise<boolean> {
    return this.call("close");
  }

  /**
   * Revokes the bot's current token and returns a replacement (managed bots).
   * The old token stops working immediately; callers must discard the new one
   * when disconnecting.
   */
  async replaceManagedBotToken(userId: number): Promise<string> {
    return this.call("replaceManagedBotToken", { user_id: userId });
  }

  /**
   * One long-poll batch. The HTTP timeout must exceed the poll timeout or
   * every idle poll would look like a network error.
   */
  async getUpdates(
    input: {
      offset?: number;
      timeoutSeconds: number;
      allowedUpdates?: string[];
    },
    signal?: AbortSignal,
  ): Promise<BotApiUpdate[]> {
    const params: Record<string, unknown> = {
      timeout: input.timeoutSeconds,
      limit: 100,
      allowed_updates: input.allowedUpdates ?? DEFAULT_ALLOWED_UPDATES,
    };
    if (typeof input.offset === "number" && input.offset > 0) params.offset = input.offset;
    const raw = await this.call<unknown[]>("getUpdates", params, {
      timeoutMs: input.timeoutSeconds * 1000 + 15_000,
      ...(signal ? { signal } : {}),
    });
    return (raw ?? []) as BotApiUpdate[];
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendMessage(input: {
    chatId: number;
    text: string;
    parseMode?: "HTML" | "MarkdownV2";
    disableNotification?: boolean;
    replyToMessageId?: number;
    replyMarkup?: unknown;
  }): Promise<TelegramSentMessage> {
    const params: Record<string, unknown> = {
      chat_id: input.chatId,
      text: input.text,
    };
    if (input.parseMode) params.parse_mode = input.parseMode;
    if (input.disableNotification !== undefined)
      params.disable_notification = input.disableNotification;
    if (input.replyToMessageId !== undefined) params.reply_to_message_id = input.replyToMessageId;
    if (input.replyMarkup !== undefined) params.reply_markup = input.replyMarkup;
    const result = await this.call<Record<string, unknown>>("sendMessage", params);
    const messageId = typeof result?.message_id === "number" ? result.message_id : null;
    return { messageId, chatId: input.chatId };
  }
}

/** The update types this instance subscribes to — deliberately minimal (ADR 0007). */
export const DEFAULT_ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "channel_post",
  "edited_channel_post",
  "callback_query",
  "my_chat_member",
];

/** Map a normalized Bot API user onto the ProvisionedBot summary shape. */
export function toProvisionedBot(
  me: BotApiUser,
  source: ProvisionedBot["source"],
  connectedAt: string,
): ProvisionedBot {
  const displayName = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
  return {
    id: me.id,
    username: typeof me.username === "string" ? me.username.replace(/^@/, "") : "",
    displayName: displayName || me.username || String(me.id),
    canReadAllGroupMessages:
      typeof me.can_read_all_group_messages === "boolean" ? me.can_read_all_group_messages : null,
    canJoinGroups: typeof me.can_join_groups === "boolean" ? me.can_join_groups : null,
    supportsInlineQueries:
      typeof me.supports_inline_queries === "boolean" ? me.supports_inline_queries : null,
    source,
    connectedAt,
  };
}

/** Never log a URL or a raw token — this is the only place they exist. */
export function describeApiClientError(err: unknown, token: string): string {
  const base = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return redactTokenText(base, token);
}
