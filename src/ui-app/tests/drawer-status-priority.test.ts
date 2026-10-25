import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { selectDrawerStatus } from "../src/lib/drawer-status-priority";
import DebugPanel from "../src/components/DebugPanel.vue";
import type { Task } from "../src/types";

describe("selectDrawerStatus", () => {
  it.each([
    [{ reviewFailed: true }, "reviewFailed"],
    [{ reviewFailed: true, notLandable: true }, "reviewFailed"],
    [{ handoffFailed: true, notLandable: true }, "notLandable"],
    [{ reviewFailed: true, handoffFailed: true, checksRunning: true }, "reviewFailed"],
    [{ checksRunning: true, confirmingHandoff: true }, "checksRunning"],
    [{ checksFailedAfterRetries: true, checksRunning: true }, "checksFailedAfterRetries"],
    [{ checksFailedAfterRetries: true, confirmingHandoff: true }, "checksFailedAfterRetries"],
    [{ waitingForYou: true, reviewFailed: true }, "waitingForYou"],
    [{ waitingForYou: true, notLandable: true, handoffFailed: true }, "waitingForYou"],
    [{ checksRunning: true }, "checksRunning"],
    [{}, null],
  ])("selects one status by priority for %o", (candidates, expected) => {
    expect(selectDrawerStatus(candidates)).toBe(expected);
  });
});

describe("DebugPanel status details", () => {
  it("shows complete status explanations in its Status details subtab", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const wrapper = mount(DebugPanel, {
      props: {
        task: { id: "0042", title: "Fixture", body: "", status: "review", git: {} } as Task,
        statusDetails: [
          {
            title: "Not landable checklist",
            detail: "FAIL: review lock — report missing\nnext: run review again",
          },
          { title: "What happened", detail: "The reviewer exited before writing a report." },
        ],
        view: "status",
      },
      global: { plugins: [pinia, router], stubs: { teleport: true } },
    });
    expect(wrapper.find('[aria-label="Task status details"]').text()).toContain(
      "Not landable checklist",
    );
    expect(wrapper.text()).toContain("report missing");
    expect(wrapper.text()).toContain("The reviewer exited before writing a report.");
  });
});
