import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import DebugPanel from "../src/components/DebugPanel.vue";
import {
  debugEventExpandable,
  debugEventExpandedDetail,
  debugEventExpandedMessage,
  isTitleVisuallyTruncated,
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

  it("shows duplicate activity text once when expanded and truncated", () => {
    const text = "status review→done, release:success";
    const opts = { titleTruncated: true };
    expect(debugEventExpandable({ kind: "activity", title: text, detail: text }, opts)).toBe(true);
    expect(debugEventExpandedMessage({ kind: "activity", title: text, detail: text }, opts)).toBe(
      text,
    );
    expect(debugEventExpandedDetail({ kind: "activity", title: text, detail: text })).toBeNull();
  });

  it("does not expand duplicate title/detail when the line fits", () => {
    const text = "status review→done";
    expect(debugEventExpandable({ kind: "activity", title: text, detail: text })).toBe(false);
  });

  it("relies on layout truncation for title-only rows", () => {
    const medium = "close-out complete — published to main after a long merge gate";
    expect(debugEventExpandable({ kind: "log", title: medium })).toBe(false);
    expect(debugEventExpandable({ kind: "log", title: medium }, { titleTruncated: true })).toBe(
      true,
    );
  });

  it("expands check rows only when output exists or the title is truncated", () => {
    const short = "merge-gate — passed in 2s";
    expect(debugEventExpandable({ kind: "check", title: short, checkOutput: "ok\n" })).toBe(true);
    expect(debugEventExpandable({ kind: "check", title: short })).toBe(false);
    expect(debugEventExpandable({ kind: "check", title: short }, { titleTruncated: true })).toBe(
      true,
    );
  });

  it("detects ellipsis via scrollWidth", () => {
    const truncated = document.createElement("span");
    Object.defineProperty(truncated, "scrollWidth", { value: 200 });
    Object.defineProperty(truncated, "clientWidth", { value: 80 });
    expect(isTitleVisuallyTruncated(truncated)).toBe(true);
    const fits = document.createElement("span");
    Object.defineProperty(fits, "scrollWidth", { value: 80 });
    Object.defineProperty(fits, "clientWidth", { value: 80 });
    expect(isTitleVisuallyTruncated(fits)).toBe(false);
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
