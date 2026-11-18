import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";
import { EMPTY_COUNTS, flush } from "./component-test-helpers";

const prerequisite = { id: "0101", title: "Prerequisite task", status: "ready" } as Task;
const current = {
  id: "0102",
  title: "Task to edit",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0102-task.md",
  absPath: "/tmp/repo/work/0102-task.md",
  body: "",
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
} as Task;

function ok(data: unknown, status = 200) {
  return { ok: true, status, json: async () => data };
}

async function mountDrawer() {
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/health")) return ok({ root: "/tmp/repo", taskCount: 2 });
    if (url.endsWith("/api/board") || url.endsWith("/api/index"))
      return ok({ tasks: [prerequisite, current], counts: EMPTY_COUNTS, taskCount: 2 });
    if (url.endsWith("/api/tasks") && method === "POST")
      return ok({ ...current, id: "0103", title: "Created task" }, 201);
    if (url.endsWith("/api/tasks/0102") && method === "PATCH")
      return ok({ ...current, ...(JSON.parse(String(init?.body ?? "{}")) as Partial<Task>) });
    if (url.endsWith("/api/tasks/0102")) return ok(current);
    if (url.endsWith("/api/agents/running")) return ok({ tasks: [] });
    return ok({ tasks: [], items: [], markers: [], counts: EMPTY_COUNTS });
  });
  vi.stubGlobal("fetch", fetchMock);
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const repo = useRepoStore();
  repo.tasks = [prerequisite, current];
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  return { wrapper, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("task dependency editing", () => {
  it("sends selected prerequisites with Manual task creation", async () => {
    const { wrapper, fetchMock } = await mountDrawer();
    const ui = useUiStore();
    ui.openNewTask();
    await flush();
    await wrapper.get("button.tab-btn:nth-of-type(2)").trigger("click");
    await wrapper.get("#nt-title").setValue("Created task");
    await wrapper.get(".dependency-option").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Create")!
      .trigger("click");
    await flush();

    const call = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/api/tasks") && init?.method === "POST",
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ dependsOn: ["0101"] });
    expect(ui.isNew).toBe(false);
  });

  it("persists selected prerequisites from the task Details editor", async () => {
    const { wrapper, fetchMock } = await mountDrawer();
    const ui = useUiStore();
    ui.open(current);
    await flush();
    await wrapper.get(".dependency-option").trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Save")!
      .trigger("click");
    await flush();

    const call = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/api/tasks/0102") && init?.method === "PATCH",
    );
    expect(call).toBeTruthy();
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ dependsOn: ["0101"] });
  });
});
