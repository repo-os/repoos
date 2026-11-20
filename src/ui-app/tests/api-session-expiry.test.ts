/**
 * An open app whose session expires must end up at sign-in (#1273).
 *
 * The router guard only runs on client navigation, so an API call answered with
 * the server's session-gate 401 used to leave the dashboard up with failing
 * requests. `api()` now sends the visitor to `/login` with `expired=1` and a way
 * back, and still throws its ApiError for the caller.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "../src/api";

function replyWith(status: number, body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: status < 400,
    status,
    statusText: "x",
    json: async () => body,
  }));
}

function onPage(pathname: string, search = ""): ReturnType<typeof vi.fn> {
  const assign = vi.fn();
  vi.stubGlobal("location", { pathname, search, assign });
  return assign;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api() session expiry (#1273)", () => {
  it("sends the visitor to sign-in with a way back when the session gate answers 401", async () => {
    vi.stubGlobal("fetch", replyWith(401, { error: "Authentication required" }));
    const assign = onPage("/work", "?task=1273");

    const err = await api("/api/tasks").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(assign).toHaveBeenCalledWith(
      `/login?expired=1&redirect=${encodeURIComponent("/work?task=1273")}`,
    );
  });

  it("leaves other 401s alone, so a provider's rejected key does not bounce the page", async () => {
    vi.stubGlobal("fetch", replyWith(401, { error: "OpenRouter rejected the API key" }));
    const assign = onPage("/settings");

    await expect(api("/api/model-providers")).rejects.toThrow("OpenRouter rejected the API key");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not redirect from the sign-in page itself", async () => {
    vi.stubGlobal("fetch", replyWith(401, { error: "Authentication required" }));
    const assign = onPage("/login");

    await expect(api("/api/auth/users")).rejects.toThrow("Authentication required");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not redirect on other failures", async () => {
    vi.stubGlobal("fetch", replyWith(500, { error: "boom" }));
    const assign = onPage("/work");

    await expect(api("/api/tasks")).rejects.toThrow("boom");
    expect(assign).not.toHaveBeenCalled();
  });
});
