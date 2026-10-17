/**
 * Compact configurable activity indicators (#0787).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import { useConfigStore } from "../src/stores/config";
import {
  ACTIVITY_ANIMATION_SIZES,
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_SLOT_CH,
} from "../../core/activity-animation.js";

function mountIndicator(
  props: Record<string, unknown> = {},
  formStyle?: string,
  formSize?: string,
): ReturnType<typeof mount> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const config = useConfigStore();
  if (formStyle !== undefined) config.form.activityAnimationStyle = formStyle;
  if (formSize !== undefined) config.form.activityAnimationSize = formSize;
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

  it("disables compact motion under prefers-reduced-motion (#0787)", () => {
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.ai-compact/);
  });
});

describe("ActivityIndicator size (#0813)", () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  it("defaults to Auto and leaves the established geometry untouched", () => {
    const wrapper = mountIndicator({ animationStyle: "orbital-pixel" });
    expect(wrapper.classes()).not.toContain("ai-sized");
    expect(wrapper.element.getAttribute("style") ?? "").not.toContain("--ai-scale");
  });

  it("reads activityAnimationSize from the config form", () => {
    const wrapper = mountIndicator({}, "orbital-pixel", "2.5");
    expect(wrapper.classes()).toContain("ai-sized");
    expect(wrapper.element.getAttribute("style")).toContain("--ai-size-ch: 2.5");
  });

  it("scales every compact style against its own Auto slot", () => {
    for (const style of ACTIVITY_ANIMATION_STYLES) {
      if (style === "three-dots") continue;
      const wrapper = mountIndicator({ animationStyle: style, animationSize: "3" });
      const styleAttr = wrapper.element.getAttribute("style") ?? "";
      const expected = 3 / ACTIVITY_ANIMATION_STYLE_SLOT_CH[style];
      expect(styleAttr, style).toContain("--ai-size-ch: 3");
      expect(styleAttr, style).toContain(`--ai-scale: ${expected}`);
      wrapper.unmount();
    }
  });

  it("scales the legacy dot group without changing its style or label", () => {
    const wrapper = mountIndicator({
      animationStyle: "three-dots",
      animationSize: "1",
      label: "Working…",
    });
    expect(wrapper.classes()).toContain("ai-sized");
    expect(wrapper.classes()).toContain("ai-legacy-dots");
    expect(wrapper.findAll(".ai-dot")).toHaveLength(3);
    expect(wrapper.get('[role="status"]').attributes("aria-label")).toBe("Working…");
  });

  it("accepts sm and md contexts at every explicit size", () => {
    for (const size of ["sm", "md"] as const) {
      for (const step of ACTIVITY_ANIMATION_SIZES) {
        if (step === "auto") continue;
        const wrapper = mountIndicator({
          size,
          animationStyle: "orbital-pixel",
          animationSize: step,
        });
        expect(wrapper.classes(), `${size} ${step}`).toContain("ai-sized");
        wrapper.unmount();
      }
    }
  });
});
