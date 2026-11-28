// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import HubDownloadLink from "../../../landing/src/components/HubDownloadLink.vue";

afterEach(() => vi.unstubAllGlobals());

describe("Android Hub download state", () => {
  it("shows Coming soon without a published version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    const wrapper = mount(HubDownloadLink);
    await flushPromises();
    expect(wrapper.text()).toBe("Coming soon");
    expect(wrapper.find("a").exists()).toBe(false);
  });

  it("shows the published version as the repoos.org download link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ versionName: "1.2.3" })));
    const wrapper = mount(HubDownloadLink);
    await flushPromises();
    expect(wrapper.text()).toContain("Download for Android v1.2.3");
    expect(wrapper.get("a").attributes("href")).toBe("https://repoos.org/downloads/repoos-hub.apk");
  });
});
