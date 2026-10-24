import { beforeEach, describe, expect, it, vi } from "vitest";
import {
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
