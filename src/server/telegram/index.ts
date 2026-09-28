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
import { createTelegramAgentChatHandler, type TelegramAgentChatOptions } from "./agent-chat.js";
import type { Logger } from "../../core/logger.js";
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
  /**
   * Wire `/msg` (#0542): the task-agent follow-up and needs-input handler.
   * Located here because autonomy lives with the commands' ONE authorized
   * entry point — the command handler dispatches to it before the
   * unknown-command fallback, so reads and agent chat can never end up on
   * competing intake paths. Nothing to pass but the logger; every other
   * collaborator is already in this wiring.
   */
  agentChat?: { logger: Logger };
}

/**
 * Assemble the agent-chat handler's collaborators from the command wiring.
 * `config` is the full `RepoOSConfig` object the server already holds —
 * `bootstrapTelegramAtBoot` declares it as `RepoOSConfig` (not a Pick)
 * precisely so this handler can see the agents list and task-file defaults
 * its follow-up turn needs; every other consumer reads a narrow view of the
 * same live object.
 */
function agentChatOptions(
  config: RepoOSConfig,
  index: LiveIndex,
  runner: AgentRunner,
  logger: Logger,
): TelegramAgentChatOptions {
  return {
    config,
    index,
    runner,
    logger,
    reply: async (chatId, text) => {
      await getTelegramProvider(config).sendMessage(chatId, text);
    },
  };
}

/**
 * Register the authorization intake handler and resume polling when configured
 * (#0534). Call after `resetTelegramProviders()` on reload so the new provider
 * singleton receives the handler.
 *
 * When `commands` is supplied, the read-only command handler (#0540) is
 * registered as THE intake `onAuthorized` callback, and `/msg` routes inside
 * it to the task-agent follow-up handler (#0542) when `commands.agentChat` is
 * wired — one intake consumer, never two. Omitted (as in adapter tests) the
 * intake path stays exactly as #0534 left it: authorize, audit, drop — no
 * replies.
 */
export async function bootstrapTelegramAtBoot(
  /**
   * The full config object the server holds (Settings saves mutate it in
   * place). Declared `RepoOSConfig` rather than a Pick so the `/msg` handler
   * (#0542) can see the agents list and task-file defaults; every consumer
   * below reads a narrow view of the same live object.
   */
  config: RepoOSConfig,
  commands?: TelegramCommandWiring,
): Promise<{ resumed: boolean; detail?: string }> {
  const provider = getTelegramProvider(config);
  let onAuthorized: TelegramAuthorizedHandler | undefined;
  if (commands) {
    // `/msg` shares the commands' single authorized-entry point: the command
    // handler dispatches to it before the unknown-command fallback, so reads
    // and agent chat compose instead of competing for onAuthorized.
    const agentChat = commands.agentChat
      ? createTelegramAgentChatHandler(
          agentChatOptions(config, commands.index, commands.runner, commands.agentChat.logger),
        )
      : undefined;
    onAuthorized = createTelegramCommandHandler({
      config,
      repositoryName: projectDisplayName(config.root),
      index: commands.index,
      runner: commands.runner,
      reviews: commands.reviews,
      ...(commands.publicOrigin ? { publicOrigin: commands.publicOrigin } : {}),
      send: async (chatId, text, options) => {
        await provider.sendMessage(chatId, text, options);
      },
      ...(agentChat ? { agentChat } : {}),
    });
  }
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
