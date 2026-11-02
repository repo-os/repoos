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
import { enableAutoUnmount, mount } from "@vue/test-utils";
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

// #0960: unmount mounted drawers after each case. The shared useNow clock ticks
// the shared `now` ref every second; a drawer left mounted from an earlier case
// would re-render on that tick and, while the later case is inside an await,
// any late-mounted v-if child resolves its pinia stores via injection —
// flipping pinia's global active pinia and making the next case's no-arg
// `useUiStore()` return the previous case's store.
enableAutoUnmount(afterEach);

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

async function mountDrawer(
  pinia: Pinia,
  task: Task,
  landableResponse: unknown,
  reviewResponse: unknown = null,
  passResponses: Record<number, unknown> = {},
) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/landable")) return json(landableResponse);
      const passMatch = url.match(/\/review\/passes\/(\d+)/);
      if (passMatch) return json({ ok: true, review: passResponses[Number(passMatch[1])] ?? null });
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/api/agents/queued")) return json({ tasks: [] });
      if (url.endsWith("/review"))
        return json(
          reviewResponse ?? { ok: true, running: false, enabled: true, review: null, lines: [] },
        );
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      return json({ ok: true });
    }),
  );
  const ui = useUiStore();
  ui.open(task);
  ui.activeTab = "review";
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

    const summary = wrapper.find(".drawer-status-summary");
    expect(summary.exists()).toBe(true);
    expect(summary.find(".drawer-status-l1").text()).toContain("Not ready to merge");
    expect(summary.find(".drawer-status-l2").text()).toContain("Merge with main");
    expect(summary.find(".drawer-status-l3").exists()).toBe(false);
    expect(wrapper.findAll(".drawer-status-summary")).toHaveLength(1);
    expect(wrapper.find(".landable-checks").exists()).toBe(false);

    const button = moveToDone(wrapper);
    expect(button, "Move to done is rendered").toBeTruthy();
    const title = button!.attributes("title") ?? "";
    expect(title).toContain("Merge with main");
    expect(title).toContain("src/core/types.ts conflicts with main");

    await wrapper
      .findAll("button.tab-btn")
      .find((tab) => tab.text().includes("Debug"))!
      .trigger("click");
    await wrapper
      .findAll("button.debug-tab")
      .find((tab) => tab.text().includes("Status details"))!
      .trigger("click");
    expect(wrapper.find('[aria-label="Task status details"]').text()).toContain(
      "src/core/types.ts conflicts with main",
    );
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
    expect(wrapper.find(".drawer-status-summary").exists(), "the status card renders").toBe(true);
    expect(wrapper.find(".drawer-status-l1").text(), "the status card copy is short").toContain(
      "Not ready to merge",
    );
  });
});

describe("review pass selection and identity (#1003)", () => {
  it("selects the latest pass by default, marks an older pass, and shows its coding agent", async () => {
    const latest = {
      id: "0001",
      at: "2026-11-02T10:00:00.000Z",
      agent: "reviewer",
      cli: "codex",
      model: "gpt-5",
      branch: "feat/landable",
      state: "ok",
      markdown: "## Verdict\ngood to go.\n\nLatest review details.\n",
    };
    const older = {
      ...latest,
      at: "2026-11-01T10:00:00.000Z",
      cli: "cursor",
      markdown: "## Verdict\ngood to go.\n\nOlder review details.\n",
    };
    const history = [
      {
        pass: 1,
        at: older.at,
        state: "ok",
        verdict: "good to go",
        agent: "reviewer",
        cli: "cursor",
        model: "composer",
      },
      {
        pass: 2,
        at: latest.at,
        state: "ok",
        verdict: "good to go",
        agent: "reviewer",
        cli: "codex",
        model: "gpt-5",
      },
    ];
    const wrapper = await mountDrawer(
      setup(),
      reviewTask(),
      {
        ok: true,
        taskId: "0001",
        landable: false,
        checks: [],
        summary: { pass: 0, warn: 0, fail: 0 },
      },
      { ok: true, running: false, enabled: true, review: latest, history, lines: [] },
      { 1: older },
    );
    expect(wrapper.find(".verdict-callout").text()).toContain("Latest");
    expect(wrapper.findAll(".review-history-row")[0]?.classes()).toContain("is-selected");
    expect(wrapper.findAll(".review-history-row")[0]?.attributes("aria-pressed")).toBe("true");
    expect(wrapper.find(".review-history-reviewer").text()).toBe("Codex");

    await wrapper.findAll(".review-history-row")[1]!.trigger("click");
    await flush();
    expect(wrapper.findAll(".review-history-row")[1]?.classes()).toContain("is-selected");
    expect(wrapper.findAll(".review-history-row")[1]?.attributes("aria-pressed")).toBe("true");
    expect(wrapper.findAll(".review-history-row")[0]?.attributes("aria-pressed")).toBe("false");
    expect(wrapper.find(".verdict-callout").text()).toContain("Not latest");
    expect(wrapper.findAll(".review-history-reviewer")[1]?.text()).toBe("Cursor");
    expect(wrapper.find(".review-card").text()).toContain("Older review details.");
    expect(wrapper.find(".review-pass-freshness").classes()).toContain("is-old");
  });

  it("ignores an older pass response after a newer selection", async () => {
    const latest = {
      id: "0001",
      at: "2026-11-02T10:00:00.000Z",
      agent: "reviewer",
      cli: "codex",
      model: "gpt-5",
      branch: "feat/landable",
      state: "ok",
      markdown: "## Verdict\ngood to go.\n\nLatest selection details.\n",
    };
    const older = {
      ...latest,
      at: "2026-11-01T10:00:00.000Z",
      markdown: "## Verdict\ngood to go.\n\nOlder selection details.\n",
    };
    const wrapper = await mountDrawer(
      setup(),
      reviewTask(),
      {
        ok: true,
        taskId: "0001",
        landable: false,
        checks: [],
        summary: { pass: 0, warn: 0, fail: 0 },
      },
      {
        ok: true,
        running: false,
        enabled: true,
        review: latest,
        history: [
          {
            pass: 2,
            at: latest.at,
            state: "ok",
            verdict: "good to go",
            agent: "reviewer",
            cli: "codex",
            model: "gpt-5",
          },
          {
            pass: 1,
            at: older.at,
            state: "ok",
            verdict: "good to go",
            agent: "reviewer",
            cli: "codex",
            model: "gpt-5",
          },
        ],
        lines: [],
      },
    );

    let resolveOlder!: (response: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        const pass = Number(url.match(/\/review\/passes\/(\d+)/)?.[1]);
        if (pass === 1) return new Promise((resolve) => (resolveOlder = resolve));
        return Promise.resolve(json({ ok: true, review: latest }));
      }),
    );

    const rows = wrapper.findAll(".review-history-row");
    await rows[1]!.trigger("click");
    await rows[0]!.trigger("click");
    await flush();
    expect(wrapper.find(".review-card").text()).toContain("Latest selection details.");

    resolveOlder(await json({ ok: true, review: older }));
    await flush();
    expect(wrapper.find(".review-card").text()).toContain("Latest selection details.");
    expect(wrapper.find(".review-card").text()).not.toContain("Older selection details.");
    expect(wrapper.find(".verdict-callout").text()).toContain("Latest");
    expect(wrapper.find(".verdict-callout").text()).not.toContain("Not latest");
    expect(wrapper.findAll(".review-history-row")[0]?.classes()).toContain("is-selected");
  });

  it("shows the selected failed pass instead of the latest report", async () => {
    const latest = {
      id: "0001",
      at: "2026-11-02T10:00:00.000Z",
      agent: "reviewer",
      cli: "codex",
      model: "gpt-5",
      branch: "feat/landable",
      state: "ok",
      markdown: "## Verdict\ngood to go.\n\nLatest report.\n",
    };
    const older = { ...latest, state: "failed", markdown: "Older pass failed to run." };
    const wrapper = await mountDrawer(
      setup(),
      reviewTask(),
      FAILING,
      {
        ok: true,
        running: false,
        enabled: true,
        review: latest,
        history: [
          {
            pass: 1,
            at: older.at,
            state: "failed",
            verdict: "failed",
            agent: "reviewer",
            cli: "codex",
            model: "gpt-5",
          },
          {
            pass: 2,
            at: latest.at,
            state: "ok",
            verdict: "good to go",
            agent: "reviewer",
            cli: "codex",
            model: "gpt-5",
          },
        ],
        lines: [],
      },
      { 1: older },
    );

    await wrapper.findAll(".review-history-row")[0]!.trigger("click");
    await flush();

    expect(wrapper.find(".review-failed").text()).toBe("Older pass failed to run.");
    expect(wrapper.text()).not.toContain("Latest report.");
  });

  it("shows a retry path after a review-pass fetch fails", async () => {
    const latest = {
      id: "0001",
      at: "2026-11-02T10:00:00.000Z",
      agent: "reviewer",
      cli: "codex",
      model: "gpt-5",
      branch: "feat/landable",
      state: "ok",
      markdown: "## Verdict\ngood to go.\n\nLatest report.\n",
    };
    const wrapper = await mountDrawer(setup(), reviewTask(), FAILING, {
      ok: true,
      running: false,
      enabled: true,
      review: latest,
      history: [
        {
          pass: 1,
          at: "2026-11-01T10:00:00.000Z",
          state: "ok",
          verdict: "good to go",
          agent: "reviewer",
          cli: "codex",
          model: "gpt-5",
        },
        {
          pass: 2,
          at: latest.at,
          state: "ok",
          verdict: "good to go",
          agent: "reviewer",
          cli: "codex",
          model: "gpt-5",
        },
      ],
      lines: [],
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/review/passes/1")) throw new Error("network unavailable");
      return json({ ok: true, review: latest });
    });
    vi.stubGlobal("fetch", fetchMock);

    await wrapper.findAll(".review-history-row")[0]!.trigger("click");
    await flush();
    expect(wrapper.find('[role="alert"]').text()).toContain("Could not load this review pass.");

    fetchMock.mockImplementation(async () =>
      json({ ok: true, review: { ...latest, markdown: "Recovered pass." } }),
    );
    await wrapper.find('[role="alert"] button').trigger("click");
    await flush();
    expect(wrapper.find(".review-card").text()).toContain("Recovered pass.");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
