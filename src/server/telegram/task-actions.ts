/**
 * Writing to the repository from Telegram (#0543): create tasks, drive the
 * lifecycle, and carry attachments — all behind the identity model the earlier
 * phases built.
 *
 * Security model (the reason this is the last phase):
 *
 *  - Every surface here is admin-only. A `member` is an authorized sender, so
 *    a refusal is answered with a role explanation and audited — never an
 *    ADR-0007 silent no-op.
 *  - Role is re-resolved from `auth_users` at press time (`resolveTelegramSender`),
 *    so a demotion takes effect on the very next interaction and the role a
 *    button was rendered for is never trusted.
 *  - Inline payloads are signed, short-lived, single-use (`verifyTelegramAction`
 *    + `TelegramActionNonceLedger`); a replay, an expired token, a forged
 *    token, and a token rendered for an admin but pressed by a member all fail.
 *  - Move to done is two-step by construction: the first press renders a
 *    confirmation card naming repository/task/branch and starts nothing; only
 *    the confirm button calls the close-out operation.
 *  - Creation and action limiters are checked before any task file is written
 *    or any agent/close-out work is queued.
 *
 * The handler joins the intake's ONE `onAuthorized` chain: `/newtask`, the
 * text that answers an Edit prompt, and callback presses are all consumed here.
 * It never registers a second sink, and it returns without acting on anything
 * that belongs to the read commands, `/msg`, or the guide chat.
 */
import type { RepoOSConfig, Task } from "../../core/types.js";
import { getAuthStore } from "../../core/auth-store.js";
import {
  TELEGRAM_AUDIT,
  resolveTelegramSender,
  telegramInviteSecret,
} from "../../core/telegram-identity.js";
import { webUiLink } from "../notifications/link.js";
import { canonicalTaskRef } from "./agent-chat.js";
import {
  TelegramActionNonceLedger,
  TELEGRAM_ACTION_TTL_MS,
  createTelegramActionNonce,
  signTelegramAction,
  verifyTelegramAction,
  type TelegramActionKind,
} from "./callbacks.js";
import { classifyTelegramAttachment } from "./attachments.js";
import { tryAcquireTelegramActionLimits, tryAcquireTelegramCreateLimits } from "./rate-limits.js";
import {
  applyDraftEdit,
  inferTaskDraft,
  type DraftField,
  type TaskDraftFields,
} from "./task-draft.js";
import {
  TelegramTaskDraftStore,
  type TelegramDraftAttachmentRef,
  type TelegramTaskDraftRecord,
} from "./task-drafts-store.js";
import type { TelegramTaskCreateResult } from "./task-creation.js";
import { actorEmail, type TelegramActor } from "./actor.js";
import type { TelegramAuthorizedHandler } from "./intake.js";
import type {
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramSendOptions,
  TelegramUpdate,
} from "./types.js";

export interface TelegramTaskActionResult {
  ok: boolean;
  message: string;
}

export interface TelegramTaskActionOps {
  /** Create through the shared `repoos.createTask` path. */
  createTask(
    draft: TaskDraftFields,
    attachments: Array<{ name: string | null; bytes: Buffer }>,
    actor: TelegramActor,
  ): TelegramTaskCreateResult | Promise<TelegramTaskCreateResult>;
  start(task: Task, actor: TelegramActor): Promise<TelegramTaskActionResult>;
  pause(task: Task, actor: TelegramActor): Promise<TelegramTaskActionResult>;
  requestReview(task: Task, actor: TelegramActor): Promise<TelegramTaskActionResult>;
  moveToDone(task: Task, actor: TelegramActor): Promise<TelegramTaskActionResult>;
  /** Bot API file download; absent means attachments are unsupported here. */
  downloadFile?(
    fileId: string,
    options: { maxBytes: number },
  ): Promise<{ data: Buffer; filePath: string | null }>;
  /** Voice transcription; absent means voice notes are answered honestly. */
  transcribeVoice?(bytes: Buffer, mime: string): Promise<string>;
}

export interface TelegramTaskActionsOptions {
  config: Pick<RepoOSConfig, "root" | "cacheDir">;
  /** Session secret used to sign inline payloads; absent disables buttons. */
  authSessionSecret?: string;
  repositoryName: string;
  /** Declared area vocabulary; empty allows free-text areas. */
  areaVocabulary: string[];
  defaultArea: string;
  publicOrigin?: string;
  index: { getTask(id: string): Task | null };
  ops: TelegramTaskActionOps;
  send(chatId: number, text: string, options?: TelegramSendOptions): void | Promise<void>;
  answerCallback?(callbackQueryId: string, text?: string): void | Promise<void>;
  /** Test seams. */
  now?: () => Date;
  draftStore?: TelegramTaskDraftStore;
  nonceLedger?: TelegramActionNonceLedger;
  logger?: { system(level: "info" | "warn", message: string, detail?: unknown): void };
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const ROLE_REFUSAL =
  "That is an admin action — your role is member. Task notifications still reach this chat, " +
  "and an admin can create tasks, start or pause agents, request review, and close out work.";

const NO_SECRET =
  "Inline actions are unavailable because this server has no session secret configured. " +
  "Use the web UI for now.";

interface InlineButton {
  text: string;
  callback_data: string;
}

type InlineKeyboard = { inline_keyboard: InlineButton[][] };

function replyOptions(
  message: TelegramMessage | null,
  callback: TelegramCallbackQuery | null,
): TelegramSendOptions {
  const thread = message?.messageThreadId ?? callback?.messageThreadId ?? null;
  const opts: TelegramSendOptions = {};
  if (message) opts.replyToMessageId = message.messageId;
  if (thread !== null) opts.messageThreadId = thread;
  return opts;
}

function webLink(options: TelegramTaskActionsOptions, path: string): string {
  return webUiLink({ root: options.config.root } as RepoOSConfig, path, options.publicOrigin);
}

function audit(
  root: string,
  actor: TelegramActor,
  action: string,
  details: Record<string, unknown>,
): void {
  try {
    const store = getAuthStore(root);
    if (!store?.isAvailable()) return;
    store.logAudit(action, actorEmail(actor), actorEmail(actor), JSON.stringify(details));
  } catch {
    /* audit is best-effort on the Telegram path; the action result is not */
  }
}

/** One attachment descriptor from a Bot API message, reduced to what we need. */
interface AttachmentDescriptor {
  fileId: string;
  name: string | null;
  voice: boolean;
}

function collectAttachmentDescriptors(update: TelegramUpdate): AttachmentDescriptor[] {
  const raw = update.raw?.message as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return [];
  const out: AttachmentDescriptor[] = [];
  const photo = raw.photo;
  if (Array.isArray(photo) && photo.length > 0) {
    // Telegram sends several sizes; the last is the largest.
    const largest = photo[photo.length - 1] as Record<string, unknown>;
    const fileId = typeof largest?.file_id === "string" ? largest.file_id : null;
    if (fileId) out.push({ fileId, name: "photo", voice: false });
  }
  const document = raw.document as Record<string, unknown> | undefined;
  if (document && typeof document?.file_id === "string") {
    out.push({
      fileId: document.file_id,
      name: typeof document.file_name === "string" ? document.file_name : null,
      voice: false,
    });
  }
  const voice = raw.voice as Record<string, unknown> | undefined;
  if (voice && typeof voice?.file_id === "string") {
    out.push({ fileId: voice.file_id, name: null, voice: true });
  }
  return out;
}

function repliedToText(update: TelegramUpdate): string | null {
  const raw = update.raw?.message as Record<string, unknown> | undefined;
  const reply = raw?.reply_to_message as Record<string, unknown> | undefined;
  if (!reply) return null;
  if (typeof reply.text === "string" && reply.text.trim()) return reply.text.trim();
  if (typeof reply.caption === "string" && reply.caption.trim()) return reply.caption.trim();
  return null;
}

function renderPreviewText(draft: TaskDraftFields, attachmentCount: number): string {
  const lines = [
    "📝 New task preview — nothing has been created yet",
    "",
    `Title: ${draft.title}`,
    `Type: ${draft.type}`,
    `Priority: ${draft.priority}`,
    `Area: ${draft.area}`,
    "",
    "Body:",
    draft.body.length > 1200 ? `${draft.body.slice(0, 1200)}…` : draft.body,
  ];
  if (attachmentCount > 0) {
    lines.push("", `Attachments: ${attachmentCount} (validated when you press Create)`);
  }
  return lines.join("\n");
}

function editPrompt(field: DraftField): string {
  switch (field) {
    case "title":
      return "Send the new title as your next message.";
    case "type":
      return "Send the new type (feature, bug, chore, spec, refactor) as your next message.";
    case "priority":
      return "Send the new priority (p0, p1, p2, p3) as your next message.";
    case "area":
      return "Send the new area as your next message.";
  }
}

export interface TelegramTaskActionMarkupInput {
  taskId: string;
  status: string;
  needsInput?: boolean;
  /** Notification kind, so a failed/needs-input active task gets Resume. */
  kind?: string;
}

/**
 * Buttons for a notification that offers an action. Returns undefined when
 * the task's state has nothing useful to do. Members may see these buttons too
 * (notifications fan out to the bound chat); pressing one is refused with the
 * role explanation, never silently ignored.
 */
export function telegramTaskActionMarkup(
  secret: string | null,
  input: TelegramTaskActionMarkupInput,
  now: Date = new Date(),
): InlineKeyboard | undefined {
  if (!secret) return undefined;
  const ref = input.taskId;
  const token = (kind: TelegramActionKind): string =>
    signTelegramAction(secret, { kind, ref, now, ttlMs: TELEGRAM_ACTION_TTL_MS });
  const row: InlineButton[] = [];
  if (input.status === "ready") {
    row.push({ text: "▶️ Start", callback_data: token("start") });
  } else if (input.status === "active") {
    if (input.needsInput || input.kind === "task.agent_failed") {
      row.push({ text: "▶️ Resume", callback_data: token("resume") });
    }
    row.push({ text: "⏸ Pause", callback_data: token("pause") });
    row.push({ text: "👀 Request review", callback_data: token("review") });
  } else if (input.status === "review") {
    row.push({ text: "✅ Move to done", callback_data: token("done") });
  }
  return row.length > 0 ? { inline_keyboard: [row] } : undefined;
}

/** Per-chat serialization so a group burst cannot interleave previews/actions. */
function createChatQueue(): <T>(chatId: number, task: () => Promise<T>) => Promise<T> {
  const chains = new Map<number, Promise<void>>();
  return <T>(chatId: number, task: () => Promise<T>): Promise<T> => {
    const previous = chains.get(chatId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    chains.set(chatId, settled);
    void settled.finally(() => {
      if (chains.get(chatId) === settled) chains.delete(chatId);
    });
    return run;
  };
}

export function createTelegramTaskActionsHandler(
  options: TelegramTaskActionsOptions,
): TelegramAuthorizedHandler {
  const now = options.now ?? (() => new Date());
  const enqueue = createChatQueue();
  const secret = telegramInviteSecret(options.authSessionSecret);
  const drafts =
    options.draftStore ??
    new TelegramTaskDraftStore(options.config.root, options.config.cacheDir, now);
  const nonces =
    options.nonceLedger ??
    new TelegramActionNonceLedger(options.config.root, options.config.cacheDir, now);

  const reply = async (
    chatId: number | null,
    text: string,
    opts: TelegramSendOptions = {},
  ): Promise<void> => {
    if (chatId === null) return;
    try {
      await options.send(chatId, text, opts);
    } catch (error) {
      options.logger?.system("warn", "Telegram task-action reply failed", {
        chatId,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const sign = (kind: TelegramActionKind, ref: string): string =>
    signTelegramAction(secret!, { kind, ref, now: now() });

  const previewKeyboard = (nonce: string): InlineKeyboard => ({
    inline_keyboard: [
      [
        { text: "✅ Create", callback_data: sign("create", nonce) },
        { text: "✏️ Edit", callback_data: sign("edit", nonce) },
        { text: "✖️ Cancel", callback_data: sign("cancel", nonce) },
      ],
    ],
  });

  const editKeyboard = (nonce: string): InlineKeyboard => ({
    inline_keyboard: [
      [
        { text: "Title", callback_data: sign("edit-title", nonce) },
        { text: "Type", callback_data: sign("edit-type", nonce) },
        { text: "Priority", callback_data: sign("edit-priority", nonce) },
        { text: "Area", callback_data: sign("edit-area", nonce) },
      ],
    ],
  });

  const renderPreview = async (
    chatId: number,
    record: TelegramTaskDraftRecord,
    opts: TelegramSendOptions,
  ): Promise<void> => {
    if (!secret) {
      await reply(chatId, renderPreviewText(record.fields, record.attachments.length), opts);
      return;
    }
    await reply(chatId, renderPreviewText(record.fields, record.attachments.length), {
      ...opts,
      replyMarkup: previewKeyboard(record.nonce),
    });
  };

  const startPreview = async (
    update: TelegramUpdate,
    actor: TelegramActor,
    message: TelegramMessage,
  ): Promise<void> => {
    if (actor.role !== "admin") {
      audit(options.config.root, actor, TELEGRAM_AUDIT.taskCreateRefused, {
        outcome: "denied_role",
        chatId: message.chatId,
        chatType: message.chatType,
      });
      await reply(message.chatId, ROLE_REFUSAL, replyOptions(message, null));
      return;
    }
    if (!tryAcquireTelegramCreateLimits(actor.telegramUserId, message.chatId)) {
      audit(options.config.root, actor, TELEGRAM_AUDIT.taskCreateRefused, {
        outcome: "rate_limited",
        chatId: message.chatId,
      });
      await reply(
        message.chatId,
        "Creation rate limit reached — try again in a few minutes.",
        replyOptions(message, null),
      );
      return;
    }

    const proseFromArgs = message.commandArgs.join(" ").trim();
    const prose = proseFromArgs || repliedToText(update) || "";
    const descriptors = collectAttachmentDescriptors(update);

    if (!secret) {
      await reply(message.chatId, NO_SECRET, replyOptions(message, null));
      return;
    }

    if (!options.ops.downloadFile && descriptors.some((d) => !d.voice)) {
      await reply(
        message.chatId,
        "Attachments are unavailable on this instance — send the description as text.",
        replyOptions(message, null),
      );
      return;
    }

    // Validate every non-voice attachment by its bytes before showing a card.
    const attachments: TelegramDraftAttachmentRef[] = [];
    let voiceText = "";
    for (const descriptor of descriptors) {
      if (descriptor.voice) {
        if (!options.ops.downloadFile || !options.ops.transcribeVoice) {
          await reply(
            message.chatId,
            "Voice notes are not transcribed on this instance — send the description as text.",
            replyOptions(message, null),
          );
          return;
        }
        try {
          const { data } = await options.ops.downloadFile(descriptor.fileId, {
            maxBytes: MAX_ATTACHMENT_BYTES,
          });
          voiceText = (await options.ops.transcribeVoice(data, "audio/ogg")).trim();
        } catch (error) {
          await reply(
            message.chatId,
            `Could not transcribe that voice note: ${
              error instanceof Error ? error.message : String(error)
            }`,
            replyOptions(message, null),
          );
          return;
        }
        continue;
      }
      try {
        const { data } = await options.ops.downloadFile!(descriptor.fileId, {
          maxBytes: MAX_ATTACHMENT_BYTES,
        });
        const classified = classifyTelegramAttachment(data, { maxBytes: MAX_ATTACHMENT_BYTES });
        if (!classified.ok) {
          audit(options.config.root, actor, TELEGRAM_AUDIT.taskCreateRefused, {
            outcome: "attachment_rejected",
            error: classified.error,
            chatId: message.chatId,
          });
          await reply(message.chatId, classified.error, replyOptions(message, null));
          return;
        }
      } catch (error) {
        await reply(
          message.chatId,
          `Could not download that attachment: ${
            error instanceof Error ? error.message : String(error)
          }`,
          replyOptions(message, null),
        );
        return;
      }
      attachments.push({ fileId: descriptor.fileId, name: descriptor.name, voice: false });
    }

    const combinedProse = [prose, voiceText].filter(Boolean).join("\n\n").trim();
    const inferred = inferTaskDraft(combinedProse, {
      areas: options.areaVocabulary,
      defaultArea: options.defaultArea,
    });
    if (!inferred.ok) {
      await reply(message.chatId, inferred.question, replyOptions(message, null));
      return;
    }

    const record: TelegramTaskDraftRecord = {
      nonce: createTelegramActionNonce(),
      ownerTelegramUserId: actor.telegramUserId,
      chatId: message.chatId,
      messageThreadId: message.messageThreadId,
      fields: inferred.draft,
      attachments,
      awaitingField: null,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
    };
    drafts.save(record);
    await renderPreview(message.chatId, record, replyOptions(message, null));
  };

  const handleEditText = async (
    actor: TelegramActor,
    message: TelegramMessage,
  ): Promise<boolean> => {
    const pending = drafts.findAwaiting(actor.telegramUserId, message.chatId);
    if (!pending || pending.awaitingField === null) return false;
    const text = (message.text ?? "").trim();
    if (!text) return true;
    const field = pending.awaitingField;
    const result = applyDraftEdit(pending.fields, field, text, options.areaVocabulary);
    if (!result.ok) {
      await reply(message.chatId, result.error, replyOptions(message, null));
      await renderPreview(message.chatId, pending, replyOptions(message, null));
      return true;
    }
    pending.fields = result.draft;
    pending.awaitingField = null;
    pending.updatedAt = now().toISOString();
    drafts.save(pending);
    await renderPreview(message.chatId, pending, replyOptions(message, null));
    return true;
  };

  const requireAdmin = async (
    actor: TelegramActor,
    chatId: number | null,
    update: TelegramUpdate,
    kind: string,
  ): Promise<TelegramActor | null> => {
    // Re-resolve at press time — never trust the role the intake cached or the
    // renderer assumed. A demoted admin loses access on their next interaction.
    let liveRole = actor.role;
    try {
      const store = getAuthStore(options.config.root);
      const live = store?.isAvailable() ? resolveTelegramSender(store, actor.telegramUserId) : null;
      if (!live) {
        audit(options.config.root, actor, TELEGRAM_AUDIT.taskActionRefused, {
          outcome: "not_authorized",
          action: kind,
          chatId,
        });
        await reply(chatId, "This Telegram account is no longer linked to an allowlisted user.");
        return null;
      }
      liveRole = live.role;
    } catch {
      /* fall back to the intake's live resolution */
    }
    if (liveRole !== "admin") {
      audit(options.config.root, actor, TELEGRAM_AUDIT.taskActionRefused, {
        outcome: "denied_role",
        action: kind,
        chatId,
        updateKind: update.kind,
      });
      await reply(chatId, ROLE_REFUSAL);
      return null;
    }
    return { ...actor, role: "admin" };
  };

  const handleCallback = async (
    update: TelegramUpdate,
    actor: TelegramActor,
    callback: TelegramCallbackQuery,
  ): Promise<void> => {
    const chatId = callback.chatId;
    const opts = replyOptions(null, callback);
    const finish = async (text?: string): Promise<void> => {
      try {
        await options.answerCallback?.(callback.id, text);
      } catch {
        /* the spinner is cosmetic */
      }
    };

    if (!secret) {
      await reply(chatId, NO_SECRET, opts);
      await finish();
      return;
    }

    const verified = verifyTelegramAction(secret, callback.data, now());
    if (!verified.ok) {
      audit(options.config.root, actor, TELEGRAM_AUDIT.callbackRejected, {
        reason: verified.reason,
        chatId,
        telegramUserId: actor.telegramUserId,
      });
      await reply(
        chatId,
        verified.reason === "expired"
          ? "That button has expired — use a fresh notification or /newtask."
          : "That button is no longer valid. Start the action again.",
        opts,
      );
      await finish();
      return;
    }

    const live = await requireAdmin(actor, chatId, update, verified.payload.kind);
    if (!live) {
      await finish();
      return;
    }

    // Single-use: consume only after the presser proved they are still admin,
    // so a member's press cannot burn an admin's button.
    if (!nonces.consume(verified.payload.nonce, verified.payload.expiresAt)) {
      audit(options.config.root, actor, TELEGRAM_AUDIT.callbackRejected, {
        reason: "replay",
        action: verified.payload.kind,
        chatId,
      });
      await reply(chatId, "That button was already used. Use a fresh one.", opts);
      await finish();
      return;
    }

    const kind = verified.payload.kind;
    const ref = verified.payload.ref;

    if (kind === "create" || kind === "edit" || kind === "cancel" || kind.startsWith("edit-")) {
      const record = drafts.get(ref);
      if (!record) {
        await reply(chatId, "That preview has expired — start again with /newtask.", opts);
        await finish();
        return;
      }
      if (kind === "create") {
        if (!tryAcquireTelegramCreateLimits(actor.telegramUserId, record.chatId)) {
          audit(options.config.root, actor, TELEGRAM_AUDIT.taskCreateRefused, {
            outcome: "rate_limited",
            chatId: record.chatId,
          });
          await reply(record.chatId, "Creation rate limit reached — try again in a few minutes.");
          await finish();
          return;
        }
        const downloads: Array<{ name: string | null; bytes: Buffer }> = [];
        for (const attachment of record.attachments) {
          if (!options.ops.downloadFile) {
            await reply(chatId, "Attachments are unavailable on this instance.", opts);
            await finish();
            return;
          }
          try {
            const { data } = await options.ops.downloadFile(attachment.fileId, {
              maxBytes: MAX_ATTACHMENT_BYTES,
            });
            downloads.push({ name: attachment.name, bytes: data });
          } catch (error) {
            await reply(
              chatId,
              `Could not download an attachment, so nothing was created: ${
                error instanceof Error ? error.message : String(error)
              }`,
              opts,
            );
            await finish();
            return;
          }
        }
        const created = await options.ops.createTask(record.fields, downloads, actor);
        if (!created.ok) {
          audit(options.config.root, actor, TELEGRAM_AUDIT.taskCreateRefused, {
            outcome: "create_failed",
            error: created.error,
            chatId: record.chatId,
          });
          await reply(chatId, `Could not create the task: ${created.error}`, opts);
          await finish();
          return;
        }
        drafts.delete(ref);
        audit(options.config.root, actor, TELEGRAM_AUDIT.taskCreated, {
          taskId: created.task.id,
          title: created.task.title,
          type: created.task.type,
          priority: created.task.priority,
          area: created.task.area,
          images: created.imageCount,
          files: created.fileCount,
          chatId: record.chatId,
          chatType: callback.chatType,
        });
        const link = webLink(options, `/work?task=${created.task.id}`);
        await reply(
          chatId,
          `✅ Created #${created.task.id} — ${created.task.title}\n${link}`,
          opts,
        );
        await finish("Created");
        return;
      }
      if (kind === "cancel") {
        drafts.delete(ref);
        await reply(chatId, "Cancelled — nothing was created.", opts);
        await finish("Cancelled");
        return;
      }
      if (kind === "edit") {
        await reply(chatId, "Which field should I change?", {
          ...opts,
          replyMarkup: editKeyboard(ref),
        });
        await finish();
        return;
      }
      // edit-<field>
      if (record.ownerTelegramUserId !== actor.telegramUserId) {
        await reply(chatId, "Only the admin who started this preview can edit it.", opts);
        await finish();
        return;
      }
      const field = kind.slice("edit-".length) as DraftField;
      record.awaitingField = field;
      record.updatedAt = now().toISOString();
      drafts.save(record);
      await reply(chatId, editPrompt(field), opts);
      await finish();
      return;
    }

    // ── Lifecycle actions ──────────────────────────────────────────────────
    const canonical = canonicalTaskRef(ref);
    const task = canonical ? options.index.getTask(canonical) : null;
    if (!task) {
      await reply(chatId, `No task #${ref} in this repository.`, opts);
      await finish();
      return;
    }

    if (!tryAcquireTelegramActionLimits(actor.telegramUserId, chatId)) {
      audit(options.config.root, actor, TELEGRAM_AUDIT.taskActionRefused, {
        outcome: "rate_limited",
        action: kind,
        taskId: task.id,
        chatId,
      });
      await reply(chatId, "Action rate limit reached — try again in a few minutes.", opts);
      await finish();
      return;
    }

    if (kind === "done") {
      if (task.status !== "review") {
        await reply(
          chatId,
          `#${task.id} is '${task.status}' — only a review task can move to done.`,
          opts,
        );
        await finish();
        return;
      }
      // First tap starts NOTHING. The confirm card names exactly what a merge
      // would touch; a second, separate press is required.
      await reply(
        chatId,
        [
          "⚠️ Move to done — confirm merge",
          "",
          `Repository: ${options.repositoryName}`,
          `Task: #${task.id} — ${task.title}`,
          `Branch: ${task.branch || "(no branch)"}`,
          "",
          "This merges the branch into main and runs the close-out gate.",
        ].join("\n"),
        {
          ...opts,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: "✅ Confirm merge", callback_data: sign("confirm", task.id) },
                { text: "✖️ Cancel", callback_data: sign("cancel-done", task.id) },
              ],
            ],
          } satisfies InlineKeyboard,
        },
      );
      await finish();
      return;
    }

    if (kind === "cancel-done") {
      await reply(chatId, `Cancelled — #${task.id} is untouched.`, opts);
      await finish("Cancelled");
      return;
    }

    if (kind === "confirm" && task.status !== "review") {
      await reply(chatId, `#${task.id} is no longer in review — nothing was merged.`, opts);
      await finish();
      return;
    }

    let result: TelegramTaskActionResult;
    switch (kind) {
      case "start":
      case "resume":
        result = await options.ops.start(task, actor);
        break;
      case "pause":
        result = await options.ops.pause(task, actor);
        break;
      case "review":
        result = await options.ops.requestReview(task, actor);
        break;
      case "confirm":
        result = await options.ops.moveToDone(task, actor);
        break;
      default:
        result = { ok: false, message: "That action is not available." };
    }

    audit(
      options.config.root,
      actor,
      result.ok ? TELEGRAM_AUDIT.taskAction : TELEGRAM_AUDIT.taskActionRefused,
      {
        action: kind,
        taskId: task.id,
        outcome: result.ok ? "ok" : "failed",
        message: result.message,
        chatId,
        chatType: callback.chatType,
      },
    );
    await reply(chatId, result.message, opts);
    await finish(result.ok ? "Done" : "Failed");
  };

  return async (update, actor): Promise<boolean> => {
    if (update.callbackQuery) {
      const chatId = update.callbackQuery.chatId;
      if (chatId === null) {
        await handleCallback(update, actor, update.callbackQuery);
        return true;
      }
      await enqueue(chatId, () => handleCallback(update, actor, update.callbackQuery!));
      return true;
    }
    const message = update.message;
    if (!message || update.kind !== "message") return false;
    if (message.command === "newtask") {
      await enqueue(message.chatId, () => startPreview(update, actor, message));
      return true;
    }
    if (message.command !== null) return false;
    // Plain text: consumed only when it answers an Edit prompt. Returning the
    // verdict stops the chain from also sending the same text to guide chat.
    return await enqueue(message.chatId, () => handleEditText(actor, message));
  };
}
