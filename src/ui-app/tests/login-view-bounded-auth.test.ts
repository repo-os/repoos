/**
 * The login page must not hang on a slow or dead server (#1236).
 *
 * `LoginView.checkStatus` used to issue unbounded `fetch` calls for
 * `/api/auth/status` and `/api/auth/me` — a stalled connection kept the
 * login spinner up until the browser's own timeout, the same unbounded-fetch
 * class #1226 fixed on the boot path. Every login fetch is now bounded and a
 * failure resolves to a plain-English status with a retry.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LoginView from "../src/views/LoginView.vue";
import { SERVER_UNREACHABLE_MESSAGE } from "../src/api";

const replace = vi.hoisted(() => vi.fn());
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace, push: vi.fn() }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  replace.mockClear();
  routeState.query = {};
});

/** A fetch that never answers — but honours an abort signal like the real one. */
function stallingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError")),
      );
    });
  });
}

const STATUS_ENABLED = {
  enabled: true,
  bootstrapNeeded: false,
  hasGoogle: false,
  hasEmailProvider: true,
  repoName: "repoos",
};

function mountLogin(): VueWrapper {
  setActivePinia(createPinia());
  return mount(LoginView, { global: { plugins: [setActivePinia(createPinia())] } });
}

describe("LoginView under a slow / 500 / offline auth server (#1236)", () => {
  it("a stalled /api/auth/status resolves to a plain-English error after the timeout, never an endless spinner", async () => {
    vi.useFakeTimers();
    const fetchMock = stallingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountLogin();

    // Still loading: spinner, no error yet.
    expect(wrapper.find(".login-loading").exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-status-error"]').exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(6_000);
    await flushPromises();

    expect(wrapper.find(".login-loading").exists()).toBe(false);
    const error = wrapper.find('[data-testid="login-status-error"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toContain("Can't reach the RepoOS server");
    expect(wrapper.find('[data-testid="login-retry"]').exists()).toBe(true);
    // The probe really was bounded: the fetch got an abort signal.
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(
      true,
    );
    wrapper.unmount();
  });

  it("HTTP 500 from /api/auth/status shows the failure state instead of a misleading form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );
    const wrapper = mountLogin();
    await flushPromises();

    expect(wrapper.find(".login-loading").exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-status-error"]').text()).toContain(
      "Can't reach the RepoOS server",
    );
    // The "Email provider not configured" trap must not render.
    expect(wrapper.text()).not.toContain("Email provider not configured");
    wrapper.unmount();
  });

  it("an offline server (fetch rejects) shows the failure state with a retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const wrapper = mountLogin();
    await flushPromises();

    expect(wrapper.find('[data-testid="login-status-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain(SERVER_UNREACHABLE_MESSAGE);
    wrapper.unmount();
  });

  it("Try again re-runs the bounded probe and recovers into the sign-in form", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/status") throw new TypeError("Failed to fetch");
      return Response.json({ ...STATUS_ENABLED, enabled: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountLogin();
    await flushPromises();
    expect(wrapper.find('[data-testid="login-status-error"]').exists()).toBe(true);

    // Second attempt: the status probe answers and the form appears.
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/status") return Response.json(STATUS_ENABLED);
      return Response.json({ authenticated: false, authEnabled: true });
    });
    await wrapper.find('[data-testid="login-retry"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="login-status-error"]').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Email address"]').exists()).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/status")).toHaveLength(2);
    wrapper.unmount();
  });

  it("a healthy server shows the sign-in form and every login fetch is bounded", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url === "/api/auth/status") return Response.json(STATUS_ENABLED);
      return Response.json({ authenticated: false, authEnabled: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountLogin();
    await flushPromises();

    expect(wrapper.find(".login-loading").exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-status-error"]').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Email address"]').exists()).toBe(true);
    expect(fetchMock.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(
      true,
    );
    wrapper.unmount();
  });

  it("a stalled /api/auth/me falls back to the usable sign-in form, not an error or a spinner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/status") return Response.json(STATUS_ENABLED);
        // Stalls forever, but honours the abort signal like a real fetch.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        });
      }),
    );
    vi.useFakeTimers();
    const wrapper = mountLogin();
    await vi.advanceTimersByTimeAsync(6_000);
    await flushPromises();

    expect(wrapper.find(".login-loading").exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-status-error"]').exists()).toBe(false);
    expect(wrapper.find('input[aria-label="Email address"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("auth disabled redirects to the dashboard, and an authenticated session redirects to the target", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/status") {
        return Response.json({ ...STATUS_ENABLED, enabled: false });
      }
      return Response.json({ authenticated: true, authEnabled: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountLogin();
    await flushPromises();

    expect(replace).toHaveBeenCalledWith("/");
    wrapper.unmount();

    replace.mockClear();
    routeState.query = { redirect: "/work" };
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/auth/status") return Response.json(STATUS_ENABLED);
      return Response.json({ authenticated: true, authEnabled: true });
    });
    const wrapper2 = mountLogin();
    await flushPromises();

    expect(replace).toHaveBeenCalledWith("/work");
    wrapper2.unmount();
  });

  it("the OTP request POST is bounded too", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/status") return Response.json(STATUS_ENABLED);
      if (url === "/api/auth/me") return Response.json({ authenticated: false });
      expect(url).toBe("/api/auth/request-otp");
      expect(init?.signal instanceof AbortSignal).toBe(true);
      expect(init?.method).toBe("POST");
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mountLogin();
    await flushPromises();

    await wrapper.find('input[aria-label="Email address"]').setValue("hello@repoos.org");
    const send = wrapper.findAll("button").find((b) => b.text().includes("Send code"));
    expect(send).toBeDefined();
    await send!.trigger("click");
    await flushPromises();

    expect(fetchMock.mock.calls.some(([url]) => url === "/api/auth/request-otp")).toBe(true);
    wrapper.unmount();
  });
});
