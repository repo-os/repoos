import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

/**
 * #1264 — the task drawer's Changes, Review and Tokens tabs must show an error
 * (with a retry) when their best-effort load fails, not a "Loading…" line or
 * "no data yet" copy that never resolves. The loaders stay swallow-and-continue
 * so one endpoint can't break the board; this pins the bookkeeping they leave
 * behind for the drawer to read.
 */

type Loader = {
  kind: "diff" | "diff-stats" | "review" | "usage";
  path: string;
  load: (repo: ReturnType<typeof useRepoStore>, id: string) => Promise<unknown>;
  okBody: Record<string, unknown>;
};

const ID = "0042";
const LOADERS: Loader[] = [
  {
    kind: "diff",
    path: `/api/tasks/${ID}/diff`,
    load: (repo, id) => repo.loadDiff(id),
    okBody: { ok: true, diff: { patch: "", truncated: false } },
  },
  {
    kind: "diff-stats",
    path: `/api/tasks/${ID}/diff-stats`,
    load: (repo, id) => repo.loadDiffStats(id, { priority: true }),
    okBody: { ok: true, stats: { filesChanged: 1, additions: 2, deletions: 0 } },
  },
  {
    kind: "review",
    path: `/api/tasks/${ID}/review`,
    load: (repo, id) => repo.loadReview(id),
    okBody: { ok: true, running: false, enabled: true, review: null },
  },
  {
    kind: "usage",
    path: `/api/tasks/${ID}/stats`,
    load: (repo, id) => repo.loadTaskUsage(id),
    okBody: { ok: true, stats: null },
  },
];

/** Each failure shape a drawer load can meet: a non-ok JSON body, or no response at all. */
const FAILURES: Array<{ name: string; respond: () => Promise<Response> }> = [
  {
    name: "server error response",
    respond: async () =>
      new Response(JSON.stringify({ ok: false, error: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
  },
  {
    name: "not found response",
    respond: async () =>
      new Response(JSON.stringify({ error: "Task #0042 not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
  },
  {
    name: "network error",
    respond: async () => {
      throw new TypeError("Failed to fetch");
    },
  },
];

describe("drawer load failure bookkeeping (#1264)", () => {
  let served: Response | null = null;
  let thrown: Error | null = null;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (thrown) throw thrown;
        if (served) return served.clone();
        throw new Error("unexpected fetch: " + url);
      }),
    );
  });

  afterEach(() => {
    served = null;
    thrown = null;
    vi.unstubAllGlobals();
  });

  describe.each(LOADERS)("$kind", (loader) => {
    it.each(FAILURES)("is flagged as failed on a $name", async ({ respond }) => {
      try {
        served = await respond();
      } catch (err) {
        thrown = err as Error;
      }
      const repo = useRepoStore();
      await loader.load(repo, ID);
      await vi.waitFor(() => {
        expect(repo.drawerLoadFailedFor(loader.kind, ID)).toBe(true);
      });
    });

    it("clears the failure once a retry succeeds", async () => {
      served = new Response(JSON.stringify({ ok: false }), { status: 500 });
      const repo = useRepoStore();
      await loader.load(repo, ID);
      await vi.waitFor(() => {
        expect(repo.drawerLoadFailedFor(loader.kind, ID)).toBe(true);
      });

      served = new Response(JSON.stringify(loader.okBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
      await loader.load(repo, ID);
      await vi.waitFor(() => {
        expect(repo.drawerLoadFailedFor(loader.kind, ID)).toBe(false);
      });
    });

    it("is never flagged for a task that was never loaded", () => {
      expect(useRepoStore().drawerLoadFailedFor(loader.kind, ID)).toBe(false);
    });

    it("tracks failures per task", async () => {
      served = new Response(JSON.stringify({ ok: false }), { status: 500 });
      const repo = useRepoStore();
      await loader.load(repo, ID);
      await vi.waitFor(() => {
        expect(repo.drawerLoadFailedFor(loader.kind, ID)).toBe(true);
      });
      expect(repo.drawerLoadFailedFor(loader.kind, "0099")).toBe(false);
    });
  });
});
