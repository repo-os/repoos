/**
 * #0644: the shared hotfix badge renders from `task.hotfix` and names the
 * target — `BRANCH` for a normal hotfix, the louder `MAIN` variant for one
 * running directly on main.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TaskCard from "../src/components/TaskCard.vue";
import HotfixBadge from "../src/components/HotfixBadge.vue";
import { makeTask, FakeEventSource, flush } from "./component-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HotfixBadge", () => {
  it("reads HOTFIX · BRANCH and stays the quiet variant", () => {
    const wrapper = mount(HotfixBadge, {
      props: { target: "branch", branch: "hotfix/0644-fix" },
    });
    expect(wrapper.text()).toBe("HOTFIX · BRANCH");
    expect(wrapper.classes()).toContain("hotfix-badge");
    expect(wrapper.classes()).not.toContain("hotfix-badge--main");
    // The explanation rides the shared styled tooltip, not a native `title`.
    expect(wrapper.attributes("data-tip")).toContain("hotfix/0644-fix");
    expect(wrapper.attributes("title")).toBeUndefined();
  });

  it("reads HOTFIX · MAIN and marks the louder variant", () => {
    const wrapper = mount(HotfixBadge, { props: { target: "main", branch: "main" } });
    expect(wrapper.text()).toBe("HOTFIX · MAIN");
    expect(wrapper.classes()).toContain("hotfix-badge--main");
  });
});

describe("TaskCard hotfix visibility", () => {
  it("renders the shared badge from task.hotfix and outlines the card", async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const pinia = createPinia();
    setActivePinia(pinia);
    const task = makeTask({ status: "ready", hotfix: true, hotfixTarget: "main", branch: "" });
    const wrapper = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await flush();

    const badge = wrapper.find(".hotfix-badge");
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toBe("HOTFIX · MAIN");
    expect(wrapper.find("article.task-card").classes()).toContain("hotfix");
  });

  it("renders no badge for an ordinary task", async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    const pinia = createPinia();
    setActivePinia(pinia);
    const task = makeTask({ status: "ready" });
    const wrapper = mount(TaskCard, {
      props: { task, dragEnabled: false },
      global: { plugins: [pinia] },
    });
    await flush();

    expect(wrapper.find(".hotfix-badge").exists()).toBe(false);
    expect(wrapper.find("article.task-card").classes()).not.toContain("hotfix");
  });
});
