/**
 * #0511 — card and drawer name the `needs_input` reason; idle review tasks
 * must not show a working indicator while needs-input uses a static warning.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import { nextTick } from "vue";
import TaskCard from "../src/components/TaskCard.vue";
import TaskDrawer from "../src/components/TaskDrawer.vue";
import { useRepoStore } from "../src/stores/repo";
import { useConfigStore } from "../src/stores/config";
import { useUiStore } from "../src/stores/ui";
import type { Task } from "../src/types";
import { NEEDS_INPUT_STATUS_LABELS } from "../src/lib/needs-input-ui";

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0506",
  title: "Test task",
  type: "feature",
  status: "review",
  priority: "p2",
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
  path: "work/0506-test.md",
  absPath: "/tmp/repo/work/0506-test.md",
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
    dirty: false,
  },
  preview: null,
  automaticReview: { running: false, enabled: true },
  ...over,
});

function mountCard(task: Task) {
  return mount(TaskCard, { props: { task, dragEnabled: false } });
}

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

async function mountDrawer(pinia: Pinia, task: Task) {
  const router = createRouter({ history: createMemoryHistory(), routes: [] });
  await router.push("/");
  await router.isReady();
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

function stubDrawerApi(
  task: Task,
  opts: { reviewRunning?: boolean; agentRunning?: boolean } = {},
): void {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
      if (url.includes("/api/index"))
        return json({ tasks: [task], counts: { ...EMPTY_COUNTS, review: 1 }, taskCount: 1 });
      if (url.includes("/api/agents/running")) {
        return json({
          tasks: opts.agentRunning ? [{ id: task.id, agent: "engineer" }] : [],
        });
      }
      if (url.includes("/review"))
        return json({
          ok: true,
          running: opts.reviewRunning ?? false,
          enabled: true,
          review: null,
          lines: [],
        });
      if (url.includes("/output")) return json({ ok: true, lines: [], stats: {} });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

describe("needs_input status labels on the board card (#0511)", () => {
  for (const [reason, label] of Object.entries(NEEDS_INPUT_STATUS_LABELS)) {
    it(`shows "${label}" for ${reason}`, () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const repo = useRepoStore();
      repo.reviews = {};
      const task = makeTask({
        status: "active",
        needsInput: true,
        needsInputReason: reason === "questions" ? undefined : reason,
        questions: reason === "questions" ? ["Which API?"] : undefined,
      });
      const wrapper = mountCard(task);
      const hint = wrapper.find(".tc-hint");
      expect(hint.classes()).toContain("tc-needs-input");
      expect(hint.find(".tc-needs-input-icon").exists()).toBe(true);
      expect(hint.find(".ai").exists()).toBe(false);
      expect(hint.text()).toContain(label);
      expect(wrapper.find(".tc-waiting").exists()).toBe(false);
    });
  }

  it("falls back to Needs your input for an unknown reason", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    repo.reviews = {};
    const task = makeTask({
      status: "active",
      needsInput: true,
      needsInputReason: "totally-unknown-reason",
    });
    const wrapper = mountCard(task);
    expect(wrapper.find(".tc-hint").text()).toContain("Needs your input");
  });

  it("shows review passed when dev-error needs_input is stale on a review task", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({
      needsInput: true,
      needsInputReason: "dev-error",
    });
    repo.reviews = {
      "0506": {
        running: false,
        enabled: true,
        lines: [],
        report: {
          id: "0506",
          at: new Date().toISOString(),
          agent: "reviewer",
          cli: "opencode",
          model: "default",
          branch: "feat/x",
          state: "ok",
          markdown: "## Verdict\ngood to go.",
        },
      },
    };
    const wrapper = mountCard(task);
    const hint = wrapper.find(".tc-hint");
    expect(hint.text()).toContain("ready to finish");
    expect(wrapper.find(".task-card").classes()).not.toContain("needs-input");
  });

  it("shows no working hint for review with needs_input and no running review", () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const repo = useRepoStore();
    const task = makeTask({
      needsInput: true,
      needsInputReason: "review-failed",
    });
    repo.reviews = {
      "0506": { running: false, enabled: true, lines: [], report: null },
    };
    const wrapper = mountCard(task);
    const hint = wrapper.find(".tc-hint");
    expect(hint.classes()).toContain("tc-needs-input");
    expect(hint.find(".ai").exists()).toBe(false);
    expect(hint.text()).toContain("Reviewer failed");
  });
});

describe("needs_input status labels in the task drawer (#0511)", () => {
  for (const [reason, label] of Object.entries(NEEDS_INPUT_STATUS_LABELS)) {
    it(`header chip shows "${label}" for ${reason}`, async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      FakeEventSource.instances = [];
      const task = makeTask({
        status:
          reason === "review-failed" ? "review" : reason === "underspecified" ? "inbox" : "active",
        needsInput: true,
        needsInputReason: reason === "questions" ? undefined : reason,
        questions: reason === "questions" ? ["Pick A or B"] : undefined,
      });
      stubDrawerApi(task);
      const wrapper = await mountDrawer(pinia, task);
      if (reason === "questions") {
        expect(wrapper.find(".questions-for-you-banner").exists()).toBe(true);
        expect(wrapper.find(".rs-chip.rs-needs-input").exists()).toBe(false);
      } else {
        const chip = wrapper.find(".rs-chip.rs-needs-input");
        expect(chip.exists()).toBe(true);
        expect(chip.text()).toContain(label);
      }
      expect(wrapper.find(".rs-reviewing").exists()).toBe(false);
    });
  }

  it("shows no review substate chip when review is idle with no verdict and no needs_input", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({ needsInput: false });
    stubDrawerApi(task);
    const wrapper = await mountDrawer(pinia, task);
    expect(wrapper.find(".rs-chip").exists()).toBe(false);
  });

  it("shows reviewing, not a stale needs-input chip, while a review is running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    FakeEventSource.instances = [];
    const task = makeTask({
      needsInput: true,
      needsInputReason: "watchdog-stuck",
    });
    stubDrawerApi(task, { reviewRunning: true });
    const repo = useRepoStore();
    repo.reviews = {
      "0506": { running: true, enabled: true, lines: [], report: null },
    };
    const wrapper = await mountDrawer(pinia, task);
    const chip = wrapper.find(".rs-chip");
    expect(chip.classes()).toContain("rs-reviewing");
    expect(chip.text()).toContain("reviewing");
    expect(wrapper.find(".rs-needs-input").exists()).toBe(false);
  });
});

describe("underspecified needs_input Send to PM (#0558)", () => {
  it("sends the flesh-out canned message when the banner primary action is clicked", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const sent: string[] = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (u.includes("/api/index"))
          return json({ tasks: [], counts: { ...EMPTY_COUNTS, inbox: 1 }, taskCount: 1 });
        if (u.includes("/api/agents/running")) return json({ tasks: [] });
        if (u.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (u.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (u.includes("/pm/message")) {
          const body = JSON.parse(String((init?.body as string) ?? "{}"));
          sent.push(body.text ?? "");
          return json({ ok: true, spawn: { ok: true, pid: 1 } });
        }
        throw new Error("unexpected fetch: " + u);
      }),
    );

    const task = makeTask({
      status: "inbox",
      needsInput: true,
      needsInputReason: "underspecified",
    });
    const ui = useUiStore();
    ui.open(task);
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    await router.push("/");
    await router.isReady();
    const wrapper = mount(TaskDrawer, {
      global: { plugins: [pinia, router], stubs: { teleport: true, Transition: true } },
    });
    await flush();

    const primary = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Send to PM (fleshes this out)"));
    expect(primary).toBeDefined();
    await primary!.trigger("click");
    await flush();

    expect(sent).toEqual(["Can you flesh this out?"]);
    expect(ui.activeTab).toBe("pm");
  });

  it("disables Send to PM when the PM agent is not configured", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const task = makeTask({
      status: "inbox",
      needsInput: true,
      needsInputReason: "underspecified",
    });
    stubDrawerApi(task);
    const config = useConfigStore();
    config.loaded = true;
    config.agents = [{ name: "pm", cli: "opencode", model: "default", enabled: false }];
    const wrapper = await mountDrawer(pinia, task);
    const primary = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Send to PM (fleshes this out)"));
    expect(primary).toBeDefined();
    expect((primary!.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Send to PM while a PM turn is already running", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const task = makeTask({
      status: "inbox",
      needsInput: true,
      needsInputReason: "underspecified",
    });
    stubDrawerApi(task);
    const repo = useRepoStore();
    repo.runningIds = [`pm-task-v2:${task.id}`];
    const wrapper = await mountDrawer(pinia, task);
    const primary = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Send to PM (fleshes this out)"));
    expect(primary).toBeDefined();
    expect((primary!.element as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("agent questions needs_input (#0566)", () => {
  beforeAll(() => {
    if (typeof HTMLElement.prototype.scrollTo !== "function") {
      Object.defineProperty(HTMLElement.prototype, "scrollTo", {
        configurable: true,
        writable: true,
        value: () => {},
      });
    }
  });

  it("shows one Questions for you banner and not the Task-tab duplicate", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const task = makeTask({
      status: "active",
      needsInput: true,
      questions: ["Which database?", "Include migrations?"],
    });
    stubDrawerApi(task);
    const wrapper = await mountDrawer(pinia, task);
    expect(wrapper.find(".questions-for-you-banner").exists()).toBe(true);
    expect(wrapper.find(".needs-input-block").exists()).toBe(false);
    expect(wrapper.findAll(".questions-for-you-banner")).toHaveLength(1);
    expect(wrapper.find(".agent-waiting").exists()).toBe(false);
    expect(wrapper.find(".drawer-head .rs-needs-input").exists()).toBe(false);
  });

  it("routes to PM without prefilling the compose box and sends question context", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const posts: { text?: string; answeringQuestions?: string[] }[] = [];
    const task = makeTask({
      status: "active",
      needsInput: true,
      questions: ["Which database?"],
    });
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 1, workDir: "work" });
        if (u.includes("/api/index"))
          return json({ tasks: [task], counts: { ...EMPTY_COUNTS, active: 1 }, taskCount: 1 });
        if (u.includes("/api/agents/running")) return json({ tasks: [] });
        if (u.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (u.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (u.includes("/pm/message")) {
          posts.push(JSON.parse(String((init?.body as string) ?? "{}")));
          return json({ ok: true, spawn: { ok: true, pid: 1 } });
        }
        throw new Error("unexpected fetch: " + u);
      }),
    );

    const wrapper = await mountDrawer(pinia, task);
    const answerBtn = wrapper.findAll("button").find((b) => b.text().includes("Answer in PM"));
    expect(answerBtn).toBeDefined();
    await answerBtn!.trigger("click");
    await flush();
    expect(useUiStore().activeTab).toBe("pm");
    expect(wrapper.find(".pm-open-questions").exists()).toBe(true);

    const textarea = wrapper.find('textarea[aria-label="Message PM"]');
    expect((textarea.element as HTMLTextAreaElement).value).toBe("");
    await textarea.setValue("Postgres with migrations.");
    await wrapper.find("form.ai-chat-compose").trigger("submit.prevent");
    await flush();

    expect(posts).toHaveLength(1);
    expect(posts[0]?.text).toBe("Postgres with migrations.");
    expect(posts[0]?.answeringQuestions).toEqual(["Which database?"]);
  });

  it("drops PM answer context when the drawer switches tasks", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const posts: { text?: string; answeringQuestions?: string[] }[] = [];
    const taskA = makeTask({
      id: "0566a",
      path: "work/0566a-a.md",
      absPath: "/tmp/repo/work/0566a-a.md",
      status: "active",
      needsInput: true,
      questions: ["Question for task A?"],
    });
    const taskB = makeTask({
      id: "0566b",
      path: "work/0566b-b.md",
      absPath: "/tmp/repo/work/0566b-b.md",
      status: "active",
      needsInput: false,
      questions: [],
    });
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 2, workDir: "work" });
        if (u.includes("/api/index"))
          return json({
            tasks: [taskA, taskB],
            counts: { ...EMPTY_COUNTS, active: 2 },
            taskCount: 2,
          });
        if (u.includes("/api/agents/running")) return json({ tasks: [] });
        if (u.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (u.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (u.includes("/pm/message")) {
          posts.push(JSON.parse(String((init?.body as string) ?? "{}")));
          return json({ ok: true, spawn: { ok: true, pid: 1 } });
        }
        throw new Error("unexpected fetch: " + u);
      }),
    );

    const ui = useUiStore();
    const wrapper = await mountDrawer(pinia, taskA);
    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Answer in PM"))!
      .trigger("click");
    await flush();
    expect(wrapper.find(".pm-open-questions").exists()).toBe(true);

    ui.open(taskB);
    await flush();
    expect(wrapper.find(".pm-open-questions").exists()).toBe(false);

    ui.activeTab = "pm";
    await flush();
    const textarea = wrapper.find('textarea[aria-label="Message PM"]');
    await textarea.setValue("Reply on task B only.");
    await wrapper.find("form.ai-chat-compose").trigger("submit.prevent");
    await flush();

    expect(posts).toHaveLength(1);
    expect(posts[0]?.text).toBe("Reply on task B only.");
    expect(posts[0]?.answeringQuestions).toBeUndefined();
  });

  it("does not restore answer draft or context on another task after a failed send", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const taskA = makeTask({
      id: "0566a",
      path: "work/0566a-a.md",
      absPath: "/tmp/repo/work/0566a-a.md",
      status: "active",
      needsInput: true,
      questions: ["Question for task A?"],
    });
    const taskB = makeTask({
      id: "0566b",
      path: "work/0566b-b.md",
      absPath: "/tmp/repo/work/0566b-b.md",
      status: "active",
      needsInput: false,
      questions: [],
    });
    let releaseSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/api/health"))
          return json({ ok: true, root: "/tmp/repo", taskCount: 2, workDir: "work" });
        if (u.includes("/api/index"))
          return json({
            tasks: [taskA, taskB],
            counts: { ...EMPTY_COUNTS, active: 2 },
            taskCount: 2,
          });
        if (u.includes("/api/agents/running")) return json({ tasks: [] });
        if (u.includes("/review"))
          return json({ ok: true, running: false, enabled: true, review: null, lines: [] });
        if (u.includes("/output")) return json({ ok: true, lines: [], stats: {} });
        if (u.includes("/pm/message")) {
          await sendGate;
          return { ok: false, status: 500, json: async () => ({ error: "PM failed" }) };
        }
        throw new Error("unexpected fetch: " + u);
      }),
    );

    const ui = useUiStore();
    const repo = useRepoStore();
    vi.spyOn(repo, "onError").mockImplementation(() => {});
    const wrapper = await mountDrawer(pinia, taskA);
    await wrapper
      .findAll("button")
      .find((b) => b.text().includes("Answer in PM"))!
      .trigger("click");
    await flush();
    const textarea = wrapper.find('textarea[aria-label="Message PM"]');
    await textarea.setValue("Answer for task A.");
    const sendPromise = wrapper.find("form.ai-chat-compose").trigger("submit.prevent");
    await flush();

    ui.open(taskB);
    await flush();
    releaseSend!();
    await sendPromise;
    await flush();

    ui.activeTab = "pm";
    await flush();
    expect(
      (wrapper.find('textarea[aria-label="Message PM"]').element as HTMLTextAreaElement).value,
    ).toBe("");
    expect(wrapper.find(".pm-open-questions").exists()).toBe(false);
  });
});
