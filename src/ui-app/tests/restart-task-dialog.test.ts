/**
 * #0997 — the restart confirmation must be a real, hit-testable floating layer.
 *
 * jsdom does no hit-testing, so the regression is asserted as the two things
 * that produce a working click (#0575): the dialog is body-teleported out of
 * the card/column/drawer stacking context, and its content carries the shared
 * dialog's `data-overlay-layer` marker (which style.css keeps at
 * `pointer-events: auto` while Radix has `<body>` click-transparent).
 *
 * Before the fix the hand-rolled `.restart-overlay` rendered inline with no
 * marker at all, so this test failed on the current code.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import RestartTaskDialog from "../src/components/RestartTaskDialog.vue";
import TaskCard from "../src/components/TaskCard.vue";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0994",
  title: "Test task",
  type: "feature",
  status: "active",
  priority: "p0",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0994-test.md",
  absPath: "/tmp/repo/work/0994-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: true,
    worktreeExists: true,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: "/tmp/wt",
    dirty: true,
  },
  preview: null,
  automaticReview: { running: false, enabled: true },
  ...over,
});

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/worktree-dirty")) return json({ ok: true, files: [] });
      if (String(url).includes("/diff-stats"))
        return json({ filesChanged: 0, additions: 0, deletions: 0 });
      if (String(url).includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (String(url).includes("/api/index")) return json({ tasks: [], counts: {}, taskCount: 0 });
      return json({ ok: true, lines: [], tasks: [] });
    }),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("restart task dialog (#0997)", () => {
  it("renders as a body-teleported overlay layer, not inside the card", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    stubFetch();
    const task = makeTask();
    const wrapper = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    await flush();

    const restart = wrapper.findAll("button").find((b) => b.text().includes("Restart work"));
    expect(restart, "the active card offers Restart work").toBeDefined();
    await restart!.trigger("click");
    await flush();

    const modal = document.body.querySelector(".restart-modal") as HTMLElement | null;
    expect(modal, "the confirmation is rendered").not.toBeNull();
    // The whole bug: it used to live inside the card's stacking context with
    // no layer marker, so a layer below took the pointer.
    expect(modal!.closest(".task-card")).toBeNull();
    const layer = modal!.getAttribute("data-overlay-layer");
    expect(layer, "shared dialog stamps the layer id").toBeTruthy();
    expect(document.body.querySelector(".overlay")?.getAttribute("data-overlay-layer")).toBe(layer);

    wrapper.unmount();
  });

  it("runs each action from a real button click", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    stubFetch();
    const repo = useRepoStore();
    const startWork = vi.spyOn(repo, "startWork").mockResolvedValue(undefined);
    const task = makeTask();
    const wrapper = mount(RestartTaskDialog, {
      props: { task },
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    await flush();

    const resume = document.body.querySelector(
      '[data-test-id="restart-resume"]',
    ) as HTMLButtonElement;
    expect(resume).not.toBeNull();
    resume.click();
    await flush();
    expect(startWork).toHaveBeenCalledWith(task, "resume", undefined, false);

    const clean = document.body.querySelector(
      '[data-test-id="restart-clean"]',
    ) as HTMLButtonElement;
    clean.click();
    await flush();
    expect(startWork).toHaveBeenCalledWith(task, "clean", undefined, false);

    const emitted = wrapper.emitted("started") ?? [];
    expect(emitted.length).toBe(2);

    wrapper.unmount();
  });

  it("closes on Cancel without starting work", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    stubFetch();
    const repo = useRepoStore();
    const startWork = vi.spyOn(repo, "startWork").mockResolvedValue(undefined);
    const wrapper = mount(RestartTaskDialog, {
      props: { task: makeTask() },
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    await flush();

    (document.body.querySelector('[data-test-id="restart-cancel"]') as HTMLButtonElement).click();
    await flush();

    expect(startWork).not.toHaveBeenCalled();
    expect(wrapper.emitted("close")).toHaveLength(1);

    wrapper.unmount();
  });
});
