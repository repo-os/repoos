/**
 * Board column labels (#0396): configurable display labels for the six board
 * columns via [board.columns] in repoos.toml. Tests that:
 * - Config store's columnLabels resolves overrides over defaults
 * - WorkView passes configured labels (including Draft column) to BoardColumn
 * - DashboardView uses original labels by default, configured when set
 * - Canonical status IDs are preserved alongside display labels
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, DOMWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import { useRepoStore } from "../src/stores/repo";
import type { ConfigField, Task } from "../src/types";
import WorkView from "../src/views/WorkView.vue";
import DashboardView from "../src/views/DashboardView.vue";
import SettingsView from "../src/views/SettingsView.vue";

const api = vi.spyOn(apiMod, "api");

let currentQuery: Record<string, string | string[]> = {};
const replaceSpy = vi.fn(async () => {});

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: currentQuery }),
  useRouter: () => ({ replace: replaceSpy, push: vi.fn() }),
}));

function makeTask(id: string, status: Task["status"] = "ready"): Task {
  return {
    id,
    title: `Task ${id}`,
    type: "feature",
    status,
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
    path: `work/${id}-task.md`,
    absPath: `/tmp/repo/work/${id}-task.md`,
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
  };
}

function schemaField(key: string, defaultVal = ""): ConfigField {
  return {
    key,
    label: key,
    type: "string",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: defaultVal,
    description: "",
    options: [],
  } as ConfigField;
}

async function loadConfig(boardColumns?: Record<string, string>): Promise<void> {
  const labels = boardColumns ?? {
    draft: "Proposed / Drafts",
    inbox: "Inbox",
    ready: "Ready",
    active: "Active",
    review: "Review",
    done: "Done",
  };
  api.mockResolvedValue({
    config: {
      maxActiveTasks: 3,
      board: { columns: labels },
    },
    schema: [
      schemaField("maxActiveTasks"),
      ...Object.keys(labels).map((k) => schemaField(`board.columns.${k}`, labels[k])),
    ],
  });
  await useConfigStore().load();
}

const BOARD_COL_STUB = {
  name: "BoardColumn",
  template: "<div><slot /></div>",
  props: ["col", "barColor", "emptyText", "forceExpand", "highlightId", "dragEnabled"],
};

const STAT_CARD_STUB = {
  name: "StatCard",
  template: "<div class='stat-card-stub' />",
  props: ["label", "value", "bg", "color", "glow"],
};

const WORK_STUBS = { BoardColumn: BOARD_COL_STUB, IntegrationStatusBar: true } as const;

const DASH_STUBS = {
  StatCard: STAT_CARD_STUB,
  FeedPanel: true,
  NeedsYouPanel: true,
  SystemResourcePanel: true,
  UsagePanel: true,
  AutoEngineeringPanel: true,
  ReleaseTimeline: true,
} as const;

beforeEach(() => {
  setActivePinia(createPinia());
  currentQuery = {};
  replaceSpy.mockClear();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("config store columnLabels", () => {
  it("returns defaults when no board.columns configured", async () => {
    await loadConfig();
    const config = useConfigStore();
    expect(config.columnLabels).toEqual({
      draft: "Proposed / Drafts",
      inbox: "Inbox",
      ready: "Ready",
      active: "Active",
      review: "Review",
      done: "Done",
    });
  });

  it("merges overrides over defaults", async () => {
    await loadConfig({ draft: "Ideas", done: "Shipped" });
    const config = useConfigStore();
    expect(config.columnLabels.draft).toBe("Ideas");
    expect(config.columnLabels.done).toBe("Shipped");
    expect(config.columnLabels.inbox).toBe("Inbox");
  });

  it("preserves canonical status IDs alongside labels", async () => {
    await loadConfig({ draft: "Ideas" });
    const config = useConfigStore();
    expect(Object.keys(config.columnLabels)).toEqual([
      "draft",
      "inbox",
      "ready",
      "active",
      "review",
      "done",
    ]);
  });
});

describe("WorkView board column labels", () => {
  it("passes configured labels to BoardColumn (including Draft column)", async () => {
    await loadConfig({ draft: "Ideas", inbox: "Backlog", done: "Shipped" });
    const repo = useRepoStore();
    repo.tasks = [makeTask("0001", "ready")];
    repo.counts = { draft: 0, inbox: 0, ready: 1, active: 0, review: 0, done: 0 };
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();
    const boardCols = wrapper.findAllComponents({ name: "BoardColumn" });
    expect(boardCols.length).toBeGreaterThanOrEqual(2);
    expect(boardCols[0].props("col").id).toBe("draft");
    expect(boardCols[0].props("col").label).toBe("Ideas");
    const inboxCol = boardCols.find((c) => c.props("col").id === "inbox");
    expect(inboxCol?.props("col").label).toBe("Backlog");
  });

  it("uses default labels when no config", async () => {
    await loadConfig();
    const repo = useRepoStore();
    repo.tasks = [makeTask("0001", "ready")];
    repo.counts = { draft: 0, inbox: 0, ready: 1, active: 0, review: 0, done: 0 };
    const wrapper = mount(WorkView, { global: { stubs: WORK_STUBS } });
    await flushPromises();
    const boardCols = wrapper.findAllComponents({ name: "BoardColumn" });
    expect(boardCols[0].props("col").label).toBe("Proposed / Drafts");
    const inboxCol = boardCols.find((c) => c.props("col").id === "inbox");
    expect(inboxCol?.props("col").label).toBe("Inbox");
  });
});

describe("DashboardView column labels", () => {
  it("uses original labels by default (no config)", async () => {
    await loadConfig();
    const wrapper = mount(DashboardView, { global: { stubs: DASH_STUBS } });
    await flushPromises();
    const statCards = wrapper.findAllComponents({ name: "StatCard" });
    expect(statCards.length).toBe(6);
    expect(statCards[0].props("label")).toBe("drafts");
    expect(statCards[5].props("label")).toBe("done");
  });

  it("uses configured labels when board.columns is set", async () => {
    await loadConfig({ draft: "Ideas", done: "Shipped" });
    const wrapper = mount(DashboardView, { global: { stubs: DASH_STUBS } });
    await flushPromises();
    const statCards = wrapper.findAllComponents({ name: "StatCard" });
    expect(statCards[0].props("label")).toBe("Ideas");
    expect(statCards[5].props("label")).toBe("Shipped");
  });

  it("non-overridden columns keep original labels", async () => {
    await loadConfig({ draft: "Ideas" });
    const wrapper = mount(DashboardView, { global: { stubs: DASH_STUBS } });
    await flushPromises();
    const statCards = wrapper.findAllComponents({ name: "StatCard" });
    expect(statCards[0].props("label")).toBe("Ideas");
    // done card keeps its original label
    expect(statCards[5].props("label")).toBe("done");
  });
});

const DEFAULT_LABELS = {
  draft: "Proposed / Drafts",
  inbox: "Inbox",
  ready: "Ready",
  active: "Active",
  review: "Review",
  done: "Done",
};

function boardColumnSchema(): ConfigField[] {
  return Object.entries(DEFAULT_LABELS).map(([status, label]) =>
    schemaField(`board.columns.${status}`, label),
  );
}

function settingsConfigResponse(boardOverrides?: Record<string, string>) {
  const columns = { ...DEFAULT_LABELS, ...boardOverrides };
  return {
    config: {
      maxActiveTasks: 3,
      board: { columns },
    },
    schema: [schemaField("maxActiveTasks"), ...boardColumnSchema()],
  };
}

async function loadSettingsConfig(boardOverrides?: Record<string, string>): Promise<void> {
  api.mockResolvedValue(settingsConfigResponse(boardOverrides));
  await useConfigStore().load();
}

async function mountSettings(tab: "general" | "advanced" = "general") {
  currentQuery = { tab };
  const wrapper = mount(SettingsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

function boardColumnDraftRow(): HTMLElement | null {
  return document.getElementById("setting-board.columns.draft");
}

function boardColumnDraftInput(): HTMLInputElement | null {
  return boardColumnDraftRow()?.querySelector("input") ?? null;
}

describe("SettingsView board column labels (#0499)", () => {
  beforeEach(() => {
    (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
  });

  it("renders column label inputs on Advanced, not General", async () => {
    await loadSettingsConfig();
    const general = await mountSettings("general");
    const row = boardColumnDraftRow();
    expect(row).not.toBeNull();
    expect(document.getElementById("settings-panel-general")?.contains(row!)).toBe(false);
    expect(document.getElementById("settings-panel-advanced")?.contains(row!)).toBe(true);
    general.unmount();

    const advanced = await mountSettings("advanced");
    expect(boardColumnDraftInput()).not.toBeNull();
    expect(document.getElementById("setting-board.columns.done")).not.toBeNull();
    advanced.unmount();
  });

  it("auto-save PATCH includes a new column label", async () => {
    await loadSettingsConfig();
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = await mountSettings("advanced");
    const input = boardColumnDraftInput();
    expect(input).not.toBeNull();
    await new DOMWrapper(input!).setValue("Ideas");
    await flushPromises();
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });

    expect(saveSpy).toHaveBeenCalled();
    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body["board.columns.draft"]).toBe("Ideas");
    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("clearing a field submits the column default", async () => {
    await loadSettingsConfig({ draft: "Ideas" });
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = await mountSettings("advanced");
    const input = boardColumnDraftInput();
    await new DOMWrapper(input!).setValue("");
    await flushPromises();
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });

    expect(saveSpy).toHaveBeenCalled();
    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body["board.columns.draft"]).toBe(DEFAULT_LABELS.draft);
    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("rejects duplicate and over-length labels without PATCH", async () => {
    await loadSettingsConfig();
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = await mountSettings("advanced");

    const draftInput = boardColumnDraftInput();
    expect(draftInput).not.toBeNull();
    await new DOMWrapper(draftInput!).setValue("Inbox");
    await flushPromises();
    await new Promise((r) => setTimeout(r, 600));
    await flushPromises();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(boardColumnDraftRow()?.querySelector(".ff-error")?.textContent).toMatch(/already used/i);

    await new DOMWrapper(draftInput!).setValue("x".repeat(41));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 600));
    await flushPromises();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(boardColumnDraftRow()?.querySelector(".ff-error")?.textContent).toMatch(
      /40 characters/i,
    );

    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("?focus=board.columns.draft opens Advanced and focuses the row", async () => {
    await loadSettingsConfig();
    currentQuery = { focus: "board.columns.draft" };
    const scroll = Element.prototype.scrollIntoView as unknown as ReturnType<typeof vi.fn>;
    const wrapper = mount(SettingsView, { attachTo: document.body });
    await flushPromises();
    await vi.waitFor(() => expect(scroll).toHaveBeenCalled(), { timeout: 2500 });

    expect(replaceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "settings",
        query: expect.objectContaining({ tab: "advanced" }),
      }),
    );
    expect((scroll.mock.contexts[0] as HTMLElement).id).toBe("setting-board.columns.draft");
    wrapper.unmount();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });
});
