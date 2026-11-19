/**
 * Live-update recovery after a dropped stream (#1244 QA pass).
 *
 * The SSE `onopen` handler refreshes the board index, because frames emitted
 * while the stream was down are never replayed. That refresh can fail (the
 * server is still answering slowly after a restart, or a request times out).
 * Before this fix the failure was swallowed: the board kept its pre-outage
 * counts and the "did not respond in time" error stayed up until some other
 * frame happened to arrive, which on a quiet repo is never. The refresh is now
 * retried with the same jittered backoff the stream uses, and a board that
 * finally loads also retracts the offline banner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";
import { showOffline, uiRecoveryState } from "../src/lib/uiRecovery";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
const READY_COUNTS = { ...EMPTY_COUNTS, ready: 3 };

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners.get(t) ?? [];
    list.push(fn);
    this.listeners.set(t, list);
  }

  close(): void {
    /* noop */
  }
}

/** Board responses in call order: `failures` board calls reject, then `counts` answer. */
let boardFailures = 0;
let boardCalls = 0;
let boardCounts = EMPTY_COUNTS;

function mockFetch(): void {
  const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({
          ok: true,
          root: "/tmp/repo",
          projectName: "repo",
          branch: null,
          taskCount: 0,
          workDir: "work",
        });
      if (url.includes("/api/board")) {
        boardCalls++;
        if (boardFailures > 0) {
          boardFailures--;
          throw new TypeError("network down");
        }
        return json({ tasks: [] as Task[], counts: boardCounts, taskCount: 0 });
      }
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      return json({});
    }),
  );
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  FakeEventSource.instances = [];
  boardFailures = 0;
  boardCalls = 0;
  boardCounts = EMPTY_COUNTS;
  vi.stubGlobal("EventSource", FakeEventSource);
  mockFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Let pending promise chains and timers settle. */
async function settle(ms = 0): Promise<void> {
  if (ms > 0) vi.advanceTimersByTime(ms);
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

/**
 * Boot the store, then wait out the init-reuse window so the next `onopen` is a
 * genuine reconnect (which always refreshes), not the first open that skips it.
 */
async function bootStore() {
  const repo = useRepoStore();
  await repo.init();
  await settle(5_000);
  return { repo, es: FakeEventSource.instances.at(-1)! };
}

describe("board refresh after an SSE reconnect", () => {
  it("retries a failed reconnect refresh until the board lands, with no further frame", async () => {
    const { repo, es } = await bootStore();

    // The reconnect's refresh fails (server still busy), then succeeds.
    boardCounts = READY_COUNTS;
    boardFailures = 1;
    const callsBefore = boardCalls;
    es.onopen?.();
    await settle();
    expect(boardCalls).toBe(callsBefore + 1);
    expect(repo.boardLoadError).not.toBeNull();
    expect(repo.counts.ready).toBe(0); // stale until the retry lands

    // No SSE frame arrives. The retry alone must catch the board up.
    await settle(2_000);
    expect(boardCalls).toBe(callsBefore + 2);
    expect(repo.boardLoadError).toBeNull();
    expect(repo.counts.ready).toBe(3);
  });

  it("a stream error cancels a pending retry; the next open refreshes once", async () => {
    const { repo, es } = await bootStore();

    boardFailures = 1;
    const callsBefore = boardCalls;
    es.onopen?.();
    await settle();
    expect(boardCalls).toBe(callsBefore + 1);

    // The stream drops before the retry fires: the retry must not run now.
    es.onerror?.();
    await settle(60_000);
    expect(boardCalls).toBe(callsBefore + 1);

    // The reconnect's own open refreshes exactly once.
    const next = FakeEventSource.instances.at(-1)!;
    expect(next).not.toBe(es);
    next.onopen?.();
    await settle();
    expect(boardCalls).toBe(callsBefore + 2);
  });

  it("a board that loads retracts an offline banner left by a timed-out refresh", async () => {
    const { repo, es } = await bootStore();

    // The stream is up, but a refresh timed out and raised the banner.
    es.onopen?.();
    showOffline("The RepoOS server did not respond in time — retry the request.");
    expect(uiRecoveryState().kind).toBe("offline");

    // The same timed-out refresh is retried; once it lands the banner clears.
    boardFailures = 1;
    const callsBefore = boardCalls;
    es.onopen?.();
    await settle();
    await settle(2_000);
    expect(boardCalls).toBeGreaterThanOrEqual(callsBefore + 2);
    expect(repo.boardLoadError).toBeNull();
    expect(uiRecoveryState().kind).toBeNull();
  });
});
