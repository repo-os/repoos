/**
 * `/api/auth/me` must not hang the whole app on a stalled server (#1226).
 *
 * `loadMe()` is awaited by both the router guard and App's `onMounted`, so a
 * request that never answers used to block every page behind an endless
 * loading skeleton. The store now bounds the request and treats a timeout the
 * same as any other failure (auth off, app renders).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "../src/stores/auth";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A fetch that never answers — but honours an abort signal like the real one. */
function stallingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    });
  });
}

describe("auth store under a stalled /api/auth/me (#1226)", () => {
  it("gives up after the timeout instead of blocking every page forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", stallingFetch());
    setActivePinia(createPinia());
    const store = useAuthStore();

    const pending = store.loadMe();
    await vi.advanceTimersByTimeAsync(6_000);
    await pending;

    expect(store.loaded).toBe(true);
    expect(store.authEnabled).toBe(false);
    expect(store.authenticated).toBe(false);
  });

  it("still reads a normal response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ authEnabled: true, authenticated: true, email: "a@b.c", role: "admin" }),
      ),
    );
    setActivePinia(createPinia());
    const store = useAuthStore();

    await store.loadMe();

    expect(store.loaded).toBe(true);
    expect(store.authEnabled).toBe(true);
    expect(store.authenticated).toBe(true);
    expect(store.email).toBe("a@b.c");
  });

  it("a response that fails mid-read still leaves the app usable", async () => {
    // Connection drops after the headers: res.json() rejects.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ({
          json: () => Promise.reject(new Error("connection reset mid-read")),
        }) as unknown as Response,
      ),
    );
    setActivePinia(createPinia());
    const store = useAuthStore();

    await store.loadMe();

    expect(store.loaded).toBe(true);
    expect(store.authEnabled).toBe(false);
    expect(store.authenticated).toBe(false);
  });
});
