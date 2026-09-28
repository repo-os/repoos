/**
 * Per-repository Telegram provider singleton (#0531).
 *
 * Routes obtain the provider here so config-source and credentials follow the
 * same lifecycle as the rest of the server: one provider per repo root, built
 * lazily on first use, reading the live config through the repoos object the
 * caller already holds (Settings saves mutate it in place).
 *
 * Tests reset the map with `resetTelegramProviders` or inject collaborators
 * through `setTelegramProvider`. Resetting only stops running transports —
 * it deliberately never deletes a stored connection, so a test-only helper
 * cannot become destructive if reused in production cleanup.
 */
import type { RepoOSConfig } from "../../core/types.js";
import { projectDisplayName } from "../../core/config.js";
import { LocalTelegramProvider } from "./provider.js";
import { TelegramCredentialStore } from "./store.js";
import {
  createTelegramIntakeHandler,
  telegramIntakeOptionsFromConfig,
  type TelegramAuthorizedHandler,
} from "./intake.js";
import { createTelegramCommandHandler } from "./commands.js";
import type { LiveIndex } from "../live-index.js";
import type { AgentRunner } from "../agents.js";
import type { ReviewManager } from "../review.js";

/** The adapter's live config view — everything it needs from RepoOSConfig. */
export interface TelegramRuntimeConfig {
  enabled: boolean;
  provisioningUrl: string;
  provisioningKey?: string;
}

export function telegramRuntimeConfig(
  config: Pick<RepoOSConfig, "root"> & { telegram?: RepoOSConfig["telegram"] },
): TelegramRuntimeConfig {
  return {
    enabled: config.telegram?.enabled === true,
    provisioningUrl: config.telegram?.provisioningUrl ?? "",
    provisioningKey: process.env.REPOOS_TELEGRAM_PROVISIONING_KEY || undefined,
  };
}

const providers = new Map<string, LocalTelegramProvider>();

function providerKey(root: string): string {
  // One provider per canonical checkout; symlinks/relative paths in tests
  // normalize through this exact string, so different roots stay separate.
  return root;
}

export function getTelegramProvider(
  config: Pick<RepoOSConfig, "root"> & { telegram?: RepoOSConfig["telegram"] },
): LocalTelegramProvider {
  const key = providerKey(config.root);
  const existing = providers.get(key);
  if (existing) return existing;
  const provider = new LocalTelegramProvider({
    resolveConfig: () => telegramRuntimeConfig(config),
    root: config.root,
    repositoryName: projectDisplayName(config.root),
    store: new TelegramCredentialStore(config.root),
  });
  providers.set(key, provider);
  return provider;
}

export function setTelegramProvider(root: string, provider: LocalTelegramProvider): void {
  providers.set(providerKey(root), provider);
}

/**
 * Stop every provider's polling loop and drop the singletons, keeping stored
 * connection state on disk. The server teardown/dispose path and tests both
 * use this; deleting credentials was `disconnect()`'s job and stays there.
 */
export function resetTelegramProviders(): void {
  for (const provider of providers.values()) {
    // Fire-and-forget cleanup; tests only need state to be disposable. The
    // polling loop aborts its in-flight getUpdates promptly (see polling.ts).
    void provider.stopPolling();
  }
  providers.clear();
}

/**
 * Boot-time transport resume (#0531, review round 1): a restart used to leave
 * the stored `transport.mode = "polling"` with no loop behind it — a silently
 * dead transport. After the server binds, this reads the connection record
 * and (re)starts the long-poll loop when the stored transport is polling and
 * the credential is readable. The loop itself gates on the live
 * `telegram.enabled` switch, so an integration that is currently disabled
 * stays paused with no Telegram traffic and resumes live when it is enabled.
 *
 * Never throws; every outcome is reported for the server log and mirrored
 * into `status().lastError` where it is an error.
 */
export async function resumeTelegramTransports(
  config: Pick<RepoOSConfig, "root"> & { telegram?: RepoOSConfig["telegram"] },
): Promise<{ resumed: boolean; detail?: string }> {
  const provider = getTelegramProvider(config);
  try {
    return await provider.resumeTransport();
  } catch (e) {
    const detail =
      e instanceof Error ? e.message : `telegram transport resume failed: ${String(e)}`;
    return { resumed: false, detail };
  }
}

/**
 * Server-owned read sources the Telegram commands render from (#0540) — the
 * same in-process `LiveIndex`/`AgentRunner`/`ReviewManager` the HTTP read
 * routes use, so Telegram never grows a parallel data path.
 */
export interface TelegramCommandWiring {
  index: LiveIndex;
  runner: AgentRunner;
  reviews: ReviewManager;
  /** Control-plane origin for web links; falls back to env/tunnel. */
  publicOrigin?: string;
}

/**
 * Boot options: optional command wiring (#0540) and/or an extra
 * authorized-update handler (#0541 agent chat). The intake supports exactly
 * ONE `onAuthorized` sink, so both are composed with `chainedOnAuthorized` —
 * each handler filters its own scope out of every update, so a chained
 * update flows through every handler that can act on it.
 */
export interface TelegramBootOptions extends Partial<TelegramCommandWiring> {
  onAuthorized?: TelegramAuthorizedHandler;
}

/**
 * Compose authorized-update handlers into the intake's single sink.
 * Handlers are run in the given order and each filters its own surface
 * (#0540 commands act on `msg.command`; #0541 agent chat acts on plain new
 * non-command text); a failure in one is logged redacted and never
 * suppresses the next. Returns undefined when nothing is registered, so
 * `bootstrapTelegramAtBoot` keeps #0534's drop-with-no-sink behavior.
 */
export function chainedOnAuthorized(
  ...handlers: readonly (TelegramAuthorizedHandler | undefined)[]
): TelegramAuthorizedHandler | undefined {
  const chain = handlers.filter((h): h is TelegramAuthorizedHandler => h != null);
  if (chain.length === 0) return undefined;
  if (chain.length === 1) return chain[0];
  return async (update, actor, meta) => {
    for (const handler of chain) {
      try {
        await handler(update, actor, meta);
      } catch (e) {
        console.error(
          `[telegram] authorized handler failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  };
}

/**
 * Register the authorization intake handler and resume polling when configured
 * (#0534). Call after `resetTelegramProviders()` on reload so the new provider
 * singleton receives the handler.
 *
 * With wiring supplied, the read-only command handler (#0540) is composed
 * into the intake `onAuthorized` sink; with `onAuthorized` supplied the extra
 * handler is chained after it (#0541 agent chat). Neither (adapter tests):
 * the intake path stays exactly as #0534 left it: authorize, audit, drop.
 */
export async function bootstrapTelegramAtBoot(
  config: Pick<RepoOSConfig, "root" | "auth" | "telegram">,
  options: TelegramBootOptions = {},
): Promise<{ resumed: boolean; detail?: string }> {
  const provider = getTelegramProvider(config);
  let commandHandler: TelegramAuthorizedHandler | undefined;
  if (options.index && options.runner && options.reviews) {
    commandHandler = createTelegramCommandHandler({
      config,
      repositoryName: projectDisplayName(config.root),
      index: options.index,
      runner: options.runner,
      reviews: options.reviews,
      ...(options.publicOrigin ? { publicOrigin: options.publicOrigin } : {}),
      send: async (chatId, text, sendOpts) => {
        await provider.sendMessage(chatId, text, sendOpts);
      },
    });
  }
  const onAuthorized = chainedOnAuthorized(commandHandler, options.onAuthorized);
  provider.onUpdate(
    createTelegramIntakeHandler(
      telegramIntakeOptionsFromConfig(config, {
        resolveBot: () => {
          const status = provider.status();
          if (!status.connected || !status.bot) return null;
          return { id: status.bot.id, username: status.bot.username };
        },
        ...(onAuthorized ? { onAuthorized } : {}),
      }),
    ),
  );
  return resumeTelegramTransports(config);
}
