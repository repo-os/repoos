import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import ToastPanel from "../src/components/ToastPanel.vue";
import { useRepoStore } from "../src/stores/repo";

describe("toast panel accessibility", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("announces toast changes politely and gives each toast an appropriate live role", () => {
    const repo = useRepoStore();
    repo.pushToast("Saved changes", "success");
    repo.pushToast("Could not save changes", "error");

    const wrapper = mount(ToastPanel);
    expect(wrapper.get(".toast-panel").attributes()).toMatchObject({
      role: "region",
      "aria-label": "Notifications",
      "aria-live": "polite",
      "aria-atomic": "false",
    });
    expect(wrapper.find('[role="status"]').text()).toContain("Saved changes");
    expect(wrapper.find('[role="alert"]').text()).toContain("Could not save changes");
    expect(wrapper.get('button[aria-label="Dismiss notification: Saved changes"]')).toBeTruthy();
    wrapper.unmount();
  });
});
