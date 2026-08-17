import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import DoneErrorCard from "../src/components/DoneErrorCard.vue";

const original = {
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight"),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight"),
};

/** jsdom does no layout, so scrollHeight/clientHeight are always 0 — stub them
 *  so the component's own overflow detection is exercised deterministically. */
function stubOverflow(overflowing: boolean): void {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => (overflowing ? 60 : 10),
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 20,
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await nextTick();
}

afterEach(() => {
  for (const key of ["scrollHeight", "clientHeight"] as const) {
    const desc = original[key];
    if (desc) Object.defineProperty(HTMLElement.prototype, key, desc);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
  }
});

describe("DoneErrorCard", () => {
  it("renders a short message without implying expansion", async () => {
    stubOverflow(false);
    const wrapper = mount(DoneErrorCard, {
      props: { message: "merge conflict: src/a.ts" },
    });
    await flush();

    expect(wrapper.text()).toContain("merge conflict: src/a.ts");
    expect(wrapper.find("button").exists()).toBe(false);
    expect(wrapper.find('[aria-expanded]').exists()).toBe(false);
    expect(wrapper.find(".done-error-static").exists()).toBe(true);
  });

  it("clamps an overflowing message and expands/collapses it", async () => {
    stubOverflow(true);
    const long = "conflict in src/components/ReallyLongComponentName.ts ".repeat(12);
    const wrapper = mount(DoneErrorCard, { props: { message: long } });
    await flush();

    const btn = wrapper.find("button.done-error-toggle");
    expect(btn.exists()).toBe(true);
    // Native button → keyboard operable (Enter/Space).
    expect(btn.element.tagName).toBe("BUTTON");
    expect(btn.attributes("aria-expanded")).toBe("false");
    expect(btn.attributes("aria-controls")).toBeTruthy();
    expect(btn.attributes("title")).toBe("Show more");
    // Collapsed message is clamped to two lines.
    expect(wrapper.find(".done-error-msg").classes()).toContain("clamped");

    await btn.trigger("click");
    await flush();
    expect(wrapper.find("button.done-error-toggle").attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".done-error-msg").classes()).not.toContain("clamped");
    expect(wrapper.find(".done-error-detail").exists()).toBe(true);
    expect(wrapper.find("button.done-error-toggle").attributes("title")).toBe("Show less");

    await wrapper.find("button.done-error-toggle").trigger("click");
    await flush();
    expect(wrapper.find("button.done-error-toggle").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".done-error-msg").classes()).toContain("clamped");
    expect(wrapper.find(".done-error-detail").exists()).toBe(false);
  });

  it("announces the error as a live alert region", async () => {
    stubOverflow(false);
    const wrapper = mount(DoneErrorCard, { props: { message: "boom" } });
    await flush();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("shows step, conflicting files, and guidance once expanded", async () => {
    stubOverflow(true);
    const wrapper = mount(DoneErrorCard, {
      props: {
        message: "merge conflict: src/a.ts, src/b.ts",
        step: "check",
        conflicts: ["src/a.ts", "src/b.ts"],
      },
    });
    await flush();
    await wrapper.find("button").trigger("click");
    await flush();

    expect(wrapper.text()).toContain("Move to done failed");
    expect(wrapper.text()).toContain("at check");
    expect(wrapper.text()).toContain("Conflicting files");
    expect(wrapper.text()).toContain("src/a.ts");
    expect(wrapper.text()).toContain("src/b.ts");
  });

  it("renders the per-phase hint and check-output excerpt instead of conflict guidance (0215)", async () => {
    stubOverflow(true);
    const wrapper = mount(DoneErrorCard, {
      props: {
        message: "The validation check failed — deletion detected by watcher",
        step: "check",
        hint: "The build or check gate failed on the merged branch. Fix the failure in the feature branch's worktree, commit, and retry the close-out.",
        detail: "deletion detected by watcher\n  at tests/x.test.ts:12",
      },
    });
    await flush();
    await wrapper.find("button").trigger("click");
    await flush();

    expect(wrapper.text()).toContain("Check output");
    expect(wrapper.text()).toContain("tests/x.test.ts:12");
    expect(wrapper.text()).toContain("Fix the failure in the feature branch's worktree");
    // No conflict guidance for a check failure.
    expect(wrapper.text()).not.toContain("resolve the conflicting files");
    expect(wrapper.find(".done-error-files").exists()).toBe(false);
  });

  it("collapses onto the fresh message when a retry replaces it", async () => {
    stubOverflow(true);
    const wrapper = mount(DoneErrorCard, {
      props: { message: "first failure message ".repeat(10) },
    });
    await flush();
    await wrapper.find("button").trigger("click");
    await flush();
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("true");

    wrapper.setProps({ message: "second failure message ".repeat(10) });
    await flush();
    expect(wrapper.find("button").attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".done-error-msg").classes()).toContain("clamped");
    expect(wrapper.text()).toContain("second failure message");
    expect(wrapper.find(".done-error-detail").exists()).toBe(false);
  });
});
