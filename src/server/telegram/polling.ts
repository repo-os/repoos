/**
 * Long-polling update transport (#0531).
 *
 * Drives Telegram's `getUpdates` in a single in-process loop and feeds every
 * raw payload to the provider's shared intake path, so polling and webhook
 * normalize identically and code above the adapter never learns which
 * transport produced an update.
 *
 * While a webhook is set, Telegram refuses `getUpdates` — the loop clears a
 * webhook it finds at start (without dropping pending updates) so switching
 * transports works without operator surgery.
 *
 * The loop is best-effort: network errors back off and retry; a 401 stops the
 * loop (the token was revoked) and surfaces the failure once. A update whose
 * payload cannot be normalized is acknowledged (offset advanced) and logged,
 * never re-tried forever — one malformed update must not poison the pointer.
 */
import { DEFAULT_ALLOWED_UPDATES, TelegramApiError, type TelegramApiClient } from "./api.js";

export interface TelegramPollingOptions {
  api: TelegramApiClient;
  /** Receives every raw update; the provider normalizes (shared with webhook). */
  onRaw: (raw: unknown) => void;
  /** Pointer persistence (kept across restarts in the connection record). */
  readPointer: () => number | null;
  writePointer: (lastUpdateId: number) => void;
  /** Seconds a single getUpdates call blocks for work (1–50; default 25). */
  pollTimeoutSeconds?: number;
  /** Error callback: receives an already-redacted string. */
  onError?: (message: string) => void;
}

const MAX_BACKOFF_MS = 10_000;
const INITIAL_BACKOFF_MS = 1_000;
/**
 * Brief pause between polls when a batch comes back empty. Telegram semantics
 * allow an immediate re-poll, but a hot loop on an idle bot burns a CPU core
 * and a test-fork's heap; a short idle keeps every failed/error batch pending
 * while staying responsive.
 */
const IDLE_AFTER_BATCH_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TelegramPolling {
  private readonly api: TelegramApiClient;
  private readonly onRaw: (raw: unknown) => void;
  private readonly readPointer: () => number | null;
  private readonly writePointer: (lastUpdateId: number) => void;
  private readonly pollTimeoutSeconds: number;
  private readonly onError?: (message: string) => void;

  private running = false;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  /** Serialized loop marker so start() after a race cannot double-run. */
  private starting = false;

  constructor(options: TelegramPollingOptions) {
    this.api = options.api;
    this.onRaw = options.onRaw;
    this.readPointer = options.readPointer;
    this.writePointer = options.writePointer;
    this.pollTimeoutSeconds = Math.min(50, Math.max(1, options.pollTimeoutSeconds ?? 25));
    this.onError = options.onError;
  }

  /** Whether the loop is running (started and not stopped). */
  isRunning(): boolean {
    return this.running;
  }

  /** Start the loop (idempotent). Fire-and-forget: callers don't await it. */
  start(): void {
    if (this.running || this.starting) return;
    this.starting = true;
    this.stopped = false;
    this.running = true;
    this.loopPromise = this.run().finally(() => {
      this.starting = false;
      this.running = false;
      this.loopPromise = null;
    });
  }

  /** Stop the loop and wait for the in-flight request to settle. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.running = false;
    if (this.loopPromise) await this.loopPromise.catch(() => undefined);
    this.loopPromise = null;
  }

  private async run(): Promise<void> {
    // Long polling cannot run while a webhook is set; clear one we don't own.
    try {
      const info = await this.api.getWebhookInfo();
      if (info.url) await this.api.deleteWebhook(false);
    } catch (e) {
      // Non-fatal: maybe it was already cleared (url arrives empty), but a
      // 401 means the token is dead — stop the loop rather than spin.
      this.reportError(e, "polling start");
      if (e instanceof TelegramApiError && e.code === 401) {
        this.running = false;
        return;
      }
    }

    let backoffMs = 0;
    while (this.running) {
      try {
        const batched = await this.pollOnce();
        backoffMs = 0;
        // Empty batch: brief idle before the next long-poll attempt.
        if (batched.length === 0) {
          await sleep(IDLE_AFTER_BATCH_MS);
        }
      } catch (e) {
        if (this.stopped || !this.running) return;
        if (e instanceof TelegramApiError && e.code === 401) {
          this.reportError(e, "polling stopped (bot token unauthorized)");
          return;
        }
        this.reportError(e, "polling");
        await sleep(backoffMs || INITIAL_BACKOFF_MS);
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : INITIAL_BACKOFF_MS, MAX_BACKOFF_MS);
      }
    }
  }

  /**
   * One request → deliver raws through the provider → advance the pointer.
   * Also usable directly by tests and by anyone wanting single-step polling.
   * Returns the update ids consumed (empty when Telegram had nothing new).
   */
  async pollOnce(): Promise<number[]> {
    const offset = this.readPointer();
    const raws = await this.api.getUpdates({
      timeoutSeconds: this.pollTimeoutSeconds,
      allowedUpdates: DEFAULT_ALLOWED_UPDATES,
      ...(offset && offset > 0 ? { offset: offset + 1 } : {}),
    });
    const consumed: number[] = [];
    for (const raw of raws ?? []) {
      // Delivery goes through the provider so both transports share normalization.
      this.onRaw(raw);
      const id = (raw as { update_id?: unknown } | null)?.update_id;
      if (typeof id === "number" && Number.isFinite(id)) consumed.push(id);
    }
    const maxId = consumed.length ? Math.max(...consumed) : null;
    if (maxId !== null) {
      this.writePointer(maxId);
    }
    return consumed;
  }

  private reportError(e: unknown, context: string): void {
    const text =
      e instanceof Error ? `${context}: ${e.name}: ${e.message}` : `${context}: ${String(e)}`;
    this.onError?.(text);
    console.error(`[telegram] ${text}`);
  }
}
