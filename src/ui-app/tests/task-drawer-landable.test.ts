/**
 * The task drawer's landing pre-checks (#0867): the same read-only checklist
 * `repoos landable <id>` prints, shown next to Move to done, and the first
 * failing check explained on the button itself.
 *
 * Also guards the class of regression the first implementation caused: a
 * server or test double that answers 200 without the checklist shape must be
 * ignored, never stored and dereferenced by the drawer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { applyShotPreviewFixture } from "../src/lib/shot-preview-fixtures";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { LandableResult, Task } from "../src/types";
import { EMPTY_COUNTS, FakeEventSource, flush, json, makeTask } from "./component-test-helpers";

// jsdom has no Element.scrollTo; TaskDrawer calls it while streaming session output.
(Element.prototype as unknown as { scrollTo: () => void }).scrollTo ??= () => {};

const reviewTask = (over: Partial<Task> = {}): Task =>
  makeTask({
    status: "review",
    branch: "feat/landable",
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: "/tmp/repo/.worktrees/0001",
      dirty: false,
    },
    ...over,
  });

const FAILING: LandableResult = {
  taskId: "0001",
  branch: "feat/landable",
  headSha: "a".repeat(40),
  lockSha: "a".repeat(40),
  landable: false,
  checks: [
    {
      id: "review-verdict",
      label: "Review verdict",
      status: "pass",
      detail: 'latest review pass is "good to go"',
    },
    {
      id: "review-lock",
      label: "Review lock",
      status: "pass",
      detail: "lock sha aaaaaaa matches worktree HEAD aaaaaaa",
    },
    {
      id: "worktree-clean",
      label: "Worktree clean",
      status: "pass",
      detail: "worktree is clean",
    },
    {
      id: "merge-conflicts",
      label: "Merge with main",
      status: "fail",
      detail: "src/core/types.ts conflicts with main: merge main into the branch, keep both sides",
      nextStep:
        "Merge main into the branch (repoos sync <id>), keep both sides, then re-request review: repoos review again <id>",
    },
    {
      id: "task-scope",
      label: "Task scope",
      status: "pass",
      detail: "diff changes 2 files, all within this task",
    },
    {
      id: "main-clean",
      label: "Main clean",
      status: "pass",
      detail: "main has no uncommitted files",
    },
  ],
  summary: { pass: 5, warn: 0, fail: 1 },
};

async function mountDrawer(pinia: Pinia, task: Task, landableResponse: unknown) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/landable")) return json(landableResponse);
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/agents/queued")) return json({ tasks: [] });
      if (url.includes("/review"))
        return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      return json({ ok: true });
    }),
  );
  const ui = useUiStore();
  ui.open(task);
  const wrapper = mount(TaskDrawer, {
    global: {
      plugins: [pinia, router],
      stubs: { teleport: true, Transition: true },
    },
  });
  await flush();
  return wrapper;
}

function setup(): Pinia {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}

const moveToDone = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll("button").find((b) => b.text().includes("Move to done"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("task drawer landing pre-checks (#0867)", () => {
  it("shows the same checklist and explains the first failing check on Move to done", async () => {
    const pinia = setup();
    const wrapper = await mountDrawer(pinia, reviewTask(), FAILING);

    const checks = wrapper.find(".landable-checks");
    expect(checks.exists()).toBe(true);
    expect(checks.text()).toContain("Not landable yet");
    expect(checks.text()).toContain("src/core/types.ts conflicts with main");
    expect(checks.text()).toContain("5 passed");
    expect(checks.text()).toContain("1 failing");

    const button = moveToDone(wrapper);
    expect(button, "Move to done is rendered").toBeTruthy();
    const title = button!.attributes("title") ?? "";
    expect(title).toContain("Merge with main");
    expect(title).toContain("src/core/types.ts conflicts with main");
  });

  it("ignores a 200 response without the checklist shape instead of crashing the drawer", async () => {
    const pinia = setup();
    const wrapper = await mountDrawer(pinia, reviewTask(), { ok: true });

    expect(wrapper.find(".landable-checks").exists()).toBe(false);
    const button = moveToDone(wrapper);
    expect(button).toBeTruthy();
    expect(button!.attributes("title") ?? "").not.toContain("Merge with main");
  });

  it("renders the declared drawer:landable shot fixture", async () => {
    const pinia = setup();
    const repo = useRepoStore();
    applyShotPreviewFixture(repo, "drawer:landable");
    const fixtureTask = repo.tasks.find((t) => t.id === "9999");
    expect(fixtureTask, "fixture seeds task 9999").toBeTruthy();

    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index"))
          return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        return json({ ok: true });
      }),
    );
    useUiStore().open(fixtureTask!);
    const wrapper = mount(TaskDrawer, {
      global: {
        plugins: [pinia, router],
        stubs: { teleport: true, Transition: true },
      },
    });
    await flush();

    const checks = wrapper.find(".landable-checks");
    expect(checks.exists(), "the shot's waitFor selector renders").toBe(true);
    expect(checks.text()).toContain("src/core/types.ts conflicts with main");
  });
});
