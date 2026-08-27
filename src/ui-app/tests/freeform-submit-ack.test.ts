/**
 * Freeform submit → acknowledgment panel (0311): after creating a task the
 * drawer swaps the input form for a "this may take a few minutes" panel with
 * options to start another task or leave, instead of blocking on the new task.
 */
import { describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const makeDraft = (over: Partial<Task> = {}): Task => ({
  id: "0312",
  title: "Draft idea",
  type: "feature",
  status: "draft",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "hello@repoos.org",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0312-draft-idea.md",
  absPath: "/tmp/repo/work/0312-draft-idea.md",
  body: "rough idea",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  ...over,
});

const json = async (data: unknown) => ({ ok: true, status: 201, json: async () => data });

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("/api/tasks/freeform")) {
        return json({ ok: true, fallback: false, task: makeDraft() });
      }
      if (u.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (u.includes("/api/board") || u.includes("/api/index"))
        return json({
          tasks: [],
          counts: { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 },
          taskCount: 0,
        });
      if (u.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + u);
    }),
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) await nextTick();
}

async function mountNewTask(): Promise<{ wrapper: VueWrapper; ui: ReturnType<typeof useUiStore> }> {
  stubFetch();
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();
  ui.openNewTask();
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  return { wrapper, ui };
}

async function submitFreeform(wrapper: VueWrapper): Promise<void> {
  const textarea = wrapper.find("#nt-freeform");
  await textarea.setValue("Let's build a thing");
  const createBtn = wrapper
    .findAll("button")
    .find((b) => b.text().includes("Create task"));
  expect(createBtn).toBeTruthy();
  await createBtn!.trigger("click");
  await flush();
}

describe("freeform submit acknowledgment (0311)", () => {
  it("shows the acknowledgment panel after a successful freeform submit", async () => {
    const { wrapper } = await mountNewTask();
    await submitFreeform(wrapper);

    const panel = wrapper.find(".ff-done");
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain("may take a few minutes");
    expect(panel.text()).toContain("background");
    expect(panel.text()).toContain("#0312");
    expect(panel.text()).toContain("Create another task");
    expect(panel.text()).toContain("Done");
  });

  it("Create another task returns to a clean freeform form", async () => {
    const { wrapper } = await mountNewTask();
    await submitFreeform(wrapper);

    const another = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Create another task"));
    await another!.trigger("click");
    await flush();

    expect(wrapper.find(".ff-done").exists()).toBe(false);
    const textarea = wrapper.find("#nt-freeform");
    expect(textarea.exists()).toBe(true);
    expect((textarea.element as HTMLTextAreaElement).value).toBe("");
  });

  it("Done closes the new-task pane", async () => {
    const { wrapper, ui } = await mountNewTask();
    await submitFreeform(wrapper);

    const done = wrapper.findAll("button").find((b) => b.text().trim() === "Done");
    await done!.trigger("click");
    await flush();

    expect(ui.isNew).toBe(false);
    expect(wrapper.find(".ff-done").exists()).toBe(false);
  });
});
