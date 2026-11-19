/**
 * Recovery-banner retraction on stream frames (#1226, review round 1).
 *
 * The offline banner can be up while the SSE stream is still delivering
 * frames: any `api()` timeout raises it (`repoos:api-timeout` → `showOffline`)
 * without the stream ever dying. `clearOfflineOnStreamBack()` therefore runs
 * on BOTH "the stream is demonstrably up" paths — `onopen` and the per-frame
 * handler — or a board that visibly updates under a "server is offline"
 * banner contradicts itself until the user focuses or navigates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";
import { dismissRecovery, showOffline, uiRecoveryState } from "../src/lib/uiRecovery";

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

  emit(t: string, data: unknown): void {
    for (const fn of this.listeners.get(t) ?? []) fn({ data: JSON.stringify(data) });
  }

  close(): void {
    /* noop */
  }
}

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

beforeEach(() => {
  setActivePinia(createPinia());
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/tasks/queued")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + url);
    }),
  );
});

afterEach(() => {
  dismissRecovery();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offline banner clears on stream frames (#1226 review round 1)", () => {
  it("a frame arriving while the banner is up clears it, without onopen", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];
    expect(es).toBeDefined();

    // The banner is up (any api() timeout raises it) while the stream itself
    // is healthy — the exact contradictory state the review called out.
    showOffline("The RepoOS server did not respond in time.");
    expect(uiRecoveryState().kind).toBe("offline");

    es.emit("repo.status", { type: "repo.status", dirty: false });

    expect(uiRecoveryState().kind).toBeNull();
    // A frame also proves the stream healthy for the debounced indicator.
    expect(repo.streamDown).toBe(false);
  });

  it("is still a no-op for a stale-build banner", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = FakeEventSource.instances[0];

    showOffline("The RepoOS server did not respond in time.");
    // A stale-build banner has different truth conditions and must not be
    // dismissed by stream traffic.
    uiRecoveryState().kind = "stale";
    es.emit("repo.status", { type: "repo.status", dirty: false });

    expect(uiRecoveryState().kind).toBe("stale");
  });
});
