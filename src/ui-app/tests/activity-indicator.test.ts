/**
 * Compact configurable activity indicators (#0787).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import { useConfigStore } from "../src/stores/config";
import { ACTIVITY_ANIMATION_STYLES } from "../../core/activity-animation.js";

function mountIndicator(
  props: Record<string, unknown> = {},
  formStyle?: string,
): ReturnType<typeof mount> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  if (formStyle !== undefined) config.form.activityAnimationStyle = formStyle;
  return mount(ActivityIndicator, {
    props,
    global: { plugins: [pinia] },
  });
}

describe("ActivityIndicator (#0787)", () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  it("uses orbital-pixel by default from config", () => {
    const wrapper = mountIndicator({}, undefined);
    expect(wrapper.find(".ai-style-orbital-pixel").exists()).toBe(true);
    expect(wrapper.find(".ai-motion-coding").exists()).toBe(true);
  });

  it("honors animationStyle override without config", () => {
    const wrapper = mountIndicator({ animationStyle: "three-dots" });
    expect(wrapper.find(".ai-legacy-dots").exists()).toBe(true);
    expect(wrapper.findAll(".ai-dot")).toHaveLength(3);
  });

  it("maps reviewing variant to reviewing motion", () => {
    const wrapper = mountIndicator({
      variant: "reviewing",
      animationStyle: "cursor-scan-pulse",
    });
    expect(wrapper.find(".ai-motion-reviewing").exists()).toBe(true);
  });

  it("supports agent motion for PM-style work", () => {
    const wrapper = mountIndicator({
      activity: "agent",
      animationStyle: "tiny-signal-bars",
    });
    expect(wrapper.find(".ai-style-tiny-signal-bars").exists()).toBe(true);
    expect(wrapper.find(".ai-motion-agent").exists()).toBe(true);
  });

  it("reads activityAnimationStyle from the config form", () => {
    const wrapper = mountIndicator({}, "spark-diamond");
    expect(wrapper.find(".ai-style-spark-diamond").exists()).toBe(true);
  });

  it("renders a distinct root class for every style", () => {
    for (const style of ACTIVITY_ANIMATION_STYLES) {
      const wrapper = mountIndicator({ animationStyle: style });
      if (style === "three-dots") {
        expect(wrapper.find(".ai-legacy-dots").exists()).toBe(true);
      } else {
        expect(wrapper.find(`.ai-style-${style}`).exists()).toBe(true);
      }
      wrapper.unmount();
    }
  });

  it("exposes role=status and aria-label for accessibility", () => {
    const wrapper = mountIndicator({ label: "Coding…" });
    const root = wrapper.get('[role="status"]');
    expect(root.attributes("aria-label")).toBe("Coding…");
  });
});
