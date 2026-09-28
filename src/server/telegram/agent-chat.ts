/**
 * Task-agent follow-ups and needs-input answers over Telegram (#0542).
 *
 * The first Telegram surface where an authorized sender acts on a *named* task
 * instead of reading repository state, so the authorization model is the
 * design:
 *
 *  - Driving an agent is admin-scoped, resolved live. `/msg` supplies input to
 *    an agent that is changing the repository and can steer the task toward a
 *    status transition (an engineer turn that ends in a review handoff), so a
 *    `member` is refused: they may read status and receive notifications, but
 *    not drive an agent to completion. Role comes from the intake's live
 *    resolution (`auth_users`, ADR 0007), so a demoted admin's very next
 *    message is refused. The role check runs BEFORE the task lookup: a member
 *    must not be able to probe task ids for existence.
 *  - One repository, one inbox. The task id is looked up only in this
 *    repository's live index; a task id from another project and a task id
 *    that does not exist get the same reply — nothing here confirms that a
 *    foreign id names a real task.
 *  - Nothing is dropped silently. Every outcome — unknown task, wrong status,
 *    no agent conversation yet, mid-turn busy, rate limit, success — is
 *    answered in the chat the command came from. "Silently dropping a message
 *    into a task with no live agent ... looks like data loss."
 *  - Explicit attribution. Answering a needs-input prompt clears the flag
 *    through `dismissNeedsInputOnTask` with the sender's allowlisted email as
 *    the actor, so the activity entry and audit log never read `"human"`. The
 *    agent turn itself is an `AgentRunner` turn, which self-records usage in
 *    the sessions table (repo rule: every LLM call site records usage).
 *
 * Command surface is a command on purpose: plain-text agent-bound private
 * messages belong to the repository-guide conversation (#0541), which owns
 * per-user conversation state. `/msg <task-id> <text…>` is independent of any
 * conversation, works the same in a private chat and a bound group (group
 * trigger rules still apply upstream), and needs no shared or expiring state.
 */
import type { RepoOSConfig, Task } from "../../core/types.js";
import { worktreePathForBranch } from "../../core/git.js";
import { resumePreamble } from "../../core/context-pack.js";
import type { Logger } from "../../core/logger.js";
import { getAuthStore } from "../../core/auth-store.js";
import { TELEGRAM_AUDIT } from "../../core/telegram-identity.js";
import { resolveAgentForTask, type AgentRunner } from "../agents.js";
import { dismissNeedsInputOnTask } from "../needs-input-dismiss.js";
import { tryAcquireTelegramAgentLimits } from "./rate-limits.js";
import { actorEmail, type TelegramActor } from "./actor.js";
import type { TelegramAuthorizedHandler } from "./intake.js";
import type { TelegramUpdate } from "./types.js";

/**
 * Deliver a reply in the chat the command came from. Production wires
 * `provider.sendMessage`; tests capture calls. Failures are the handler's to
 * log — never the caller's.
 */
export type TelegramChatReply = (chatId: number, text: string) => Promise<void>;

/** The index surface the handler needs; LiveIndex satisfies this structurally. */
export interface TelegramTaskIndex {
  getTask(id: string): Task | null;
  applyFileChange(absPath: string, opts?: { guarded?: boolean }): void | Promise<void>;
}

export interface TelegramAgentChatOptions {
  config: RepoOSConfig;
  index: TelegramTaskIndex;
  /** The AgentRunner surface the handler drives (satisfied by the real runner). */
  runner: Pick<AgentRunner, "output" | "send">;
  logger: Logger;
  reply: TelegramChatReply;
}

/** `/msg[@bot] <ref> <text…>` — capture 2 is the task ref, capture 3 the body. */
const MSG_COMMAND_RE = /^\/msg(@[A-Za-z0-9_]+)?(?:\s+([^\s]+))?(?:\s+([\s\S]*))?$/;

export interface ParsedTaskAgentCommand {
  taskRef: string | null;
  message: string | null;
}

/** Parse `/msg` command text; anything else is not this handler's input. */
export function parseTaskAgentCommand(text: string | null): ParsedTaskAgentCommand {
  if (!text || !text.startsWith("/")) return { taskRef: null, message: null };
  const match = text.match(MSG_COMMAND_RE);
  if (!match) return { taskRef: null, message: null };
  const taskRef = match[2]?.trim() ?? null;
  const message = match[3]?.trim() ?? null;
  return {
    taskRef: taskRef ? taskRef : null,
    message: message ? message : null,
  };
}

/**
 * Canonical task id for a chat-typed reference: task ids are 4-digit zero-
 * padded strings (`"0542"`), so `#0542`, `0542` and `542` resolve the same
 * way and `#542` never names a different task. Longer digit strings are
 * looked up EXACTLY — `00042` is refused rather than reinterpreted as `0042`
 * (over-padded refs are not a valid id form and padding cannot guess intent),
 * and a repo whose ids outgrow four digits still resolves exactly. Anything
 * non-numeric is null: it can only be a nonexistent task, and the reply must
 * not differ.
 */
export function canonicalTaskRef(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/^#/, "").trim();
  if (!/^\d{1,9}$/.test(digits)) return null;
  return digits.length <= 4 ? digits.padStart(4, "0") : digits;
}

const USAGE =
  "Send a follow-up to a task's agent:\n" +
  "\n/msg <task-id> <message>\n" +
  "\ne.g. /msg 0542 keep the settings test in the same commit\n" +
  "\nIf the agent is blocked waiting for input, the message answers it and" +
  " clears the needs-input flag.";

/** Display a chat-typed reference back the way users write it: `#<ref>`. */
function chatRef(raw: string | null): string {
  return `#${raw ?? "<id>"}`;
}

function auditJson(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

type AgentChatAuditOutcome = "denied_role" | "not_found" | "not_active" | "sent" | "failed";

interface AgentChatAuditDetail {
  taskId?: string;
  answeredNeedsInput?: boolean;
}

function auditAgentChat(
  store: ReturnType<typeof getAuthStore>,
  actor: TelegramActor,
  update: TelegramUpdate,
  outcome: AgentChatAuditOutcome,
  detail: AgentChatAuditDetail = {},
): void {
  if (!store?.isAvailable()) return;
  const msg = update.message;
  store.logAudit(
    outcome === "sent" ? TELEGRAM_AUDIT.agentFollowUp : TELEGRAM_AUDIT.agentFollowUpRefused,
    actor.email,
    actor.email,
    auditJson({
      outcome,
      ...detail,
      chatId: msg?.chatId ?? null,
      chatType: msg?.chatType ?? null,
      telegramUserId: actor.telegramUserId,
    }),
  );
}

/**
 * Build the `/msg` handler. Registered in `bootstrapTelegramAtBoot` next to
 * the read commands (#0540) as `TelegramCommandDeps.agentChat`; the command
 * handler dispatches `/msg` here through its per-chat queue. It is also a
 * valid direct intake `onAuthorized` consumer (tests use it that way): other
 * commands and non-command updates return without acting — `/status`,
 * `/tasks`, `/agents`, `/help` are the read-only surface's (#0540), plain
 * text belongs to #0541, and edited messages must never re-trigger a send.
 */
export function createTelegramAgentChatHandler(
  options: TelegramAgentChatOptions,
): TelegramAuthorizedHandler {
  const { config, index, runner, logger } = options;

  const storeFor = (): ReturnType<typeof getAuthStore> => {
    try {
      const store = getAuthStore(config.root);
      return store?.isAvailable() ? store : null;
    } catch {
      return null;
    }
  };

  return async (update: TelegramUpdate, actor: TelegramActor) => {
    const msg = update.message;
    // Only fresh messages carrying the command. Edits must not re-trigger a
    // send, and channel posts have no attributable sender upstream anyway.
    if (!msg || update.kind !== "message" || msg.command !== "msg") return;
    const chatId = msg.chatId;

    const respond = async (text: string): Promise<void> => {
      try {
        await options.reply(chatId, text);
      } catch (err) {
        logger.system("warn", "Telegram agent-chat reply failed", {
          chatId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const store = storeFor();

    // ── Privilege gate, first — before any task lookup ─────────────────────
    if (actor.role !== "admin") {
      auditAgentChat(store, actor, update, "denied_role");
      await respond(
        "Messaging a task's agent is an admin action over Telegram — ask an admin to answer " +
          "the conversation, or use the web UI. Task notifications still reach this chat.",
      );
      return;
    }

    const parsed = parseTaskAgentCommand(msg.text);
    if (!parsed.taskRef || !canonicalTaskRef(parsed.taskRef) || !parsed.message) {
      await respond(USAGE);
      return;
    }

    const canonical = canonicalTaskRef(parsed.taskRef);
    // Only this repository's index is consulted, so a task id from another
    // project and a malformed/unknown id are indistinguishable here.
    const task = canonical ? index.getTask(canonical) : null;
    if (!task || !canonical) {
      await respond(`No task ${chatRef(parsed.taskRef)} in this repository.`);
      return;
    }

    if (task.status !== "active") {
      auditAgentChat(store, actor, update, "not_active", { taskId: task.id });
      await respond(
        `Task #${task.id} is '${task.status}' — an agent only takes follow-ups on an active task.`,
      );
      return;
    }

    const agent = resolveAgentForTask(config, task);
    if (!agent) {
      auditAgentChat(store, actor, update, "failed", { taskId: task.id });
      await respond(
        `No engineer agent is enabled for #${task.id} — enable one on the Agents page first.`,
      );
      return;
    }

    // "Has a running agent" means the task has an agent conversation to
    // resume — a persisted transcript from Start work or a previous turn.
    // An agent that is mid-turn is also fine to address: `send` reports busy
    // and the sender is told, never dropped.
    const session = runner.output(task.id);
    if (!session) {
      await respond(
        `No agent conversation exists for #${task.id} yet — start the task in the web UI, ` +
          "then continue it here.",
      );
      return;
    }

    // The LLM-limit is the expensive-path limit (#0534/#0541): enforce it
    // here, at the actual turn-creation site, and say so on refusal instead
    // of silently dropping the message.
    if (!tryAcquireTelegramAgentLimits(actor.telegramUserId, chatId)) {
      await respond("Rate limit reached on the agent path — try again in a minute.");
      return;
    }

    let preamble: string | undefined;
    if (task.branch) {
      const wtPath = worktreePathForBranch(config.root, task.branch);
      if (wtPath) preamble = resumePreamble(config, task, task.branch, wtPath) || undefined;
    }

    const sent = runner.send(task.id, parsed.message, agent, { resumePreamble: preamble });
    if (!sent.ok && sent.busy) {
      auditAgentChat(store, actor, update, "failed", { taskId: task.id });
      await respond(
        `The agent for #${task.id} can't take a message right now — ` +
          `${sent.reason ?? "wait for the current turn to finish"}. Resend once it finishes.`,
      );
      return;
    }
    if (!sent.ok) {
      auditAgentChat(store, actor, update, "failed", { taskId: task.id });
      await respond(
        `Could not reach the agent for #${task.id}: ${sent.reason ?? "unknown reason"}.`,
      );
      return;
    }

    // The answer reached the agent; if a needs-input prompt was open it is
    // now resolved. Clearing AFTER a successful send means a busy/failed
    // delivery never clears a flag the answer did not reach.
    let answeredNeedsInput = false;
    if (task.needsInput) {
      try {
        // Attribution requirement (#0542): the actor is the Telegram user's
        // allowlisted email, never "human".
        const updated = dismissNeedsInputOnTask(config, task.absPath, actorEmail(actor));
        await index.applyFileChange(updated.absPath, { guarded: true });
        answeredNeedsInput = true;
      } catch (err) {
        // The turn already carries the full answer, so treat this as a
        // bookkeeping problem: it is logged, and the reply still confirms
        // the delivery rather than pretending it failed (or worse, staying
        // silent and looking like data loss).
        logger.task(task.id, "warn", "needs_input flag was not cleared for a Telegram answer", {
          actor: actor.email,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    auditAgentChat(store, actor, update, "sent", {
      taskId: task.id,
      ...(answeredNeedsInput ? { answeredNeedsInput: true } : {}),
    });
    logger.task(task.id, "info", "Telegram follow-up sent to the task agent", {
      actor: actor.email,
      chatId,
      answeredNeedsInput,
      queued: sent.queued === true,
    });
    await respond(
      sent.queued === true
        ? `📨 #${task.id} accepted — the agent is queued for a free slot and will pick it up.`
        : answeredNeedsInput
          ? `✅ Answer sent to the agent for #${task.id}.`
          : `✅ Sent to the agent for #${task.id}.`,
    );
  };
}
