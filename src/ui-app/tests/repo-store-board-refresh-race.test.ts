import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function boardResponse(): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 }),
  } as Response;
}

function useDeferredBoardResponses(responses: Array<ReturnType<typeof deferred<Response>>>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      const next = responses.shift();
      if (!next) throw new Error("unexpected fetch");
      return next.promise;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("board refresh request ordering", () => {
  it("does not let a late failure from an older request undo a successful retry", async () => {
    setActivePinia(createPinia());
    const older = deferred<Response>();
    const retry = deferred<Response>();
    useDeferredBoardResponses([older, retry]);
    const repo = useRepoStore();
    repo.boardLoadError = "Previous failure";

    const olderRefresh = repo.refresh();
    const retryRefresh = repo.refresh();
    retry.resolve(boardResponse());
    await retryRefresh;
    expect(repo.boardLoadError).toBeNull();

    older.reject(new TypeError("network offline"));
    await expect(olderRefresh).rejects.toThrow("Can't reach the RepoOS server");
    expect(repo.boardLoadError).toBeNull();
  });

  it("does not let a late success from an older request clear the latest failure", async () => {
    setActivePinia(createPinia());
    const older = deferred<Response>();
    const latest = deferred<Response>();
    useDeferredBoardResponses([older, latest]);
    const repo = useRepoStore();

    const olderRefresh = repo.refresh();
    const latestRefresh = repo.refresh();
    latest.reject(new TypeError("network offline"));
    await expect(latestRefresh).rejects.toThrow("Can't reach the RepoOS server");
    const latestError = repo.boardLoadError;
    expect(latestError).toContain("Can't reach the RepoOS server");

    older.resolve(boardResponse());
    await olderRefresh;
    expect(repo.boardLoadError).toBe(latestError);
  });
});
