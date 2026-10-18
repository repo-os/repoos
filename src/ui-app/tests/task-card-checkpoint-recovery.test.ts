/**
 * The board card says "re-reviewing checkpoint…" while a post-handoff
 * checkpoint recovery runs (#0834) — the state the `card:checkpointRecovery`
 * shot fixture seeds, and the `task-card-agent-hint` target that shot's
 * highlight outlines. A declared shot whose target is missing fails handoff,
 * so this proves the capture target actually renders.
 */
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";
import { SHOT_PREVIEW_FIXTURE_TASK_ID } from "../../core/shot-fixtures.js";
import TaskCard from "../src/components/TaskCard.vue";
import { applyShotPreviewFixture } from "../src/lib/shot-preview-fixtures";
import { useRepoStore } from "../src/stores/repo";

const ButtonStub = defineComponent({
  name: "Button",
  inheritAttrs: false,
  setup(_props, { slots, attrs }) {
    return () => h("button", attrs, slots.default?.() as never);
  },
});

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await nextTick();
}

function mountFixtureCard() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const repo = useRepoStore();
  applyShotPreviewFixture(repo, "card:checkpointRecovery");
  const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
  if (!task) throw new Error("card:checkpointRecovery did not seed the fixture task");
  const wrapper = mount(TaskCard, {
    props: { task, dragEnabled: false },
    global: { plugins: [pinia], stubs: { teleport: true, Button: ButtonStub } },
  });
  return { repo, task, wrapper };
}

describe("TaskCard post-handoff checkpoint recovery hint (#0834)", () => {
  it("renders the capture target the card:checkpointRecovery shot outlines", async () => {
    const { wrapper } = mountFixtureCard();
    await flush();

    const hint = wrapper.get('[data-test-id="task-card-agent-hint"]');
    expect(hint.text()).toContain("re-reviewing checkpoint…");
  });

  it("drops the hint the moment recovery ends", async () => {
    const { repo, task, wrapper } = mountFixtureCard();
    await flush();

    repo.setCheckpointRecovery(task.id, false);
    await flush();

    const hint = wrapper.find('[data-test-id="task-card-agent-hint"]');
    // Either the hint is gone entirely, or whatever replaces it no longer
    // reads "re-reviewing checkpoint…".
    expect(hint.exists() && hint.text().includes("re-reviewing checkpoint…")).toBe(false);
  });
});
