/**
 * Shared Telegram adapter types (#0531).
 *
 * The local adapter is the single place this instance talks to Telegram's Bot
 * API. Later tasks build on the shapes defined here without creating parallel
 * implementations:
 *
 *  - #0532 serves the webhook HTTP route (with secret validation) and hands
 *    received bodies to `TelegramProvider.handleUpdate`.
 *  - #0533–#0535 (identity linking, per-message authorization, chat links)
 *    consume normalized `TelegramUpdate`s, never raw payloads.
 *  - #0537 dispatches notifications through `TelegramProvider.sendMessage`.
 *  - #0538 renders `TelegramProvider.status()` — status only, never a token.
 *  - #0559 implements the hosted side of the `ProvisioningClient` contract.
 *
 * Authorization context: ADR 0007 binds Telegram identity to the RepoOS
 * allowlist. Normalization here only mines transport facts (ids, chat, text);
 * authorization itself happens downstream, and while no intake handler is
 * registered an update is normalized and silently dropped — it must never
 * trigger an agent or disclose repository data.
 */

/** Chat types as Telegram reports them (`Chat.type`). */
export type TelegramChatType = "private" | "group" | "supergroup" | "channel";

/** Where a connected project bot's credential came from. */
export type BotSource = "byo-token" | "managed";

/**
 * The projection of `getMe` (plus provenance) persisted with the encrypted
 * credential. Browser-visible: BYO and managed provisioning both produce this
 * same shape, and it never contains the token itself.
 */
export interface ProvisionedBot {
  /** Numeric Telegram bot user id (`getMe().id`). */
  id: number;
  /** Bot username without the leading `@`. */
  username: string;
  /** Display name (Bot API `first_name`, plus `last_name` when present). */
  displayName: string;
  /**
   * Mirrors group privacy mode (`getMe().can_read_all_group_messages`): true
   * means the bot receives ALL group messages. There is no Bot API method to
   * change privacy mode — the operator does that in BotFather (docs/telegram-adapter.md).
   */
  canReadAllGroupMessages: boolean | null;
  canJoinGroups: boolean | null;
  supportsInlineQueries: boolean | null;
  source: BotSource;
  /** ISO timestamp of when this credential was registered with the instance. */
  connectedAt: string;
}

/** One bot command as Telegram's `setMyCommands` expects (sans `/`). */
export interface TelegramBotCommand {
  /** 1–32 chars, lowercase letters/digits/underscore per BotFather conventions. */
  command: string;
  /** 1–256 chars. */
  description: string;
}

/** A normalized incoming message. */
export interface TelegramMessage {
  messageId: number;
  chatId: number;
  chatType: TelegramChatType;
  /** Group/supergroup/channel title; null for private chats. */
  chatTitle: string | null;
  /**
   * Numeric Telegram user id of the sender. Null when the message has no
   * attributable user (channel posts) — ADR 0007 authorization resolves
   * users, so anonymous posts are never authorizable senders.
   */
  senderId: number | null;
  /** Display/lookup hint only — NEVER an authorization input (ADR 0007). */
  senderUsername: string | null;
  senderIsBot: boolean;
  /** `message.text`, falling back to the media caption. */
  text: string | null;
  /** Unix seconds, as Telegram reports. */
  date: number;
  /** Parsed slash command (`help` for `/help@bot arg`), lowercase; else null. */
  command: string | null;
  /** Slash-command arguments split on whitespace. */
  commandArgs: string[];
}

/** The update kinds the adapter recognizes. */
export type TelegramUpdateKind =
  | "message"
  | "edited_message"
  | "channel_post"
  | "edited_channel_post"
  | "callback_query"
  | "my_chat_member"
  | "other";

export interface TelegramCallbackQuery {
  id: string;
  fromUserId: number;
  fromUsername: string | null;
  /** The inline keyboard payload the bot attached when sending. */
  data: string | null;
}

/**
 * A normalized incoming update. `raw` keeps the original Telegram payload so
 * downstream tasks can refine without a second transport hop; adapters above
 * this layer must not depend on raw field names in their main flow.
 */
export interface TelegramUpdate {
  updateId: number;
  kind: TelegramUpdateKind;
  /** Present for message/edited_message/channel_post/edited_channel_post. */
  message?: TelegramMessage;
  callbackQuery?: TelegramCallbackQuery;
  raw: Record<string, unknown>;
  /** ISO timestamp when this instance normalized the update (not Telegram's). */
  receivedAt: string;
}

/**
 * Browser-visible connection status. Deliberately contains no credential
 * material and never the stored ciphertext envelope — the browser sees
 * connection STATUS only (#0530 boundary requirement).
 */
export interface TelegramStatus {
  /** The `[telegram] enabled` feature switch, read from the live config. */
  enabled: boolean;
  /** True when a project bot is connected (credential stored and readable). */
  connected: boolean;
  bot?: {
    id: number;
    username: string;
    displayName: string;
    canReadAllGroupMessages: boolean | null;
    source: BotSource;
  };
  transport: TelegramTransport;
  profile?: {
    name?: string;
    description?: string;
    shortDescription?: string;
    commands: TelegramBotCommand[];
  };
  /** Managed provisioning (#0559) — reported honestly; BYO does not need it. */
  managedProvisioning: { configured: boolean };
  /** Last failure, already redacted of any credential material. */
  lastError: string | null;
  updatedAt: string | null;
}

export type TelegramTransportMode = "off" | "polling" | "webhook";

export interface TelegramTransport {
  mode: TelegramTransportMode;
  /** The webhook URL in use. The secret token never appears here. */
  webhookUrl?: string;
}

export interface TelegramSendOptions {
  /** Telegram parse mode. Plain text when unset. */
  parseMode?: "HTML" | "MarkdownV2";
  disableNotification?: boolean;
  /** Send as a (direct) reply to this message in the same chat. */
  replyToMessageId?: number;
  /**
   * Inline keyboard / reply markup raw JSON, passed through to Telegram —
   * the shape is Telegram's (`InlineKeyboardMarkup`, …), and #0537 will use it
   * for action buttons. No schema here on purpose.
   */
  replyMarkup?: unknown;
}

export interface TelegramSentMessage {
  messageId: number | null;
  chatId: number;
}

/** Input for configuring the bot's public identity (#0531; UI in #0538). */
export interface TelegramProfileInput {
  /** Bot name shown in Telegram (0–64 chars; empty string clears the override). */
  name?: string;
  /** Shown in an empty chat (0–512 chars). */
  description?: string;
  /** Profile-page short description (0–120 chars). */
  shortDescription?: string;
  /** The public command list (`setMyCommands`, 0–100 commands). */
  commands?: TelegramBotCommand[];
}

export interface TelegramProfile {
  name?: string;
  description?: string;
  shortDescription?: string;
  commands: TelegramBotCommand[];
}

/** The downstream intake/authorization/command pipeline (registered later). */
export type TelegramUpdateHandler = (update: TelegramUpdate) => void | Promise<void>;

import type { AuthStore } from "../../core/auth-store.js";

/**
 * The Telegram boundary every later task programs against. Implementations
 * must keep credentials server-side: nothing on this interface returns a
 * decrypted token, and error text produced by implementations is redacted.
 */
export interface TelegramProvider {
  /**
   * Validate a bot token against Telegram (`getMe`) and store it encrypted.
   * `source` records provenance: an operator-pasted BYO token, or a token
   * redeemed from the managed provisioning service (#0559).
   */
  connectByBotToken(token: string, source?: BotSource): Promise<ProvisionedBot>;
  /**
   * Revoke the bot at Telegram, remove the webhook, forget the credential, and
   * clear repository bindings — complete or loudly incomplete (#0539).
   */
  disconnect(input: TelegramDisconnectInput): Promise<TelegramDisconnectResult>;
  status(): TelegramStatus;
  configureProfile(input: TelegramProfileInput): Promise<TelegramProfile>;
  /** Send a message through the connected project bot. */
  sendMessage(
    chatId: number,
    text: string,
    options?: TelegramSendOptions,
  ): Promise<TelegramSentMessage>;
  /**
   * Normalize one raw update (webhook body or polling result), then hand it
   * to the registered intake handler. With no handler registered this is a
   * silent no-op beyond normalization. Returns the normalized update (or
   * null for a malformed/unsupported payload) so callers can log honestly.
   */
  handleUpdate(raw: unknown): Promise<TelegramUpdate | null>;
  /** Register the downstream intake handler, or null to swallow updates. */
  onUpdate(handler: TelegramUpdateHandler | null): void;
  transport(): TelegramTransport;
  /**
   * Switch the update transport. Polling and webhook normalize identically;
   * nothing above the adapter changes when the mode changes.
   */
  setTransport(input: {
    mode: TelegramTransportMode;
    webhookUrl?: string;
  }): Promise<TelegramTransport>;
  /** The managed-provisioning client boundary (#0559 contract). */
  managed(): ManagedProvisioningClient;
}

// ---------------------------------------------------------------------------
// Managed provisioning client (#0559 contract) — narrow, server-to-server.
// ---------------------------------------------------------------------------

/**
 * A provisioning request's server-side state machine. The service owns the
 * transitions; this instance can only begin, observe, and redeem.
 */
export type ProvisioningRequestState =
  | "pending"
  | "awaiting_bot_creation"
  | "ready"
  | "redeemed"
  | "expired"
  | "failed";

/** A provisioning request as the browser may see it — no credential material. */
export interface ProvisioningRequestView {
  id: string;
  state: ProvisioningRequestState;
  /** The `https://t.me/newbot/…` link the admin opens in Telegram. */
  deepLink: string;
  expiresAt: string;
  /** Populated once the request is ready/redeemed. Never contains a token. */
  bot?: ProvisionedBot;
  /** Redacted service explanation, present when state = "failed". */
  error?: string;
}

export interface ProvisioningBeginInput {
  /** Which repository is asking (display name). */
  repository: string;
  /** The instance's identity, for the service's bootstrap correlation. */
  instanceId: string;
  /** The authenticated admin who started the request (audit only). */
  adminEmail: string;
  /** Suggested bot display name the deep link prefills. */
  botNameHint?: string;
}

/**
 * The client half of the managed-provisioning boundary. `redeem` is
 * single-use and idempotent by contract (retrying a completed redemption
 * returns the same already-redeemed state, not a second credential); #0559
 * supplies the service and owns the real secure handoff.
 */
export interface ProvisioningClient {
  begin(input: ProvisioningBeginInput): Promise<{
    id: string;
    deepLink: string;
    expiresAt: string;
  }>;
  getStatus(id: string): Promise<ProvisioningRequestView>;
  /** Server-to-server credential pickup. The token never leaves the server. */
  redeem(id: string): Promise<{ token: string }>;
}

/**
 * What the provider uses: a configured HTTP client, or an explicitly
 * unconfigured one that fails honestly while BYO keeps working (#0531).
 */
export interface ManagedProvisioningClient extends ProvisioningClient {
  isConfigured(): boolean;
  /**
   * Ask the #0559 service to revoke a managed project bot. When the service is
   * not configured, disconnect falls back to Bot API token replacement.
   */
  revokeBot(input: {
    botId: number;
    instanceId: string;
    repository: string;
  }): Promise<{ confirmed: boolean }>;
}

export interface TelegramDisconnectInput {
  actorEmail: string;
  authStore: AuthStore | null;
  instanceId: string;
}

export interface TelegramDisconnectResult {
  ok: true;
  alreadyDisconnected: boolean;
  revocationConfirmed: boolean;
  webhookRemoved: boolean;
  bindingsCleared: {
    userLinks: number;
    chatLinks: number;
  };
}

export type TelegramDisconnectPhase = "revoke" | "webhook" | "local";

export class TelegramDisconnectError extends Error {
  readonly phase: TelegramDisconnectPhase;
  readonly retryable: boolean;

  constructor(phase: TelegramDisconnectPhase, message: string, retryable = true) {
    super(message);
    this.name = "TelegramDisconnectError";
    this.phase = phase;
    this.retryable = retryable;
  }
}
