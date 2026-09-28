/**
 * Telegram command rendering (#0540).
 *
 * Telegram caps a message at 4096 characters, and a task list can easily
 * exceed it. Everything here is in service of two rules from the task:
 *
 *  - A list never gets cut mid-item without saying so. Lists paginate with an
 *    explicit "Showing N–M of T", and `/tasks` accepts a page argument so the
 *    reader can fetch the rest.
 *  - Where content overlaps with the notification provider, reuse its
 *    `NotificationSpec` renderer rather than inventing a second format for the
 *    same facts.
 */
import type { NotificationSpec } from "../notifications/format.js";
import { formatNotification } from "../notifications/format.js";
import type { Task } from "../../core/types.js";

/** Telegram's hard message length cap. */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/** Items shown per page by default — keeps a page comfortably under the cap. */
export const DEFAULT_PAGE_SIZE = 8;

/** Longest rendered task line before the title is ellipsised. */
const ITEM_MAX_LENGTH = 110;

export interface TelegramPage<T> {
  items: T[];
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first item on this page (0 when empty). */
  from: number;
  /** 1-based index of the last item on this page (0 when empty). */
  to: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/** Slice `items` into a page, clamping an out-of-range page into range. */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): TelegramPage<T> {
  const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const current = Math.min(Math.max(1, requested || 1), pageCount);
  const start = (current - 1) * size;
  const slice = items.slice(start, start + size);
  const from = total === 0 ? 0 : start + 1;
  const to = start + slice.length;
  return {
    items: slice,
    page: current,
    pageCount,
    total,
    from,
    to,
    hasPrev: current > 1,
    hasNext: current < pageCount,
  };
}

/** "Showing 3–10 of 27", or "Nothing to show" when the list is empty. */
export function showingLine(page: TelegramPage<unknown>): string {
  if (page.total === 0) return "Nothing to show";
  return `Showing ${page.from}–${page.to} of ${page.total}`;
}

/** Collapse whitespace and ellipsise a single line to a bounded length. */
export function truncateLine(text: string, max: number = ITEM_MAX_LENGTH): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * A task's `NotificationSpec`-style one-liner — the same `headline · title`
 * string the notification provider sends, with the id prefixed for the board.
 */
export function taskLine(spec: NotificationSpec, task: Task): string {
  return truncateLine(formatNotification(spec, `#${task.id} ${task.title}`), ITEM_MAX_LENGTH);
}

/** `10:30Z` in UTC — a stable, compact timestamp for list lines. */
export function shortUtc(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return `${new Date(ms).toISOString().slice(11, 16)}Z`;
}

/**
 * Final safety net for a message that is still over Telegram's cap despite
 * item-level pagination. Truncates at a line boundary and says so explicitly —
 * a reader must never mistake clipped output for complete output.
 */
export function clampMessage(text: string, limit: number = TELEGRAM_MESSAGE_LIMIT): string {
  if (text.length <= limit) return text;
  const notice = "\n…message truncated at Telegram's length limit";
  const room = Math.max(1, limit - notice.length);
  let cut = text.slice(0, room);
  const lastBreak = cut.lastIndexOf("\n");
  if (lastBreak > room * 0.5) cut = cut.slice(0, lastBreak);
  return `${cut}${notice}`;
}
