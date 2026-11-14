import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navFromConfig } from "../src/nav";
import { useResponsiveLayout } from "../src/composables/useResponsiveLayout";

describe("mobile app layout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("switches at 720 CSS pixels and keeps desktop composition at tablet widths", async () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined;
    const media = {
      matches: true,
      addEventListener: vi.fn((_event: string, callback: (event: MediaQueryListEvent) => void) => {
        listener = callback;
      }),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    vi.stubGlobal("matchMedia", vi.fn(() => media));

    let layout!: ReturnType<typeof useResponsiveLayout>;
    const wrapper = mount(defineComponent({
      setup() {
        layout = useResponsiveLayout();
        return () => h("div");
      },
    }));
    expect(layout.isNarrow.value).toBe(true); // 719.98px and below
    (media as unknown as { matches: boolean }).matches = false; // 720px and above
    listener?.({ matches: false } as MediaQueryListEvent);
    await nextTick();
    expect(layout.isNarrow.value).toBe(false);
    (media as unknown as { matches: boolean }).matches = false; // includes 768px tablet
    listener?.({ matches: false } as MediaQueryListEvent);
    await nextTick();
    expect(layout.isNarrow.value).toBe(false);
    wrapper.unmount();
    expect(media.removeEventListener).toHaveBeenCalledOnce();
  });

  it("keeps four primary destinations and exposes configured secondary routes", () => {
    const ids = navFromConfig({ release: { enabled: true } }).map((item) => item.id);
    const primary = ["work", "search", "more", "settings"];
    const secondary = ids.filter((id) => !["work", "settings"].includes(id));

    expect(primary).toEqual(["work", "search", "more", "settings"]);
    expect(secondary).toEqual(["dashboard", "inputs", "checks", "releases", "secrets", "agents", "repo"]);
    expect(navFromConfig({}).map((item) => item.id)).not.toContain("releases");
    expect(ids).toContain("agents");
    expect(ids).toContain("repo");
    expect(ids).toContain("dashboard");
  });
});
