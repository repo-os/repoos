import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import DebugPanel from "../src/components/DebugPanel.vue";
import {
  DEBUG_TITLE_EXPAND_THRESHOLD,
  debugEventExpandable,
  debugEventExpandedDetail,
  debugEventExpandedMessage,
} from "../src/lib/debug-event-expand";
import { useRepoStore } from "../src/stores/repo";
import type { Task, TaskLogEntry } from "../src/types";

const TASK = {
  id: "0820",
  title: "Fixture",
  body: "",
  status: "done",
  git: { worktreePath: null, dirty: false },
} as unknown as Task;

const LONG =
  "main advanced with bookkeeping-only commits — publishing without a merge conflict check on the candidate tree";

describe("debugEventExpandable (#0829)", () => {
  it("expands truncated log lines and shows message plus JSON detail once each", () => {
    const title = LONG;
    const detail = JSON.stringify({ from: "abc", to: "def" });
    expect(debugEventExpandable({ kind: "log", title, detail })).toBe(true);
    expect(debugEventExpandedMessage({ kind: "log", title, detail })).toBe(title);
    expect(debugEventExpandedDetail({ kind: "log", title, detail })).toBe(detail);
  });

  it("shows duplicate activity text once when expanded", () => {
    const text = "status review→done, release:success";
    expect(debugEventExpandable({ kind: "activity", title: text, detail: text })).toBe(true);
    expect(debugEventExpandedMessage({ kind: "activity", title: text, detail: text })).toBe(text);
    expect(debugEventExpandedDetail({ kind: "activity", title: text, detail: text })).toBeNull();
  });

  it("skips an expander for short lines with no detail", () => {
    const short = "ok";
    expect(short.length).toBeLessThan(DEBUG_TITLE_EXPAND_THRESHOLD);
    expect(debugEventExpandable({ kind: "log", title: short })).toBe(false);
  });
});

describe("DebugPanel expanded rows (#0829)", () => {
  it("renders the full message and JSON payload when a long log row is expanded", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const payload = { from: "main", to: "feat" };
    const entry: TaskLogEntry = {
      timestamp: "2026-10-18T03:21:00Z",
      level: "info",
      component: "task",
      message: LONG,
      context: payload,
    };
    repo.taskLogs[TASK.id] = [entry];

    const wrapper = mount(DebugPanel, {
      props: { task: TASK },
      global: { plugins: [pinia], stubs: { teleport: true } },
      attachTo: document.body,
    });
    await nextTick();

    const row = wrapper.get(".debug-event");
    expect(row.classes()).toContain("debug-event-expandable");
    await row.trigger("click");
    await nextTick();

    const message = wrapper.get(".debug-event-message");
    expect(message.text()).toBe(LONG);
    const detail = wrapper.get(".debug-log-inline");
    expect(detail.text()).toContain('"from"');
    wrapper.unmount();
  });
});
