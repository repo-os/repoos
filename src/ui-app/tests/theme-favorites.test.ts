/**
 * Favorite design themes (#0255): the config store holds one favorites array
 * (capped at 3, persisted to localStorage["repoos.favoriteThemes"]) that both
 * the Settings theme list and the sidebar quick switcher render from.
 *
 * Covers the cap (4th star rejected with inline feedback, nothing silently
 * dropped), star-order display, the empty-favorites fallback to the full
 * catalog, reload persistence, and that starring never changes the applied
 * uiTheme.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useConfigStore, MAX_FAVORITE_THEMES } from "../src/stores/config";
import * as apiMod from "../src/api";
import type { ConfigField } from "../src/types";
import Sidebar from "../src/components/Sidebar.vue";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} as Record<string, string> }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function schemaField(key: string): ConfigField {
  return {
    key,
    label: key,
    type: "boolean",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: false,
    description: "",
    options: [],
  } as ConfigField;
}

const SCHEMA: ConfigField[] = [schemaField("maxActiveTasks"), schemaField("ntfyEnabled")];

function configResponse() {
  return { config: { maxActiveTasks: 3, ntfyEnabled: false }, schema: SCHEMA };
}

/** SettingsView only renders its body once config.load() has resolved. */
async function loadConfig() {
  api.mockResolvedValue(configResponse());
  const config = useConfigStore();
  await config.load();
  return config;
}

async function mountSidebar() {
  const wrapper = mount(Sidebar, { global: { stubs: { CanaryConfirmDialog: true } } });
  await nextTick();
  return wrapper;
}

async function mountSettings() {
  const wrapper = mount(SettingsView);
  await nextTick();
  await nextTick();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("config store favorites (#0255)", () => {
  it("defaults to no favorites, so sidebarThemes falls back to the full catalog in order", async () => {
    const store = useConfigStore();
    expect(store.favoriteThemes).toEqual([]);
    expect(store.sidebarThemes.map((t) => t.id)).toEqual(["classic", "clear", "gen z", "jelly"]);
  });

  it("starring adds themes in star order and persists to localStorage", async () => {
    const store = useConfigStore();
    await loadConfig();

    expect(store.toggleThemeFavorite("jelly")).toBe(true);
    expect(store.toggleThemeFavorite("classic")).toBe(true);

    expect(store.favoriteThemes).toEqual(["jelly", "classic"]);
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual([
      "jelly",
      "classic",
    ]);
  });

  it("sidebarThemes shows exactly the starred themes in star order", async () => {
    const store = useConfigStore();
    store.toggleThemeFavorite("gen z");
    store.toggleThemeFavorite("classic");
    expect(store.sidebarThemes.map((t) => t.id)).toEqual(["gen z", "classic"]);
  });

  it("starring a 4th theme is rejected with 'Up to 3 favorites' feedback and nothing is dropped", async () => {
    const store = useConfigStore();
    for (const id of ["classic", "clear", "gen z"]) {
      expect(store.toggleThemeFavorite(id)).toBe(true);
    }

    const before = [...store.favoriteThemes];
    expect(store.toggleThemeFavorite("jelly")).toBe(false);

    expect(store.favoriteThemes).toEqual(before);
    expect(store.themeFavoritesNotice).toBe("Up to 3 favorites");
    expect(store.favoriteThemes).toHaveLength(MAX_FAVORITE_THEMES);
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual(before);
  });

  it("un-starring always works, clears the notice, and frees a slot", async () => {
    const store = useConfigStore();
    for (const id of ["classic", "clear", "gen z"]) store.toggleThemeFavorite(id);
    expect(store.toggleThemeFavorite("jelly")).toBe(false);
    expect(store.themeFavoritesNotice).toBe("Up to 3 favorites");

    expect(store.toggleThemeFavorite("classic")).toBe(true);
    expect(store.themeFavoritesNotice).toBe("");
    expect(store.favoriteThemes).toEqual(["clear", "gen z"]);

    // The previously-blocked star now fits.
    expect(store.toggleThemeFavorite("jelly")).toBe(true);
    expect(store.favoriteThemes).toEqual(["clear", "gen z", "jelly"]);
  });

  it("starring/un-starring never changes the applied uiTheme", async () => {
    const store = useConfigStore();
    await loadConfig();
    await store.setUiTheme("jelly");

    store.toggleThemeFavorite("classic");
    store.toggleThemeFavorite("clear");
    store.toggleThemeFavorite("gen z");
    store.toggleThemeFavorite("classic"); // un-star

    expect(store.uiTheme).toBe("jelly");
    expect(store.form.uiTheme).toBe("jelly");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("jelly");
  });

  it("favorites survive a reload: a fresh store reads them back in star order", async () => {
    const first = useConfigStore();
    first.toggleThemeFavorite("jelly");
    first.toggleThemeFavorite("clear");

    setActivePinia(createPinia());
    const reloaded = useConfigStore();
    expect(reloaded.favoriteThemes).toEqual(["jelly", "clear"]);
    expect(reloaded.sidebarThemes.map((t) => t.id)).toEqual(["jelly", "clear"]);
  });

  it("corrupt localStorage yields empty favorites, not a crash", () => {
    localStorage.setItem("repoos.favoriteThemes", "not json");
    const store = useConfigStore();
    expect(store.favoriteThemes).toEqual([]);
    expect(store.sidebarThemes).toHaveLength(4);
  });

  it("drops unknown ids, duplicates, and over-cap entries when loading", () => {
    localStorage.setItem(
      "repoos.favoriteThemes",
      JSON.stringify(["classic", "bogus", "classic", "clear", "gen z", "jelly"]),
    );
    const store = useConfigStore();
    expect(store.favoriteThemes).toEqual(["classic", "clear", "gen z"]);
  });

  it("toggling an unknown theme id is a rejected no-op", () => {
    const store = useConfigStore();
    expect(store.toggleThemeFavorite("nope")).toBe(false);
    expect(store.favoriteThemes).toEqual([]);
    expect(store.themeFavoritesNotice).toBe("");
  });
});

describe("sidebar quick switcher (#0255)", () => {
  it("shows all four themes when nothing is starred (fallback)", async () => {
    useConfigStore();
    const wrapper = await mountSidebar();
    const labels = wrapper.findAll(".theme-switch button").map((b) => b.text());
    expect(labels).toEqual(["Classic", "Clear", "Gen Z", "Jelly"]);
  });

  it("shows only the starred themes in star order", async () => {
    const store = useConfigStore();
    store.toggleThemeFavorite("gen z");
    store.toggleThemeFavorite("classic");
    const wrapper = await mountSidebar();
    const labels = wrapper.findAll(".theme-switch button").map((b) => b.text());
    expect(labels).toEqual(["Gen Z", "Classic"]);
  });

  it("falls back to all themes once every favorite is un-starred", async () => {
    const store = useConfigStore();
    store.toggleThemeFavorite("jelly");
    store.toggleThemeFavorite("jelly"); // un-star
    const wrapper = await mountSidebar();
    expect(wrapper.findAll(".theme-switch button")).toHaveLength(4);
  });

  it("switching to a starred theme works and marks it active", async () => {
    const store = useConfigStore();
    await loadConfig();
    store.toggleThemeFavorite("clear");
    const wrapper = await mountSidebar();

    await wrapper.find(".theme-switch button").trigger("click");
    await nextTick();

    expect(store.uiTheme).toBe("clear");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("clear");
    const buttons = wrapper.findAll(".theme-switch button");
    expect(buttons[0].classes()).toContain("on");
  });
});

describe("settings theme list (#0255)", () => {
  it("renders a row per theme with the active one marked", async () => {
    await loadConfig();
    await useConfigStore().setUiTheme("gen z");
    const wrapper = await mountSettings();

    const rows = wrapper.findAll(".theme-row");
    expect(rows).toHaveLength(4);
    expect(
      rows.map((r) =>
        r
          .attributes("aria-label")
          ?.replace(/^Use the /, "")
          .replace(/ theme$/, ""),
      ),
    ).toEqual(["Classic", "Clear", "Gen Z", "Jelly"]);
    expect(rows[2].find(".theme-active-badge").text()).toBe("active");
    expect(rows[2].classes()).toContain("current");
    expect(rows[2].find(".theme-active-badge").text()).toBe("active");
    expect(rows[0].find(".theme-active-badge").exists()).toBe(false);
  });

  it("stars render as toggles and persist; the 4th is blocked with inline feedback", async () => {
    await loadConfig();
    const wrapper = await mountSettings();
    const stars = wrapper.findAll(".theme-star");
    expect(stars).toHaveLength(4);

    for (let i = 0; i < 3; i++) await stars[i].trigger("click");
    expect(wrapper.findAll(".theme-star.on")).toHaveLength(3);

    // 4th star attempt: blocked, visible feedback, nothing silently dropped
    await stars[3].trigger("click");
    expect(wrapper.findAll(".theme-star.on")).toHaveLength(3);
    const note = wrapper.find(".theme-fav-note");
    expect(note.exists()).toBe(true);
    expect(note.text()).toBe("Up to 3 favorites");

    // un-star always works and clears the feedback
    await stars[0].trigger("click");
    expect(wrapper.findAll(".theme-star.on")).toHaveLength(2);
    expect(wrapper.find(".theme-fav-note").exists()).toBe(false);
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual([
      "clear",
      "gen z",
    ]);
  });

  it("clicking a theme row applies it and moves the active badge", async () => {
    const store = await loadConfig();
    const wrapper = await mountSettings();

    await wrapper.findAll(".theme-row")[1].trigger("click");
    await nextTick();

    expect(store.uiTheme).toBe("clear");
    expect(wrapper.findAll(".theme-row")[1].classes()).toContain("current");
  });

  it("starring in settings updates the sidebar switcher through the shared store", async () => {
    const store = await loadConfig();
    const sidebar = await mountSidebar();
    const settings = await mountSettings();

    expect(sidebar.findAll(".theme-switch button")).toHaveLength(4);

    for (const i of [0, 1, 2]) await settings.findAll(".theme-star")[i].trigger("click");
    await nextTick();

    expect(store.favoriteThemes).toEqual(["classic", "clear", "gen z"]);
    expect(sidebar.findAll(".theme-switch button").map((b) => b.text())).toEqual([
      "Classic",
      "Clear",
      "Gen Z",
    ]);

    await settings.findAll(".theme-star")[2].trigger("click"); // un-star
    await nextTick();
    expect(sidebar.findAll(".theme-switch button").map((b) => b.text())).toEqual([
      "Classic",
      "Clear",
    ]);
  });
});
