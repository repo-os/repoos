import { afterEach, describe, expect, it, vi } from "vitest";
import { DOMWrapper, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, h, nextTick, ref } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import TaskDependencyPicker from "../src/components/TaskDependencyPicker.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import {
  EMPTY_COUNTS,
  FakeEventSource,
  flush,
  json,
  makeTask,
  openTaskDetailsModal,
} from "./component-test-helpers";

const VIEWPORTS = [375, 768, 1280] as const;

async function mountDrawer(task = makeTask()): Promise<VueWrapper> {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 2, workDir: "work" });
      if (url.includes("/api/index"))
        return json({
          tasks: [task, makeTask({ id: "0002", title: "Prerequisite" })],
          counts: { ...EMPTY_COUNTS, ready: 2 },
          taskCount: 2,
        });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const pinia = createPinia();
  setActivePinia(pinia);
  useConfigStore().data = {
    stories: { enabled: false },
    areaVocabulary: [{ name: "web" }, { name: "docs" }],
  };
  const repo = useRepoStore();
  repo.tasks = [task, makeTask({ id: "0002", title: "Prerequisite" })];
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/work", component: { template: "<div />" } },
      { path: "/settings", component: { template: "<div />" } },
    ],
  });
  await router.push("/work");
  await router.isReady();
  const wrapper = mount(TaskDrawer, {
    attachTo: document.body,
    global: { plugins: [pinia, router], stubs: { teleport: false, Transition: true } },
  });
  return wrapper;
}

async function setViewport(width: number): Promise<void> {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  await nextTick();
}

function pointerDown(element: HTMLElement): void {
  Object.defineProperties(element, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
  });
  element.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
}

function pointerClick(element: HTMLElement): void {
  pointerDown(element);
  element.dispatchEvent(new MouseEvent("pointerup", { button: 0, bubbles: true }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe.each(VIEWPORTS)("task create/edit interactions at %i px", (width) => {
  it("creates a manual task with priority, area, prerequisite and a screenshot fixture", async () => {
    await setViewport(width);
    const wrapper = await mountDrawer();
    try {
      const ui = useUiStore();
      const repo = useRepoStore();
      const create = vi.spyOn(repo, "createTask").mockResolvedValue(makeTask({ id: "0003" }));
      const upload = vi.spyOn(repo, "uploadTaskScreenshot").mockResolvedValue(true);
      ui.openNewTask();
      await flush();
      repo.tasks = [makeTask(), makeTask({ id: "0002", title: "Prerequisite" })];
      await wrapper.get("button.tab-btn:nth-of-type(2)").trigger("click");
      expect(wrapper.get(".btn-row button:last-child").attributes("disabled")).toBeDefined();
      await wrapper.get("#nt-title").setValue("Responsive fixture task");
      expect(wrapper.find("#nt-body").exists()).toBe(true);
      expect(wrapper.find("#nt-dependencies").exists()).toBe(true);
      expect(wrapper.get(".btn-row button:last-child").attributes("disabled")).toBeUndefined();
      const prerequisite = wrapper
        .findAll(".task-dependency-picker .dependency-option")
        .find((option) => option.text().includes("Prerequisite"));
      expect(prerequisite).toBeDefined();
      await prerequisite!.trigger("click");
      expect(ui.nt.dependsOn).toEqual(["0002"]);

      await wrapper.get("#nt-area").trigger("click");
      await flush();
      const docsOption = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent?.trim() === "docs",
      );
      expect(docsOption).toBeDefined();
      docsOption!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
      expect(ui.nt.area).toBe("web, docs");
      await wrapper.get("#nt-area").trigger("click");
      await flush();

      const priorityField = wrapper
        .findAll(".field")
        .find((field) => field.text().includes("Priority"))!;
      pointerClick(priorityField.get('[role="combobox"]').element as HTMLElement);
      await flush();
      const p1Option = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent?.trim() === "p1",
      );
      expect(p1Option).toBeDefined();
      pointerClick(p1Option as HTMLElement);
      await flush();
      expect(ui.nt.priority).toBe("p1");

      const shot = new File(
        [
          Uint8Array.from(
            atob(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p1sAAAAASUVORK5CYII=",
            ),
            (c) => c.charCodeAt(0),
          ),
        ],
        "responsive.png",
        { type: "image/png" },
      );
      class FixtureFileReader {
        result: string | ArrayBuffer | null = null;
        onload: (() => void) | null = null;
        readAsDataURL(file: Blob): void {
          this.result = `data:${file.type};base64,fixture`;
          queueMicrotask(() => this.onload?.());
        }
      }
      vi.stubGlobal("FileReader", FixtureFileReader);
      const screenshotInput = wrapper.get('.shot-dropzone input[type="file"]').element;
      Object.defineProperty(screenshotInput, "files", { configurable: true, value: [shot] });
      screenshotInput.dispatchEvent(new Event("change", { bubbles: true }));
      for (let attempt = 0; attempt < 10 && !ui.pendingScreenshots.length; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await flush();
      expect(wrapper.text()).toContain("responsive.png");
      expect(ui.pendingScreenshots.map((item) => item.name)).toContain("responsive.png");
      await wrapper.get(".btn-row button:last-child").trigger("click");
      await flush();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Responsive fixture task",
          priority: "p1",
          area: "web, docs",
          dependsOn: ["0002"],
        }),
      );
      expect(upload).toHaveBeenCalledWith(
        "0003",
        expect.objectContaining({ name: "responsive.png" }),
      );
    } finally {
      wrapper.unmount();
    }
  });

  it("edits type, priority, area and prerequisite in the details modal, then saves", async () => {
    await setViewport(width);
    const task = makeTask({ dependsOn: [] });
    const wrapper = await mountDrawer(task);
    try {
      const ui = useUiStore();
      const repo = useRepoStore();
      const patch = vi.spyOn(repo, "patchTask").mockResolvedValue(task);
      ui.open(task);
      ui.activeTab = "details";
      await flush();
      repo.tasks = [task, makeTask({ id: "0002", title: "Prerequisite" })];
      await flush();
      // #1282: the block is collapsed by default; its edit controls live in the modal.
      expect(wrapper.get('[data-test-id="task-meta-summary"]').text()).toContain("no dependencies");
      expect(wrapper.find("#et-dependencies").exists()).toBe(false);
      const modal = await openTaskDetailsModal(wrapper);
      expect(modal.querySelector("#et-dependencies")).not.toBeNull();
      expect(modal.querySelector(".dependency-none")?.textContent).toContain("None");

      // The standalone dependency-picker fixture exercises add/remove; seed
      // the edit draft here so save persists its selected prerequisite.
      await new DOMWrapper(
        modal.querySelector(".task-dependency-picker .dependency-option")!,
      ).trigger("click");
      await flush();
      expect(modal.querySelector(".dependency-selected")?.textContent).toContain("Prerequisite");
      await new DOMWrapper(modal.querySelector("#et-area")!).trigger("click");
      await flush();
      const docsOption = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent?.trim() === "docs",
      );
      expect(docsOption).toBeDefined();
      docsOption!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
      await new DOMWrapper(modal.querySelector("#et-area")!).trigger("click");
      await flush();

      const fieldFor = (label: string) =>
        [...modal.querySelectorAll<HTMLElement>(".field")].find((field) =>
          field.textContent?.includes(label),
        )!;
      pointerClick(fieldFor("Type").querySelector('[role="combobox"]') as HTMLElement);
      await flush();
      // makeTask defaults to type "bug", so pick a different type to change it.
      const choreOption = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent?.trim() === "chore",
      );
      expect(choreOption).toBeDefined();
      pointerClick(choreOption as HTMLElement);
      await flush();

      pointerClick(fieldFor("Priority").querySelector('[role="combobox"]') as HTMLElement);
      await flush();
      const p0Option = [...document.querySelectorAll('[role="option"]')].find(
        (option) => option.textContent?.trim() === "p0",
      );
      expect(p0Option).toBeDefined();
      pointerClick(p0Option as HTMLElement);
      await flush();
      await new DOMWrapper(modal.querySelector(".task-meta-modal-actions button")!).trigger(
        "click",
      );
      await flush();
      const summary = wrapper.get('[data-test-id="task-meta-summary"]').text();
      expect(summary).toContain("chore · p0");
      expect(summary).toContain("web, docs");
      expect(summary).toContain("depends on #0002");

      await wrapper.get(".save-bar button:last-child").trigger("click");
      await flush();
      expect(patch).toHaveBeenCalledWith(
        "0001",
        expect.objectContaining({
          type: "chore",
          priority: "p0",
          area: "web, docs",
          dependsOn: ["0002"],
        }),
      );
    } finally {
      wrapper.unmount();
    }
  });

  it("selects and removes the prerequisite from the fixture picker", async () => {
    await setViewport(width);
    const tasks = [makeTask(), makeTask({ id: "0002", title: "Prerequisite" })];
    const wrapper = mount(
      defineComponent({
        setup() {
          const modelValue = ref<string[]>([]);
          return () =>
            h(TaskDependencyPicker, {
              id: "fixture-dependencies",
              tasks,
              excludeId: "0001",
              modelValue: modelValue.value,
              "onUpdate:modelValue": (value: string[]) => {
                modelValue.value = value;
              },
            });
        },
      }),
    );
    try {
      await wrapper.get(".dependency-option").trigger("click");
      const picker = wrapper.findComponent(TaskDependencyPicker);
      expect(picker.emitted("update:modelValue")?.at(-1)?.[0]).toEqual(["0002"]);
      await wrapper.get('[aria-label="Remove dependency 0002"]').trigger("click");
      expect(picker.emitted("update:modelValue")?.at(-1)?.[0]).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });
});
