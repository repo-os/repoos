import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const task = (over: Partial<Task> = {}): Task =>
  ({
    id: "0001",
    title: "t",
    status: "active",
    branch: "feat/x",
    body: "preview only",
    extra: {},
    ...over,
  }) as Task;

interface Pending {
  url: string;
  resolve: (data: unknown) => void;
}

/** A fetch whose responses are released by the test, so ordering is observable. */
function deferredFetch(): { pending: Pending[]; urls: () => string[] } {
  const pending: Pending[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          pending.push({
            url,
            resolve: (data) => resolve({ ok: true, status: 200, json: async () => data }),
          });
        }),
    ),
  );
  return { pending, urls: () => pending.map((p) => p.url) };
}

const stats = { ok: true, stats: { filesChanged: 1, additions: 2, deletions: 3 } };

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("diff-stats request pool", () => {
  it("runs only a few card requests at a time and drains the rest as they finish", async () => {
    const f = deferredFetch();
    const repo = useRepoStore();
    for (let i = 1; i <= 10; i++) void repo.loadDiffStats(String(i).padStart(4, "0"));
    expect(f.pending).toHaveLength(3);
    f.pending[0].resolve(stats);
    await vi.waitFor(() => expect(f.pending).toHaveLength(4));
    expect(repo.diffStatsFor("0001")).toEqual(stats.stats);
  });

  it("lets the drawer's task jump ahead of queued card requests", async () => {
    const f = deferredFetch();
    const repo = useRepoStore();
    for (let i = 1; i <= 6; i++) void repo.loadDiffStats(String(i).padStart(4, "0"));
    void repo.loadDiffStats("0006", { priority: true });
    f.pending[0].resolve(stats);
    await vi.waitFor(() => expect(f.pending).toHaveLength(4));
    expect(f.urls()[3]).toBe("/api/tasks/0006/diff-stats");
  });

  it("does not queue the same task twice", () => {
    const f = deferredFetch();
    const repo = useRepoStore();
    for (let i = 0; i < 3; i++) void repo.loadDiffStats("0001");
    expect(f.pending).toHaveLength(1);
  });
});

describe("drawer full-task loading flag", () => {
  it("is set while the full task is fetched, then cleared and the task replaced", async () => {
    const f = deferredFetch();
    const ui = useUiStore();
    const opened = ui.openTask(task());
    expect(ui.active?.body).toBe("preview only");
    expect(ui.activeDetailLoading).toBe(true);
    f.pending[0].resolve(task({ body: "the full spec" }));
    await opened;
    expect(ui.activeDetailLoading).toBe(false);
    expect(ui.active?.body).toBe("the full spec");
  });

  it("clears the flag when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const ui = useUiStore();
    await ui.openTask(task());
    expect(ui.activeDetailLoading).toBe(false);
    expect(ui.active?.body).toBe("preview only");
  });

  it("clears the flag when the drawer is closed mid-fetch", async () => {
    const f = deferredFetch();
    const ui = useUiStore();
    const opened = ui.openTask(task());
    ui.close();
    expect(ui.activeDetailLoading).toBe(false);
    f.pending[0].resolve(task({ body: "late" }));
    await opened;
    expect(ui.active).toBeNull();
  });
});
