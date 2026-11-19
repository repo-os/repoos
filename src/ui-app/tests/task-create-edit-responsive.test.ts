import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, h, nextTick, ref } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import AreaPicker from "../src/components/AreaPicker.vue";
import Select from "../src/components/ui/select/root.vue";
import TaskDependencyPicker from "../src/components/TaskDependencyPicker.vue";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

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
      ui.nt.dependsOn = ["0002"];
      expect(ui.nt.dependsOn).toEqual(["0002"]);

      const areaTrigger = wrapper.get("#nt-area");
      await areaTrigger.trigger("click");
      await flush();
      wrapper.findComponent(AreaPicker).vm.$emit("update:modelValue", ["web"]);
      await flush();
      expect(ui.nt.area).toBe("web");

      wrapper
        .findAll(".field")
        .find((field) => field.text().includes("Priority"))!
        .findComponent(Select)
        .vm.$emit("update:modelValue", "p1");
      await flush();
      expect(ui.nt.priority).toBe("p1");

      const shot = new File(["fixture image bytes"], "responsive.png", { type: "image/png" });
      ui.pendingScreenshots.push({
        name: shot.name,
        mime: shot.type,
        dataUrl: "data:image/png;base64,Zml4dHVyZQ==",
        size: shot.size,
      });
      expect(ui.pendingScreenshots.map((item) => item.name)).toContain("responsive.png");
      await wrapper.get(".btn-row button:last-child").trigger("click");
      await flush();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Responsive fixture task",
          priority: "p1",
          area: "web",
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

  it("edits priority, area and prerequisite from the task details fixture", async () => {
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
      expect(wrapper.find("#et-dependencies").exists()).toBe(true);
      // The standalone dependency-picker fixture exercises add/remove; seed
      // the edit draft here so save persists its selected prerequisite.

      await wrapper.get("#et-area").trigger("click");
      await flush();
      wrapper.findComponent(TaskDependencyPicker).vm.$emit("update:modelValue", ["0002"]);
      wrapper.findComponent(AreaPicker).vm.$emit("update:modelValue", ["web", "docs"]);
      await flush();

      wrapper
        .findAll(".field")
        .find((field) => field.text().includes("Priority"))!
        .findComponent(Select)
        .vm.$emit("update:modelValue", "p0");
      await wrapper.get(".save-bar button:last-child").trigger("click");
      await flush();
      expect(patch).toHaveBeenCalledWith(
        "0001",
        expect.objectContaining({
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
