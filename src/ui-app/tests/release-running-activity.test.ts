/**
 * #1089 — Releases page and cut drawer show ActivityIndicator while a release runs.
 */
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import * as apiMod from "../src/api";
import ReleasesView from "../src/views/ReleasesView.vue";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import { invalidatePageData } from "../src/composables/page-data-cache";

const api = vi.spyOn(apiMod, "api");

function releaseStatus(over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    supported: true,
    name: "Publish RepoOS",
    provider: "git-tag",
    branch: "main",
    version: "0.5.81",
    tag: "v0.5.81",
    latestTag: "v0.5.81",
    latestTagAt: "2026-11-01T00:00:00Z",
    latestTagSha: "abc1234",
    commitsBehindMain: 2,
    latestStableTag: "v0.5.81",
    head: "def5678",
    clean: true,
    onReleaseBranch: true,
    tagExists: false,
    released: false,
    ready: true,
    blockers: [],
    releaseUrl: null,
    workflowUrl: null,
    ...over,
  };
}

function idleRun() {
  return {
    state: "idle" as const,
    phase: null,
    message: "",
    startedAt: null,
    updatedAt: null,
  };
}

function mockReleaseApi(run: Record<string, unknown>) {
  api.mockImplementation((path: string) => {
    if (path === "/api/release") return Promise.resolve(releaseStatus());
    if (path === "/api/release/distribution")
      return Promise.resolve({ channels: [], releaseVersion: null, releaseTag: null });
    if (path === "/api/release/run") return Promise.resolve(run);
    if (path === "/api/release/notes") return Promise.resolve({ hasDraft: false });
    if (path === "/api/release/notes/run")
      return Promise.resolve({
        state: "idle",
        startedAt: null,
        updatedAt: null,
        error: null,
        key: null,
        notes: null,
        sinceTag: null,
        commitCount: 0,
        truncated: false,
      });
    if (path === "/api/release/email")
      return Promise.resolve({
        enabled: false,
        to: [],
        when: "published",
        includePrereleases: false,
        providerConfigured: false,
        repository: null,
        version: null,
        record: null,
      });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

async function mountReleases(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ReleasesView, {
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await flushPromises();
  return wrapper;
}

function countReleaseActivityIndicators(wrapper: VueWrapper): number {
  const pill = wrapper.find('[data-test-id="release-phase-pill"]');
  const cutOpen = wrapper.find('[data-test-id="cut-release-open"]');
  const heading = wrapper.find('[data-test-id="release-cut-progress-heading"]');
  let n = 0;
  for (const host of [pill, cutOpen, heading]) {
    if (host.exists()) n += host.findAllComponents(ActivityIndicator).length;
  }
  return n;
}

beforeEach(() => {
  invalidatePageData("release-status");
  invalidatePageData("release-distribution");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("ReleasesView running activity (#1089)", () => {
  it.each([
    ["idle", idleRun()],
    [
      "succeeded",
      {
        state: "succeeded",
        phase: "pushing_tag",
        message: "Released v0.5.82",
        startedAt: "2026-11-11T00:00:00Z",
        updatedAt: "2026-11-11T00:03:00Z",
      },
    ],
    [
      "failed",
      {
        state: "failed",
        phase: "checking",
        message: "check failed",
        startedAt: "2026-11-11T00:00:00Z",
        updatedAt: "2026-11-11T00:01:00Z",
      },
    ],
  ] as const)("shows no release activity indicators when the run is %s", async (_label, run) => {
    mockReleaseApi(run);
    const wrapper = await mountReleases();
    expect(countReleaseActivityIndicators(wrapper)).toBe(0);
    wrapper.unmount();
  });

  it("shows indicators on the pill, View progress, and cut drawer heading while running", async () => {
    mockReleaseApi({
      state: "running",
      phase: "checking",
      message: "Running checks…",
      startedAt: "2026-11-11T03:00:00.000Z",
      updatedAt: "2026-11-11T03:00:05.000Z",
    });
    const wrapper = await mountReleases();
    expect(wrapper.find('[data-test-id="release-phase-pill"]').attributes("data-phase")).toBe(
      "releasing",
    );
    expect(countReleaseActivityIndicators(wrapper)).toBe(2);

    const open = wrapper.get('[data-test-id="cut-release-open"]');
    open.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(wrapper.find('[data-test-id="release-cut-progress-heading"]').text()).toMatch(
      /Step 4 of 7/,
    );
    expect(countReleaseActivityIndicators(wrapper)).toBe(3);
    wrapper.unmount();
  });
});
