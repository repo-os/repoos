import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { nextTick } from "vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const task: Task = {
  id: "1007",
  title: "Engineering report history fixture",
  type: "feature",
  status: "active",
  priority: "p2",
  area: "server",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/report-history",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/1007-fixture.md",
  absPath: "/tmp/repo/work/1007-fixture.md",
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
    worktreePath: "/tmp/repo-wt",
    dirty: false,
  },
  preview: null,
  automaticReview: { running: false, enabled: true },
};

const reports = [
  {
    taskId: "1007",
    round: 1,
    at: "2026-11-01T12:00:00Z",
    agent: "codex",
    model: "model-one",
    branch: "feat/report-history",
    baseSha: "base-tree",
    sourceSha: "source-one",
    wordCount: 7,
    markdown: "## TL;DR\nFirst round report body.",
  },
  {
    taskId: "1007",
    round: 2,
    at: "2026-11-02T12:00:00Z",
    agent: "claude",
    model: "model-two",
    branch: "feat/report-history",
    baseSha: "base-tree",
    sourceSha: "source-two",
    wordCount: 8,
    markdown: "## TL;DR\nSecond round report body.",
  },
];

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

describe("engineering report history", () => {
  it("lists rounds and opens the selected report from the Dev tab", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    vi.stubGlobal("EventSource", class {
      addEventListener(): void {}
      close(): void {}
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (url.includes("/api/index")) return json({ tasks: [task], counts: {}, taskCount: 1 });
        if (url.includes("/api/agents/running")) return json({ tasks: [] });
        if (url.includes("/engineering-reports")) return json({ ok: true, reports });
        if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const repo = useRepoStore();
    await repo.init();
    const ui = useUiStore();
    ui.open(task);
    ui.activeTab = "agent";
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    for (let i = 0; i < 5; i++) await nextTick();

    await wrapper.get('[data-test-id="engineering-report-tab"]').trigger("click");
    expect(wrapper.get('[data-test-id="engineering-report-history"]').text()).toContain("Round 1");
    expect(wrapper.text()).toContain("Round 2");
    expect(wrapper.text()).toContain("Second round report body.");

    await wrapper.get('[data-test-id="engineering-report-history"] tbody tr').trigger("click");
    expect(wrapper.text()).toContain("First round report body.");
    expect(wrapper.text()).not.toContain("Second round report body.");
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
});
