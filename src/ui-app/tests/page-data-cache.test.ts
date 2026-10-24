import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidatePageData, refreshPageData } from "../src/composables/page-data-cache";

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
    await refreshPageData("resource", async () => { throw new Error("offline"); }, receive, failed);
    expect(receive).toHaveBeenLastCalledWith("stale");
    expect(failed).toHaveBeenCalledWith(expect.any(Error));
  });

  it("shares a refresh already in flight", async () => {
    let resolve!: (value: string) => void;
    const fetcher = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const a = refreshPageData("resource", fetcher, vi.fn());
    const b = refreshPageData("resource", fetcher, vi.fn());
    resolve("shared");
    await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
