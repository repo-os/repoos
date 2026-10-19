/**
 * Scheduled tasks editor (#0841): standard drawer shell, form fields, preview, CRUD.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ScheduledTasksPanel from "../src/components/ScheduledTasksPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import type { TaskSchedule } from "../../core/schedule.js";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

let mounted: VueWrapper[] = [];

function mountPanel(): VueWrapper {
  const wrapper = mount(ScheduledTasksPanel, { attachTo: document.body });
  mounted.push(wrapper);
  return wrapper;
}

function drawer(): HTMLElement | null {
  return document.body.querySelector('[data-testid="schedule-editor-drawer"]');
}

function buttons(root: ParentNode, label: (t: string) => boolean): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll("button")).find((b) => label(b.textContent ?? "")) as
    | HTMLButtonElement
    | undefined;
}

function makeSchedule(over: Partial<TaskSchedule> = {}): TaskSchedule {
  return {
    id: "0001",
    title: "Doc audit",
    enabled: true,
    cadence: "weekly",
    timezone: "UTC",
    timeOfDay: "09:00",
    runAt: "",
    dayOfWeek: 1,
    taskTitle: "Audit docs",
    taskType: "chore",
    taskArea: "docs",
    taskPriority: "p2",
    taskAssignedTo: "ai",
    taskStatus: "ready",
    autoStartAgent: false,
    body: "## Problem\nDrift\n",
    nextRunPreview: "Mon, Oct 20, 9:00 AM",
    nextRunAt: "2026-10-20T09:00:00.000Z",
    lastRunAt: "",
    lastResult: "",
    lastTaskId: "",
    lastError: "",
    lastOccurrenceKey: "",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    path: "schedules/0001-doc-audit.md",
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("schedule editor drawer (#0841)", () => {
  it("renders the shared drawer shell and closes on X, overlay, and Escape", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="new-schedule"]').trigger("click");
    await flushPromises();

    const el = drawer();
    expect(el).toBeTruthy();
    expect(el!.querySelector(".drawer-head")).toBeTruthy();
    expect(el!.querySelector(".drawer-resize")).toBeTruthy();
    expect(el!.querySelector(".drawer-head")!.textContent).toContain("New schedule");

    await wrapper.get('[data-testid="schedule-editor-close"]').trigger("click");
    await flushPromises();
    expect(drawer()).toBeNull();

    await wrapper.get('[data-testid="new-schedule"]').trigger("click");
    await flushPromises();
    expect(drawer()).toBeTruthy();

    const overlay = document.body.querySelector<HTMLElement>(".overlay")!;
    overlay.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1 }),
    );
    await flushPromises();
    expect(drawer()).toBeNull();

    await wrapper.get('[data-testid="new-schedule"]').trigger("click");
    await flushPromises();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(drawer()).toBeNull();
  });

  it("uses standard-height inputs, not ff-textarea on single-line fields", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="new-schedule"]').trigger("click");
    await flushPromises();

    const el = drawer()!;
    const inputs = el.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) {
      expect(input.classList.contains("ff-textarea")).toBe(false);
    }
    expect(el.querySelector("textarea.ff-textarea")).toBeTruthy();
    expect(el.querySelector('[data-radix-select-trigger], button[role=\"combobox\"]')).toBeTruthy();
  });

  it("shows a real next-run preview for defaults and specific errors when invalid", async () => {
    const wrapper = mountPanel();
    await flushPromises();
    await wrapper.get('[data-testid="new-schedule"]').trigger("click");
    await flushPromises();

    const previewEl = drawer()!.querySelector('[data-testid="schedule-next-preview"] strong')!;
    expect(previewEl.textContent).not.toBe("Could not preview");
    expect(previewEl.textContent).not.toBe("—");
    expect(previewEl.textContent!.length).toBeGreaterThan(3);

    const saveBtn = wrapper.get('[data-testid="schedule-save"]');
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(true);

    const titleInput = drawer()!.querySelector("#sched-title") as HTMLInputElement;
    titleInput.value = "Weekly audit";
    titleInput.dispatchEvent(new Event("input"));
    await flushPromises();
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(false);

    const tzInput = drawer()!.querySelector("#sched-timezone") as HTMLInputElement;
    tzInput.value = "Not/A_Zone";
    tzInput.dispatchEvent(new Event("input"));
    await flushPromises();
    expect(previewEl.textContent).toMatch(/valid IANA/i);
    expect((saveBtn.element as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("schedule CRUD from the panel", () => {
  it("create → edit → disable → run now → delete", async () => {
    const repo = useRepoStore();
    repo.refreshSchedules = vi.fn().mockResolvedValue(undefined);
    const created = makeSchedule({ id: "0099", title: "New chore" });
    repo.createSchedule = vi.fn().mockResolvedValue(created);
    repo.patchSchedule = vi.fn().mockImplementation(async (id, patch) => {
      const row = makeSchedule({ id, ...patch });
      repo.schedules = [row];
      return row;
    });
    repo.deleteSchedule = vi.fn().mockImplementation(async () => {
      repo.schedules = [];
    });
    repo.runSchedule = vi.fn().mockResolvedValue(undefined);
    repo.pushToast = vi.fn();
    repo.schedules = [];

    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('[data-testid="new-schedule"]').trigger("click");
    await flushPromises();
    const titleInput = drawer()!.querySelector("#sched-title") as HTMLInputElement;
    titleInput.value = "New chore";
    titleInput.dispatchEvent(new Event("input"));
    await flushPromises();

    await wrapper.get('[data-testid="schedule-save"]').trigger("click");
    await flushPromises();
    expect(repo.createSchedule).toHaveBeenCalled();
    repo.schedules = [created];
    await flushPromises();

    const editBtn = buttons(wrapper.element, (t) => t.includes("Edit"));
    expect(editBtn).toBeTruthy();
    editBtn!.click();
    await flushPromises();
    expect(drawer()!.querySelector(".drawer-head")!.textContent).toContain("Edit schedule");
    await wrapper.get('[data-testid="schedule-editor-close"]').trigger("click");
    await flushPromises();

    const card = wrapper.get('[data-testid="schedule-card-0099"]');
    const switchRoot = card.element.querySelector("button[role='switch']") as HTMLButtonElement;
    expect(switchRoot).toBeTruthy();
    switchRoot.click();
    await flushPromises();
    expect(repo.patchSchedule).toHaveBeenCalledWith("0099", { enabled: false });

    buttons(card.element, (t) => t.includes("Run now"))!.click();
    await flushPromises();
    expect(repo.runSchedule).toHaveBeenCalledWith("0099");

    buttons(card.element, (t) => t === "Delete")!.click();
    await flushPromises();
    const modal = document.body.querySelector(".delete-confirm-modal")!;
    expect(modal).toBeTruthy();
    const confirmBtn = modal.querySelectorAll(
      ".delete-confirm-actions button",
    )[1] as HTMLButtonElement;
    confirmBtn.click();
    await flushPromises();
    expect(repo.deleteSchedule).toHaveBeenCalledWith("0099");
  });
});
