/**
 * Favorite design themes (#0255): the config store holds one favorites array
 * (capped at 3, persisted to localStorage["repoos.favoriteThemes"]) that both
 * the Settings theme list and the sidebar quick switcher render from.
 *
 * Covers the cap (a 4th star drops the oldest favorite to make room and says
 * so inline), star-order display, the empty-favorites fallback to the first
 * MAX_VISIBLE_THEMES catalog entries, reload persistence, and that starring
 * never changes the applied
 * uiTheme.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import {
  useConfigStore,
  MAX_FAVORITE_THEMES,
  MAX_VISIBLE_THEMES,
  DESIGN_THEMES,
} from "../src/stores/config";
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
  it("defaults to no favorites, so sidebarThemes falls back to the first catalog entries", async () => {
    const store = useConfigStore();
    expect(store.favoriteThemes).toEqual([]);
    expect(store.sidebarThemes.map((t) => t.id)).toEqual(
      DESIGN_THEMES.slice(0, MAX_VISIBLE_THEMES).map((t) => t.id),
    );
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

  it("starring a 4th theme drops the oldest star and states the cap", async () => {
    const store = useConfigStore();
    for (const id of ["classic", "clear", "gen z"]) {
      expect(store.toggleThemeFavorite(id)).toBe(true);
    }

    expect(store.toggleThemeFavorite("gruvbox")).toBe(true);

    // Oldest first out of the array, newest pick kept.
    expect(store.favoriteThemes).toEqual(["clear", "gen z", "gruvbox"]);
    expect(store.themeFavoritesNotice).toBe("Up to 3 favorites (dropped Classic)");
    expect(store.favoriteThemes).toHaveLength(MAX_FAVORITE_THEMES);
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual([
      "clear",
      "gen z",
      "gruvbox",
    ]);
  });

  it("drops only as many stars as it must when storage held more than the cap", () => {
    const store = useConfigStore();
    // Not reachable through the store (which trims on write), but it keeps the
    // eviction arithmetic honest if a future cap change or a stale page does it.
    store.favoriteThemes.push("classic", "clear", "gen z", "jelly", "gruvbox");

    expect(store.toggleThemeFavorite("hypercolor")).toBe(true);
    expect(store.favoriteThemes).toEqual(["jelly", "gruvbox", "hypercolor"]);
  });

  it("un-starring always works and clears the notice", async () => {
    const store = useConfigStore();
    for (const id of ["classic", "clear", "gen z"]) store.toggleThemeFavorite(id);
    store.toggleThemeFavorite("gruvbox"); // evicts classic, states the cap
    expect(store.themeFavoritesNotice).toBe("Up to 3 favorites (dropped Classic)");

    expect(store.toggleThemeFavorite("clear")).toBe(true);
    expect(store.themeFavoritesNotice).toBe("");
    expect(store.favoriteThemes).toEqual(["gen z", "gruvbox"]);
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
    expect(store.sidebarThemes).toHaveLength(MAX_VISIBLE_THEMES);
  });

  it("drops unknown ids, duplicates, and over-cap entries when loading", () => {
    localStorage.setItem(
      "repoos.favoriteThemes",
      JSON.stringify(["classic", "bogus", "classic", "clear", "gen z", "gruvbox", "jelly"]),
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
  it("shows the first catalog themes when nothing is starred (fallback)", async () => {
    useConfigStore();
    const wrapper = await mountSidebar();
    const labels = wrapper.findAll(".theme-switch button").map((b) => b.text());
    expect(labels).toEqual(DESIGN_THEMES.slice(0, MAX_VISIBLE_THEMES).map((t) => t.label));
    expect(labels).toHaveLength(MAX_VISIBLE_THEMES);
  });

  it("shows only the starred themes in star order", async () => {
    const store = useConfigStore();
    store.toggleThemeFavorite("gen z");
    store.toggleThemeFavorite("classic");
    const wrapper = await mountSidebar();
    const labels = wrapper.findAll(".theme-switch button").map((b) => b.text());
    expect(labels).toEqual(["Gen Z", "Classic"]);
  });

  it("falls back to the first catalog themes once every favorite is un-starred", async () => {
    const store = useConfigStore();
    store.toggleThemeFavorite("jelly");
    store.toggleThemeFavorite("jelly"); // un-star
    const wrapper = await mountSidebar();
    expect(wrapper.findAll(".theme-switch button")).toHaveLength(MAX_VISIBLE_THEMES);
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
    expect(rows).toHaveLength(DESIGN_THEMES.length);
    expect(
      rows.map((r) =>
        r
          .attributes("aria-label")
          ?.replace(/^Use the /, "")
          .replace(/ theme$/, ""),
      ),
    ).toEqual(DESIGN_THEMES.map((t) => t.label));
    expect(rows[2].find(".theme-active-badge").text()).toBe("active");
    expect(rows[2].classes()).toContain("current");
    expect(rows[2].find(".theme-active-badge").text()).toBe("active");
    expect(rows[0].find(".theme-active-badge").exists()).toBe(false);
  });

  it("stars render as toggles and persist; the 4th swaps out the oldest with feedback", async () => {
    await loadConfig();
    const wrapper = await mountSettings();
    const stars = wrapper.findAll(".theme-star");
    expect(stars).toHaveLength(DESIGN_THEMES.length);

    for (let i = 0; i < 3; i++) await stars[i].trigger("click");
    expect(wrapper.findAll(".theme-star.on")).toHaveLength(3);

    // 4th star: the oldest favorite gives way automatically, and the cap is
    // still stated rather than freeing the slot silently.
    await stars[3].trigger("click");
    expect(wrapper.findAll(".theme-star.on")).toHaveLength(3);
    const note = wrapper.find(".theme-fav-note");
    expect(note.exists()).toBe(true);
    expect(note.text()).toBe("Up to 3 favorites (dropped Classic)");
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual([
      "clear",
      "gen z",
      "jelly",
    ]);

    // un-star always works and clears the feedback
    await stars[1].trigger("click");
    expect(wrapper.findAll(".theme-star.on")).toHaveLength(2);
    expect(wrapper.find(".theme-fav-note").exists()).toBe(false);
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual([
      "gen z",
      "jelly",
    ]);
  });

  it("renders the themes section before other general preferences", async () => {
    await loadConfig();
    const wrapper = await mountSettings();
    const sectionLabels = wrapper
      .findAll(".sec-label")
      .map((el) => el.text().replace(/\s+/g, " ").trim());
    const themesIdx = sectionLabels.indexOf("Themes");
    const generalIdx = sectionLabels.indexOf("General");
    expect(themesIdx).toBeGreaterThanOrEqual(0);
    expect(generalIdx).toBeGreaterThan(themesIdx);
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

    // Nothing starred yet, so the switcher shows the first catalog themes.
    expect(sidebar.findAll(".theme-switch button")).toHaveLength(MAX_VISIBLE_THEMES);

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

describe("gruvbox design theme (#0503)", () => {
  it("is offered in the catalog and applies by setting data-ui-theme on <html>", async () => {
    const store = await loadConfig();
    const wrapper = await mountSettings();

    const gruvbox = wrapper
      .findAll(".theme-row")
      .find((r) => r.attributes("aria-label") === "Use the Gruvbox theme");
    expect(gruvbox).toBeDefined();

    await gruvbox!.trigger("click");
    await nextTick();

    expect(store.uiTheme).toBe("gruvbox");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("gruvbox");
    expect(document.documentElement.dataset.uiTheme).toBe("gruvbox");
  });

  it("can be starred like any other theme", async () => {
    const store = useConfigStore();
    expect(store.toggleThemeFavorite("gruvbox")).toBe(true);
    expect(store.sidebarThemes.map((t) => t.id)).toEqual(["gruvbox"]);
  });
});
