/**
 * #0342: changing an agent's CLI in the Coding Agent + Model modal used to
 * reset its model to "default" and auto-save it instantly, wiping a
 * deliberately pinned model id. The modal now remembers a model per CLI, so
 * switching away and back restores the pin instead of destroying it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AgentModelModal from "../src/components/AgentModelModal.vue";
import { useModelMemory } from "../src/composables/useModelMemory";
import { useConfigStore } from "../src/stores/config";

const PIN = "deepinfra/deepseek-ai/DeepSeek-V4-Flash-0731";
const CLAUDE_PIN = "sonnet";

const MODEL_OPTIONS = [
  { value: "default", label: "Default", disabled: false },
  { value: PIN, label: "DeepSeek V4 Flash", disabled: false },
  { value: CLAUDE_PIN, label: "Claude Sonnet", disabled: false },
];

// Render dialog primitive children in place; the real radix components only add
// portal/overlay behaviour the test doesn't exercise (and recurse under jsdom).
const Slot = {
  setup:
    (_props: unknown, { slots }: { slots: { default?: () => unknown } }) =>
    () =>
      slots.default?.(),
};
const dialogStubs = {
  teleport: true,
  Dialog: Slot,
  DialogContent: Slot,
  DialogOverlay: true,
  DialogTitle: Slot,
  DialogDescription: Slot,
  DialogClose: Slot,
};

function mountModal(cli: string, model: string): VueWrapper {
  return mount(AgentModelModal, {
    props: {
      open: true,
      cliOptions: ["opencode", "claude code"],
      modelOptions: MODEL_OPTIONS,
      cli,
      model,
    },
    global: { stubs: dialogStubs },
  });
}

function cliButton(wrapper: VueWrapper, label: string) {
  const btn = wrapper.findAll(".am-cli-btn").find((b) => b.text() === label);
  if (!btn) throw new Error(`no CLI button "${label}"`);
  return btn;
}

function lastModel(wrapper: VueWrapper): unknown {
  const emitted = wrapper.emitted("update:model");
  return emitted ? emitted[emitted.length - 1]![0] : undefined;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  // The modal validates a recalled pin against the CLI's real option list
  // (`config.modelsFor`), so give opencode a live list containing the pin.
  const config = useConfigStore();
  config.liveModelsByCli = { opencode: [PIN] };
  config.modelsLoaded = true;
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useModelMemory", () => {
  it("remembers and recalls a model per CLI", () => {
    const { remember, recall } = useModelMemory();
    remember("opencode", PIN);
    expect(recall("opencode")).toBe(PIN);
    expect(recall("claude code")).toBeUndefined();
  });

  it("ignores empty values and survives corrupted storage", () => {
    const { remember, recall } = useModelMemory();
    remember("", PIN);
    remember("opencode", "");
    expect(recall("opencode")).toBeUndefined();

    localStorage.setItem("agent-model-last-by-cli", "not json");
    expect(() => recall("opencode")).not.toThrow();
    expect(recall("opencode")).toBeUndefined();
  });
});

describe("isKnownModelForCli", () => {
  it("rejects a model the CLI no longer lists", () => {
    const config = useConfigStore();
    expect(config.isKnownModelForCli("claude code", "ghost")).toBe(false);
    expect(config.isKnownModelForCli("claude code", "sonnet")).toBe(true);
  });

  it("trusts a pin when the live list hasn't loaded", () => {
    const config = useConfigStore();
    config.modelsLoaded = false;
    expect(config.isKnownModelForCli("opencode", "ghost")).toBe(true);
  });
});

describe("AgentModelModal CLI switching", () => {
  it("resets to default for a CLI that was never pinned", async () => {
    const wrapper = mountModal("opencode", PIN);

    await cliButton(wrapper, "claude code").trigger("click");

    expect(wrapper.emitted("update:cli")?.[0]).toEqual(["claude code"]);
    expect(lastModel(wrapper)).toBe("default");
  });

  it("restores the pinned model when switching away and back", async () => {
    const wrapper = mountModal("opencode", PIN);

    await cliButton(wrapper, "claude code").trigger("click");
    expect(lastModel(wrapper)).toBe("default");

    // Parent applies the change before the user switches back.
    await wrapper.setProps({ cli: "claude code", model: "default" });
    await cliButton(wrapper, "opencode").trigger("click");

    expect(lastModel(wrapper)).toBe(PIN);
  });

  it("restores a model picked since the last time the CLI was left", async () => {
    const wrapper = mountModal("opencode", PIN);

    await cliButton(wrapper, "claude code").trigger("click");
    await wrapper.setProps({ cli: "claude code", model: "default" });

    // Pick a model for claude code, then leave and come back.
    const option = wrapper
      .findAll('[role="option"]')
      .find((o) => o.text().includes("Claude Sonnet"));
    await option!.trigger("click");
    await wrapper.setProps({ cli: "claude code", model: CLAUDE_PIN });

    await cliButton(wrapper, "opencode").trigger("click");
    await wrapper.setProps({ cli: "opencode", model: PIN });
    await cliButton(wrapper, "claude code").trigger("click");

    expect(lastModel(wrapper)).toBe(CLAUDE_PIN);
  });

  it("falls back to default when the remembered model is no longer offered", async () => {
    // A CLI's live model list can shift between sessions; a stale pin must not
    // be re-persisted silently (the failure class this task targets).
    useModelMemory().remember("claude code", "ghost-model-that-no-longer-exists");
    const wrapper = mountModal("opencode", PIN);

    await cliButton(wrapper, "claude code").trigger("click");

    expect(lastModel(wrapper)).toBe("default");
  });

  it("recalls a pin across modal instances (browser-local memory)", async () => {
    const first = mountModal("opencode", PIN);
    await cliButton(first, "claude code").trigger("click");
    first.unmount();

    const second = mountModal("claude code", "default");
    await cliButton(second, "opencode").trigger("click");

    expect(lastModel(second)).toBe(PIN);
  });

  it("does nothing when re-selecting the active CLI", async () => {
    const wrapper = mountModal("opencode", PIN);

    await cliButton(wrapper, "opencode").trigger("click");

    expect(wrapper.emitted("update:cli")).toBeUndefined();
    expect(wrapper.emitted("update:model")).toBeUndefined();
  });
});
