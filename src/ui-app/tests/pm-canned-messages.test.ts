/**
 * Canned PM messages above the PM compose box (0283, extended by 0294): shown
 * for any task status with a defined set (draft/inbox, active, review), remains
 * visible/askable even after a PM conversation exists.
 */
import { describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "draft",
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
  path: "work/0001-test.md",
  absPath: "/tmp/repo/work/0001-test.md",
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
  ...over,
});

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

/** Stub fetch so every PM output load returns the given conversation lines. */
function stubFetch(sentMessages: string[], outputLines: unknown[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/output")) return json({ ok: true, lines: outputLines });
      if (u.includes("/pm/message")) {
        const body = JSON.parse(String((init?.body as string) ?? "{}"));
        sentMessages.push(body.text ?? "");
        return json({ ok: true });
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
      if (u.includes("/review")) return json({ ok: true, running: false, enabled: false, review: null });
      throw new Error("unexpected fetch: " + u);
    }),
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) await nextTick();
}

/** Open the given task in the drawer and switch to the PM tab (post-mount so
 *  the PM-transcript restore watcher fires). */
async function mountPmTab(task: Task): Promise<{ wrapper: VueWrapper; sent: string[] }> {
  const sent: string[] = [];
  stubFetch(sent);
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  const ui = useUiStore();

  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
  });
  await flush();
  // Switch to the PM tab after mount so the restore watcher fetches output.
  ui.activeTab = "pm";
  await flush();
  return { wrapper, sent };
}

describe("canned PM messages above the compose box", () => {
  it("shows the canned list for a fresh draft task with no PM conversation", async () => {
    const { wrapper } = await mountPmTab(makeTask());
    const list = wrapper.find(".pm-canned");
    expect(list.exists()).toBe(true);
    expect(list.text()).toContain("flesh this out");
  });

  it("shows the canned list for an inbox task with no PM conversation", async () => {
    const { wrapper } = await mountPmTab(makeTask({ status: "inbox" }));
    expect(wrapper.find(".pm-canned").exists()).toBe(true);
  });

  it("shows the active-stage canned questions for an active task", async () => {
    const { wrapper } = await mountPmTab(makeTask({ status: "active" }));
    const list = wrapper.find(".pm-canned");
    expect(list.exists()).toBe(true);
    expect(list.text()).toContain("going on with this task");
    expect(list.text()).toContain("What's wrong?");
    expect(list.text()).toContain("What should I do next?");
  });

  it("shows the review-stage canned questions for a review task", async () => {
    const { wrapper } = await mountPmTab(makeTask({ status: "review" }));
    const list = wrapper.find(".pm-canned");
    expect(list.exists()).toBe(true);
    expect(list.text()).toContain("blocking this from being done");
    expect(list.text()).toContain("actually ready");
  });

  it("does not show the canned list for statuses without a defined set", async () => {
    for (const status of ["ready", "done"] as const) {
      const { wrapper } = await mountPmTab(makeTask({ status }));
      expect(wrapper.find(".pm-canned").exists(), `status=${status}`).toBe(false);
    }
  });

  it("still shows the canned list once a PM conversation already exists", async () => {
    const { wrapper } = await mountPmTab(makeTask());
    // Seed an existing conversation, reloading the transcript from fetch.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/output")) return json({ ok: true, lines: [{ type: "human", text: "already chatted" }] });
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
    const repo = useRepoStore();
    repo.outputs["pm-task-v2:0001"] = [{ type: "human", text: "already chatted" }];
    await flush();

    expect(wrapper.find(".pm-canned").exists()).toBe(true);
  });

  it("clicking a canned message sends it to the PM immediately", async () => {
    const { wrapper, sent } = await mountPmTab(makeTask());
    const items = wrapper.findAll(".pm-canned-item");
    expect(items.length).toBeGreaterThan(0);
    await items[0].trigger("click");
    await flush();

    // The clicked message was sent to the PM endpoint.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBe("Can you flesh this out?");
  });
});
