/**
 * LoginView's session-expiry and code-step state (#1273).
 *
 * Going back to the email step must drop the code step's wrong-code message
 * and half-typed code; a session that ended while the app was open shows why
 * the visitor is here; and the resend timer stops when the page is left.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LoginView from "../src/views/LoginView.vue";

const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const STATUS_ENABLED = {
  enabled: true,
  bootstrapNeeded: false,
  hasGoogle: false,
  hasEmailProvider: true,
  repoName: "repoos",
};

/** Answers the auth endpoints by URL; `verifyStatus` is the code check's answer. */
function authFetch(verifyStatus: number): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url === "/api/auth/status") return json(200, STATUS_ENABLED);
    if (url === "/api/auth/me") return json(200, { authEnabled: true, authenticated: false });
    if (url === "/api/auth/request-otp") return json(200, { ok: true });
    if (url === "/api/auth/verify-otp") {
      return json(verifyStatus, { error: "Invalid or expired code" });
    }
    return json(200, {});
  });
}

function mountLogin(): VueWrapper {
  setActivePinia(createPinia());
  return mount(LoginView, { global: { plugins: [createPinia()] }, attachTo: document.body });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  routeState.query = {};
});

/** Email step → Send code → code step. */
async function reachCodeStep(wrapper: VueWrapper): Promise<void> {
  await flushPromises();
  await wrapper.find('input[aria-label="Email address"]').setValue("qa-member@example.com");
  await wrapper.find(".login-btn.primary").trigger("click");
  await flushPromises();
}

describe("LoginView session-expiry and code-step state (#1273)", () => {
  it("says the session ended when the visitor arrives with expired=1", async () => {
    routeState.query = { expired: "1" };
    vi.stubGlobal("fetch", authFetch(401));
    const wrapper = mountLogin();
    await flushPromises();
    expect(wrapper.find('[data-testid="login-session-expired"]').text()).toContain(
      "Your session ended",
    );
    wrapper.unmount();
  });

  it("shows no expiry notice on a plain sign-in", async () => {
    vi.stubGlobal("fetch", authFetch(401));
    const wrapper = mountLogin();
    await flushPromises();
    expect(wrapper.find('[data-testid="login-session-expired"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("clears the wrong-code message and the typed code on 'Use a different email'", async () => {
    vi.stubGlobal("fetch", authFetch(401));
    const wrapper = mountLogin();
    await reachCodeStep(wrapper);

    await wrapper.find('input[aria-label="One-time code"]').setValue("123456");
    await wrapper.find(".login-btn.primary").trigger("click");
    await flushPromises();
    expect(wrapper.find(".login-error").text()).toContain("Invalid or expired code");

    const back = wrapper.findAll(".login-link").find((b) => b.text() === "Use a different email");
    await back!.trigger("click");
    await flushPromises();

    expect(wrapper.find('input[aria-label="Email address"]').exists()).toBe(true);
    expect(wrapper.find(".login-error").exists()).toBe(false);
    wrapper.unmount();
  });

  it("stops the resend timer when the page is left", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", authFetch(401));
    const wrapper = mountLogin();
    await reachCodeStep(wrapper);
    expect(wrapper.find('input[aria-label="One-time code"]').exists()).toBe(true);

    const clear = vi.spyOn(globalThis, "clearInterval");
    wrapper.unmount();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
