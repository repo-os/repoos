import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PAGE_DATA_MAX_AGE_MS,
  invalidatePageData,
  invalidatePageDataPrefix,
  refreshPageData,
} from "../src/composables/page-data-cache";

describe("page data cache", () => {
  beforeEach(() => {
    invalidatePageData("resource");
  });

  it("serves cached data immediately and refreshes it in place", async () => {
    const receive = vi.fn();
    await refreshPageData("resource", async () => "first", receive);
    const fetcher = vi.fn(async () => "updated");
    await refreshPageData("resource", fetcher, receive);
    expect(receive.mock.calls[1][0]).toBe("first");
    expect(receive.mock.calls[2][0]).toBe("updated");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not show cached data older than the max age, and refetches", async () => {
    vi.useFakeTimers();
    try {
      const receive = vi.fn();
      await refreshPageData("resource", async () => "old", receive);
      vi.setSystemTime(Date.now() + PAGE_DATA_MAX_AGE_MS + 1_000);
      const fresh = vi.fn();
      await refreshPageData("resource", async () => "new", fresh);
      expect(fresh).toHaveBeenCalledTimes(1);
      expect(fresh).toHaveBeenCalledWith("new");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never evicts an in-flight entry when the cache is over its size bound", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((r) => (resolve = r));
    const receive = vi.fn();
    const inflight = refreshPageData("inflight", () => pending, receive);
    for (let i = 0; i < 80; i += 1) {
      await refreshPageData(
        `filler-${i}`,
        async () => i,
        () => {},
      );
    }
    resolve("done");
    await inflight;
    expect(receive).toHaveBeenCalledWith("done");
    invalidatePageDataPrefix("filler-");
    invalidatePageData("inflight");
  });

  it("still shows data inside the max age", async () => {
    vi.useFakeTimers();
    try {
      const receive = vi.fn();
      await refreshPageData("resource", async () => "recent", receive);
      vi.setSystemTime(Date.now() + PAGE_DATA_MAX_AGE_MS - 1_000);
      const again = vi.fn();
      await refreshPageData("resource", async () => "newer", again);
      expect(again.mock.calls[0][0]).toBe("recent");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps stale data visible when refresh fails", async () => {
    const receive = vi.fn();
    const failed = vi.fn();
    await refreshPageData("resource", async () => "stale", receive);
    await refreshPageData(
      "resource",
      async () => {
        throw new Error("offline");
      },
      receive,
      failed,
    );
    expect(receive).toHaveBeenLastCalledWith("stale");
    expect(failed).toHaveBeenCalledWith(expect.any(Error));
  });

  it("shares a refresh already in flight", async () => {
    let resolve!: (value: string) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const a = refreshPageData("resource", fetcher, vi.fn());
    const b = refreshPageData("resource", fetcher, vi.fn());
    await Promise.resolve();
    resolve("shared");
    await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reserves a cached refresh before delivering stale data", async () => {
    await refreshPageData("resource", async () => "stale", vi.fn());
    const fetcher = vi.fn(async () => "fresh");
    let nested: Promise<void> | undefined;
    const outer = refreshPageData("resource", fetcher, () => {
      nested ??= refreshPageData("resource", fetcher, vi.fn());
    });
    await outer;
    await nested;
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not publish an in-flight response after invalidation", async () => {
    let resolve!: (value: string) => void;
    const oldFetcher = () =>
      new Promise<string>((done) => {
        resolve = done;
      });
    const oldReceive = vi.fn();
    const oldRequest = refreshPageData("resource", oldFetcher, oldReceive);
    await Promise.resolve();

    invalidatePageData("resource");
    const newReceive = vi.fn();
    await refreshPageData("resource", async () => "fresh", newReceive);
    resolve("outdated");
    await oldRequest;

    expect(oldReceive).not.toHaveBeenCalledWith("outdated");
    expect(newReceive).toHaveBeenLastCalledWith("fresh");
  });

  it("invalidates matching query variants by prefix", async () => {
    await refreshPageData("check-plan:default:", async () => "default", vi.fn());
    await refreshPageData("check-plan:fast:main", async () => "fast", vi.fn());
    invalidatePageDataPrefix("check-plan:");
    const receive = vi.fn();
    await refreshPageData("check-plan:default:", async () => "fresh", receive);
    expect(receive).toHaveBeenCalledWith("fresh");
  });
});
