import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UiRecoveryBanner from "../src/components/UiRecoveryBanner.vue";
import { dismissRecovery, showOffline } from "../src/lib/uiRecovery";

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
});
