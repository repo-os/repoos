/**
 * #0592 — the NoCheckPlanReminder callout: shown wherever a check run was
 * SKIPPED because the repo has no check plan. Amber, never green; offers the
 * one-click "file a task" path (via the normal POST /api/tasks route) and a
 * copyable CLI hint mentioning `repoos check --print-plan`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import NoCheckPlanReminder from "../src/components/NoCheckPlanReminder.vue";
import ChecksView from "../src/views/ChecksView.vue";
import { isGenuinelyEmptyPlan } from "../src/lib/check-setup";
import type { CheckPlanView } from "../src/types";

function planPayload(over: Partial<CheckPlanView> = {}): CheckPlanView {
  return {
    source: "empty",
    defaultProfile: "default",
    profile: "default",
    profiles: ["default", "full"],
    warnings: [],
    errors: [],
    steps: [],
    lastRun: null,
    ...over,
  } as CheckPlanView;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NoCheckPlanReminder (#0592)", () => {
  it("names the skip, offers --print-plan, and never reads as a green pass", () => {
    const wrapper = mount(NoCheckPlanReminder, {
      global: { plugins: [createPinia()] },
    });
    const text = wrapper.text();
    expect(text).toContain("No checks configured");
    expect(text).toContain("Nothing was verified");
    expect(text).toContain("repoos check --print-plan");
    expect(text).toContain("user-docs/check.md");
    // Never green: no pass wording anywhere on the card.
    expect(text.toLowerCase()).not.toContain("checks passed");
    expect(wrapper.attributes("aria-label")).toBe("No checks configured");
  });

  it("files the setup task through POST /api/tasks with an agent-actionable body", async () => {
    setActivePinia(createPinia());
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "0600", title: bodyTitle, status: "inbox" }),
        };
      }),
    );
    const wrapper = mount(NoCheckPlanReminder, {
      global: { plugins: [createPinia()] },
    });
    const bodyTitle = "Set up check.steps in repoos.toml";

    await wrapper.get("button.ncpr-primary").trigger("click");
    await flushPromises();

    // First call is the creation POST; openTask() then best-effort-refreshes.
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]!.url).toBe("/api/tasks");
    expect(calls[0]!.init?.method).toBe("POST");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.title).toBe("Set up check.steps in repoos.toml");
    expect(body.type).toBe("chore");
    // The body must tell the assigned agent HOW to do the setup.
    expect(body.body).toContain("repoos check --print-plan");
    expect(body.body).toContain("[[check.steps]]");
    expect(body.body).toContain("repoos.toml");
    expect(body.body).toContain("user-docs/check.md");
  });
});

// shared reminder guard (round 2 review): empty + zero steps + ZERO errors.
describe("isGenuinelyEmptyPlan (#0592)", () => {
  it("applies to a planless, error-free repo, and not to a broken declared plan", () => {
    expect(isGenuinelyEmptyPlan({ source: "empty", steps: [], errors: [] })).toBe(true);
    expect(isGenuinelyEmptyPlan({ source: "empty", steps: [], errors: undefined })).toBe(true);
    expect(
      isGenuinelyEmptyPlan({
        source: "empty",
        steps: [],
        errors: ["[check] declares [[check.steps]] but no row is usable"],
      }),
    ).toBe(false);
    expect(
      isGenuinelyEmptyPlan({
        source: "declared",
        steps: [
          {
            name: "build",
            timeoutMs: 600_000,
            required: true,
            profiles: [],
            whenChanged: [],
            dependsOn: [],
            requires: [],
            crossCutting: true,
            selected: true,
            missing: [],
          },
        ],
        errors: [],
      }),
    ).toBe(false);
  });
});

// round 2 review: the Checks page must withhold the amber reminder for a
// broken (error-carrying) plan — only errors-free planless repos show it.
describe("ChecksView — no-check-plan reminder (#0592)", () => {
  async function mountChecks(plan: CheckPlanView): Promise<any> {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/check-plan"))
          return { ok: true, status: 200, json: async () => ({ ok: true, checkPlan: plan }) };
        if (url.includes("/api/health"))
          return { ok: true, status: 200, json: async () => ({ ok: true, root: "/tmp" }) };
        return { ok: true, status: 200, json: async () => ({}) };
      }),
    );
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div/>" } }],
    });
    router.push({ path: "/checks", query: { tab: "plan" } });
    await router.isReady();
    return await mount(ChecksView, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
  }

  it("shows the reminder for a genuine empty plan", async () => {
    const wrapper = await mountChecks(planPayload());
    await flushPromises();
    expect(wrapper.text()).toContain("No checks configured");
    vi.unstubAllGlobals();
  });

  it("withholds the reminder when the plan carries errors (the gate fails red)", async () => {
    const wrapper = await mountChecks(
      planPayload({
        errors: ["[check] declares [[check.steps]] but no row is usable"],
      }),
    );
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain("no row is usable");
    expect(text).not.toContain("No checks configured");
    vi.unstubAllGlobals();
  });

  it("styles a skipped last run as its own neutral state, not a red failure", async () => {
    const wrapper = await mountChecks(
      planPayload({
        lastRun: {
          profile: "full",
          source: "empty",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
          passed: false,
          outcome: "skipped",
          results: [],
        },
      }),
    );
    await flushPromises();
    const card = wrapper.get(".ck-lastrun");
    expect(card.text()).toContain("No checks ran — plan not configured");
    expect(card.attributes("data-outcome")).toBe("skipped");
    expect(card.attributes("data-passed")).toBe("false");
    vi.unstubAllGlobals();
  });
});
