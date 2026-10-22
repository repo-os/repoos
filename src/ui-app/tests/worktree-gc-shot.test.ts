import { afterEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SystemResourcePanel from "../src/components/SystemResourcePanel.vue";
import {
  applyShotPreviewFixture,
  shotFixturePinnedSystemStats,
} from "../src/lib/shot-preview-fixtures";
import { useRepoStore } from "../src/stores/repo";
import type { Health } from "../src/types";

describe("worktree GC Control dashboard shot fixture (#0923)", () => {
  const originalUrl = window.location.href;
  let wrapper: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    window.history.replaceState({}, "", originalUrl);
  });

  it("renders the worktree action and its preview from loaded fixture stats", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    window.history.replaceState({}, "", "/?shotState=system%3AworktreeGc");
    const repo = useRepoStore();
    repo.health = { isPreviewBuild: true } as Health;
    applyShotPreviewFixture(repo, "system:worktreeGc");

    wrapper = mount(SystemResourcePanel, { global: { plugins: [pinia] } });
    await flushPromises();

    expect(repo.systemStats?.repo).toMatchObject({ worktrees: 27, worktreeWarnThreshold: 20 });
    expect(shotFixturePinnedSystemStats()).toBe(repo.systemStats);
    expect(wrapper.get("button.gc-action").text()).toContain("Run repoos gc · clean up worktrees");
    expect(wrapper.get(".wt-warn").attributes("data-tip")).toContain(
      "Run repoos gc · clean up worktrees",
    );
    expect(wrapper.get(".wt-warn").attributes("title")).toBeUndefined();

    await wrapper.get("button.gc-action").trigger("click");
    await flushPromises();
    expect(wrapper.get(".gc-preview").text()).toContain("repoos/integrate/0042");
    expect(wrapper.get(".gc-preview").text()).toContain("close-out job still active");
  });
});
