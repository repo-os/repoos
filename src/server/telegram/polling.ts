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
 *
 * Live gating: the loop holds `enabled()` (the `[telegram] enabled` master
 * switch, read live) and pauses — makes no Telegram calls — while it is
 * false, resuming within a tick when the switch returns. A transport is
 * therefore inert whenever the integration is disabled, including at boot
 * (the boot resume starts the loop regardless and relies on this gate, so a
 * later Settings flip needs no restart).
 */
import { DEFAULT_ALLOWED_UPDATES, TelegramApiError, type TelegramApiClient } from "./api.js";

export interface TelegramPollingOptions {
  api: TelegramApiClient;
  /** Receives every raw update and resolves when delivery has settled. */
  onRaw: (raw: unknown) => unknown | Promise<unknown>;
  /** Pointer persistence (kept across restarts in the connection record). */
  readPointer: () => number | null;
  writePointer: (lastUpdateId: number) => void;
  /** Seconds a single getUpdates call blocks for work (1–50; default 25). */
  pollTimeoutSeconds?: number;
  /** Live integration gate; false pauses the loop without tearing it down. */
  enabled?: () => boolean;
  /** Override for the paused re-check interval (tests shrink it). */
  pausedCheckMs?: number;
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
/** How often a paused loop re-checks the integration gate. */
const PAUSED_CHECK_MS = 1_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, ms);
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }
    function onAbort(): void {
      finish();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class TelegramPolling {
  private readonly api: TelegramApiClient;
  private readonly onRaw: (raw: unknown) => unknown | Promise<unknown>;
  private readonly readPointer: () => number | null;
  private readonly writePointer: (lastUpdateId: number) => void;
  private readonly pollTimeoutSeconds: number;
  private readonly enabled: () => boolean;
  private readonly pausedCheckMs: number;
  private readonly onError?: (message: string) => void;

  private running = false;
  private stopped = false;
  private loopPromise: Promise<void> | null = null;
  /** Serialized loop marker so start() after a race cannot double-run. */
  private starting = false;
  /** Aborts the in-flight getUpdates + pauses promptly on stop(). */
  private controller: AbortController | null = null;

  constructor(options: TelegramPollingOptions) {
    this.api = options.api;
    this.onRaw = options.onRaw;
    this.readPointer = options.readPointer;
    this.writePointer = options.writePointer;
    this.pollTimeoutSeconds = Math.min(50, Math.max(1, options.pollTimeoutSeconds ?? 25));
    this.enabled = options.enabled ?? (() => true);
    this.pausedCheckMs = Math.max(1, options.pausedCheckMs ?? PAUSED_CHECK_MS);
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
    this.controller = new AbortController();
    this.loopPromise = this.run().finally(() => {
      this.starting = false;
      this.running = false;
      this.controller = null;
      this.loopPromise = null;
    });
  }

  /**
   * Stop the loop promptly: aborts an in-flight getUpdates (which would
   * otherwise hold the stop for up to the full poll timeout) and wakes any
   * backoff/pause sleep, so callers never wait out a 25s request.
   */
  stop(): Promise<void> {
    this.stopped = true;
    this.running = false;
    const controller = this.controller;
    if (controller && !controller.signal.aborted) {
      try {
        controller.abort();
      } catch {
        /* abort is local; nothing to handle */
      }
    }
    if (this.loopPromise) return this.loopPromise.catch(() => undefined);
    return Promise.resolve();
  }

  private paused(): boolean {
    // A paused loop keeps running (and its pointer) — it just makes no
    // Telegram calls until the integration gate returns true.
    return !this.enabled();
  }

  private async run(): Promise<void> {
    // Long polling cannot run while a webhook is set; clear one we don't own.
    try {
      const info = await this.api.getWebhookInfo();
      if (info.url) await this.api.deleteWebhook(false);
    } catch (e) {
      if (this.stopped || !this.running) return;
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
      if (this.paused()) {
        await sleep(this.pausedCheckMs, this.controller?.signal);
        continue;
      }
      try {
        const pointerBefore = this.readPointer();
        const batched = await this.pollOnce();
        backoffMs = 0;
        // Idle between batches that make no pointer progress — an empty
        // response, or one whose ids are all at/below the offset we already
        // held (a non-advancing server must not turn this loop into a hot
        // spin that delivers the same updates at full speed).
        const maxId = batched.length ? Math.max(...batched) : null;
        const madeProgress = maxId !== null && maxId > (pointerBefore ?? Number.NEGATIVE_INFINITY);
        if (!madeProgress) {
          await sleep(IDLE_AFTER_BATCH_MS, this.controller?.signal);
        }
      } catch (e) {
        if (this.stopped || !this.running) return;
        if (e instanceof TelegramApiError && e.code === 401) {
          this.reportError(e, "polling stopped (bot token unauthorized)");
          return;
        }
        this.reportError(e, "polling");
        await sleep(backoffMs || INITIAL_BACKOFF_MS, this.controller?.signal);
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : INITIAL_BACKOFF_MS, MAX_BACKOFF_MS);
      }
    }
  }

  /**
   * One request → deliver raws through the provider → advance the pointer.
   * The pointer moves only after every delivery in the batch has settled, so
   * a crash mid-batch (or a delivery rejection) leaves the update for
   * Telegram to redeliver — at-least-once intake, never a silent drop.
   * Also usable directly by tests and by anyone wanting single-step polling.
   * Returns the update ids consumed (empty when Telegram had nothing new).
   */
  async pollOnce(): Promise<number[]> {
    const offset = this.readPointer();
    const raws = await this.api.getUpdates(
      {
        timeoutSeconds: this.pollTimeoutSeconds,
        allowedUpdates: DEFAULT_ALLOWED_UPDATES,
        ...(offset && offset > 0 ? { offset: offset + 1 } : {}),
      },
      // stop() aborts the in-flight long poll instead of waiting it out.
      this.controller?.signal ?? undefined,
    );
    const consumed: number[] = [];
    for (const raw of raws ?? []) {
      // Delivery awaits the provider's normalization + handler so the pointer
      // never publishes what the consumer has not yet settled.
      await this.onRaw(raw);
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
