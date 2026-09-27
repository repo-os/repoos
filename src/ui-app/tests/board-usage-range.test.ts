import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const BOARD_USAGE_RANGE_KEY = "repoos.board.usageRange";

function mockBoardUsageFetch(): void {
  const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/stats/board")) {
        return json({
          ok: true,
          stats: { totalSessions: 0, totalCostUsd: 0, roles: [], days: [] },
        });
      }
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

describe("board usage range persistence (#0554)", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mockBoardUsageFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to 7d when storage is empty", () => {
    const repo = useRepoStore();
    expect(repo.boardUsageRange).toBe("7d");
    expect(localStorage.getItem(BOARD_USAGE_RANGE_KEY)).toBeNull();
  });

  it("persists a selection and restores it on a fresh store instance", async () => {
    const repo = useRepoStore();
    await repo.loadBoardUsage("30d");
    expect(localStorage.getItem(BOARD_USAGE_RANGE_KEY)).toBe("30d");

    setActivePinia(createPinia());
    const restored = useRepoStore();
    expect(restored.boardUsageRange).toBe("30d");
  });

  it("falls back to 7d for invalid stored values", () => {
    localStorage.setItem(BOARD_USAGE_RANGE_KEY, "not-a-range");
    setActivePinia(createPinia());
    expect(useRepoStore().boardUsageRange).toBe("7d");

    localStorage.setItem(BOARD_USAGE_RANGE_KEY, JSON.stringify("1d"));
    setActivePinia(createPinia());
    expect(useRepoStore().boardUsageRange).toBe("7d");
  });

  it("refetches the current range without rewriting storage on retry", async () => {
    const repo = useRepoStore();
    await repo.loadBoardUsage("1d");
    expect(localStorage.getItem(BOARD_USAGE_RANGE_KEY)).toBe("1d");

    localStorage.removeItem(BOARD_USAGE_RANGE_KEY);
    await repo.loadBoardUsage();
    expect(repo.boardUsageRange).toBe("1d");
    expect(localStorage.getItem(BOARD_USAGE_RANGE_KEY)).toBeNull();

    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/api/stats/board"));
    expect(String(call?.[0])).toContain("range=1d");
  });

  it("initial fetch uses the restored range, not a hardcoded default", async () => {
    localStorage.setItem(BOARD_USAGE_RANGE_KEY, "all");
    setActivePinia(createPinia());
    const repo = useRepoStore();
    expect(repo.boardUsageRange).toBe("all");

    await repo.loadBoardUsage();
    const call = vi.mocked(fetch).mock.calls.find((c) => String(c[0]).includes("/api/stats/board"));
    expect(String(call?.[0])).toContain("range=all");
  });
});
