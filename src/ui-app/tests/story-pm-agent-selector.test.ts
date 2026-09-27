/**
 * The story panel's PM tab carries the same agent + model selector as the task
 * panel's PM tab: the shared <AgentModelControl>, rendered in the shared
 * <PmChatSurface>'s header slot, with the pick remembered per story and sent as
 * an override with each message.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import * as apiMod from "../src/api";
import StoryPmChat from "../src/components/StoryPmChat.vue";
import AgentModelControl from "../src/components/AgentModelControl.vue";
import PmChatSurface from "../src/components/PmChatSurface.vue";
import { useConfigStore } from "../src/stores/config";
import type { MergedStoryGroup } from "../../core/story-display";
import type { Task } from "../src/types";

const api = vi.spyOn(apiMod, "api");
let wrapper: VueWrapper | null = null;

const story = {
  key: "alpha slice",
  number: "0001",
  name: "Alpha slice",
  tasks: [],
  total: 0,
  attention: 0,
  complete: false,
} as unknown as MergedStoryGroup<Task>;

beforeEach(() => {
  setActivePinia(createPinia());
  window.localStorage.clear();
  const config = useConfigStore();
  config.loaded = true;
  config.agents = [
    { name: "pm", cli: "claude code", model: "opus", enabled: true },
  ] as unknown as typeof config.agents;
  config.agentsMeta = {
    clis: ["claude code", "opencode", "antigravity"],
    models: [],
    defaults: [],
    skills: [],
  } as unknown as typeof config.agentsMeta;
  api.mockReset();
  api.mockResolvedValue({ ok: true, lines: [] });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

async function mountChat(): Promise<VueWrapper> {
  wrapper = mount(StoryPmChat, { props: { story }, attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe("story PM tab agent + model selector", () => {
  it("renders the shared selector inside the chat surface, showing the configured pm agent", async () => {
    const w = await mountChat();
    const control = w.findComponent(AgentModelControl);
    expect(control.exists()).toBe(true);
    // It lives inside the surface's padded body, same as the task panel's.
    expect(w.findComponent(PmChatSurface).find(".agent-override-bar .am-control").exists()).toBe(
      true,
    );
    expect(control.text()).toContain("claude code");
  });

  it("does not offer antigravity (a story has no worktree to run it in)", async () => {
    const w = await mountChat();
    const props = w.findComponent(AgentModelControl).props() as { cliOptions: string[] };
    expect(props.cliOptions).not.toContain("antigravity");
  });

  it("sends only the differing cli/model with a message, and remembers the pick per story", async () => {
    const w = await mountChat();
    const control = w.findComponent(AgentModelControl);
    await control.vm.$emit("update:cli", "opencode");
    await control.vm.$emit("update:model", "opencode/big-pickle");
    await flushPromises();

    const surface = w.findComponent(PmChatSurface);
    await surface.vm.$emit("update:draft", "Break this down.");
    await surface.vm.$emit("send");
    await flushPromises();

    const call = api.mock.calls.find((c) => String(c[0]).endsWith("/pm/message"));
    expect(call).toBeTruthy();
    const body = JSON.parse(String((call![1] as { body: string }).body));
    expect(body.text).toBe("Break this down.");
    expect(body.cliOverride).toBe("opencode");
    expect(body.modelOverride).toBe("opencode/big-pickle");

    const saved = JSON.parse(window.localStorage.getItem("repoos:story-pm-agent:alpha slice")!);
    expect(saved).toEqual({ cli: "opencode", model: "opencode/big-pickle" });
  });

  it("sends no override while the pick equals the configured pm agent", async () => {
    const w = await mountChat();
    const surface = w.findComponent(PmChatSurface);
    await surface.vm.$emit("update:draft", "Hi.");
    await surface.vm.$emit("send");
    await flushPromises();

    const call = api.mock.calls.find((c) => String(c[0]).endsWith("/pm/message"));
    const body = JSON.parse(String((call![1] as { body: string }).body));
    expect(body.cliOverride).toBeUndefined();
    expect(body.modelOverride).toBeUndefined();
    expect(window.localStorage.getItem("repoos:story-pm-agent:alpha slice")).toBeNull();
  });
});
