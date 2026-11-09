/**
 * Component-level coverage for the redesigned Deployments page (#0365):
 * grouping [[deployments]] rows into a services × branches matrix, and the
 * new "vs local main" sync label that replaces the raw ↑/↓-vs-own-origin
 * chips. The server-side computation itself is covered in deployments.test.ts
 * — this file is about the view correctly rendering what the API returns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useAuthStore } from "../src/stores/auth";
import Select from "../src/components/ui/select/root.vue";
import DeploymentsView from "../src/views/DeploymentsView.vue";
import { invalidatePageData } from "../src/composables/page-data-cache";

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
        environmentConsumer: "deployment:landing-page-prod",
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
        environmentConsumer: "deployment:landing-page-dev",
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
        environmentConsumer: "deployment:docs-prod",
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

async function mountView(role: "admin" | "member" = "admin"): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().role = role;
  const wrapper = mount(DeploymentsView, { attachTo: document.body, global: { plugins: [pinia] } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  invalidatePageData("deployments");
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("DeploymentsView matrix (#0365)", () => {
  it("shows cached deployments immediately on revisit and applies the refresh in place", async () => {
    api.mockResolvedValue(status());
    const first = await mountView();
    first.unmount();

    let finish!: (value: unknown) => void;
    api.mockImplementation((path) => {
      if (path === "/api/deployments") return new Promise((resolve) => (finish = resolve)) as never;
      if (path === "/api/project-environments")
        return Promise.resolve({ environments: [] }) as never;
      throw new Error(`Unexpected API route: ${path}`);
    });
    const wrapper = mount(DeploymentsView, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await nextTick();
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    expect(wrapper.text()).toContain("Landing page");

    finish?.(
      status({
        rows: [{ ...status().rows[0], name: "Updated service", service: "Updated service" }],
      }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain("Updated service");
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([{ initial: status() }, { initial: status({ enabled: false, rows: [], branches: [] }) }])(
    "shows refresh errors with cached deployments $initial",
    async ({ initial }) => {
      api.mockResolvedValue(initial);
      const first = await mountView();
      first.unmount();

      api.mockImplementation((path) => {
        if (path === "/api/deployments") return Promise.reject(new Error("refresh boom")) as never;
        if (path === "/api/project-environments")
          return Promise.resolve({ environments: [] }) as never;
        throw new Error(`Unexpected API route: ${path}`);
      });
      const wrapper = mount(DeploymentsView, {
        attachTo: document.body,
        global: { plugins: [createPinia()] },
      });
      await nextTick();
      expect(wrapper.find(".page-skeleton").exists()).toBe(false);
      expect(wrapper.text()).toContain(
        initial.rows.length ? "Landing page" : "Deployments aren't configured",
      );

      await flushPromises();
      expect(wrapper.text()).toContain("Refresh failed");
      expect(wrapper.text()).toContain(
        initial.rows.length ? "Landing page" : "Deployments aren't configured",
      );
      expect(wrapper.find(".page-skeleton").exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it("pins the first-load skeleton for its declared shot fixture", async () => {
    window.history.replaceState({}, "", "/deployments?shotState=deployments%3Aloading");
    const wrapper = await mountView();
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    expect(api).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("renders the registered environment-binding capture fixture without API data", async () => {
    window.history.replaceState({}, "", "/deployments?shotState=deployments%3AenvironmentBinding");
    const wrapper = await mountView();
    expect(wrapper.find(".dep-env-binding").exists()).toBe(true);
    expect(wrapper.text()).toContain("production");
    expect(wrapper.text()).toContain("Does not upload or sync variables");
    expect(api).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("loads deployments for members without calling the admin-only environment route or exposing binding controls", async () => {
    api.mockImplementation(async (path) => {
      if (path === "/api/deployments")
        return status({
          rows: status().rows.map((row) => ({ ...row, environment: "production" })),
        }) as never;
      throw new Error("Admin access required");
    });
    const wrapper = await mountView("member");
    expect(wrapper.find(".dep-err").exists()).toBe(false);
    expect(wrapper.text()).toContain("Local environment: production");
    expect(wrapper.text()).toContain("Ask an admin to change this binding");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith("/api/deployments");
    wrapper.unmount();
  });

  it("loads the admin environment list and allows an admin to bind a deployment", async () => {
    api.mockImplementation(async (path) => {
      if (path === "/api/deployments") return status() as never;
      if (path === "/api/project-environments") return { environments: [{ id: "dev" }] } as never;
      throw new Error(`Unexpected API route: ${path}`);
    });
    const wrapper = await mountView("admin");
    expect(wrapper.findComponent(Select).exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Ask an admin to change this binding");
    expect(api).toHaveBeenCalledWith("/api/project-environments");
    wrapper.unmount();
  });

  it("changing a deployment environment only saves its local binding", async () => {
    api.mockImplementation(async (path) => {
      if (path === "/api/deployments") return status() as never;
      if (path === "/api/project-environments")
        return { environments: [{ id: "dev" }, { id: "production" }] } as never;
      if (path === "/api/project-environment-bindings") return { ok: true } as never;
      throw new Error(`Unexpected API route: ${path}`);
    });
    const wrapper = await mountView("admin");
    const select = wrapper.find(".dep-env-binding select");
    await select.setValue("production");
    await flushPromises();

    expect(api).toHaveBeenCalledWith(
      "/api/project-environment-bindings",
      expect.objectContaining({ method: "PUT", body: expect.any(String) }),
    );
    const bindingCall = api.mock.calls.find(
      ([path]) => path === "/api/project-environment-bindings",
    );
    expect(bindingCall).toBeDefined();
    const request = bindingCall?.[1] as { body: string };
    expect(JSON.parse(request.body)).toEqual({
      consumer: "deployment:landing-page-prod",
      environment: "production",
      keys: [],
    });
    expect(api.mock.calls.some(([path]) => path === "/api/deployments/deploy")).toBe(false);
    wrapper.unmount();
  });

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

  it("uses the styled environment selector and explains the empty state with a Secrets link", async () => {
    api.mockImplementation(async (path) => {
      if (path === "/api/deployments") return status() as never;
      if (path === "/api/project-environments") return { environments: [] } as never;
      throw new Error(`Unexpected API route: ${path}`);
    });
    const wrapper = await mountView();
    expect(wrapper.findComponent(Select).exists()).toBe(false);
    expect(wrapper.find(".dep-env-binding select").exists()).toBe(false);
    await wrapper.get(".dep-env-empty").trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("Environments hold local project secrets");
    expect(document.body.querySelector('a[href="/secrets"]')?.textContent).toContain(
      "Go to Secrets",
    );
    wrapper.unmount();
  });
});
