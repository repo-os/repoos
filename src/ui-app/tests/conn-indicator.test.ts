/**
 * The top-bar connection indicator (0205 → 0333 → debounce hotfix). Silence is
 * healthy: while connected — or still loading, or merely *connecting* — nothing
 * renders at all. The red "disconnected" pill appears only once the event
 * stream has a REAL, persistent error.
 *
 * The pill reads the store's debounced `streamDown` signal, not raw
 * `connected`. `connected` flips false the instant EventSource fires `onerror`,
 * which includes the pre-first-open window on every page load and every sub-3s
 * auto-reconnect — none of which are outages worth alarming about.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TopBar from "../src/components/TopBar.vue";
import { useRepoStore } from "../src/stores/repo";

const stubs = { SearchBar: true };

/** Mount the top bar with the store's startup flags forced to a known state. */
async function connPill(state: { loading: boolean; streamDown: boolean }) {
  const repo = useRepoStore();
  repo.loading = state.loading;
  repo.streamDown = state.streamDown;
  const wrapper = mount(TopBar, { global: { stubs } });
  await nextTick();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe("top-bar connection indicator", () => {
  it("renders nothing while the stream is up", async () => {
    const wrapper = await connPill({ loading: false, streamDown: false });

    expect(wrapper.find(".conn").exists()).toBe(false);
  });

  it("renders nothing during initial loading", async () => {
    const wrapper = await connPill({ loading: true, streamDown: false });

    expect(wrapper.find(".conn").exists()).toBe(false);
  });

  it("renders nothing while merely connecting — startup finished, stream not yet open", async () => {
    // The exact regression: `connected` is false here (no SSE `onopen` yet),
    // but that's not an outage — the debounced `streamDown` is still false.
    const repo = useRepoStore();
    repo.loading = false;
    repo.connected = false;
    repo.streamDown = false;
    const wrapper = mount(TopBar, { global: { stubs } });
    await nextTick();

    expect(wrapper.find(".conn").exists()).toBe(false);
  });

  it("shows a red disconnected pill once the stream is confirmed down", async () => {
    const wrapper = await connPill({ loading: false, streamDown: true });
    const conn = wrapper.find(".conn");

    expect(conn.exists()).toBe(true);
    expect(conn.classes()).toContain("offline");
    expect(conn.text()).toBe("offline");
    expect(conn.attributes("role")).toBe("status");
    expect(conn.attributes("aria-label")).toBe("Server is disconnected");
    expect(conn.attributes("title")).toBe("Server is disconnected");
  });

  it("styles the state it can render", async () => {
    const css = readFileSync(join(__dirname, "../src/style.css"), "utf8");

    const wrapper = await connPill({ loading: false, streamDown: true });
    expect(wrapper.find(".conn").classes()).toContain("offline");
    expect(css).toMatch(/\.conn\.offline\s*\{/);
  });
});

describe("streamDown debounce (repo store)", () => {
  let instances: FakeES[] = [];

  class FakeES {
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    addEventListener(): void {}
    close(): void {}
    constructor() {
      instances.push(this);
    }
  }

  beforeEach(() => {
    instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeES);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stays false through the initial connect window, then true only after a real, persistent error", async () => {
    const repo = useRepoStore();
    await repo.init();
    const es = instances.at(-1)!;

    // Connecting: no onopen, no onerror. Not an outage.
    expect(repo.streamDown).toBe(false);

    // A real stream error, but the browser reconnects inside the grace window.
    es.onerror?.();
    expect(repo.streamDown).toBe(false); // debounced
    vi.advanceTimersByTime(2000);
    es.onopen?.();
    vi.advanceTimersByTime(5000);
    expect(repo.streamDown).toBe(false); // reconnected — never surfaced

    // An error that does NOT recover within the grace window.
    es.onerror?.();
    expect(repo.streamDown).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(repo.streamDown).toBe(true);

    // Recovery clears it immediately.
    es.onopen?.();
    expect(repo.streamDown).toBe(false);
  });
});
