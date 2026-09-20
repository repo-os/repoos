/**
 * Component coverage for the Releases page's "Published to" section (#0445):
 * it renders only when destinations are configured, shows each channel's
 * version/state, and copies every install command independently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import * as apiMod from "../src/api";
import ReleasesView from "../src/views/ReleasesView.vue";

const api = vi.spyOn(apiMod, "api");

const origClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function releaseStatus() {
  return {
    enabled: true,
    supported: true,
    name: "Publish RepoOS",
    provider: "git-tag",
    branch: "main",
    version: "1.2.3",
    tag: "v1.2.3",
    latestTag: "v1.2.3",
    latestTagAt: "2026-09-01T00:00:00Z",
    latestTagSha: "abc1234",
    latestStableTag: "v1.2.3",
    head: "abc1234",
    clean: true,
    onReleaseBranch: true,
    tagExists: true,
    released: true,
    ready: false,
    blockers: ["v1.2.3 already exists."],
    releaseUrl: "https://github.com/repo-os/repoos/releases/tag/v1.2.3",
    workflowUrl: null,
  };
}

function channel(over: Partial<Record<string, unknown>> = {}) {
  return {
    name: "npm",
    kind: "npm",
    url: "https://www.npmjs.com/package/@repo-os/repoos",
    install: ["npm install -g @repo-os/repoos", "bun add -g @repo-os/repoos"],
    version: "1.2.3",
    state: "matching",
    detail: null,
    ...over,
  };
}

function mockApi(channels: ReturnType<typeof channel>[]) {
  api.mockImplementation((path: string) => {
    if (path === "/api/release") return Promise.resolve(releaseStatus());
    if (path === "/api/release/distribution")
      return Promise.resolve({ releaseVersion: "1.2.3", releaseTag: "v1.2.3", channels });
    if (path === "/api/release/run")
      return Promise.resolve({
        state: "idle",
        phase: null,
        message: "",
        startedAt: null,
        updatedAt: null,
      });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(ReleasesView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  if (origClipboard) Object.defineProperty(navigator, "clipboard", origClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("ReleasesView Published to (#0445)", () => {
  it("makes the current release and its distribution sync state the primary summary", async () => {
    mockApi([channel()]);
    const wrapper = await mountView();

    expect(wrapper.find(".rel-current-label").text()).toBe("Current release");
    expect(wrapper.find(".rel-current-number").text()).toBe("v1.2.3");
    expect(wrapper.find(".rel-current-sync").text()).toBe("All distribution destinations in sync");
    expect(wrapper.find(".rel-next-release strong").text()).toBe("v1.2.4");

    wrapper.unmount();
  });

  it("renders each configured channel with its install commands", async () => {
    mockApi([
      channel(),
      channel({
        name: "Homebrew",
        kind: "homebrew",
        url: "https://github.com/repo-os/homebrew-tap",
        install: ["brew install repo-os/tap/repoos"],
        version: "1.2.2",
        state: "out-of-sync",
        detail: "Channel is at 1.2.2; this release is 1.2.3.",
      }),
    ]);
    const wrapper = await mountView();
    const text = wrapper.text();
    expect(text).toContain("Published to");
    expect(text).toContain("npm");
    expect(text).toContain("Homebrew");
    expect(text).toContain("npm install -g @repo-os/repoos");
    expect(text).toContain("brew install repo-os/tap/repoos");
    expect(text).toContain("Up to date");
    expect(text).toContain("Out of sync");
    wrapper.unmount();
  });

  it("renders nothing when no destinations are configured", async () => {
    mockApi([]);
    const wrapper = await mountView();
    expect(wrapper.text()).not.toContain("Published to");
    wrapper.unmount();
  });

  it("rechecks downstream destinations on demand", async () => {
    mockApi([channel({ state: "unavailable", version: null, detail: "Not published yet" })]);
    const wrapper = await mountView();

    expect(api.mock.calls.filter(([path]) => path === "/api/release/distribution")).toHaveLength(1);
    const checkAgain = wrapper.findAll("button").find((button) => button.text() === "Check again");
    expect(checkAgain).toBeDefined();
    await checkAgain!.trigger("click");
    await flushPromises();
    expect(api.mock.calls.filter(([path]) => path === "/api/release/distribution")).toHaveLength(2);

    wrapper.unmount();
  });

  it("copies an individual install command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mockApi([channel()]);
    const wrapper = await mountView();

    const copyButtons = wrapper.findAll('button[aria-label="Copy npm install command"]');
    expect(copyButtons).toHaveLength(2);
    await copyButtons[1].trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith("bun add -g @repo-os/repoos");
    wrapper.unmount();
  });
});
