/**
 * Component coverage for the Releases page's "Published to" section (#0445):
 * it renders only when destinations are configured, shows each channel's
 * version/state, and copies every install command independently.
 */
import { createPinia } from "pinia";
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
  const wrapper = mount(ReleasesView, {
    attachTo: document.body,
    global: { plugins: [createPinia()] },
  });
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

  function button(root: ParentNode, text: string): HTMLButtonElement | null {
    return [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
  }

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

  it("keeps the promoted failure when the retry dialog is opened and closed", async () => {
    mockWithRun(failedRun);
    const wrapper = await mountView();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);

    button(document.body, "Cut next release")!.click();
    await flushPromises();
    // While the drawer is open the page banner yields to it, and under #0621
    // the drawer shows the still-unresolved failure inline — but the failure
    // must not be cleared: the promotion ends only when a release succeeds.
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(false);
    expect(document.querySelector(".release-drawer-error")?.textContent).toContain(
      "repoos check failed",
    );

    button(document.body, "Cancel")!.click();
    await flushPromises();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);
    expect(wrapper.text()).toContain("repoos check failed");
    wrapper.unmount();
  });

  it("shows the spinner alongside channels during a Check again recheck", async () => {
    let distributionCalls = 0;
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution") {
        distributionCalls += 1;
        // First lookup lands; the recheck never does.
        return distributionCalls === 1
          ? Promise.resolve({
              releaseVersion: "1.2.3",
              releaseTag: "v1.2.3",
              channels: [channel()],
            })
          : new Promise(() => {});
      }
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
    expect(wrapper.find(".rel-dist-loading").exists()).toBe(false);

    const checkAgain = wrapper
      .findAll("button")
      .find((b) => b.text() === "Check again")!
      .trigger("click");
    await checkAgain;
    await flushPromises();

    expect(wrapper.find(".rel-dist-loading").exists()).toBe(true);
    expect(wrapper.find(".rel-dist-channels").exists()).toBe(true);
    expect(wrapper.text()).toContain("npm");
    wrapper.unmount();
  });

  it("keeps the failure banner when a retry fails before a run is created", async () => {
    api.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/api/release" && opts?.method === "POST")
        return Promise.reject(new Error("git push rejected"));
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") return Promise.resolve(failedRun);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);

    button(document.body, "Cut next release")!.click();
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>("#rel-version")!;
    input.value = "1.2.4";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    const publish = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().startsWith("Publish"),
    )!;
    publish.click();
    await flushPromises();

    // The POST failed before a run existed. The dialog reports this attempt;
    // the page's status refresh must not clear the promoted failure.
    expect(document.querySelector(".release-drawer-error")?.textContent).toContain(
      "git push rejected",
    );
    button(document.body, "Cancel")!.click();
    await flushPromises();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);
    expect(wrapper.text()).toContain("git push rejected");
    wrapper.unmount();
  });

  it("ignores a stale run-poll response that arrives after a newer success", async () => {
    let resolveFirstPoll: ((v: Record<string, unknown>) => void) | undefined;
    let runCalls = 0;
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") {
        runCalls += 1;
        // The mount poll hangs; every later poll reports the success.
        if (runCalls === 1)
          return new Promise<Record<string, unknown>>((resolve) => {
            resolveFirstPoll = resolve;
          });
        return Promise.resolve({
          state: "succeeded",
          phase: "pushing_tag",
          message: "Released v1.2.4",
          startedAt: "2026-10-01T02:00:00Z",
          updatedAt: "2026-10-01T02:03:00Z",
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();

    // The 1s tick issues a newer poll while the first is still in flight; it
    // observes and applies the success.
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(wrapper.find(".rel-outcome--ok").exists()).toBe(true);

    // The hung first poll now lands with the older failure — it must be
    // dropped instead of resurrecting the failure banner.
    resolveFirstPoll?.(failedRun);
    await flushPromises();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(false);
    expect(wrapper.find(".rel-outcome--ok").exists()).toBe(true);
    expect(wrapper.find(".rel-outcome--ok").text()).toContain("Released v1.2.4");
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
      dist.element.compareDocumentPosition(ok.element) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    wrapper.unmount();
  });

  it("drops a pre-retry poll that resolves after the retry's run is accepted", async () => {
    // The review finding on #0622: a poll issued before Publish is clicked can
    // resolve after the retry's POST returns. The seq guard only orders polls
    // against each other — nothing invalidated a poll on retry — so the stale
    // response would otherwise overwrite the retry's running run with the prior
    // failure, clear the releasing flag, and stop polling, leaving the retry's
    // own outcome unobserved.
    let resolveStalePoll: ((v: Record<string, unknown>) => void) | undefined;
    let runCalls = 0;
    api.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/api/release" && opts?.method === "POST") {
        return Promise.resolve({
          run: {
            state: "running",
            phase: "checking",
            message: "Running checks…",
            startedAt: "2026-10-01T02:00:00Z",
            updatedAt: "2026-10-01T02:00:10Z",
          },
        });
      }
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") {
        runCalls += 1;
        // The mount poll reports the prior failure (applied as the first
        // observation — the failure banner is promoted).
        if (runCalls === 1) return Promise.resolve(failedRun);
        // The drawer-open re-sync poll (#0621) hangs — it is still in flight
        // when Publish is clicked.
        if (runCalls === 2)
          return new Promise<Record<string, unknown>>((resolve) => {
            resolveStalePoll = resolve;
          });
        // Every poll issued after the retry reports its success.
        return Promise.resolve({
          state: "succeeded",
          phase: "pushing_tag",
          message: "Released v1.2.4",
          startedAt: "2026-10-01T02:00:00Z",
          updatedAt: "2026-10-01T02:03:00Z",
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);

    // Publish while the drawer's re-sync poll is still in flight.
    button(document.body, "Cut next release")!.click();
    await flushPromises();
    expect(resolveStalePoll).toBeDefined();
    const input = document.querySelector<HTMLInputElement>("#rel-version")!;
    input.value = "1.2.4";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    const publish = [...document.body.querySelectorAll("button")].find((b) =>
      b.textContent?.trim().startsWith("Publish"),
    )!;
    publish.click();
    await flushPromises();

    // The retry's run was accepted: the dialog shows the release in progress.
    expect(document.querySelector(".release-progress")).not.toBeNull();
    // The stale pre-retry poll now lands with the prior failure — it must be
    // dropped instead of replacing the running state, clearing the releasing
    // flag, and stopping the poll loop.
    resolveStalePoll?.(failedRun);
    await flushPromises();
    expect(document.querySelector(".release-progress")).not.toBeNull();
    expect(document.querySelector(".release-drawer-error"))!.toBeNull();

    // Polling continued: the retry's own success is observed and applied.
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    const ok = wrapper.find(".rel-outcome--ok");
    expect(ok.exists()).toBe(true);
    expect(ok.text()).toContain("Released v1.2.4");
    wrapper.unmount();
  });

  /** A running notes draft keeps the 1s poll tick alive between run outcomes. */
  const notesRunning = {
    state: "running",
    startedAt: "2026-10-01T01:00:00Z",
    updatedAt: "2026-10-01T01:00:10Z",
    error: null,
    key: "k-notes",
    notes: null,
    sinceTag: "v1.2.3",
    commitCount: 3,
    truncated: false,
  };

  it("ignores a previous-run terminal poll that lands while the release POST is pending (#0622 review)", async () => {
    let resolvePost: ((v: Record<string, unknown>) => void) | undefined;
    let runCalls = 0;
    api.mockImplementation((path: string, opts?: { method?: string }) => {
      if (path === "/api/release" && opts?.method === "POST")
        return new Promise<Record<string, unknown>>((resolve) => {
          resolvePost = resolve;
        });
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") {
        runCalls += 1;
        // The mount poll and the drawer-open poll are still in flight, so the
        // 1s tick is alive when Publish is clicked (they are invalidated by
        // the click, but the tick keeps issuing fresh polls).
        if (runCalls <= 2) return new Promise<Record<string, unknown>>(() => {});
        // Polls issued while the POST is pending: the new run doesn't exist
        // yet, so they carry the PREVIOUS run's terminal snapshot.
        return Promise.resolve(failedRun);
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();

    button(document.body, "Cut next release")!.click();
    await flushPromises();
    const input = document.querySelector<HTMLInputElement>("#rel-version")!;
    input.value = "1.2.4";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    [...document.body.querySelectorAll("button")]
      .find((b) => b.textContent?.trim().startsWith("Publish"))!
      .click();
    await flushPromises();
    expect(resolvePost).toBeDefined();
    // `running` hides the version field (there is no run to show progress for
    // until the POST resolves).
    expect(document.querySelector("#rel-version")).toBeNull();

    // A tick fires while the POST is still pending and reads the previous
    // failed run. It must not flip the release off or re-enable Publish.
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(runCalls).toBeGreaterThan(2);
    expect(document.querySelector("#rel-version")).toBeNull();

    resolvePost?.({
      run: {
        state: "running",
        phase: "checking",
        message: "Running checks…",
        startedAt: "2026-10-01T02:00:00Z",
        updatedAt: "2026-10-01T02:00:10Z",
      },
    });
    await flushPromises();
    expect(document.querySelector(".release-progress")).not.toBeNull();
    wrapper.unmount();
  });

  it("clears the promoted failure when another client's whole run fits between two polls (#0622 review)", async () => {
    let run: Record<string, unknown> = failedRun;
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return Promise.resolve({
          releaseVersion: "1.2.3",
          releaseTag: "v1.2.3",
          channels: [channel()],
        });
      if (path === "/api/release/run") return Promise.resolve(run);
      if (path === "/api/release/notes/run") return Promise.resolve(notesRunning);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();
    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(true);

    // A different run starts and succeeds entirely between two polls, so this
    // page never observes it running — only a new terminal run replacing the
    // failed one.
    run = {
      state: "succeeded",
      phase: "pushing_tag",
      message: "Released v1.2.4",
      startedAt: "2026-10-01T03:00:00Z",
      updatedAt: "2026-10-01T03:03:00Z",
    };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(wrapper.find(".rel-outcome--fail").exists()).toBe(false);
    expect(wrapper.find(".rel-outcome--ok").text()).toContain("Released v1.2.4");
    wrapper.unmount();
  });

  it("ignores a superseded distribution lookup that settles after a newer one (#0622 review)", async () => {
    // The mount-time lookup is slow; a release that succeeds meanwhile starts a
    // second lookup. The older response must neither overwrite the newer
    // channels nor clear the loading indicator while the newer one is pending.
    const lookups: Array<(v: Record<string, unknown>) => void> = [];
    let run: Record<string, unknown> = {
      state: "running",
      phase: "checking",
      message: "Running checks…",
      startedAt: "2026-10-01T04:00:00Z",
      updatedAt: "2026-10-01T04:00:10Z",
    };
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return new Promise<Record<string, unknown>>((resolve) => lookups.push(resolve));
      if (path === "/api/release/run") return Promise.resolve(run);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();
    expect(lookups).toHaveLength(1);

    run = {
      state: "succeeded",
      phase: "pushing_tag",
      message: "Released v1.2.4",
      startedAt: "2026-10-01T04:00:00Z",
      updatedAt: "2026-10-01T04:03:00Z",
    };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(lookups).toHaveLength(2);

    const summary = (version: string) => ({
      releaseVersion: version,
      releaseTag: `v${version}`,
      channels: [channel({ version })],
    });
    // Newer lookup lands first, then the older one finishes last.
    lookups[1]!(summary("1.2.4"));
    await flushPromises();
    lookups[0]!(summary("1.2.3"));
    await flushPromises();

    expect(wrapper.find(".rel-dist-loading").exists()).toBe(false);
    expect(wrapper.find(".rel-dist").text()).toContain("1.2.4");
    expect(wrapper.find(".rel-dist").text()).not.toContain("1.2.3");
    wrapper.unmount();
  });

  it("keeps the loading indicator until the latest distribution lookup settles (#0622 review)", async () => {
    const lookups: Array<(v: Record<string, unknown>) => void> = [];
    let run: Record<string, unknown> = {
      state: "running",
      phase: "checking",
      message: "Running checks…",
      startedAt: "2026-10-01T04:00:00Z",
      updatedAt: "2026-10-01T04:00:10Z",
    };
    api.mockImplementation((path: string) => {
      if (path === "/api/release") return Promise.resolve(releaseStatus());
      if (path === "/api/release/distribution")
        return new Promise<Record<string, unknown>>((resolve) => lookups.push(resolve));
      if (path === "/api/release/run") return Promise.resolve(run);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    const wrapper = await mountView();
    run = { ...run, state: "succeeded", message: "Released v1.2.4" };
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(lookups).toHaveLength(2);

    // The OLDER lookup settles first: the newer one is still pending.
    lookups[0]!({ releaseVersion: "1.2.3", releaseTag: "v1.2.3", channels: [channel()] });
    await flushPromises();
    expect(wrapper.find(".rel-dist-loading").exists()).toBe(true);
    wrapper.unmount();
  });
});
