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
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe("Project updates signup", () => {
  it("explains the opt-in and sends a normalized address to the public endpoint", async () => {
    send.mockResolvedValue(Response.json({ ok: true, status: "pending" }));
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
  ])("shows the %s 409 outcome", async (status, copy) => {
    send.mockResolvedValue(Response.json({ ok: false, status }, { status: 409 }));
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toContain(copy);
  });

  it.each([
    [{ ok: false }, 200],
    [{ ok: true, status: "unknown" }, 200],
    [{ ok: false, status: "pending" }, 200],
  ])(
    "does not treat an unrecognized or unsuccessful response as success (%j)",
    async (body, status) => {
      send.mockResolvedValue(Response.json(body, { status }));
      wrapper = mount(ProjectUpdatesSignup);
      await wrapper.get("input").setValue("person@example.com");
      await wrapper.get("form").trigger("submit");
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toContain("Please try again");
    },
  );

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

  it("shows a specific retry message when the service throttles the request", async () => {
    send.mockResolvedValue(Response.json({ ok: false }, { status: 429 }));
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Too many attempts");
  });

  it("recovers from network rejection and a 15 second timeout", async () => {
    send.mockRejectedValueOnce(new TypeError("network unavailable"));
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("Please try again");
    wrapper.unmount();
    wrapper = undefined;

    vi.useFakeTimers();
    let signal!: AbortSignal;
    send.mockImplementationOnce((_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();
    expect(signal.aborted).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toContain("took too long");
  });

  it("aborts an in-flight request when the component unmounts", async () => {
    let signal!: AbortSignal;
    send.mockImplementation((_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get("input").setValue("person@example.com");
    await wrapper.get("form").trigger("submit");
    wrapper.unmount();
    wrapper = undefined;
    expect(signal.aborted).toBe(true);
  });

  it.each(["", "not an origin", "https://updates.example.net/path"])(
    "fails closed when the endpoint origin is missing or malformed (%s)",
    async (origin) => {
      vi.stubEnv("VITE_PROJECT_UPDATES_ENDPOINT", origin);
      wrapper = mount(ProjectUpdatesSignup);
      expect(wrapper.text()).toContain("signup is temporarily unavailable");
      expect(wrapper.find("form").exists()).toBe(false);
      expect(send).not.toHaveBeenCalled();
    },
  );

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
    expect(wrapper.get('[role="status"]').classes()).toContain(`updates-message--${state}`);
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("provides a way back from a confirmation result to signup", async () => {
    window.history.replaceState({}, "", "/?updates=expired&theme=gruvbox#project-updates");
    wrapper = mount(ProjectUpdatesSignup);
    await wrapper.get(".updates-back").trigger("click");
    expect(wrapper.find("form").exists()).toBe(true);
    expect(window.location.href).not.toContain("updates=");
    expect(window.location.href).toContain("theme=gruvbox");
  });
});
