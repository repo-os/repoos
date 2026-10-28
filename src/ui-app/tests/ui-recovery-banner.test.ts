import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UiRecoveryBanner from "../src/components/UiRecoveryBanner.vue";
import {
  configureUiRecovery,
  dismissRecovery,
  noteServerReached,
  offlineReasonFor,
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
    expect(copy?.textContent).toContain("38fc043e2821 ready at");
    expect(copy?.textContent).not.toContain("RepoOS was updated while this page was open");

    await wrapper.unmount();
  });
});

describe("server down vs not responding (#0959)", () => {
  const refused =
    "Can't reach the RepoOS server — it may be down. Restart it (`repoos serve`), then reload.";
  const timedOut =
    "The RepoOS server did not respond in time — retry the request or reload when the server is ready.";

  it("classifies a refused connection as down and a timeout as slow", () => {
    expect(offlineReasonFor(refused)).toBe("down");
    expect(offlineReasonFor(timedOut)).toBe("slow");
    expect(offlineReasonFor("something else")).toBeNull();
  });

  it("names the project and shows a copyable restart command when the server is down", async () => {
    noteServerReached({
      projectName: "Divot",
      restartCommand: "launchctl kickstart -k gui/$(id -u)/com.repoos.serve.divot-4a26b39f",
    });
    showOffline(refused);
    const wrapper = mount(UiRecoveryBanner, { attachTo: document.body });
    await wrapper.vm.$nextTick();

    const banner = document.body.querySelector(".ui-recovery-banner");
    expect(banner?.querySelector("strong")?.textContent).toMatch(
      /^Divot server at .+ is not running$/,
    );
    expect(banner?.textContent).toContain("connection was refused");
    expect(banner?.textContent).toContain("Last reached at");
    expect(banner?.querySelector('[data-test-id="ui-recovery-restart"] code')?.textContent).toBe(
      "launchctl kickstart -k gui/$(id -u)/com.repoos.serve.divot-4a26b39f",
    );
    await wrapper.unmount();
  });

  it("says a stalled server is running but not responding, with no restart command", async () => {
    noteServerReached({ projectName: "Divot", restartCommand: "repoos serve --port 7405" });
    showOffline(timedOut);
    const wrapper = mount(UiRecoveryBanner, { attachTo: document.body });
    await wrapper.vm.$nextTick();

    const banner = document.body.querySelector(".ui-recovery-banner");
    expect(banner?.querySelector("strong")?.textContent).toMatch(/is not responding$/);
    expect(banner?.textContent).toContain("did not answer in time");
    expect(banner?.querySelector('[data-test-id="ui-recovery-restart"]')).toBeNull();
    await wrapper.unmount();
  });
});
