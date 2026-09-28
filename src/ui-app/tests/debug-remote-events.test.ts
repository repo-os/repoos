/**
 * Debug-tab remote-validation events (#0568): a failed remote run's infra
 * error — which host ran, the exit code, and whether the failure was infra
 * rather than a red test gate — is surfaced in the task's event list instead of
 * only in the raw log under `.repoos/logs/remote-validation/`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import DebugPanel from "../src/components/DebugPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import type { RemoteValidationEvent, Task, TaskLogEntry } from "../src/types";

const TASK = {
  id: "0042",
  title: "Fixture",
  body: "",
  status: "review",
  git: { worktreePath: null, dirty: false },
} as unknown as Task;

function remoteEvent(over: Partial<RemoteValidationEvent> = {}): RemoteValidationEvent {
  return {
    at: new Date("2026-09-28T06:00:00Z").toISOString(),
    level: "warn",
    phase: "result",
    message: "remote validation unavailable: ssh connection to 203.0.113.5 dropped mid-run",
    host: "203.0.113.5",
    exitCode: 255,
    infra: true,
    ...over,
  };
}

function logEntry(message: string): TaskLogEntry {
  return {
    timestamp: new Date("2026-09-28T05:59:00Z").toISOString(),
    level: "info",
    component: "task",
    message,
  };
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  /* pinia is recreated per test; nothing global to unwind */
});

function render() {
  return mount(DebugPanel, {
    props: { task: TASK },
    global: { plugins: [pinia], stubs: { teleport: true } },
  });
}

describe("DebugPanel remote validation events (#0568)", () => {
  it("reports the host, exit code, and an infra badge for a non-test failure", async () => {
    const repo = useRepoStore();
    repo.taskRemoteEvents[TASK.id] = [remoteEvent()];

    const wrapper = render();
    await nextTick();

    const row = wrapper.find(".debug-event[data-debug-event^='remote-']");
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("203.0.113.5");
    expect(row.text()).toContain("exit 255");
    expect(row.text()).toContain("infra");
  });

  it("marks a configuration error that retrying cannot fix", async () => {
    const repo = useRepoStore();
    repo.taskRemoteEvents[TASK.id] = [
      remoteEvent({
        level: "error",
        host: undefined,
        exitCode: undefined,
        infra: false,
        configError: true,
        message: "remote validation cannot run: no host provides macos",
      }),
    ];

    const wrapper = render();
    await nextTick();

    const row = wrapper.find(".debug-event[data-debug-event^='remote-']");
    expect(row.text()).toContain("config");
    expect(row.text()).toContain("cannot run");
  });

  it("filters the list down to remote events only", async () => {
    const repo = useRepoStore();
    repo.taskRemoteEvents[TASK.id] = [remoteEvent()];
    repo.taskLogs[TASK.id] = [logEntry("a plain task log line")];

    const wrapper = render();
    await nextTick();
    expect(wrapper.text()).toContain("a plain task log line");

    await wrapper.find("select.debug-select").setValue("remote");
    await nextTick();

    expect(wrapper.text()).not.toContain("a plain task log line");
    expect(wrapper.text()).toContain("203.0.113.5");
  });
});
