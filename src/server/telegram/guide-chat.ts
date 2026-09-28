/**
 * Telegram → repository-guide agent turns (#0541, story #0003).
 *
 * A linked sender's plain-text message becomes a turn of the existing
 * repository guide conversation (Ross, `resolveRepoGuide`) through the
 * existing `AgentRunner` chat API — a new front end onto the same chat
 * surface the board UI drives (`routes/info.ts`), NOT a separate agent
 * runtime.
 *
 * Model decisions pinned here:
 *
 *  - Conversation state is per TELEGRAM USER (`tg-guide:<telegramUserId>`),
 *    never per chat. Two members of one group never share a transcript: each
 *    user's context is theirs alone, in every chat they use. The reply goes
 *    back to the chat the question was asked in (private or group), so a
 *    user can hold the same conversation from both.
 *  - A conversation expires after inactivity (expired → cleared → the next
 *    message starts fresh) so context does not accumulate indefinitely, and
 *    the user is told when that happened. `/new` clears on demand.
 *  - The per-user/per-chat AGENT rate limit is consumed by the intake
 *    handler before this handler runs; a refusal arrives as
 *    `{ agentLimited: true }` and is answered with a clear message — the
 *    limit is therefore always enforced before any LLM call is made.
 *  - Usage is recorded by the AgentRunner itself (classifySessionType →
 *    "guide"); `resolveSessionTaskId` maps `tg-guide:` keys to
 *    `taskId: null`, so Telegram turns land on the board's role rows, never
 *    a task drawer.
 *
 * Reply flow: turn-starting decisions (rate limit, `/new`, busy, disabled)
 * are awaited so intake stays fast, but waiting for the LLM turn to finish
 * and delivering its text is detached — a multi-minute generation must never
 * hold the polling loop's per-update pointer (intake awaits `onAuthorized`).
 * Completion is observed by polling `isRunning`/`queued`, and a capped wait
 * keeps a hung turn from hanging a promise forever.
 */
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../../core/types.js";
import { resolveRepoGuide, type StartResult } from "../agents.js";
import { repoGuideContext } from "../routes/helpers.js";
import type { TelegramActor } from "./actor.js";
import type { TelegramUpdate } from "./types.js";
import type { TelegramAuthorizedMeta } from "./intake.js";

/** Structural slice of AgentRunner this module drives (tests fake it). */
export interface TelegramGuideTurnRunner {
  startChat(
    sessionId: string,
    text: string,
    agent: Agent,
    repositoryContext: string,
    promptBuilder?: (text: string, context: string, agent: Agent) => string,
    opts?: { cwd?: string; emitHumanTurn?: boolean },
  ): StartResult;
  send(
    taskId: string,
    text: string,
    agent: Agent,
    opts: { resumePreamble?: string; cwd?: string; emitHumanTurn?: boolean },
  ): StartResult;
  output(sessionKey: string): { lines: AgentOutputEntry[] } | null;
  isRunning(sessionKey: string): boolean;
  queued(): { id: string; queuedAt: string }[];
  clearSession(sessionKey: string): void;
}

export interface TelegramGuideTurnDeps {
  runner: TelegramGuideTurnRunner;
  /** Resolved live — Settings can enable/disable Ross without a restart. */
  resolveAgent: () => Agent | null;
  /** Fresh repository context per turn (the task list and docs move). */
  repositoryContext: () => string;
  /** Deliver a reply to a chat. Production: TelegramProvider.sendMessage. */
  send: (chatId: number, text: string, opts?: { replyToMessageId?: number }) => Promise<unknown>;
  /** Connected bot username, for stripping a leading @mention in groups. */
  resolveBotUsername?: () => string | null;
  /** Test seams — production uses the real clock and normal pacing. */
  now?: () => number;
  pollIntervalMs?: number;
  /** Inactivity window after which a conversation is cleared. */
  expiryMs?: number;
  /** Upper bound on waiting for one turn before reporting and giving up. */
  maxTurnWaitMs?: number;
}

/** Persistent session key prefix for Telegram guide conversations (#0541). */
export const TELEGRAM_GUIDE_KEY_PREFIX = "tg-guide:";

/** Per Telegram user — the model this task chose over per-chat state. */
export function telegramGuideSessionKey(telegramUserId: number): string {
  return `${TELEGRAM_GUIDE_KEY_PREFIX}${telegramUserId}`;
}

/** Inactivity expiry: one day. Deliberately not a config knob (no Settings
 * surface is warranted for a conversation-hygiene constant). */
export const TELEGRAM_GUIDE_EXPIRY_MS = 24 * 60 * 60 * 1000;
/** Telegram's hard message limit is 4096; chunk below it with room to spare. */
export const TELEGRAM_REPLY_CHUNK = 3800;
export const TELEGRAM_GUIDE_MAX_TURN_WAIT_MS = 10 * 60 * 1000;
export const TELEGRAM_GUIDE_POLL_MS = 1_000;

const MESSAGES = {
  disabled: "Ross is disabled — enable it on the Agents page to chat here.",
  limited: "That's more questions per minute than the agent limit allows — try again in a moment.",
  busy: "Ross is still working on your previous message — this one was not sent. Try again once the reply arrives.",
  fresh: "Started a fresh conversation.",
  resumedExpired: "Started a fresh conversation — the previous one ended after 24h of inactivity.",
  noReply: "Ross finished this turn without a reply — try asking again.",
  slow: "This reply is taking unusually long (over 10 minutes). It is still running, but nothing more will arrive here for it.",
} as const;

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Chat-turn handler for one authorized Telegram update, registered as the
 * intake's `onAuthorized` (see `bootstrapTelegramAtBoot`). Everything
 * expensive — and everything meant to stay silent — happens before us; a
 * message here is from a linked, allowlisted user in a bound chat.
 */
export function telegramGuideTurnHandler(
  deps: TelegramGuideTurnDeps,
): (update: TelegramUpdate, actor: TelegramActor, meta?: TelegramAuthorizedMeta) => Promise<void> {
  const now = deps.now ?? (() => Date.now());
  const expiryMs = deps.expiryMs ?? TELEGRAM_GUIDE_EXPIRY_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? TELEGRAM_GUIDE_POLL_MS;
  const maxTurnWaitMs = deps.maxTurnWaitMs ?? TELEGRAM_GUIDE_MAX_TURN_WAIT_MS;

  const reply = async (chatId: number, text: string, replyToMessageId?: number): Promise<void> => {
    try {
      await deps.send(chatId, text, replyToMessageId ? { replyToMessageId } : undefined);
    } catch (e) {
      // Provider errors are already redacted of credential material; losing
      // one reply (visible in the log) must never break the intake handler.
      console.error(`[telegram] guide reply failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const deliverReply = async (
    chatId: number,
    replyToMessageId: number,
    sessionKey: string,
    lineCountBefore: number,
  ): Promise<void> => {
    const idle = (): boolean =>
      !deps.runner.isRunning(sessionKey) && !deps.runner.queued().some((q) => q.id === sessionKey);
    const deadline = now() + maxTurnWaitMs;
    while (!idle()) {
      if (now() > deadline) {
        await reply(chatId, MESSAGES.slow, replyToMessageId);
        return;
      }
      await sleep(pollIntervalMs);
    }
    const lines = deps.runner.output(sessionKey)?.lines ?? [];
    const text = assistantReplyText(lines.slice(lineCountBefore));
    if (!text) {
      await reply(chatId, MESSAGES.noReply, replyToMessageId);
      return;
    }
    for (const chunk of chunkForTelegram(text)) {
      await reply(chatId, chunk, replyToMessageId);
    }
  };

  return async (update, actor, meta): Promise<void> => {
    const msg = update.message;
    // Only brand-new messages start turns: an edit re-firing a paid LLM run
    // (an "edited_message" normalizes into a message-shaped update) would be
    // surprise spend, not conversation.
    if (!msg || update.kind !== "message" || msg.senderIsBot) return;
    if (meta?.agentLimited) {
      // The agent limiter refused this turn in the intake — say so plainly
      // instead of dropping it silently. No runner call is made.
      await reply(msg.chatId, MESSAGES.limited, msg.messageId);
      return;
    }

    if (msg.command === "new") {
      // Explicit conversation reset: drop the transcript and confirm.
      deps.runner.clearSession(telegramGuideSessionKey(actor.telegramUserId));
      await reply(msg.chatId, MESSAGES.fresh, msg.messageId);
      return;
    }
    // Other commands (help, and future command work) are a separate task's
    // surface — out of scope for the agent-chat path.
    if (msg.command !== null) return;

    const text = stripLeadingBotMention(
      (msg.text ?? "").trim(),
      deps.resolveBotUsername?.() ?? null,
    );
    if (!text) return; // a bare @mention ping is noise, not a question

    const agent = deps.resolveAgent();
    if (!agent) {
      await reply(msg.chatId, MESSAGES.disabled, msg.messageId);
      return;
    }

    const sessionKey = telegramGuideSessionKey(actor.telegramUserId);
    let staleNote = false;
    const existing = deps.runner.output(sessionKey);
    if (existing) {
      const lastAt = lastEntryAt(existing.lines);
      if (lastAt !== null && now() - lastAt > expiryMs) {
        // Expired: context must not accumulate indefinitely. Clearing before
        // the next turn keeps the session bounded, and the resume is visibly
        // fresh — the user is told a new conversation just started.
        deps.runner.clearSession(sessionKey);
        staleNote = true;
      }
    }

    const fresh = deps.runner.output(sessionKey) === null;
    if (staleNote) await reply(msg.chatId, MESSAGES.resumedExpired, msg.messageId);

    const context = deps.repositoryContext();
    const result = fresh
      ? deps.runner.startChat(sessionKey, text, agent, context)
      : deps.runner.send(sessionKey, text, agent, {
          resumePreamble: `Updated repository context:\n${context}`,
        });
    if (!result.ok) {
      await reply(
        msg.chatId,
        result.busy ? MESSAGES.busy : (result.reason ?? MESSAGES.noReply),
        msg.messageId,
      );
      return;
    }

    // Snapshot AFTER the human entry is appended and BEFORE any output can
    // land (startChat/spawnTurn are synchronous), so slice(start) is exactly
    // this turn's assistant output.
    const lineCountBefore = deps.runner.output(sessionKey)?.lines.length ?? 0;
    // Detached: intake must not be held for a multi-minute generation.
    void deliverReply(msg.chatId, msg.messageId, sessionKey, lineCountBefore).catch((e) => {
      console.error(`[telegram] guide reply failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  };
}

/** The newest stamp on a transcript, or null when no entry carries one. */
function lastEntryAt(lines: AgentOutputEntry[]): number | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const at = lines[i]?.at;
    if (at) {
      const parsed = Date.parse(at);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/** Assistant-visible text of one turn's transcript slice. */
export function assistantReplyText(slice: AgentOutputEntry[]): string {
  const parts: string[] = [];
  for (const entry of slice) {
    if ("type" in entry && entry.type === "text") parts.push(entry.text);
    else if ("s" in entry && entry.s === "out") parts.push(entry.d);
  }
  return parts.join("\n\n").trim();
}

/** Split into Telegram-sized pieces on line boundaries; hard-split huge lines. */
export function chunkForTelegram(text: string, chunkSize = TELEGRAM_REPLY_CHUNK): string[] {
  if (text.length <= chunkSize) return [text];
  const chunks: string[] = [];
  let current = "";
  const hardSplit = (line: string): string => {
    while (line.length > chunkSize) {
      chunks.push(line.slice(0, chunkSize));
      line = line.slice(chunkSize);
    }
    return line; // remaining tail, ≤ chunkSize
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.length > chunkSize ? hardSplit(rawLine) : rawLine;
    const segments = line === "" ? [""] : line.split("\n");
    for (const segment of segments) {
      const candidate = current ? `${current}\n${segment}` : segment;
      if (candidate.length <= chunkSize) {
        current = candidate;
        continue;
      }
      if (current) chunks.push(current);
      current = segment;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * In groups a question usually arrives as `@botname …`. The mention is an
 * addressing artifact, not a question — strip it when the bot's own username
 * leads the text. A message that was only the mention becomes empty and the
 * caller drops it.
 */
export function stripLeadingBotMention(text: string, botUsername: string | null): string {
  if (!botUsername) return text;
  const escaped = botUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`^@${escaped}(?=\\s|$)`, "i"), "").trim();
}

/**
 * Production wiring: agent from live config, repository context from the
 * live index, delivery through the per-repo provider singleton. Tests build
 * `telegramGuideTurnHandler` directly with fakes instead.
 */
export function createTelegramGuideTurn(
  config: RepoOSConfig,
  runner: TelegramGuideTurnRunner,
  opts: {
    getTasks?: () => Task[];
    send?: TelegramGuideTurnDeps["send"];
    resolveBotUsername?: TelegramGuideTurnDeps["resolveBotUsername"];
    /** Test seams — production uses the real clock and normal pacing. */
    pollIntervalMs?: number;
    maxTurnWaitMs?: number;
    expiryMs?: TelegramGuideTurnDeps["expiryMs"];
    now?: TelegramGuideTurnDeps["now"];
  } = {},
): (update: TelegramUpdate, actor: TelegramActor, meta?: TelegramAuthorizedMeta) => Promise<void> {
  return telegramGuideTurnHandler({
    runner,
    resolveAgent: () => resolveRepoGuide(config),
    repositoryContext: () => repoGuideContext(config, opts.getTasks?.() ?? []),
    resolveBotUsername: opts.resolveBotUsername,
    ...(opts.send
      ? { send: opts.send }
      : {
          send: async (chatId, text, sendOpts) => {
            // Imported lazily: keeps the provider singleton out of unit-test
            // import graphs and avoids an import cycle (index ← guide-chat).
            const { getTelegramProvider } = await import("./index.js");
            await getTelegramProvider(config).sendMessage(chatId, text, sendOpts);
          },
        }),
    ...(opts.pollIntervalMs !== undefined ? { pollIntervalMs: opts.pollIntervalMs } : {}),
    ...(opts.maxTurnWaitMs !== undefined ? { maxTurnWaitMs: opts.maxTurnWaitMs } : {}),
    ...(opts.expiryMs !== undefined ? { expiryMs: opts.expiryMs } : {}),
    ...(opts.now ? { now: opts.now } : {}),
  });
}
