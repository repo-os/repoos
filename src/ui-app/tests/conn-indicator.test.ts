/**
 * The top-bar connection pill (0205). Startup must read as "loading", never as
 * a premature "offline", and every state it can render needs a CSS rule that
 * actually matches — a state whose class is never applied looks unstyled.
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
  return wrapper.find(".conn");
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe("top-bar connection indicator (0205)", () => {
  it("shows loading — not offline — while the app is still starting up", async () => {
    const conn = await connPill({ loading: true, connected: false });

    expect(conn.text()).toBe("loading");
    expect(conn.classes()).toContain("loading");
    expect(conn.classes()).not.toContain("offline");
    expect(conn.attributes("aria-label")).toBe("Server connection: loading");
  });

  it("shows offline only once startup finished without a connection", async () => {
    const conn = await connPill({ loading: false, connected: false });

    expect(conn.text()).toBe("offline");
    expect(conn.classes()).toContain("offline");
    expect(conn.attributes("aria-label")).toBe("Server connection: offline");
  });

  it("shows live once connected", async () => {
    const conn = await connPill({ loading: false, connected: true });

    expect(conn.text()).toBe("live");
    expect(conn.classes()).toContain("live");
  });

  it("styles every state it can render", async () => {
    const css = readFileSync(join(__dirname, "../src/style.css"), "utf8");

    for (const state of ["loading", "live", "offline"] as const) {
      const conn = await connPill({
        loading: state === "loading",
        connected: state === "live",
      });
      expect(conn.classes()).toContain(state);
      expect(css).toContain(`.conn.${state}{`);
    }
  });
});
