import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ProjectUpdatesSignup from "../../../landing/src/components/ProjectUpdatesSignup.vue";

let wrapper: VueWrapper | undefined;
const send = vi.fn();

beforeEach(() => {
  vi.stubEnv("VITE_PROJECT_UPDATES_ENDPOINT", "https://updates.example.net");
  vi.stubGlobal("fetch", send.mockReset());
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Project updates signup", () => {
  it("explains the opt-in and sends a normalized address to the public endpoint", async () => {
    send.mockResolvedValue(Response.json({ status: "pending" }));
    wrapper = mount(ProjectUpdatesSignup);
    expect(wrapper.text()).toContain("Occasional RepoOS product and release updates");
    expect(wrapper.text()).toContain("unsubscribe link in every email");
    expect(wrapper.get("input").attributes()).toMatchObject({ type: "email", required: "" });
    await wrapper.get("input").setValue("  person@example.com ");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(send).toHaveBeenCalledWith(
      "https://updates.example.net/updates/subscribe",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "person@example.com" }),
      }),
    );
    expect(wrapper.get('[role="status"]').text()).toContain("Check your inbox");
  });

  it.each([
    ["already_pending", "awaiting confirmation"],
    ["already_active", "already subscribed"],
  ])("shows the %s outcome", async (status, copy) => {
    send.mockResolvedValue(Response.json({ status }));
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain(copy);
  });

  it("shows pending and recoverable failure accessibly", async () => {
    let resolve!: (response: Response) => void;
    send.mockReturnValue(new Promise<Response>((done) => (resolve = done)));
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("form").attributes("aria-busy")).toBe("true");
    expect(wrapper.get('[role="status"]').text()).toContain("Requesting your confirmation email");
    resolve(new Response("unavailable", { status: 503 }));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Please try again");
  });

  it.each([
    ["confirmed", "Your email is confirmed"],
    ["expired", "has expired"],
    ["used", "already been used"],
    ["failed", "couldn’t confirm"],
  ])("renders the %s confirmation outcome", async (state, copy) => {
    window.history.replaceState({}, "", `/?updates=${state}`);
    wrapper = mount(ProjectUpdatesSignup);
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain(copy);
    expect(wrapper.find("form").exists()).toBe(false);
  });
});
