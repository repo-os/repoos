/**
 * Component-level coverage for the redesigned Deployments page (#0365):
 * grouping [[deployments]] rows into a services × branches matrix, and the
 * new "vs local main" sync label that replaces the raw ↑/↓-vs-own-origin
 * chips. The server-side computation itself is covered in deployments.test.ts
 * — this file is about the view correctly rendering what the API returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import * as apiMod from "../src/api";
import DeploymentsView from "../src/views/DeploymentsView.vue";

const api = vi.spyOn(apiMod, "api");

function status(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    enabled: true,
    dirty: false,
    currentBranch: "main",
    root: "/repo",
    rows: [
      {
        name: "Landing page (prod)",
        service: "Landing page",
        branch: "prod",
        provider: "cloudflare-workers",
        url: "https://repoos.org",
        dashboardUrl: null,
        subdir: "landing",
        lastPushAt: "2026-09-15T00:00:00Z",
        lastPushSha: "abc1234",
        changesVsMain: null,
      },
      {
        name: "Landing page (dev)",
        service: "Landing page",
        branch: "main",
        provider: "cloudflare-workers",
        url: "https://main-landing.example.workers.dev",
        dashboardUrl: null,
        subdir: "landing",
        lastPushAt: "2026-09-15T01:00:00Z",
        lastPushSha: "def5678",
        changesVsMain: null,
      },
      {
        name: "Docs (prod)",
        service: "Docs",
        branch: "prod",
        provider: "cloudflare-workers",
        url: "https://docs.repoos.org",
        dashboardUrl: null,
        subdir: "user-docs",
        lastPushAt: null,
        lastPushSha: null,
        changesVsMain: null,
      },
    ],
    branches: [
      {
        branch: "prod",
        ahead: 0,
        behind: 0,
        hasOrigin: true,
        localExists: true,
        ffFrom: "main",
        mainSync: { state: "behind", aheadOfMain: 0, behindMain: 5 },
      },
      {
        branch: "main",
        ahead: 2,
        behind: 0,
        hasOrigin: true,
        localExists: true,
        ffFrom: null,
        mainSync: { state: "same", aheadOfMain: 0, behindMain: 0 },
      },
    ],
    ...overrides,
  };
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(DeploymentsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
});

describe("DeploymentsView matrix (#0365)", () => {
  it("groups rows by service into one matrix row per service, not per (service, branch) pair", async () => {
    api.mockResolvedValue(status());
    const wrapper = await mountView();
    const serviceNames = wrapper.findAll(".dep-service-name").map((n) => n.text());
    expect(serviceNames).toEqual(["Landing page", "Docs"]);
    wrapper.unmount();
  });

  it("renders one branch column header per configured branch", async () => {
    api.mockResolvedValue(status());
    const wrapper = await mountView();
    expect(wrapper.findAll(".dep-matrix-colhead").map((n) => n.text())).toEqual(["prod", "main"]);
    wrapper.unmount();
  });

  it("leaves a cell empty with an honest placeholder when a service isn't deployed on a branch", async () => {
    api.mockResolvedValue(status());
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("not deployed on main");
    wrapper.unmount();
  });

  it("shows the deployed URL and 'Latest branch change' wording per cell, not 'last push'", async () => {
    api.mockResolvedValue(status());
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("main-landing.example.workers.dev");
    expect(wrapper.text()).toContain("Latest branch change");
    expect(wrapper.text()).not.toContain("last push");
    wrapper.unmount();
  });

  it("labels a service row with no commits yet honestly, without a fabricated timestamp", async () => {
    api.mockResolvedValue(status());
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("no commits yet");
    wrapper.unmount();
  });
});

describe("DeploymentsView per-service vs-main breakdown (#0367)", () => {
  it("shows 0 of N when the branch is behind but none of it touches this service", async () => {
    // Reproduces the live-reported case: the branch card says "17 commits
    // behind main," but none of them touch this service's subdir.
    api.mockResolvedValue(
      status({
        rows: [
          {
            name: "Landing page (prod)",
            service: "Landing page",
            branch: "prod",
            provider: "cloudflare-workers",
            url: "https://repoos.org",
            dashboardUrl: null,
            subdir: "landing",
            lastPushAt: "2026-09-15T00:00:00Z",
            lastPushSha: "abc1234",
            changesVsMain: { aheadOfMain: 0, behindMain: 0 },
          },
        ],
        branches: [
          {
            branch: "prod",
            ahead: 0,
            behind: 0,
            hasOrigin: true,
            localExists: true,
            ffFrom: "main",
            mainSync: { state: "behind", aheadOfMain: 0, behindMain: 17 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("17 commits behind main"); // the branch card
    expect(wrapper.text()).toContain("0 of 17 behind-main commits touch this service");
    wrapper.unmount();
  });

  it("shows the real count when part of the distance does touch the service", async () => {
    api.mockResolvedValue(
      status({
        rows: [
          {
            name: "Landing page (prod)",
            service: "Landing page",
            branch: "prod",
            provider: "cloudflare-workers",
            url: "https://repoos.org",
            dashboardUrl: null,
            subdir: "landing",
            lastPushAt: "2026-09-15T00:00:00Z",
            lastPushSha: "abc1234",
            changesVsMain: { aheadOfMain: 0, behindMain: 3 },
          },
        ],
        branches: [
          {
            branch: "prod",
            ahead: 0,
            behind: 0,
            hasOrigin: true,
            localExists: true,
            ffFrom: "main",
            mainSync: { state: "behind", aheadOfMain: 0, behindMain: 17 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("3 of 17 behind-main commits touch this service");
    wrapper.unmount();
  });

  it("shows nothing extra for a row with no subdir configured (branch-level count already is its scope)", async () => {
    api.mockResolvedValue(
      status({
        rows: [
          {
            name: "Whole-branch service",
            service: "Whole-branch service",
            branch: "prod",
            provider: null,
            url: "https://example.com",
            dashboardUrl: null,
            subdir: null,
            lastPushAt: null,
            lastPushSha: null,
            changesVsMain: null,
          },
        ],
        branches: [
          {
            branch: "prod",
            ahead: 0,
            behind: 0,
            hasOrigin: true,
            localExists: true,
            ffFrom: "main",
            mainSync: { state: "behind", aheadOfMain: 0, behindMain: 17 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.find(".dep-service-sync").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("DeploymentsView branch sync summary (#0365)", () => {
  it("replaces the raw ahead/behind-vs-own-origin chips with a vs-main sync label", async () => {
    api.mockResolvedValue(status());
    const wrapper = await mountView();
    const text = wrapper.text();
    expect(text).toContain("5 commits behind main");
    expect(text).toContain("up to date with main");
    // The old headline format is gone — no more "↑ N ↓ N vs origin/<branch>".
    expect(text).not.toMatch(/↑\s*\d+\s*↓\s*\d+/);
    wrapper.unmount();
  });

  it("singularizes a one-commit distance", async () => {
    api.mockResolvedValue(
      status({
        branches: [
          {
            branch: "prod",
            ahead: 0,
            behind: 0,
            hasOrigin: true,
            localExists: true,
            ffFrom: "main",
            mainSync: { state: "behind", aheadOfMain: 0, behindMain: 1 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("1 commit behind main");
    expect(wrapper.text()).not.toContain("1 commits behind main");
    wrapper.unmount();
  });

  it("flags an 'ahead of main' branch distinctly from 'behind'", async () => {
    api.mockResolvedValue(
      status({
        branches: [
          {
            branch: "prod",
            ahead: 0,
            behind: 0,
            hasOrigin: true,
            localExists: true,
            ffFrom: null,
            mainSync: { state: "ahead", aheadOfMain: 3, behindMain: 0 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("3 commits ahead of main");
    const badge = wrapper.find(".dep-sync");
    expect(badge.attributes("data-state")).toBe("ahead");
    wrapper.unmount();
  });

  it("reports a diverged branch with both counts", async () => {
    api.mockResolvedValue(
      status({
        branches: [
          {
            branch: "prod",
            ahead: 0,
            behind: 0,
            hasOrigin: true,
            localExists: true,
            ffFrom: null,
            mainSync: { state: "diverged", aheadOfMain: 2, behindMain: 4 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("diverged from main (2 ahead, 4 behind)");
    wrapper.unmount();
  });

  it("shows 'no origin yet' instead of a sync state for an undeployed branch", async () => {
    api.mockResolvedValue(
      status({
        branches: [
          {
            branch: "staging",
            ahead: null,
            behind: null,
            hasOrigin: false,
            localExists: true,
            ffFrom: null,
            mainSync: { state: "unknown", aheadOfMain: 0, behindMain: 0 },
          },
        ],
      }),
    );
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("no origin/staging yet");
    wrapper.unmount();
  });
});

describe("DeploymentsView empty/disabled state", () => {
  it("shows the setup hint when deployments aren't configured", async () => {
    api.mockResolvedValue({
      enabled: false,
      rows: [],
      branches: [],
      root: null,
      dirty: false,
      currentBranch: null,
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Deployments aren't configured for this repository");
    wrapper.unmount();
  });
});
