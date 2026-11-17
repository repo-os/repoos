// @vitest-environment jsdom
/**
 * Mobile Hub logo affordance and project-name visibility (#1152).
 *
 * In the native Hub the top-left RepoOS mark is the one-action route back to
 * the server picker. In a normal browser that token is absent, so the mark
 * stays decorative. The phone bar also keeps the current project name visible
 * while search collapses to an icon.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import TopBar from "../src/components/TopBar.vue";

const hub = vi.hoisted(() => ({
  session: null as { origin: string; token: string } | null,
  returnTo: vi.fn<(session: { origin: string; token: string }) => void>(),
}));

vi.mock("../src/lib/hub-shell", () => ({
  readHubShellSession: () => hub.session,
  returnToHubServerPicker: (session: { origin: string; token: string }) => hub.returnTo(session),
}));

function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function mountTopBar() {
  return mount(TopBar, { global: { stubs: { SearchBar: true } } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  hub.session = null;
  hub.returnTo.mockReset();
  stubMatchMedia(false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe("top-bar hub return", () => {
  it("is inert in a normal browser", () => {
    const wrapper = mountTopBar();
    expect(wrapper.find('[data-testid="hub-return-to-picker"]').exists()).toBe(false);
    expect(wrapper.find(".logo-trigger").exists()).toBe(false);
    // The mark itself is still rendered, just not as a control.
    expect(wrapper.find(".logo-mark").exists()).toBe(true);
  });

  it("turns the logo into the one-action return in the native Hub", async () => {
    hub.session = { origin: "https://repo.example.com", token: "a".repeat(32) };
    const wrapper = mountTopBar();
    const trigger = wrapper.find('[data-testid="hub-return-to-picker"]');

    expect(trigger.exists()).toBe(true);
    expect(trigger.attributes("aria-label")).toBe("Return to RepoOS Hub server picker");
    expect(trigger.element.tagName).toBe("BUTTON");

    await trigger.trigger("click");
    expect(hub.returnTo).toHaveBeenCalledOnce();
    expect(hub.returnTo).toHaveBeenCalledWith(hub.session);
  });
});

describe("top-bar project name", () => {
  it("shows the current project name on a narrow screen", async () => {
    stubMatchMedia(true);
    const { useRepoStore } = await import("../src/stores/repo");
    const repo = useRepoStore();
    repo.health = {
      projectName: "celleris",
      branch: "feat/mobile-hub-return-to-server-picker-from-",
    } as never;

    const wrapper = mountTopBar();
    await nextTick();

    const text = wrapper.find(".repo-pill-text");
    expect(text.exists()).toBe(true);
    expect(text.text()).toBe("celleris");
    expect(wrapper.find(".repo-pill").attributes("aria-label")).toBe("Repo colour · celleris");
  });

  it("keeps the branch affordance on desktop", async () => {
    stubMatchMedia(false);
    const { useRepoStore } = await import("../src/stores/repo");
    const repo = useRepoStore();
    repo.health = {
      projectName: "celleris",
      branch: "feat/mobile-hub-return-to-server-picker-from-",
    } as never;

    const wrapper = mountTopBar();
    await nextTick();

    expect(wrapper.find(".repo-pill-text").text()).toContain("celleris × ");
  });
});
