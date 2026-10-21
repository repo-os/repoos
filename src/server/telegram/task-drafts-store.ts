/**
 * Pending task previews for the Telegram creation flow (#0543).
 *
 * A preview commits nothing, so its fields must live somewhere between the
 * `/newtask` message and the Create/Edit presses. They are persisted under the
 * gitignored cache dir keyed by the preview nonce: a server reload should not
 * turn a half-reviewed card into a dead button, and the payload is not a task
 * (no markdown is written until Create).
 *
 * Drafts expire on the same short clock as the buttons. An expired draft is
 * pruned on the next read and its (already expired) tokens are refused.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DraftField, TaskDraftFields } from "./task-draft.js";

export const TELEGRAM_DRAFT_TTL_MS = 15 * 60 * 1000;

/** A Telegram file kept by reference until Create downloads it again. */
export interface TelegramDraftAttachmentRef {
  fileId: string;
  name: string | null;
  voice: boolean;
}

export interface TelegramTaskDraftRecord {
  nonce: string;
  ownerTelegramUserId: number;
  chatId: number;
  messageThreadId: number | null;
  fields: TaskDraftFields;
  /** Attachments supplied with the creation message (validated at preview). */
  attachments: TelegramDraftAttachmentRef[];
  /** Set when an Edit field was picked and the next text message is its value. */
  awaitingField: DraftField | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistedDrafts {
  version: 1;
  drafts: Record<string, TelegramTaskDraftRecord>;
}

export class TelegramTaskDraftStore {
  private readonly path: string;
  private readonly now: () => Date;

  constructor(root: string, cacheDir = ".repoos", now: () => Date = () => new Date()) {
    this.path = join(root, cacheDir, "telegram-task-drafts.json");
    this.now = now;
  }

  private load(): PersistedDrafts {
    if (!existsSync(this.path)) return { version: 1, drafts: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<PersistedDrafts>;
      if (!parsed?.drafts || typeof parsed.drafts !== "object") return { version: 1, drafts: {} };
      return { version: 1, drafts: parsed.drafts };
    } catch {
      return { version: 1, drafts: {} };
    }
  }

  private persist(state: PersistedDrafts): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  }

  private isExpired(record: TelegramTaskDraftRecord, nowMs: number): boolean {
    const updated = Date.parse(record.updatedAt);
    return !Number.isFinite(updated) || nowMs - updated > TELEGRAM_DRAFT_TTL_MS;
  }

  get(nonce: string): TelegramTaskDraftRecord | null {
    const state = this.load();
    const record = state.drafts[nonce];
    if (!record) return null;
    if (this.isExpired(record, this.now().getTime())) {
      delete state.drafts[nonce];
      this.persist(state);
      return null;
    }
    return record;
  }

  save(record: TelegramTaskDraftRecord): void {
    const state = this.load();
    const nowMs = this.now().getTime();
    for (const [nonce, existing] of Object.entries(state.drafts)) {
      if (this.isExpired(existing, nowMs)) delete state.drafts[nonce];
    }
    state.drafts[record.nonce] = record;
    this.persist(state);
  }

  update(
    nonce: string,
    mutate: (record: TelegramTaskDraftRecord) => void,
  ): TelegramTaskDraftRecord | null {
    const record = this.get(nonce);
    if (!record) return null;
    mutate(record);
    record.updatedAt = this.now().toISOString();
    this.save(record);
    return record;
  }

  delete(nonce: string): boolean {
    const state = this.load();
    if (state.drafts[nonce] === undefined) return false;
    delete state.drafts[nonce];
    this.persist(state);
    return true;
  }

  /** The draft waiting for this sender's next text message in this chat. */
  findAwaiting(ownerTelegramUserId: number, chatId: number): TelegramTaskDraftRecord | null {
    const state = this.load();
    const nowMs = this.now().getTime();
    for (const record of Object.values(state.drafts)) {
      if (this.isExpired(record, nowMs)) continue;
      if (
        record.ownerTelegramUserId === ownerTelegramUserId &&
        record.chatId === chatId &&
        record.awaitingField !== null
      ) {
        return record;
      }
    }
    return null;
  }
}
