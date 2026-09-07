/**
 * The top-bar connection indicator (0205 → 0333). Silence is healthy: while
 * connected — or still loading — nothing renders at all; a red "disconnected"
 * pill appears only once startup finished without a connection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import TopBar from "../src/components/TopBar.vue";
import { useRepoStore } from "../src/stores/repo";

const stubs = { SearchBar: true };

/** Mount the top bar with the store's startup flags forced to a known state. */
async function connPill(state: { loading: boolean; connected: boolean }) {
  const repo = useRepoStore();
  repo.loading = state.loading;
  repo.connected = state.connected;
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

describe("top-bar connection indicator (0333)", () => {
  it("renders nothing while connected", async () => {
    const wrapper = await connPill({ loading: false, connected: true });

    expect(wrapper.find(".conn").exists()).toBe(false);
  });

  it("renders nothing during initial loading", async () => {
    const wrapper = await connPill({ loading: true, connected: false });

    expect(wrapper.find(".conn").exists()).toBe(false);
  });

  it("shows a red disconnected pill once startup finished without a connection", async () => {
    const wrapper = await connPill({ loading: false, connected: false });
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

    const wrapper = await connPill({ loading: false, connected: false });
    expect(wrapper.find(".conn").classes()).toContain("offline");
    expect(css).toMatch(/\.conn\.offline\s*\{/);
  });
});
