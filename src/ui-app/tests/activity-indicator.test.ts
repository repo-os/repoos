/**
 * Compact configurable activity indicators (#0787).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import ActivityIndicator from "../src/components/ActivityIndicator.vue";
import { useConfigStore } from "../src/stores/config";
import {
  ACTIVITY_ANIMATION_SIZES,
  ACTIVITY_ANIMATION_STYLES,
  ACTIVITY_ANIMATION_STYLE_SLOT,
  DEFAULT_ACTIVITY_ANIMATION_SIZE,
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

describe("ActivityIndicator size (#0813, fixed pixels #0816)", () => {
  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
  });

  it("defaults to a fixed pixel size, never a font-relative one", () => {
    const wrapper = mountIndicator({ animationStyle: "orbital-pixel" });
    expect(wrapper.classes()).toContain("ai-sized");
    expect(wrapper.element.getAttribute("style")).toContain(
      `--ai-size-px: ${DEFAULT_ACTIVITY_ANIMATION_SIZE}px`,
    );
  });

  it("reads activityAnimationSize from the config form as pixels", () => {
    const wrapper = mountIndicator({}, "orbital-pixel", "20");
    expect(wrapper.classes()).toContain("ai-sized");
    expect(wrapper.element.getAttribute("style")).toContain("--ai-size-px: 20px");
  });

  it("fills each compact style's natural slot at the chosen pixel width", () => {
    for (const style of ACTIVITY_ANIMATION_STYLES) {
      if (style === "three-dots") continue;
      const wrapper = mountIndicator({ animationStyle: style, animationSize: "24" });
      const styleAttr = wrapper.element.getAttribute("style") ?? "";
      const expected = 24 / ACTIVITY_ANIMATION_STYLE_SLOT[style];
      expect(styleAttr, style).toContain("--ai-size-px: 24px");
      expect(styleAttr, style).toContain(`--ai-mark-px: ${expected}px`);
      wrapper.unmount();
    }
  });

  it("scales the legacy dot group without changing its style or label", () => {
    const wrapper = mountIndicator({
      animationStyle: "three-dots",
      animationSize: "8",
      label: "Working…",
    });
    expect(wrapper.classes()).toContain("ai-sized");
    expect(wrapper.classes()).toContain("ai-legacy-dots");
    expect(wrapper.findAll(".ai-dot")).toHaveLength(3);
    expect(wrapper.get('[role="status"]').attributes("aria-label")).toBe("Working…");
  });

  it("accepts sm and md contexts at every size", () => {
    for (const size of ["sm", "md"] as const) {
      for (const step of ACTIVITY_ANIMATION_SIZES) {
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

  it("renders the same pixel width whatever the surrounding font is (#0816)", () => {
    const Host = defineComponent({
      props: { fontSize: { type: String, default: "12px" } },
      setup(props) {
        return () =>
          h("div", { style: { fontSize: props.fontSize } }, [
            h(ActivityIndicator, { animationStyle: "orbital-pixel", animationSize: "20" }),
          ]);
      },
    });
    const small = mount(Host, { props: { fontSize: "9px" } });
    const large = mount(Host, { props: { fontSize: "22px" } });
    const styleVar = (w: ReturnType<typeof mount>): string =>
      w.get(".ai").element.getAttribute("style") ?? "";
    expect(styleVar(small)).toContain("--ai-size-px: 20px");
    expect(styleVar(large)).toContain("--ai-size-px: 20px");

    // The stylesheet must resolve the slot in fixed pixels — a regression to
    // `ch`/`em` here is what made the size change with the surrounding font.
    const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
    expect(css).toMatch(/\.ai-sized \.ai-mark \{[^}]*width: var\(--ai-size-px\)/);
    expect(css).toMatch(/\.ai-sized \.ai-mark \{[^}]*font-size: var\(--ai-mark-px/);
    expect(css).not.toContain("--ai-size-ch");
  });
});
