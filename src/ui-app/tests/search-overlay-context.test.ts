import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import SearchOverlay from "../src/components/SearchOverlay.vue";
import { useDocsStore } from "../src/stores/docs";

const push = vi.fn();

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push,
    currentRoute: { value: { name: "repo", query: {} } },
  }),
  useRoute: () => ({ query: {} }),
}));

describe("SearchOverlay context scope (#0557)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    push.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => "---\nname: deploy\ndescription: Ship it\n---\n",
      })),
    );
  });

  it("clicking a skill result switches to Skills and loads the skill", async () => {
    const docs = useDocsStore();
    docs.skills = [
      {
        path: "skills/deploy/SKILL.md",
        name: "deploy",
        description: "Ship to production",
      },
    ];
    const loadSkill = vi.spyOn(docs, "loadSkill").mockResolvedValue(undefined);

    const wrapper = mount(SearchOverlay, {
      props: { open: true, scope: "context" },
      attachTo: document.body,
    });
    await flushPromises();

    const input = document.body.querySelector(".search-overlay-input") as HTMLInputElement;
    expect(input).toBeTruthy();
    input.value = "production";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 250));

    const row = document.body.querySelector(".search-row");
    expect(row).toBeTruthy();
    row!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(push).toHaveBeenCalledWith({ name: "repo", query: { tab: "skills" } });
    expect(loadSkill).toHaveBeenCalledWith("skills/deploy/SKILL.md");
    wrapper.unmount();
  });

  it("navigates results with arrows, opens the highlighted result, and closes on Escape", async () => {
    const docs = useDocsStore();
    docs.skills = [
      { path: "skills/alpha/SKILL.md", name: "alpha", description: "alpha tool" },
      { path: "skills/beta/SKILL.md", name: "beta", description: "beta tool" },
    ];
    const loadSkill = vi.spyOn(docs, "loadSkill").mockResolvedValue(undefined);
    const wrapper = mount(SearchOverlay, {
      props: { open: true, scope: "context" },
      attachTo: document.body,
    });
    await flushPromises();

    const input = document.body.querySelector(".search-overlay-input") as HTMLInputElement;
    input.value = "tool";
    input.dispatchEvent(new Event("input"));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 250));

    const dialog = document.body.querySelector('[role="dialog"]')!;

    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    dialog.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await nextTick();
    expect(
      document.body.querySelectorAll('[role="option"]')[1]?.getAttribute("aria-selected"),
    ).toBe("true");

    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    dialog.dispatchEvent(enter);
    await nextTick();
    await flushPromises();
    expect(enter.defaultPrevented).toBe(true);
    expect(loadSkill).toHaveBeenCalledWith("skills/beta/SKILL.md");

    // Escape closes the overlay, so exercise it after the navigation assertions.
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    dialog.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);

    wrapper.unmount();
  });
});
