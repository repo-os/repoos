import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskCard from "../src/components/TaskCard.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "review",
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
const jsonFail = async (data: unknown) => ({ ok: false, status: 400, json: async () => data });

/** A store with a failing move-to-done for `id`, error already recorded. */
async function repoWithDoneError(id: string): Promise<ReturnType<typeof useRepoStore>> {
  const repo = useRepoStore();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/done"))
        return jsonFail({ ok: false, error: "merge conflict: src/a.ts, src/b.ts" });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: false, review: null });
      if (url.includes("/output")) return json({ ok: true, lines: [] });
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 }, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      throw new Error("unexpected fetch: " + url);
    }),
  );
  await expect(repo.completeTask(makeTask({ id }))).rejects.toThrow();
  return repo;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

describe("move-to-done inline error placement", () => {
  it(
    "renders on the Work card, and replaces the Move to done button (#0271 follow-up) " +
      "rather than sitting below it — a failed attempt shouldn't invite clicking straight " +
      "back into the same failure from the card; the drawer keeps its own retry button",
    async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = await repoWithDoneError("0042");
      expect(repo.doneErrorFor("0042")).not.toBeNull();

      const wrapper = mount(TaskCard, {
        props: { task: makeTask({ id: "0042" }) },
        global: {
          plugins: [pinia],
          stubs: { RestartTaskDialog: true, ActivityIndicator: true },
        },
      });
      await flush();

      const err = wrapper.find(".tc-done-error");
      expect(err.exists()).toBe(true);
      expect(err.element.classList.contains("done-error")).toBe(true);
      // Inside the card.
      const card = wrapper.find(".task-card");
      expect(card.element.contains(err.element)).toBe(true);
      // No Move to done button on the card while the error is showing.
      expect(wrapper.find(".tc-foot").exists()).toBe(false);
      expect(wrapper.text()).not.toContain("Move to done");
      // No "review passed · ready to finish" hint either — it would read as
      // contradictory right next to a failure banner.
      expect(wrapper.text()).not.toContain("ready to finish");
      // The raw server message is preserved, not genericized.
      expect(err.text()).toContain("merge conflict: src/a.ts, src/b.ts");
    },
  );

  it("does not render an error on the card when the store has none", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
        if (url.includes("/api/board") || url.includes("/api/index"))
          return json({ tasks: [], counts: { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 }, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        throw new Error("unexpected fetch: " + url);
      }),
    );
    const repo = useRepoStore();
    expect(repo.doneErrorFor("0042")).toBeNull();

    const wrapper = mount(TaskCard, {
      props: { task: makeTask({ id: "0042" }) },
      global: {
        plugins: [pinia],
        stubs: { RestartTaskDialog: true, ActivityIndicator: true },
      },
    });
    await flush();
    expect(wrapper.find(".done-error").exists()).toBe(false);
  });

  it("renders in the task panel below the Move to done button", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();

    const repo = await repoWithDoneError("0042");
    const ui = useUiStore();
    ui.open(makeTask({ id: "0042" }));
    expect(repo.doneErrorFor("0042")).not.toBeNull();

    const wrapper = mount(TaskDrawer, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true },
      },
    });
    await flush();

    const err = wrapper.find(".drawer-done-error");
    expect(err.exists()).toBe(true);
    expect(err.element.classList.contains("done-error")).toBe(true);
    expect(err.text()).toContain("merge conflict: src/a.ts, src/b.ts");
    // Sits inside the quickbar, which is where the Move to done button lives.
    expect(wrapper.find(".drawer-quickbar").element.contains(err.element)).toBe(true);
    // Unlike the card (which hides its Move to done button on error, above),
    // the drawer keeps its own — a failed attempt is still one click from
    // retrying once the human has looked at (or fixed) the cause.
    expect(wrapper.text()).toContain("Move to done");
  });
});
