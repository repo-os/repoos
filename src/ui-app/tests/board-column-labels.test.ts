/**
 * Board column labels (#0396): configurable display labels for the six board
 * columns via [board.columns] in repoos.toml. Tests that:
 * - Config store's columnLabels resolves overrides over defaults
 * - DashboardView passes configured labels to stat cards
 * - Canonical status IDs are preserved alongside display labels
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import type { ConfigField } from "../src/types";
import DashboardView from "../src/views/DashboardView.vue";

const api = vi.spyOn(apiMod, "api");

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function schemaField(key: string): ConfigField {
  return {
    key,
    label: key,
    type: "string",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: "",
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
      ...Object.keys(labels).map((k) => schemaField(`board.columns.${k}`)),
    ],
  });
  await useConfigStore().load();
}

const DASH_STUBS = {
  StatCard: true,
  FeedPanel: true,
  NeedsYouPanel: true,
  SystemResourcePanel: true,
  UsagePanel: true,
  AutoEngineeringPanel: true,
  ReleaseTimeline: true,
  TestRunPanel: true,
} as const;

beforeEach(() => {
  setActivePinia(createPinia());
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
    // All six status IDs should still be present as keys
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

describe("DashboardView column labels", () => {
  it("passes default labels to stat cards", async () => {
    await loadConfig();
    const wrapper = mount(DashboardView, { global: { stubs: DASH_STUBS } });
    await flushPromises();
    const statCards = wrapper.findAllComponents({ name: "StatCard" });
    expect(statCards.length).toBe(6);
    expect(statCards[0].props("label")).toBe("Proposed / Drafts");
    expect(statCards[1].props("label")).toBe("Inbox");
    expect(statCards[5].props("label")).toBe("Done");
  });

  it("passes configured labels to stat cards", async () => {
    await loadConfig({ draft: "Ideas", done: "Shipped" });
    const wrapper = mount(DashboardView, { global: { stubs: DASH_STUBS } });
    await flushPromises();
    const statCards = wrapper.findAllComponents({ name: "StatCard" });
    expect(statCards[0].props("label")).toBe("Ideas");
    expect(statCards[5].props("label")).toBe("Shipped");
    // Non-overridden columns keep defaults
    expect(statCards[1].props("label")).toBe("Inbox");
  });
});
