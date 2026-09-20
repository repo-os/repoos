/**
 * The top-bar Help ("?") affordance (#0378). A header control visible on every
 * route — deliberately not a `nav.ts` entry — opening a small support menu
 * (the in-app support flow, docs, GitHub Discussions and Issues) that dismisses
 * on click-outside and Escape.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import TopBar from "../src/components/TopBar.vue";
import { NAV, RELEASE_NAV, DEPLOYMENTS_NAV } from "../src/nav";

const stubs = { SearchBar: true };

function mountTopBar() {
  return mount(TopBar, { global: { stubs } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe("top-bar help menu", () => {
  it("renders a help trigger", () => {
    const wrapper = mountTopBar();
    const trigger = wrapper.find(".help-menu-trigger");

    expect(trigger.exists()).toBe(true);
    expect(trigger.attributes("aria-label")).toBe("Help and support");
    expect(trigger.attributes("aria-haspopup")).toBe("menu");
    expect(trigger.attributes("aria-expanded")).toBe("false");
  });

  it("opens on click with the local support flow and external help links", async () => {
    const wrapper = mountTopBar();
    await wrapper.find(".help-menu-trigger").trigger("click");
    await nextTick();

    const links = wrapper.findAll(".help-menu-link");
    expect(links).toHaveLength(4);
    expect(links.map((l) => l.text())).toEqual([
      "Get support",
      "Docs",
      "GitHub Discussions",
      "Report a bug",
    ]);

    expect(links[0].attributes("href")).toBe("/settings?tab=support");
    expect(links[0].attributes("target")).toBeUndefined();
    expect(links[1].attributes("href")).toBe("https://docs.repoos.org");
    expect(links[2].attributes("href")).toBe("https://github.com/repo-os/repoos/discussions");
    expect(links[3].attributes("href")).toBe("https://github.com/repo-os/repoos/issues/new/choose");

    for (const link of links.slice(1)) {
      expect(link.attributes("target")).toBe("_blank");
      expect(link.attributes("rel")).toBe("noopener noreferrer");
    }
  });

  it("sets aria-expanded on the trigger while open", async () => {
    const wrapper = mountTopBar();
    await wrapper.find(".help-menu-trigger").trigger("click");
    await nextTick();

    expect(wrapper.find(".help-menu-trigger").attributes("aria-expanded")).toBe("true");
  });

  it("closes on Escape", async () => {
    const wrapper = mountTopBar();
    await wrapper.find(".help-menu-trigger").trigger("click");
    await nextTick();
    expect(wrapper.find(".help-menu-popover").exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();

    expect(wrapper.find(".help-menu-popover").exists()).toBe(false);
  });

  it("closes on click outside", async () => {
    const wrapper = mountTopBar();
    await wrapper.find(".help-menu-trigger").trigger("click");
    await nextTick();
    expect(wrapper.find(".help-menu-popover").exists()).toBe(true);

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(wrapper.find(".help-menu-popover").exists()).toBe(false);
  });

  it("stays open when clicking inside the menu", async () => {
    const wrapper = mountTopBar();
    await wrapper.find(".help-menu-trigger").trigger("click");
    await nextTick();

    wrapper
      .find(".help-menu-popover")
      .element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await nextTick();

    expect(wrapper.find(".help-menu-popover").exists()).toBe(true);
  });

  it("is not exposed through nav.ts", () => {
    const navPaths = [...NAV, RELEASE_NAV, DEPLOYMENTS_NAV].map((n) => n.path);
    const navIds = [...NAV, RELEASE_NAV, DEPLOYMENTS_NAV].map((n) => n.id);

    expect(navPaths).not.toContain("/help");
    expect(navIds).not.toContain("help");
  });
});
