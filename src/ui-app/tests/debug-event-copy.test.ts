/**
 * Click-to-copy for task debug log entries (#0567): clicking a card in the
 * Debug tab's Logs view copies the entry's full text (title + body/detail/check
 * output) and toasts, matching chat-bubble copy. These cover the text
 * extraction per entry kind and the interaction guards (active selection,
 * interactive descendants) plus that expand/collapse still works.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import DebugPanel from "../src/components/DebugPanel.vue";
import * as clipboard from "../src/lib/clipboard";
import { canCopyDebugEvent, copyTextForDebugEvent } from "../src/lib/debug-event-copy";
import { useRepoStore } from "../src/stores/repo";
import type { Task, TaskCheckRun, TaskLogEntry } from "../src/types";

const TASK = {
  id: "0042",
  title: "Fixture",
  body: "intro\n\n## Activity\n\n- 2026-09-28T05:00:00Z · status ready→active\n",
  status: "active",
  git: { worktreePath: null, dirty: false },
} as unknown as Task;

function logEntry(message: string, context?: Record<string, unknown>): TaskLogEntry {
  return {
    timestamp: new Date("2026-09-28T05:59:00Z").toISOString(),
    level: "info",
    component: "task",
    message,
    context,
  };
}

function checkRun(over: Partial<TaskCheckRun> = {}): TaskCheckRun {
  return {
    id: "0042-merge-gate-1",
    taskId: "0042",
    kind: "merge-gate",
    startedAt: new Date("2026-09-20T07:00:00Z").toISOString(),
    finishedAt: new Date("2026-09-20T07:00:02Z").toISOString(),
    durationMs: 2000,
    running: false,
    passed: false,
    code: 1,
    output: "FAIL some.test.ts\nfull output here",
    scope: "full",
    machine: "local",
    ...over,
  };
}

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function render() {
  return mount(DebugPanel, {
    props: { task: TASK },
    global: { plugins: [pinia], stubs: { teleport: true } },
    attachTo: document.body,
  });
}

describe("copyTextForDebugEvent", () => {
  it("copies an activity title once when detail repeats it", () => {
    expect(
      copyTextForDebugEvent({
        kind: "activity",
        title: "status ready→active",
        detail: "status ready→active",
      }),
    ).toBe("status ready→active");
  });

  it("copies a log message with its context JSON", () => {
    expect(
      copyTextForDebugEvent({ kind: "log", title: "spawned runner", detail: '{"pid":42}' }),
    ).toBe('spawned runner\n{"pid":42}');
  });

  it("copies a log message alone when it has no context", () => {
    expect(copyTextForDebugEvent({ kind: "log", title: "plain line" })).toBe("plain line");
  });

  it("copies a check title, failure summary, and full output", () => {
    expect(
      copyTextForDebugEvent({
        kind: "check",
        title: "MTD merge-gate check — failed in 2.0s",
        failureSummary: "some.test.ts — at some.test.ts:1:1 — Error: boom",
        checkOutput: "full output",
      }),
    ).toBe(
      "MTD merge-gate check — failed in 2.0s\nsome.test.ts — at some.test.ts:1:1 — Error: boom\nfull output",
    );
  });

  it("omits missing check parts", () => {
    expect(
      copyTextForDebugEvent({ kind: "check", title: "check — passed in 1ms", checkOutput: "" }),
    ).toBe("check — passed in 1ms");
  });

  it("returns null when the entry has no text", () => {
    expect(copyTextForDebugEvent({ kind: "log", title: "   " })).toBeNull();
    expect(canCopyDebugEvent({ kind: "log", title: "" })).toBe(false);
  });
});

describe("DebugPanel debug entry copy", () => {
  it("copies a log entry's message and context on click", async () => {
    const repo = useRepoStore();
    const copySpy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(true);
    repo.taskLogs[TASK.id] = [logEntry("spawned runner", { pid: 42 })];

    const wrapper = render();
    await nextTick();
    await wrapper.find(".debug-event[data-debug-event^='log-']").trigger("click");

    expect(copySpy).toHaveBeenLastCalledWith('spawned runner\n{"pid":42}');
    expect(repo.toasts.at(-1)?.message).toBe("Log entry copied");
    wrapper.unmount();
  });

  it("copies a collapsed check's full output and still expands the row", async () => {
    const repo = useRepoStore();
    const copySpy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(true);
    repo.taskChecks[TASK.id] = [checkRun()];

    const wrapper = render();
    await nextTick();
    const card = wrapper.find(".debug-event[data-debug-event^='check-']");
    expect(wrapper.find(".debug-log-inline").exists()).toBe(false);

    await card.trigger("click");

    expect(copySpy.mock.calls.at(-1)?.[0]).toContain("full output here");
    expect(wrapper.find(".debug-log-inline").exists()).toBe(true);
    wrapper.unmount();
  });

  it("does not copy or collapse when the user has an active selection", async () => {
    const repo = useRepoStore();
    const copySpy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(true);
    repo.taskChecks[TASK.id] = [checkRun()];

    const wrapper = render();
    await nextTick();
    const card = wrapper.find(".debug-event[data-debug-event^='check-']");
    // Expand it first so the output is selectable.
    await card.trigger("click");
    expect(wrapper.find(".debug-log-inline").exists()).toBe(true);

    const range = document.createRange();
    range.selectNodeContents(card.element);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    copySpy.mockClear();

    await card.trigger("click");

    // The selection guard wins: no copy, and the row stays expanded so the
    // selection isn't destroyed under the user.
    expect(copySpy).not.toHaveBeenCalled();
    expect(wrapper.find(".debug-log-inline").exists()).toBe(true);
    sel.removeAllRanges();
    wrapper.unmount();
  });

  it("does not copy when the click lands on an interactive descendant", async () => {
    const repo = useRepoStore();
    const copySpy = vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(true);
    repo.taskLogs[TASK.id] = [logEntry("has a button")];

    const wrapper = render();
    await nextTick();
    const card = wrapper.find(".debug-event[data-debug-event^='log-']");
    const btn = document.createElement("button");
    card.element.appendChild(btn);
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();

    expect(copySpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shows an error toast when the clipboard write fails", async () => {
    const repo = useRepoStore();
    vi.spyOn(clipboard, "copyToClipboard").mockResolvedValue(false);
    repo.taskLogs[TASK.id] = [logEntry("nope")];

    const wrapper = render();
    await nextTick();
    await wrapper.find(".debug-event[data-debug-event^='log-']").trigger("click");

    expect(repo.toasts.at(-1)?.message).toBe("Could not copy log entry");
    wrapper.unmount();
  });
});
