/**
 * A page load must fetch /api/index once, not twice.
 *
 * init() fetches the index, then connectSSE()'s onopen fetched it again ~50ms
 * later — doubling the largest payload the app transfers (~1 MB at 200 tasks)
 * for data that could not have changed in the gap. The onopen refresh is still
 * required on RECONNECT, where missed events are never replayed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

/** Captures the EventSource so a test can drive onopen by hand. */
class CapturedEventSource {
  static last: CapturedEventSource | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    CapturedEventSource.last = this;
  }
  addEventListener(): void {}
  close(): void {}
}

function countIndexFetches(fetchMock: { mock: { calls: unknown[][] } }): number {
  return fetchMock.mock.calls.filter((c) => {
    const url = String(c[0]);
    return url.includes("/api/board") || url.includes("/api/index");
  }).length;
}

describe("index fetch de-duplication", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setActivePinia(createPinia());
    CapturedEventSource.last = null;
    vi.stubGlobal("EventSource", CapturedEventSource);
    fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (url.includes("/api/board") || url.includes("/api/index"))
          return { tasks: [], counts: EMPTY_COUNTS, taskCount: 0 };
        if (url.includes("/api/health")) return { ok: true, taskCount: 0, workDir: "work" };
        return { tasks: [] };
      },
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fetches the index once across init and the first SSE open", async () => {
    const repo = useRepoStore();
    await repo.init();
    expect(countIndexFetches(fetchMock)).toBe(1);

    CapturedEventSource.last?.onopen?.();
    await vi.waitFor(() => expect(CapturedEventSource.last).toBeTruthy());
    expect(countIndexFetches(fetchMock)).toBe(1);
  });

  it("still refreshes on a reconnect, where missed events are never replayed", async () => {
    const repo = useRepoStore();
    await repo.init();
    CapturedEventSource.last?.onopen?.(); // first open — skipped
    expect(countIndexFetches(fetchMock)).toBe(1);

    CapturedEventSource.last?.onopen?.(); // reconnect — must refresh
    await vi.waitFor(() => expect(countIndexFetches(fetchMock)).toBe(2));
  });

  it("refreshes on the first open when the connection was slow to establish", async () => {
    // The skip is only sound while init()'s fetch and the open are adjacent. A
    // slow connect means events could have been emitted and never replayed, so
    // the refresh must happen even though it is the first open.
    const repo = useRepoStore();
    await repo.init();
    expect(countIndexFetches(fetchMock)).toBe(1);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 10_000);
      CapturedEventSource.last?.onopen?.();
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(countIndexFetches(fetchMock)).toBe(2));
  });
});
