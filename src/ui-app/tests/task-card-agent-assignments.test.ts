/**
 * 0455: every board card shows a small robot button in its bottom-right that
 * toggles a compact PM / Engineer / Reviewer agent assignment panel — override
 * when set, else the enabled board-default agent for that role.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import AgentModelModal from "../src/components/AgentModelModal.vue";
import { useRepoStore } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "ready",
  priority: "p2",
  area: "ui",
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
  pmAgentOverride: null,
  reviewAgentOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  automaticReview: { running: false, enabled: true },
  ...over,
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners.get(t) ?? [];
    list.push(fn);
    this.listeners.set(t, list);
  }

  emit(t: string, data: unknown): void {
    for (const fn of this.listeners.get(t) ?? []) fn({ data: JSON.stringify(data) });
  }

  close(): void {
    /* noop */
  }
}

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function stubFetch(task: Task): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, ready: 1 }, taskCount: 1 });
      if (url.includes(`/api/tasks/${task.id}`)) return json(task);
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/diff-stats")) return json({ filesChanged: 0, additions: 0, deletions: 0 });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

async function mountCard(pinia: Pinia, task: Task) {
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia] },
  });
  await flush();
  return wrapper;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TaskCard agent assignments panel (0455)", () => {
  it("previews assignments on hover and keeps click-to-edit behavior", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();
    const config = useConfigStore();
    config.agents = [
      { name: "engineer", cli: "opencode", model: "opencode-go/nimo-v2.5", enabled: true },
      { name: "pm", cli: "opencode", model: "openrouter/xiaomi/mimo-v2.5", enabled: true },
      {
        name: "reviewer",
        cli: "opencode",
        model: "opencode-go/deepseek-v4.1-flash",
        enabled: true,
      },
    ];

    const wrapper = await mountCard(pinia, task);

    expect(wrapper.find(".tc-agent-btn").exists()).toBe(true);
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);
    await wrapper.find(".tc-agent-btn").trigger("mouseenter");
    await flush();
    const preview = document.body.querySelector("[data-test-id='task-agent-preview']");
    expect(preview).not.toBeNull();
    expect(preview?.textContent).toContain("PM");
    expect(preview?.textContent).toContain("Engineer");
    expect(preview?.textContent).toContain("Reviewer");
    expect(preview?.textContent).toContain("opencode-go/nimo-v2.5");
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);
    expect(document.body.querySelector(".am-modal")).toBeNull();

    vi.useFakeTimers();
    await wrapper.find(".tc-agent-btn").trigger("mouseleave");
    await vi.advanceTimersByTimeAsync(130);
    await flush();
    expect(document.body.querySelector("[data-test-id='task-agent-preview']")).toBeNull();

    // A click (including the touch activation path) still opens the editor panel.
    await wrapper.find(".tc-agent-btn").trigger("click");
    await flush();

    const rows = wrapper.findAll(".tc-agent-row");
    expect(rows).toHaveLength(3);
    const text = rows.map((r) => r.text());
    expect(text[0]).toContain("PM");
    expect(text[0]).toContain("openrouter/xiaomi/mimo-v2.5");
    expect(text[1]).toContain("EN");
    expect(text[1]).toContain("opencode-go/nimo-v2.5");
    expect(text[2]).toContain("RV");
    expect(text[2]).toContain("opencode-go/deepseek-v4.1-flash");
    wrapper.unmount();
  });

  it("shows the same read-only assignment preview on keyboard focus", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ cliOverride: "codex", modelOverride: "gpt-5" });
    stubFetch(task);
    await useRepoStore().init();
    const wrapper = await mountCard(pinia, task);

    await wrapper.find(".tc-agent-btn").trigger("focus");
    await flush();
    const preview = document.body.querySelector("[data-test-id='task-agent-preview']");
    expect(preview?.textContent).toContain("Engineer");
    expect(preview?.textContent).toContain("codex");
    expect(preview?.textContent).toContain("gpt-5");
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);

    wrapper.unmount();
    document.body.querySelector("[data-test-id='task-agent-preview']")?.remove();
  });

  it("keeps the assignment preview within a short viewport", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 160 });
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.classList.contains("tc-agent-btn")) {
          return {
            x: 290,
            y: 145,
            top: 145,
            right: 312,
            bottom: 160,
            left: 290,
            width: 22,
            height: 15,
            toJSON: () => ({}),
          };
        }
        if (this.classList.contains("tc-agent-preview")) {
          return {
            x: 0,
            y: 0,
            top: 0,
            right: 296,
            bottom: 220,
            left: 0,
            width: 296,
            height: 220,
            toJSON: () => ({}),
          };
        }
        return originalRect.call(this);
      },
    );

    const wrapper = await mountCard(pinia, task);
    await wrapper.find(".tc-agent-btn").trigger("mouseenter");
    await flush();

    const preview = document.body.querySelector<HTMLElement>("[data-test-id='task-agent-preview']");
    expect(preview).not.toBeNull();
    expect(preview?.style.top).toBe("12px");
    expect(preview?.style.left).toBe("12px");
    expect(preview?.style.maxHeight).toBe("136px");
    expect(preview?.style.width).toBe("296px");
    wrapper.unmount();
    preview?.remove();
  });

  it("toggles open and closed only from the robot button", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ agentOverride: "codex" });
    stubFetch(task);
    await useRepoStore().init();

    const wrapper = await mountCard(pinia, task);

    await wrapper.find(".tc-agent-btn").trigger("click");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);

    // Hovering elsewhere does not collapse the click-opened table.
    await wrapper.find(".task-card").trigger("mouseleave");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);

    // A second click collapses it.
    await wrapper.find(".tc-agent-btn").trigger("click");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);
  });

  it("falls back to the enabled board-default CLI and model per role", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const config = useConfigStore();
    config.agents = [
      { name: "engineer", cli: "opencode", model: "default", enabled: true },
      { name: "pm", cli: "opencode", model: "default", enabled: true },
      { name: "reviewer", cli: "opencode", model: "default", enabled: true },
      { name: "cto", cli: "opencode", model: "default", enabled: false },
    ];
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();

    const wrapper = await mountCard(pinia, task);
    await wrapper.find(".tc-agent-btn").trigger("click");
    await flush();

    const text = wrapper.findAll(".tc-agent-row").map((r) => r.text());
    expect(text[0]).toContain("opencode");
    expect(text[0]).toContain("default");
    expect(text[1]).toContain("opencode");
    expect(text[2]).toContain("opencode");
  });

  it("opens the shared picker from a row and writes that role's override", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();
    const config = useConfigStore();
    config.agents = [
      { name: "engineer", cli: "opencode", model: "default", enabled: true },
      { name: "pm", cli: "opencode", model: "default", enabled: true },
      { name: "reviewer", cli: "opencode", model: "default", enabled: true },
    ];
    config.agentsMeta.clis = ["opencode"];

    const wrapper = await mountCard(pinia, task);
    await wrapper.find(".tc-agent-btn").trigger("click");
    await wrapper.findAll(".tc-agent-row")[0].trigger("click");
    await flush();
    expect(document.body.querySelector(".am-modal")).not.toBeNull();

    wrapper.findComponent(AgentModelModal).vm.$emit("update:model", "opencode-go/nimo-v2.5");
    await flush();
    const patch = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url, options]) =>
        String(url).includes(`/api/tasks/${task.id}`) &&
        (options as RequestInit)?.method === "PATCH",
    );
    expect(JSON.parse((patch?.[1] as RequestInit).body as string)).toEqual({
      pmCliOverride: null,
      pmModelOverride: "opencode-go/nimo-v2.5",
    });
  });

  async function mountWithPopoverSeconds(seconds: number) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();
    const config = useConfigStore();
    config.agents = [
      { name: "engineer", cli: "opencode", model: "default", enabled: true },
      { name: "pm", cli: "opencode", model: "default", enabled: true },
      { name: "reviewer", cli: "opencode", model: "default", enabled: true },
    ];
    config.data = { board: { agentPopoverCloseSeconds: seconds } };
    return mountCard(pinia, task);
  }

  it("closes the agent popover after the configured delay and restarts it on hover", async () => {
    const wrapper = await mountWithPopoverSeconds(15);
    await wrapper.find(".tc-agent-btn").trigger("click");
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);
    await wrapper.find(".tc-agent-panel").trigger("mouseenter");
    await vi.advanceTimersByTimeAsync(14_000);
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(false);
  });

  it("leaves the agent popover open when the delay is 0", async () => {
    const wrapper = await mountWithPopoverSeconds(0);
    await wrapper.find(".tc-agent-btn").trigger("click");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);
  });
});

it("fades the agent popover out and skips that fade when motion is reduced", () => {
  const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
  expect(css).toMatch(/\.tc-agent-panel-leave-active\s*\{[^}]*opacity 0\.28s/);
  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.tc-agent-panel-leave-active[^}]*transition:\s*none/s,
  );
});
