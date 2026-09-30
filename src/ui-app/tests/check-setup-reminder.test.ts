/**
 * #0592 — the NoCheckPlanReminder callout: shown wherever a check run was
 * SKIPPED because the repo has no check plan. Amber, never green; offers the
 * one-click "file a task" path (via the normal POST /api/tasks route) and a
 * copyable CLI hint mentioning `repoos check --print-plan`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NoCheckPlanReminder from "../src/components/NoCheckPlanReminder.vue";

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
