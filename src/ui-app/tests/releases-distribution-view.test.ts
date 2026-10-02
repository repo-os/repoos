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
    expect(wrapper.text()).toContain("Cut next release");

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

describe("ReleasesView failure promotion + published-to loading (#0622)", () => {
  /** Mock every endpoint with a controllable latest-run outcome. */
  function mockWithRun(run: Record<string, unknown>): void {
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") return Promise.resolve(run);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  }

  const failedRun = {
    state: "failed",
    phase: "checking",
    message: "repoos check failed",
    startedAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:01:00Z",
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a loading indicator in Published to while the first lookup is in flight", async () => {
    // Never resolves: keeps distributionLoading true through the mount flush.
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution") return new Promise(() => {});
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
    const wrapper = await mountView();

    expect(wrapper.find(".rel-dist").exists()).toBe(true);
    expect(wrapper.find(".rel-dist-loading").exists()).toBe(true);
    expect(wrapper.find(".rel-dist-loading-spin").exists()).toBe(true);
    expect(wrapper.text()).toContain("Checking distribution channels");
    expect(wrapper.find(".rel-dist-channels").exists()).toBe(false);
    wrapper.unmount();
  });

  it("replaces the loading indicator with channels once they load", async () => {
    mockApi([channel()]);
    const wrapper = await mountView();

    expect(wrapper.find(".rel-dist-loading").exists()).toBe(false);
    expect(wrapper.find(".rel-dist-channels").exists()).toBe(true);
    expect(wrapper.text()).toContain("npm");
    wrapper.unmount();
  });

  it("promotes the failure outcome above Published to while it is unresolved", async () => {
    mockWithRun(failedRun);
    const wrapper = await mountView();

    const fail = wrapper.find(".rel-outcome--fail");
    const dist = wrapper.find(".rel-dist");
    expect(fail.exists()).toBe(true);
    expect(dist.exists()).toBe(true);
    // The failure section must precede the Published-to card in DOM order.
    expect(
      fail.element.compareDocumentPosition(dist.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(fail.text()).toContain("repoos check failed");
    wrapper.unmount();
  });

  it("clears the promoted failure once a later run succeeds", async () => {
    // The page loads while a release is in flight (poll alive), watches it
    // fail, watches the retry start, then watches it succeed.
    let run: Record<string, unknown> = {
      state: "running",
      phase: "checking",
      message: "Running checks…",
      startedAt: "2026-10-01T01:00:00Z",
      updatedAt: "2026-10-01T01:00:10Z",
    };
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") return Promise.resolve(run);
      // A notes draft in flight keeps the 1s tick alive across the failure.
      if (path === "/api/release/notes/run")
        return Promise.resolve({
          state: "running",
          startedAt: "2026-10-01T01:00:00Z",
          updatedAt: "2026-10-01T01:00:10Z",
          error: null,
          key: "k-notes",
          notes: null,
          sinceTag: "v1.2.3",
          commitCount: 3,
          truncated: false,
        });
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();

    // The watched run fails: the failure outcome is promoted.
    run = failedRun;
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);

    // A retry starts, then succeeds: the promotion ends and the success
    // outcome takes over in its normal place below Published to.
    run = {
      state: "running",
      phase: "pushing_tag",
      message: "Pushing tag…",
      startedAt: "2026-10-01T02:00:00Z",
      updatedAt: "2026-10-01T02:00:10Z",
    };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    run = {
      state: "succeeded",
      phase: "pushing_tag",
      message: "Released v1.2.4",
      startedAt: "2026-10-01T02:00:00Z",
      updatedAt: "2026-10-01T02:03:00Z",
    };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(false);
    const ok = wrapper.find(".rel-outcome--ok");
    expect(ok.exists()).toBe(true);
    expect(ok.text()).toContain("Released v1.2.4");
    const dist = wrapper.find(".rel-dist");
    expect(
      dist.element.compareDocumentPosition(ok.element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    wrapper.unmount();
  });
});
