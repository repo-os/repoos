import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UiRecoveryBanner from "../src/components/UiRecoveryBanner.vue";
import {
  configureUiRecovery,
  dismissRecovery,
  showOffline,
  showStaleUi,
} from "../src/lib/uiRecovery";

afterEach(() => {
  dismissRecovery();
  document.body.innerHTML = "";
});

describe("UiRecoveryBanner", () => {
  it("teleports an opaque, compact recovery card with visible actions", async () => {
    showOffline("The server is temporarily unavailable.");
    const wrapper = mount(UiRecoveryBanner, { attachTo: document.body });
    await wrapper.vm.$nextTick();

    const banner = document.body.querySelector(".ui-recovery-banner");
    expect(banner).not.toBeNull();
    expect(banner?.querySelector("button")?.textContent).toContain("Retry / reload");
    expect(banner?.textContent).toContain("Dismiss");
    expect(wrapper.html()).not.toContain("ui-recovery-banner");

    await wrapper.unmount();
  });

  it("limits stale-build copy to the build title and one ready line", async () => {
    configureUiRecovery({ isDirty: () => true, isBusy: () => false });
    showStaleUi("/work", "38fc043e2821", "2026-09-19T15:33:38Z");
    const wrapper = mount(UiRecoveryBanner, { attachTo: document.body });
    await wrapper.vm.$nextTick();

    const copy = document.body.querySelector(".ui-recovery-copy");
    expect(copy?.querySelectorAll("strong, small")).toHaveLength(2);
    expect(copy?.textContent).toContain("New RepoOS build available");
    expect(copy?.textContent).toContain("Build 38fc043e2821 ready at");
    expect(copy?.textContent).not.toContain("RepoOS was updated while this page was open");

    await wrapper.unmount();
  });
});
