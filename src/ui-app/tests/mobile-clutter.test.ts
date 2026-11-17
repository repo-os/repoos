import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import IntegrationStatusBar from "../src/components/IntegrationStatusBar.vue";
import { useRepoStore } from "../src/stores/repo";
import type { IntegrationPipelineSnapshot } from "../src/types";

const root = resolve(__dirname, "../src");
const css = readFileSync(resolve(root, "style.css"), "utf8");
const queue = readFileSync(resolve(root, "components/MobileWorkQueue.vue"), "utf8");
const drawer = readFileSync(resolve(root, "components/TaskDrawer.vue"), "utf8");
const statusBar = readFileSync(resolve(root, "components/IntegrationStatusBar.vue"), "utf8");
const dashboard = readFileSync(resolve(root, "views/DashboardView.vue"), "utf8");
const stories = readFileSync(resolve(root, "views/StoriesView.vue"), "utf8");

function snapshot(overrides: Partial<IntegrationPipelineSnapshot>): IntegrationPipelineSnapshot {
  return {
    empty: true,
    active: null,
    queue: [],
    at: new Date().toISOString(),
    ...overrides,
  };
}

describe("mobile page clutter (#1145)", () => {
  it("hides explanatory page subtitles at phone widths, including Releases and Stories", () => {
    // One shared rule covers the shared .page-desc plus the page-specific
    // subtitle classes (Releases, Checks, Deployments) used by views with
    // their own headers. Desktop keeps all of them.
    expect(css).toMatch(
      /@media \(max-width: 719\.98px\)\s*\{[\s\S]*?\.page-desc,\s*\.rel-sub,\s*\.ck-sub,\s*\.dep-sub\s*\{\s*display:\s*none;/s,
    );
    // The subtitle is what carries the repeated explanation on Stories; the
    // title and its filters stay.
    expect(stories).toContain('class="page-desc"');
    expect(stories).toContain('class="page-title">Stories</div>');
    // A save failure is status, not explanation: keep that line on a phone.
    expect(css).toMatch(/\.page-desc:has\(\.save-msg\.err\)\s*\{\s*display:\s*block;/s);
  });

  it("drops the REPOOS / WORK breadcrumb above the phone Work queue title", () => {
    expect(queue).not.toContain("REPOOS / WORK");
    expect(queue).not.toContain("mobile-work-kicker");
    expect(queue).toContain("<h1>Work queue</h1>");
  });

  it("keeps the Mission Control title left aligned by relying on the shared header", () => {
    // Inline `align-items: flex-end` beat the phone media query and pushed the
    // title to the right. The shared .page-header already carries the desktop
    // layout, so the view must not override it inline.
    expect(dashboard).toContain('<div class="page-header">');
    expect(dashboard).not.toContain("align-items: flex-end");
    expect(css).toMatch(
      /@media \(max-width: 720px\)\s*\{[\s\S]*?\.page-header\s*\{[^}]*align-items:\s*flex-start;[^}]*flex-direction:\s*column/s,
    );
  });

  it("gives the phone task-detail title its own full-width row", () => {
    expect(drawer).toContain('class="drawer-head task-detail-head"');
    expect(drawer).not.toContain('class="drawer-head-main" style="flex: 1"');
    expect(css).toMatch(/\.task-detail-head\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(css).toMatch(/\.task-detail-head \.drawer-head-main\s*\{[^}]*flex:\s*1 1 100%/s);
    expect(css).toMatch(/\.task-detail-head \.close-x\s*\{[^}]*margin-left:\s*auto/s);
  });

  it("lets the Stories header controls wrap instead of clipping their labels", () => {
    expect(stories).toContain('class="stories-header-controls"');
    expect(stories).toMatch(
      /@media \(max-width: 720px\)\s*\{[\s\S]*?\.stories-header-controls\s*\{[^}]*flex-wrap:\s*wrap/s,
    );
    expect(stories).toContain("Hide Completed Stories");
  });
});

describe("mobile More sheet readability (#1145)", () => {
  it("uses the opaque theme surface rather than the translucent panel token", () => {
    expect(css).toMatch(/\.mobile-more-sheet\s*\{[^}]*background:\s*var\(--panel-solid\)/s);
    expect(css).not.toMatch(/\.mobile-more-sheet\s*\{[^}]*background:\s*var\(--panel\)/s);
  });

  it("keeps --panel-solid opaque in every supported theme", () => {
    const values = [...css.matchAll(/--panel-solid:\s*([^;]+);/g)].map((match) => match[1].trim());
    // classic dark/light, clear, gen z, jelly, gruvbox, catppuccin,
    // hypercolor and solarized each define a dark and a light surface.
    expect(values.length).toBeGreaterThanOrEqual(16);
    for (const value of values) {
      expect(value).not.toMatch(/rgba?\(|color-mix|transparent/);
    }
  });
});

describe("mobile integration bar (#1145)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("marks a quiet idle pipeline so the phone CSS can hide it", () => {
    const repo = useRepoStore();
    repo.integration = null;
    const wrapper = mount(IntegrationStatusBar);
    expect(wrapper.get(".ibar-wrap").classes()).toContain("is-idle");
    wrapper.unmount();
  });

  it("keeps active and failed pipelines visible on a phone", () => {
    const repo = useRepoStore();
    repo.integration = snapshot({
      empty: false,
      active: {
        taskId: "1145",
        stage: "build",
        failed: false,
        startedAt: null,
        lastProgressAt: null,
      },
    });
    let wrapper = mount(IntegrationStatusBar);
    expect(wrapper.get(".ibar-wrap").classes()).not.toContain("is-idle");
    wrapper.unmount();

    repo.integration = snapshot({
      empty: false,
      active: {
        taskId: "1145",
        stage: "check",
        failed: true,
        error: "check failed",
        startedAt: null,
        lastProgressAt: null,
      },
    });
    wrapper = mount(IntegrationStatusBar);
    expect(wrapper.get(".ibar-wrap").classes()).not.toContain("is-idle");
    wrapper.unmount();
  });

  it("keeps an idle bar visible when the check plan needs attention", async () => {
    const repo = useRepoStore();
    repo.integration = snapshot({
      checkPlan: { source: "empty", defaultProfile: "default", steps: [], errors: [] },
    });
    const wrapper = mount(IntegrationStatusBar);
    await flushPromises();
    expect(wrapper.get(".ibar-wrap").classes()).not.toContain("is-idle");
    expect(wrapper.get(".strip-label").text()).toContain("No checks configured");
    wrapper.unmount();
  });

  it("hides only the quiet idle bar in the phone media query", () => {
    expect(statusBar).toMatch(
      /@media \(max-width: 719\.98px\)\s*\{[\s\S]*?\.ibar-wrap\.is-idle\s*\{\s*display:\s*none;/s,
    );
  });
});
