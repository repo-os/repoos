/**
 * #1040 — Easter eggs bundle: card details link (E1) and agent popover rows (E2).
 *
 * E1: a needs-input card renders no separate "Details" link — the blurb alone
 * opens Status details, is keyboard-operable, and carries an accessible name.
 * E2: each hover-popover row (PM / Engineer / Reviewer) opens the same agent
 * editor the robot-icon click opens, focused on that role, and rows are
 * keyboard-operable with accessible names.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mount, DOMWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import AgentModelModal from "../src/components/AgentModelModal.vue";
import { useRepoStore } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "1040",
  title: "Needs input fixture",
  type: "chore",
  status: "active",
  priority: "p3",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "feat/x",
  tags: [],
  needsInput: true,
  needsInputReason: "dev-error",
  needsInputDetail: "crash recovery could not start the engineer",
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/1040-fixture.md",
  absPath: "/tmp/repo/work/1040-fixture.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  pmAgentOverride: null,
  pmCliOverride: null,
  pmModelOverride: null,
  reviewAgentOverride: null,
  reviewCliOverride: null,
  reviewModelOverride: null,
  git: {
    branchExists: true,
    worktreeExists: true,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: "/tmp/wt",
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
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
      if (url.includes(`/api/tasks/${task.id}`)) return json(task);
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/diff-stats")) return json({ filesChanged: 0, additions: 0, deletions: 0 });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

function seedAgents(): void {
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
}

async function mountCard(pinia: Pinia, task: Task) {
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    // Attached: the preview teleports to body, and the focus-management tests
    // need the trigger in the same document to move focus between the two.
    attachTo: document.body,
    global: { plugins: [pinia] },
  });
  await flush();
  return wrapper;
}

async function openPreview(pinia: Pinia, task: Task) {
  const wrapper = await mountCard(pinia, task);
  await wrapper.find(".tc-agent-btn").trigger("mouseenter");
  await flush();
  const preview = document.body.querySelector("[data-test-id='task-agent-preview']");
  expect(preview).not.toBeNull();
  return { wrapper, preview: preview as HTMLElement };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.querySelector("[data-test-id='task-agent-preview']")?.remove();
});

describe("needs-input blurb without Details link (#1040 E1)", () => {
  const cases: Array<{ reason: "dev-error" | "needs-human-step" | "check-wait"; detail: string }> =
    [
      { reason: "dev-error", detail: "crash recovery could not start the engineer" },
      {
        reason: "needs-human-step",
        detail: "Criterion “Rotate keys” — Decision model (91%): needs a real account.",
      },
      {
        reason: "check-wait",
        detail:
          "waiting: waiting for a local check slot (3 ahead, position 4); slot holder idle for 30 minutes",
      },
    ];

  it.each(cases)(
    "renders no Details link for $reason, click opens Status details",
    async ({ reason, detail }) => {
      const pinia = createPinia();
      setActivePinia(pinia);
      FakeEventSource.instances = [];
      vi.stubGlobal("EventSource", FakeEventSource);
      const task = makeTask({ needsInputReason: reason, needsInputDetail: detail });
      stubFetch(task);
      await useRepoStore().init();
      const ui = useUiStore();
      const opened = vi.spyOn(ui, "openTask").mockResolvedValue();
      const wrapper = await mountCard(pinia, task);

      const blurb = wrapper.get('[data-test-id="task-card-needs-input-detail"]');
      expect(blurb.text()).toContain(detail.slice(0, 20));
      expect(blurb.text()).not.toContain("Details");
      expect(wrapper.find(".diagnostic-details-affordance").exists()).toBe(false);
      // Accessible name survives the link removal.
      expect(blurb.attributes("aria-label")).toContain("Open Status details");

      await blurb.trigger("click");
      expect(opened).toHaveBeenCalledWith(task);
      expect(ui.activeTab).toBe("debug");
      expect(ui.debugView).toBe("status");
      wrapper.unmount();
    },
  );

  it("is keyboard-operable: Enter and Space open Status details", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask();
    stubFetch(task);
    await useRepoStore().init();
    const ui = useUiStore();
    const opened = vi.spyOn(ui, "openTask").mockResolvedValue();
    const wrapper = await mountCard(pinia, task);

    const blurb = wrapper.get('[data-test-id="task-card-needs-input-detail"]');
    expect(blurb.element.tagName).toBe("BUTTON");

    await blurb.trigger("keydown.enter");
    expect(opened).toHaveBeenCalledWith(task);
    opened.mockClear();
    await blurb.trigger("keydown.space");
    expect(opened).toHaveBeenCalledWith(task);
    wrapper.unmount();
  });
});

describe("agent preview rows open the editor (#1040 E2)", () => {
  it.each([
    { key: "pm", label: "PM", model: "openrouter/xiaomi/mimo-v2.5" },
    { key: "engineer", label: "Engineer", model: "opencode-go/nimo-v2.5" },
    { key: "reviewer", label: "Reviewer", model: "opencode-go/deepseek-v4.1-flash" },
  ])(
    "clicking the $label row opens the editor focused on that role",
    async ({ key, label, model }) => {
      const pinia = createPinia();
      setActivePinia(pinia);
      FakeEventSource.instances = [];
      vi.stubGlobal("EventSource", FakeEventSource);
      const task = makeTask({ needsInput: false });
      stubFetch(task);
      await useRepoStore().init();
      seedAgents();
      const { wrapper, preview } = await openPreview(pinia, task);

      const row = new DOMWrapper(
        preview.querySelector(`[data-test-id='task-agent-preview-row-${key}']`)!,
      );
      expect(row.attributes("role")).toBe("button");
      expect(row.attributes("tabindex")).toBe("0");
      // Accessible name carries role, agent and model.
      expect(row.attributes("aria-label")).toContain(label);
      expect(row.attributes("aria-label")).toContain("opencode");
      expect(row.attributes("aria-label")).toContain(model);

      await row.trigger("click");
      await flush();
      // Same editor the icon click opens (the assignment panel)…
      expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);
      // …focused on the row's role (the agent/model picker for that role).
      const modalProps = wrapper.findComponent(AgentModelModal).props() as Record<string, unknown>;
      expect(modalProps.open).toBe(true);
      expect(modalProps.memoryKey).toContain(`:${key}`);
      // The preview closes once its row is used.
      expect(document.body.querySelector("[data-test-id='task-agent-preview']")).toBeNull();
      wrapper.unmount();
    },
  );

  it("uses interactive popover semantics, not tooltip semantics", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ needsInput: false });
    stubFetch(task);
    await useRepoStore().init();
    seedAgents();
    const { wrapper, preview } = await openPreview(pinia, task);

    const trigger = wrapper.find(".tc-agent-btn");
    expect(trigger.attributes("aria-haspopup")).toBe("dialog");
    expect(trigger.attributes("aria-describedby")).toBeUndefined();
    expect(trigger.attributes("title")).toBeUndefined();
    expect(preview.getAttribute("role")).toBe("dialog");
    expect(preview.getAttribute("aria-label")).toContain("agent assignments");
    wrapper.unmount();
  });

  it("Tab from the trigger moves focus into the rows; Shift+Tab returns", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ needsInput: false });
    stubFetch(task);
    await useRepoStore().init();
    seedAgents();
    const wrapper = await mountCard(pinia, task);

    // Keyboard users open the preview by focusing the trigger…
    const trigger = wrapper.find(".tc-agent-btn");
    await trigger.trigger("focus");
    await flush();
    const preview = document.body.querySelector("[data-test-id='task-agent-preview']");
    expect(preview).not.toBeNull();
    // …and the trigger names the preview while it is open.
    expect(trigger.attributes("aria-controls")).toContain(`task-agent-preview-${task.id}`);
    // The actual keyboard sequence: Tab enters the first row (the body-teleported
    // preview sits last in tab order, so default Tab would walk the card instead).
    await trigger.trigger("keydown", { key: "Tab" });
    const firstRow = document.body.querySelector("[data-test-id='task-agent-preview-row-pm']")!;
    expect(document.activeElement).toBe(firstRow);
    // Shift+Tab on the first row returns to the trigger.
    await new DOMWrapper(firstRow).trigger("keydown", { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("Escape closes the preview and returns focus to the trigger", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ needsInput: false });
    stubFetch(task);
    await useRepoStore().init();
    seedAgents();
    const wrapper = await mountCard(pinia, task);

    const trigger = wrapper.find(".tc-agent-btn");
    await trigger.trigger("focus");
    await flush();
    await trigger.trigger("keydown", { key: "Tab" });
    const firstRow = new DOMWrapper(
      document.body.querySelector("[data-test-id='task-agent-preview-row-pm']")!,
    );
    expect(document.activeElement).toBe(firstRow.element);
    await firstRow.trigger("keydown", { key: "Escape" });
    await flush();
    expect(document.body.querySelector("[data-test-id='task-agent-preview']")).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    wrapper.unmount();
  });

  it("rows are keyboard-operable: Enter and Space open the role editor", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ needsInput: false });
    stubFetch(task);
    await useRepoStore().init();
    seedAgents();
    const { wrapper, preview } = await openPreview(pinia, task);

    const pmRow = new DOMWrapper(
      preview.querySelector("[data-test-id='task-agent-preview-row-pm']")!,
    );
    await pmRow.trigger("keydown.enter");
    await flush();
    expect(wrapper.find(".tc-agent-panel").exists()).toBe(true);
    expect(
      (wrapper.findComponent(AgentModelModal).props() as Record<string, unknown>).memoryKey,
    ).toContain(":pm");
    wrapper.unmount();
    document.body.querySelector("[data-test-id='task-agent-preview']")?.remove();

    const second = await openPreview(pinia, task);
    const engRow = new DOMWrapper(
      second.preview.querySelector("[data-test-id='task-agent-preview-row-engineer']")!,
    );
    await engRow.trigger("keydown.space");
    await flush();
    expect(second.wrapper.find(".tc-agent-panel").exists()).toBe(true);
    expect(
      (second.wrapper.findComponent(AgentModelModal).props() as Record<string, unknown>).memoryKey,
    ).toContain(":engineer");
    second.wrapper.unmount();
  });

  it("stays open while the pointer is over the popover, closes after leaving", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const task = makeTask({ needsInput: false });
    stubFetch(task);
    await useRepoStore().init();
    seedAgents();
    const wrapper = await mountCard(pinia, task);
    await wrapper.find(".tc-agent-btn").trigger("mouseenter");
    await flush();
    expect(document.body.querySelector("[data-test-id='task-agent-preview']")).not.toBeNull();

    // Shared popover pattern: the body-teleported layer carries data-overlay-layer.
    const preview = new DOMWrapper(
      document.body.querySelector("[data-test-id='task-agent-preview']")!,
    );
    expect(preview.attributes("data-overlay-layer")).toBe("floating");

    // Moving from the icon into the popover must not close it before the click.
    await wrapper.find(".tc-agent-btn").trigger("mouseleave");
    await preview.trigger("mouseenter");
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(document.body.querySelector("[data-test-id='task-agent-preview']")).not.toBeNull();

    // Leaving the popover still dismisses it after the delay.
    await preview.trigger("mouseleave");
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(document.body.querySelector("[data-test-id='task-agent-preview']")).toBeNull();
    wrapper.unmount();
  });
});
