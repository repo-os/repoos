/**
 * The local TelegramProvider: BYO-first connection management for one
 * repository (#0531).
 *
 * Responsibilities and their boundaries:
 *
 *  - Provisioning — BYO: validate a token with `getMe`, store it encrypted
 *    (see store.ts). Managed: delegate to the #0559 client contract, redeem
 *    server-to-server, and run the same validation/storage path. Both return
 *    the same ProvisionedBot; an unconfigured/unavailable service fails
 *    honestly and BYO keeps working.
 *  - Bot configuration — commands, name, description via the Bot API methods
 *    that exist. Group privacy mode is deliberately untouched: the Bot API
 *    has no method for it (BotFather-only), `getMe` only reports it
 *    (`can_read_all_group_messages`).
 *  - Delivery — `sendMessage` to any chat id, normalized errors, no retries.
 *  - Update intake — `handleUpdate` normalizes and dispatches to the
 *    registered handler. With none registered, every update is normalized
 *    and silently dropped.
 *
 * Nothing in this module ever returns, logs, or serializes the bot token.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { TelegramApiClient, toProvisionedBot, type BotApiUser } from "./api.js";
import { normalizeUpdate } from "./normalize.js";
import { TelegramPolling } from "./polling.js";
import { createManagedProvisioningClient, ManagedRedemptionFollowUpError } from "./provisioning.js";
import { encryptSecret } from "../../core/secret-store.js";
import { makeTokenRedactor } from "./redact.js";
import {
  TelegramCredentialStore,
  telegramConnectionPath,
  type TelegramConnectionRecord,
} from "./store.js";
import {
  finalizeTelegramDisconnect,
  removeBotWebhook,
  revokeProjectBotToken,
} from "./disconnect.js";
import type {
  ManagedProvisioningClient,
  ProvisionedBot,
  ProvisioningBeginInput,
  ProvisioningRequestView,
  TelegramDisconnectInput,
  TelegramDisconnectResult,
  TelegramProfile,
  TelegramProfileInput,
  TelegramProvider,
  TelegramSendOptions,
  TelegramSentMessage,
  TelegramStatus,
  TelegramTransport,
  TelegramTransportMode,
  TelegramUpdate,
  TelegramUpdateHandler,
  BotSource,
} from "./types.js";
import { TelegramDisconnectError } from "./types.js";
import { TelegramNetworkError } from "./api.js";

/** `secret_token` charset per the Bot API: A-Z a-z 0-9 _ -, 1–256 chars. */
const WEBHOOK_SECRET_BYTES = 32;
/** Ports the public Bot API accepts for webhook URLs (Local Bot API servers exempt). */
const WEBHOOK_ALLOWED_PORTS = new Set(["443", "80", "88", "8443"]);

export class TelegramNotConnectedError extends Error {
  constructor() {
    super("no Telegram bot is connected for this repository");
    this.name = "TelegramNotConnectedError";
  }
}

export interface TelegramProviderOptions {
  /**
   * Live configuration accessor — Settings can flip the feature switch
   * without a restart, so the provider reads through it on each use.
   */
  resolveConfig: () => {
    enabled: boolean;
    provisioningUrl: string;
    provisioningKey?: string;
  };
  /** Repo root (also where `.repoos/telegram-bot.json` lives). */
  root: string;
  /** Display name used for the bot profile's default description. */
  repositoryName: string;
  store: TelegramCredentialStore;
  /** Bot API construction seam — tests stub this; production always Telegram. */
  createApi?: (token: string) => TelegramApiClient;
  /** Provisioning client seam — tests stub this with a fake service. */
  createProvisioning?: (config: {
    provisioningUrl: string;
    provisioningKey?: string;
  }) => ManagedProvisioningClient;
  now?: () => Date;
}

/** RepoOS's default public profile applied at connect time (overridable). */
export const DEFAULT_BOT_COMMANDS = [
  { command: "help", description: "What this RepoOS bot can do" },
];

export class LocalTelegramProvider implements TelegramProvider {
  private readonly store: TelegramCredentialStore;
  private readonly resolveConfig: TelegramProviderOptions["resolveConfig"];
  private readonly buildApi: (token: string) => TelegramApiClient;
  private readonly buildProvisioning: (config: {
    provisioningUrl: string;
    provisioningKey?: string;
  }) => ManagedProvisioningClient;
  readonly root: string;
  readonly repositoryName: string;

  private handler: TelegramUpdateHandler | null = null;
  private polling: TelegramPolling | null = null;
  /** Redacted text of the last transport failure, surfaced via status(). */
  private lastError: string | null = null;
  private readonly now: () => Date;

  constructor(options: TelegramProviderOptions) {
    this.store = options.store;
    this.resolveConfig = options.resolveConfig;
    this.root = options.root;
    this.repositoryName = options.repositoryName;
    this.buildApi = options.createApi ?? ((token: string) => new TelegramApiClient(token));
    this.buildProvisioning =
      options.createProvisioning ??
      ((config) =>
        createManagedProvisioningClient({
          baseUrl: config.provisioningUrl,
          ...(config.provisioningKey ? { authKey: config.provisioningKey } : {}),
        }));
    this.now = options.now ?? (() => new Date());
  }

  private activeClient(): { api: TelegramApiClient; token: string } {
    const record = this.requireRecord();
    const token = this.store.readToken(record);
    return { api: this.buildApi(token), token };
  }

  private requireRecord(): TelegramConnectionRecord {
    const record = this.store.load();
    if (!record) throw new TelegramNotConnectedError();
    return record;
  }

  private redactorFor(token: string): (text: string) => string {
    return makeTokenRedactor(token);
  }

  // ── Provisioning ───────────────────────────────────────────────────────────

  async connectByBotToken(token: string, source: BotSource = "byo-token"): Promise<ProvisionedBot> {
    const trimmed = typeof token === "string" ? token.trim() : "";
    if (!trimmed) {
      throw new TelegramValidationError("bot token is required");
    }
    const api = this.buildApi(trimmed);
    let me: BotApiUser;
    try {
      me = await api.getMe();
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e); // already redacted client-side
      throw e;
    }
    if (!me.is_bot) {
      throw new TelegramValidationError("that Telegram account is a user, not a bot");
    }
    const bot = toProvisionedBot(me, source, this.now().toISOString());
    if (bot.canReadAllGroupMessages === true) {
      // Informational only: privacy mode is the operator's BotFather setting.
      // Report it via status; never attempt to change it from here.
      console.log(
        `[telegram] bot ${bot.username} has group privacy mode disabled (operator set via BotFather)`,
      );
    }
    const connectedAt = bot.connectedAt;
    // A corrupt/unreadable pre-existing record must not block re-connecting:
    // a fresh connect replaces the state wholesale, so treat unreadable as
    // "nothing stored" (status() is the loud reporter for the corruption).
    const existing = this.store.loadOrNull();
    const botChanged = existing !== null && existing.bot.id !== bot.id;
    // A new bot identity invalidates everything keyed to the old one: its
    // transport mode, webhook secret, profile overrides, and polling pointer
    // (update ids are per-bot; carrying them across skips or mis-offsets the
    // new bot's stream). A reconnect of the SAME bot keeps them valid.
    if (botChanged) await this.stopPollingLoop();
    this.store.save({
      version: 1,
      source,
      bot,
      credential: encryptSecret(trimmed),
      transport: existing && !botChanged ? existing.transport : { mode: "off" },
      profile: existing && !botChanged ? existing.profile : {},
      webhookSecret: existing && !botChanged ? existing.webhookSecret : null,
      polling: { lastUpdateId: existing && !botChanged ? existing.polling.lastUpdateId : null },
      createdAt: existing?.createdAt ?? connectedAt,
      updatedAt: connectedAt,
    });
    this.lastError = null;
    // A same-bot reconnect (e.g. a rotated token) must not leave the running
    // loop holding the previous token's API client — it would poll on a stale
    // credential and die with a 401. Restart on the fresh token; a fresh-bot
    // connect starts with no transport (the operator picks one; boot resume
    // re-arms polling after restarts).
    const mode = existing && !botChanged ? existing.transport.mode : "off";
    if (mode === "polling" && this.resolveConfig().enabled) {
      await this.stopPollingLoop();
      this.startPollingLoop();
    }
    return bot;
  }

  async disconnect(input: TelegramDisconnectInput): Promise<TelegramDisconnectResult> {
    const revokedAt = this.now().toISOString();
    await this.stopPollingLoop();

    const record = this.store.loadOrNull();
    if (!record) {
      const corruptOnDisk = existsSync(telegramConnectionPath(this.root));
      const bindings = finalizeTelegramDisconnect({
        authStore: input.authStore,
        actorEmail: input.actorEmail,
        instanceId: input.instanceId,
        revokedAt,
        record: null,
        revocationConfirmed: !corruptOnDisk,
        revocationMethod: corruptOnDisk ? "local-record-unreadable" : null,
        webhookRemoved: !corruptOnDisk,
        alreadyDisconnected: !corruptOnDisk,
        clearCredential: () => {
          this.store.clear();
          this.lastError = null;
        },
      });
      return {
        ok: true,
        alreadyDisconnected: !corruptOnDisk,
        revocationConfirmed: !corruptOnDisk,
        webhookRemoved: !corruptOnDisk,
        bindingsCleared: bindings,
      };
    }

    let token: string;
    try {
      token = this.store.readToken(record);
    } catch {
      // Corrupt or undecryptable credential: skip Telegram (nothing to call with)
      // but still clear local state — the store documents disconnect as recovery.
      const bindings = finalizeTelegramDisconnect({
        authStore: input.authStore,
        actorEmail: input.actorEmail,
        instanceId: input.instanceId,
        revokedAt,
        record,
        revocationConfirmed: false,
        revocationMethod: "local-credential-unreadable",
        webhookRemoved: false,
        alreadyDisconnected: false,
        clearCredential: () => {
          this.store.clear();
          this.lastError = null;
        },
      });
      return {
        ok: true,
        alreadyDisconnected: false,
        revocationConfirmed: false,
        webhookRemoved: false,
        bindingsCleared: bindings,
      };
    }

    const api = this.buildApi(token);
    let webhookRemoved = false;
    try {
      webhookRemoved = await removeBotWebhook(api);
      if (!webhookRemoved) {
        throw new TelegramDisconnectError(
          "webhook",
          "Telegram did not confirm the webhook was removed — local state was left intact",
        );
      }
    } catch (e) {
      if (e instanceof TelegramDisconnectError) throw e;
      if (e instanceof TelegramNetworkError) {
        throw new TelegramDisconnectError("webhook", e.message);
      }
      throw new TelegramDisconnectError(
        "webhook",
        e instanceof Error ? e.message : "failed to remove Telegram webhook",
      );
    }

    const { confirmed, method } = await revokeProjectBotToken({
      api,
      oldToken: token,
      botId: record.bot.id,
      source: record.source,
      managed: this.managed(),
      repository: this.repositoryName,
      instanceId: input.instanceId,
      createApi: this.buildApi,
    });
    if (!confirmed) {
      throw new TelegramDisconnectError(
        "revoke",
        "Telegram did not confirm the bot token was revoked — local state was left intact",
        true,
      );
    }

    const bindings = finalizeTelegramDisconnect({
      authStore: input.authStore,
      actorEmail: input.actorEmail,
      instanceId: input.instanceId,
      revokedAt,
      record,
      revocationConfirmed: confirmed,
      revocationMethod: method,
      webhookRemoved,
      alreadyDisconnected: false,
      clearCredential: () => {
        this.store.clear();
        this.lastError = null;
      },
    });

    return {
      ok: true,
      alreadyDisconnected: false,
      revocationConfirmed: confirmed,
      webhookRemoved,
      bindingsCleared: bindings,
    };
  }

  /**
   * Managed-redemption convenience: store the project credential a #0559
   * redemption just delivered. Same path, same ProvisionedBot as BYO.
   *
   * The service's credential is single-use: once `redeem` returns a token,
   * re-delivery is only replayed briefly within the service's grace window,
   * so a failure AFTER redemption must say exactly how to recover instead of
   * pretending nothing happened.
   */
  async redeemManagedCredential(id: string): Promise<ProvisionedBot> {
    // The unconfigured client throws ManagedProvisioningNotConfiguredError;
    // failures before this point consumed nothing.
    const { token } = await this.managed().redeem(id);
    try {
      return await this.connectByBotToken(token, "managed");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e); // redacted by the adapter layers
      throw new ManagedRedemptionFollowUpError(
        `the managed-provisioning credential arrived but could not be validated or stored ` +
          `(${reason}). The token is single-use: redeem the same request again within the ` +
          "service's grace window to retry, or ask the service admin to reset the request.",
      );
    }
  }

  async beginManagedProvisioning(input: {
    adminEmail: string;
    botNameHint?: string;
  }): Promise<{ id: string; deepLink: string; expiresAt: string }> {
    const beginInput: ProvisioningBeginInput = {
      repository: this.repositoryName,
      instanceId: this.root,
      adminEmail: input.adminEmail,
      ...(input.botNameHint ? { botNameHint: input.botNameHint } : {}),
    };
    return this.managed().begin(beginInput);
  }

  async getManagedProvisioningStatus(id: string): Promise<ProvisioningRequestView> {
    return this.managed().getStatus(id);
  }

  managed(): ManagedProvisioningClient {
    const config = this.resolveConfig();
    return this.buildProvisioning({
      provisioningUrl: config.provisioningUrl,
      ...(config.provisioningKey ? { provisioningKey: config.provisioningKey } : {}),
    });
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  status(): TelegramStatus {
    const config = this.resolveConfig();
    const managed = this.managed();
    let record: TelegramConnectionRecord | null = null;
    let connected = false;
    let failure = this.lastError;
    try {
      record = this.store.load();
    } catch (e) {
      failure =
        e instanceof Error
          ? e.message
          : `stored Telegram connection state is unreadable (${String(e)})`;
    }
    if (record) {
      try {
        // Prove the credential is actually decryptable; otherwise the honest
        // status is "not connected — set REPOOS_SECRET_STORE_KEY".
        this.store.readToken(record);
        connected = true;
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e);
      }
    }
    const transport: TelegramTransport = record?.transport
      ? {
          mode: record.transport.mode,
          ...(record.transport.webhookUrl ? { webhookUrl: record.transport.webhookUrl } : {}),
        }
      : { mode: "off" };
    const status: TelegramStatus = {
      enabled: config.enabled,
      connected,
      transport,
      managedProvisioning: { configured: managed.isConfigured() },
      lastError: failure,
      updatedAt: record?.updatedAt ?? null,
    };
    if (connected && record) {
      status.bot = {
        id: record.bot.id,
        username: record.bot.username,
        displayName: record.bot.displayName,
        canReadAllGroupMessages: record.bot.canReadAllGroupMessages,
        source: record.bot.source,
      };
      status.profile = {
        ...(record.profile.name !== undefined ? { name: record.profile.name } : {}),
        ...(record.profile.description !== undefined
          ? { description: record.profile.description }
          : {}),
        ...(record.profile.shortDescription !== undefined
          ? { shortDescription: record.profile.shortDescription }
          : {}),
        commands: record.profile.commands ?? [],
      };
    }
    return status;
  }

  // ── Profile & commands ─────────────────────────────────────────────────────

  async configureProfile(input: TelegramProfileInput): Promise<TelegramProfile> {
    const { api } = this.activeClient();
    const normalized = normalizeProfileInput(input);
    assertProfileWithinLimits(normalized);
    if (normalized.commands !== undefined) {
      await api.setMyCommands(normalized.commands);
    }
    if (normalized.name !== undefined) await api.setMyName(normalized.name);
    if (normalized.description !== undefined) {
      await api.setMyDescription(normalized.description);
    }
    if (normalized.shortDescription !== undefined) {
      await api.setMyShortDescription(normalized.shortDescription);
    }
    this.store.update((record) => {
      record.profile.appliedAt = this.now().toISOString();
      if (normalized.name !== undefined) record.profile.name = normalized.name;
      if (normalized.description !== undefined) {
        record.profile.description = normalized.description;
      }
      if (normalized.shortDescription !== undefined) {
        record.profile.shortDescription = normalized.shortDescription;
      }
      if (normalized.commands !== undefined) record.profile.commands = normalized.commands;
    });
    const record = this.requireRecord();
    const profile: TelegramProfile = {
      ...(record.profile.name !== undefined ? { name: record.profile.name } : {}),
      ...(record.profile.description !== undefined
        ? { description: record.profile.description }
        : {}),
      ...(record.profile.shortDescription !== undefined
        ? { shortDescription: record.profile.shortDescription }
        : {}),
      commands: record.profile.commands ?? [],
    };
    return profile;
  }

  /**
   * Whether the just-connected bot still needs the default profile applied.
   * True when the stored record has never had any profile applied
   * (`appliedAt` unset): a brand-new connection, or a reconnect whose
   * defaults never landed. False once anything was applied — including an
   * operator's custom configuration — so re-pasting the same bot's token
   * never silently reverts the operator's command list or description to the
   * defaults (review round 2: applyDefaultProfile on every connect did).
   */
  needsDefaultProfile(): boolean {
    const record = this.store.loadOrNull();
    return record !== null && !record.profile.appliedAt;
  }

  /**
   * The default profile new BYO/managed connections apply once: a `/help`
   * command plus a description naming this repository. Kept deliberately
   * small — commands arrive with the intake tasks, and #0538 exposes edits.
   */
  async applyDefaultProfile(): Promise<TelegramProfile> {
    const description = clampText(
      `Localized repository updates for the "${this.repositoryName}" RepoOS instance.`,
      512,
    );
    return this.configureProfile({
      commands: DEFAULT_BOT_COMMANDS,
      description,
      shortDescription: clampText(`Task updates from ${this.repositoryName} (RepoOS)`, 120),
    });
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramSendOptions,
  ): Promise<TelegramSentMessage> {
    if (!Number.isFinite(chatId)) throw new TelegramValidationError("chatId must be a number");
    if (typeof text !== "string" || !text.trim()) {
      throw new TelegramValidationError("message text is required");
    }
    if (text.length > 4096)
      throw new TelegramValidationError("message text exceeds Telegram's 4096-character limit");
    if (options?.parseMode && !["HTML", "MarkdownV2"].includes(options.parseMode)) {
      throw new TelegramValidationError("parseMode must be HTML or MarkdownV2");
    }
    const { api } = this.activeClient();
    try {
      return await api.sendMessage({
        chatId,
        text,
        ...(options?.parseMode ? { parseMode: options.parseMode } : {}),
        ...(options?.disableNotification !== undefined
          ? { disableNotification: options.disableNotification }
          : {}),
        ...(options?.replyToMessageId !== undefined
          ? { replyToMessageId: options.replyToMessageId }
          : {}),
        ...(options?.replyMarkup !== undefined ? { replyMarkup: options.replyMarkup } : {}),
      });
    } catch (e) {
      // Error text is redacted at the client; keep status informative.
      this.lastError = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  // ── Update intake ─────────────────────────────────────────────────────────

  onUpdate(handler: TelegramUpdateHandler | null): void {
    this.handler = handler;
  }

  async handleUpdate(raw: unknown): Promise<TelegramUpdate | null> {
    // The injectable now() reaches normalization so receivedAt is
    // deterministic under tests and honest ("when this instance normalized
    // the update") in production.
    const update = normalizeUpdate(raw, this.now().toISOString());
    if (!update) {
      // Unrecognizable payload: surface nothing, let transport-level
      // acknowledgement (#0532 / polling pointer) decide redelivery.
      return null;
    }
    if (this.handler) {
      try {
        await this.handler(update);
      } catch (e) {
        // A failing intake handler must not break the transport; log redacted.
        console.error(
          `[telegram] intake handler failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    // No handler registered: silent no-op — nothing authoritative happens and
    // nothing replies, exactly matching ADR 0007's unbound-sender behavior.
    return update;
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  transport(): TelegramTransport {
    let mode: TelegramTransportMode = "off";
    let webhookUrl: string | undefined;
    try {
      const record = this.store.load();
      if (record) {
        mode = record.transport.mode;
        webhookUrl = record.transport.webhookUrl;
      }
    } catch {
      mode = "off";
      this.lastError = this.lastError ?? "stored Telegram connection state is unreadable";
    }
    return {
      mode,
      ...(webhookUrl !== undefined ? { webhookUrl } : {}),
    };
  }

  async setTransport(input: {
    mode: TelegramTransportMode;
    webhookUrl?: string;
  }): Promise<TelegramTransport> {
    const { mode, webhookUrl } = input;
    const record = this.requireRecord();
    const token = this.store.readToken(record);
    const api = this.buildApi(token);

    if (mode !== "webhook" && mode !== "polling" && mode !== "off") {
      throw new TelegramValidationError("mode must be off, polling, or webhook");
    }

    // Awaited: an in-flight getUpdates now aborts promptly, so a new loop
    // can never poll concurrently with the dying one (Telegram forbids
    // overlapping getUpdates with a 409).
    await this.stopPollingLoop();

    if (mode === "webhook") {
      const url = webhookUrl ?? record.transport.webhookUrl;
      if (!url) {
        throw new TelegramValidationError(
          "webhook mode needs a webhookUrl (public HTTPS URL for this instance)",
        );
      }
      assertWebhookUrl(url, api.baseUrl);
      const secretToken = randomBytes(WEBHOOK_SECRET_BYTES).toString("hex");
      await api.setWebhook({
        url,
        secretToken,
        // The intake pipeline's update set is pinned in api.ts; Telegram's
        // default (all types except a few) is strictly wider than we want.
      });
      this.store.update((r) => {
        this.store.storeWebhookSecret(secretToken, r);
        r.transport = { mode: "webhook", webhookUrl: url };
      });
      return { mode: "webhook", webhookUrl: url };
    }

    if (mode === "polling") {
      await api.deleteWebhook(false);
      this.startPollingLoop();
      this.store.update((r) => {
        r.transport = { mode: "polling" };
      });
      return { mode: "polling" };
    }

    // off — also remove a webhook so Telegram stops delivering.
    try {
      await api.deleteWebhook(false);
    } catch {
      /* best-effort: the webhook may already be gone */
    }
    this.store.update((r) => {
      r.transport = { mode: "off" };
      r.webhookSecret = null;
    });
    return { mode: "off" };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Public for shutdown hygiene (tests, server teardown): stop the loop. */
  async stopPolling(): Promise<void> {
    await this.stopPollingLoop();
  }

  /** Whether a long-poll loop is currently armed (test/boot observability). */
  isPolling(): boolean {
    return this.polling?.isRunning() ?? false;
  }

  /**
   * Boot-time resume (called via `resumeTelegramTransports`, see index.ts).
   * When the stored transport is polling, starts the loop against the stored
   * credential so a restart does not leave a silently dead transport; the
   * loop itself gates on the live `telegram.enabled` switch, so a disabled
   * integration arms paused. Webhook mode has nothing to start here (the
   * webhook route is #0532's); `mode: "off"` means nothing to resume.
   * Idempotent and never throws.
   */
  async resumeTransport(): Promise<{ resumed: boolean; detail?: string }> {
    let record: TelegramConnectionRecord | null = null;
    try {
      record = this.store.load();
    } catch (e) {
      // Already surfaced through status().lastError; keep boot non-fatal.
      return {
        resumed: false,
        detail: `stored Telegram connection state is unreadable (${
          e instanceof Error ? e.message : String(e)
        })`,
      };
    }
    if (!record) return { resumed: false, detail: "nothing connected" };
    if (record.transport.mode !== "polling") return { resumed: false };
    try {
      // Prove the stored credential is usable before arming the loop;
      // otherwise surface the failure instead of a loop that 401s forever.
      this.store.readToken(record);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      this.lastError = this.lastError ?? detail;
      return { resumed: false, detail };
    }
    if (this.polling?.isRunning()) return { resumed: true };
    this.startPollingLoop();
    return {
      resumed: true,
      detail: this.resolveConfig().enabled
        ? undefined
        : "polling is paused while the Telegram integration is disabled",
    };
  }

  /** Awaitable: aborts any in-flight getUpdates promptly (see polling.stop). */
  private stopPollingLoop(): Promise<void> {
    const polling = this.polling;
    this.polling = null;
    return polling ? polling.stop() : Promise.resolve();
  }

  /** Start (or restart) long polling. Idempotent per provider instance. */
  private startPollingLoop(): void {
    if (this.polling?.isRunning()) return;
    const { api, token } = this.activeClient();
    const redact = this.redactorFor(token);
    const polling = new TelegramPolling({
      api,
      onRaw: (raw) => {
        // Both transports share this normalization path by construction; the
        // loop awaits this promise before advancing its pointer, so a
        // handler that has not settled keeps the update pending redelivery.
        return this.handleUpdate(raw);
      },
      readPointer: () => this.store.load()?.polling.lastUpdateId ?? null,
      writePointer: (id) => {
        try {
          this.store.setPollingPointer(id);
        } catch {
          /* pointer persistence is best-effort */
        }
      },
      // Live master-switch gate: no Telegram calls while `[telegram] enabled`
      // is false; the paused loop resumes live when the switch returns.
      enabled: () => this.resolveConfig().enabled,
      onError: (message) => {
        this.lastError = redact(message);
      },
    });
    polling.start();
    this.polling = polling;
  }
}

/** Local validation errors — distinct from Telegram's own API errors. */
export class TelegramValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramValidationError";
  }
}

function clampText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Normalize operator input: command names are stored lowercase without the
 * leading slash; optional string fields are trimmed (an empty string is a
 * legitimate "clear" value for the profile overrides).
 */
export function normalizeProfileInput(input: TelegramProfileInput): TelegramProfileInput {
  const out: TelegramProfileInput = {};
  if (input.name !== undefined) out.name = input.name.trim();
  if (input.description !== undefined) out.description = input.description.trim();
  if (input.shortDescription !== undefined) out.shortDescription = input.shortDescription.trim();
  if (input.commands !== undefined) {
    out.commands = input.commands.map((row) => ({
      command: row.command.trim().replace(/^\//, "").toLowerCase(),
      description: row.description.trim(),
    }));
  }
  return out;
}

/**
 * Validate profile inputs against the Bot API limits documented 2026-09-28:
 * setMyName 0–64; setMyDescription 0–512; setMyShortDescription 0–120;
 * setMyCommands 0–100 rows with command ≤32 lowercase-nameable chars and
 * description 1–256. Validating locally keeps obvious operator mistakes from
 * becoming redacted Telegram noise.
 */
function assertProfileWithinLimits(input: TelegramProfileInput): void {
  if (input.name !== undefined && input.name.length > 64) {
    throw new TelegramValidationError("profile name exceeds Telegram's 64-character limit");
  }
  if (input.description !== undefined && input.description.length > 512) {
    throw new TelegramValidationError("profile description exceeds Telegram's 512-character limit");
  }
  if (input.shortDescription !== undefined && input.shortDescription.length > 120) {
    throw new TelegramValidationError("short description exceeds Telegram's 120-character limit");
  }
  if (input.commands !== undefined) {
    if (input.commands.length > 100) {
      throw new TelegramValidationError("Telegram accepts at most 100 bot commands");
    }
    for (const command of input.commands) {
      if (!/^[a-z0-9_]{1,32}$/.test(command.command)) {
        throw new TelegramValidationError(
          "commands must be 1–32 chars of lowercase letters, digits, or underscores (no leading slash)",
        );
      }
      if (!command.description || command.description.length > 256) {
        throw new TelegramValidationError("each command needs a description of 1–256 characters");
      }
    }
  }
}

/**
 * Webhook URL requirements from the Bot API (verified 2026-09-28): HTTPS on
 * the public API, ports 443/80/88/8443 only; a Local Bot API server lifts
 * both restrictions, detected by a non-default API base.
 */
function assertWebhookUrl(url: string, apiBaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TelegramValidationError("webhookUrl must be an absolute URL");
  }
  const isLocalApi = apiBaseUrl !== "https://api.telegram.org";
  const allowedScheme = isLocalApi ? ["https:", "http:"] : ["https:"];
  if (!allowedScheme.includes(parsed.protocol)) {
    throw new TelegramValidationError(
      isLocalApi
        ? "webhookUrl must be an absolute http(s) URL"
        : "webhookUrl must be HTTPS (the public Bot API only accepts https URLs)",
    );
  }
  if (!isLocalApi && parsed.port && !WEBHOOK_ALLOWED_PORTS.has(parsed.port)) {
    throw new TelegramValidationError(
      "webhookUrl must use one of the ports Telegram supports: 443, 80, 88, 8443",
    );
  }
}

export function webhookSecretCharsetOk(token: string): boolean {
  return /^[A-Za-z0-9_-]{1,256}$/.test(token);
}
