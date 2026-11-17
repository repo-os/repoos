// @vitest-environment jsdom
/**
 * Native Hub ↔ server SPA return-to-picker contract (#1152).
 *
 * The connected server runs in an isolated WebView with no bridge, so the
 * only native action it can request is "dismiss this browser and show the
 * picker". These tests pin the exact-origin/path/token check that keeps that
 * navigation from becoming a generic native-shell channel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyHubNavigation,
  createHubReturnToken,
  hubFallbackHref,
  hubNavigationAction,
  hubReturnHref,
  isHubReturnHref,
  isHubReturnToken,
  readHubContext,
  stripHubContext,
  withHubContext,
  HUB_CONTEXT_PARAM,
  HUB_RETURN_PATH,
  type HubReturnSession,
} from "../../core/hub-return.js";
import {
  claimHubContext,
  readHubShellSession,
  returnToHubServerPicker,
} from "../src/lib/hub-shell";

const ORIGIN = "https://repo.example.com";

function session(overrides: Partial<HubReturnSession> = {}): HubReturnSession {
  return { origin: ORIGIN, token: "a".repeat(32), ...overrides };
}

describe("hub return contract", () => {
  it("creates 128-bit lowercase hex tokens", () => {
    const token = createHubReturnToken();
    expect(isHubReturnToken(token)).toBe(true);
    expect(createHubReturnToken()).not.toBe(token);
    expect(isHubReturnToken("A".repeat(32))).toBe(false);
    expect(isHubReturnToken("a".repeat(31))).toBe(false);
  });

  it("adds and reads the native context without disturbing the URL", () => {
    const opened = withHubContext(`${ORIGIN}/work?task=1152#notes`, "b".repeat(32));
    expect(opened).toContain(`task=1152`);
    expect(opened).toContain(`#notes`);
    expect(readHubContext(opened)).toEqual({ origin: ORIGIN, token: "b".repeat(32) });
    expect(readHubContext(`${ORIGIN}/`)?.token).toBeUndefined();
    expect(readHubContext(`${ORIGIN}/?${HUB_CONTEXT_PARAM}=not-a-token`)).toBeNull();
    expect(readHubContext("javascript:alert(1)")).toBeNull();
  });

  it("strips only the context parameter", () => {
    const cleaned = stripHubContext(
      `${ORIGIN}/work?task=1152&${HUB_CONTEXT_PARAM}=${"c".repeat(32)}#notes`,
    );
    expect(cleaned).toBe(`${ORIGIN}/work?task=1152#notes`);
  });

  it("builds the exact return navigation with the token in the fragment", () => {
    const s = session();
    const href = hubReturnHref(s);
    expect(href).toBe(`${ORIGIN}${HUB_RETURN_PATH}#hub-return=${s.token}`);
    expect(new URL(href).search).toBe("");
    expect(isHubReturnHref(href, s)).toBe(true);
    expect(hubNavigationAction(href, s)).toBe("close-browser");
  });

  it.each([
    ["a foreign origin", "https://evil.example.com/__repoos_hub/return-to-picker"],
    ["a different path", "https://repo.example.com/__repoos_hub/other"],
    ["a normal server route", "https://repo.example.com/work"],
    ["the right path without the token", "https://repo.example.com/__repoos_hub/return-to-picker"],
    [
      "the token in the query instead",
      "https://repo.example.com/__repoos_hub/return-to-picker?token=",
    ],
    ["a stale token", "https://repo.example.com/__repoos_hub/return-to-picker#hub-return=deadbeef"],
  ])("does not close the browser on %s", (_label, href) => {
    expect(isHubReturnHref(href, session())).toBe(false);
    expect(hubNavigationAction(href, session())).toBe("continue");
  });

  it("never matches without an active native session", () => {
    const href = hubReturnHref(session());
    expect(isHubReturnHref(href, null)).toBe(false);
    expect(hubNavigationAction(href, null)).toBe("continue");
  });

  it("accepts the same-origin offline blob fallback but not another origin", () => {
    const blob = "blob:https://repo.example.com/0d1c2b3a-0000-4000-8000-000000000000";
    const href = hubFallbackHref(session(), blob);
    expect(href.endsWith(`#hub-return=${"a".repeat(32)}`)).toBe(true);
    expect(isHubReturnHref(href, session())).toBe(true);
    expect(isHubReturnHref(href, session({ origin: "https://evil.example.com" }))).toBe(false);
    expect(() => hubFallbackHref(session(), "blob:https://evil.example.com/uuid")).toThrow();
  });

  it("navigates to the landing page when the server is reachable", async () => {
    const navigate = vi.fn<(href: string) => void>();
    await returnToHubServerPicker(session(), {
      navigate,
      reachable: async () => true,
    });
    expect(navigate).toHaveBeenCalledWith(hubReturnHref(session()));
  });

  it("falls back to an in-memory blob when the server cannot be reached", async () => {
    const navigate = vi.fn<(href: string) => void>();
    const createBlob = vi.fn(
      (_html: string) => "blob:https://repo.example.com/0d1c2b3a-0000-4000-8000-000000000000",
    );
    await returnToHubServerPicker(session(), {
      navigate,
      reachable: async () => false,
      createBlob,
    });
    expect(createBlob).toHaveBeenCalledOnce();
    expect(createBlob.mock.calls[0]?.[0]).toContain("Returning to RepoOS Hub");
    expect(createBlob.mock.calls[0]?.[0]).toContain('href="https://repo.example.com/"');
    expect(navigate).toHaveBeenCalledWith(
      hubFallbackHref(
        session(),
        "blob:https://repo.example.com/0d1c2b3a-0000-4000-8000-000000000000",
      ),
    );
  });

  it("applies exactly one close or one normal navigation", () => {
    const closeBrowser = vi.fn<() => void>();
    const navigated = vi.fn<(href: string) => void>();
    const returned = vi.fn<() => void>();

    expect(applyHubNavigation(undefined, session(), { closeBrowser, navigated, returned })).toBe(
      "continue",
    );
    expect(navigated).not.toHaveBeenCalled();

    expect(
      applyHubNavigation("https://repo.example.com/work", session(), {
        closeBrowser,
        navigated,
        returned,
      }),
    ).toBe("continue");
    expect(navigated).toHaveBeenCalledWith("https://repo.example.com/work");
    expect(closeBrowser).not.toHaveBeenCalled();

    expect(
      applyHubNavigation(hubReturnHref(session()), session(), {
        closeBrowser,
        navigated,
        returned,
      }),
    ).toBe("close-browser");
    expect(closeBrowser).toHaveBeenCalledOnce();
    expect(returned).toHaveBeenCalledOnce();
  });
});

describe("hub shell context in the SPA", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("claims the token from the URL, hides it, and remembers it for this tab", () => {
    const token = "d".repeat(32);
    window.history.replaceState({}, "", `/?${HUB_CONTEXT_PARAM}=${token}`);

    expect(claimHubContext()).toEqual({ origin: window.location.origin, token });
    expect(window.location.search).toBe("");
    expect(sessionStorage.getItem("repoos.hub.returnToken")).toBe(token);
    expect(readHubShellSession()).toEqual({ origin: window.location.origin, token });
  });

  it("survives a login round-trip through sessionStorage only", () => {
    sessionStorage.setItem("repoos.hub.returnToken", "e".repeat(32));
    expect(readHubShellSession()).toEqual({
      origin: window.location.origin,
      token: "e".repeat(32),
    });
  });

  it("stays inert in a normal browser tab", () => {
    expect(claimHubContext()).toBeNull();
    expect(readHubShellSession()).toBeNull();
  });

  it("ignores a malformed remembered token", () => {
    sessionStorage.setItem("repoos.hub.returnToken", "not-a-token");
    expect(readHubShellSession()).toBeNull();
  });
});

describe("native shell wiring", () => {
  const browser = readFileSync(resolve(__dirname, "../../../mobile/src/browser.ts"), "utf8");

  it("scopes each open with a fresh token and watches the existing nav event", () => {
    expect(browser).toMatch(/createHubReturnToken\(\)/);
    expect(browser).toMatch(/withHubContext\(url, token\)/);
    expect(browser).toContain("browserPageNavigationCompleted");
    expect(browser).toMatch(/applyHubNavigation\(data\.url, activeSession/);
    expect(browser).toMatch(/InAppBrowser\.close\(\)/);
  });

  it("does not inject a JavaScript bridge into server content", () => {
    expect(browser).not.toContain("addJavascriptInterface");
    expect(browser).not.toContain("messageHandlers");
    expect(browser).not.toContain("injectJavaScript");
  });

  it("offers the return on the login screen when a session expired mid-use", () => {
    const login = readFileSync(resolve(__dirname, "../src/views/LoginView.vue"), "utf8");
    expect(login).toContain("readHubShellSession");
    expect(login).toContain('data-testid="login-return-to-picker"');
    expect(login).toContain("Return to RepoOS Hub server picker");
    expect(login).toMatch(/class="login-logo login-logo-button"/);
  });
});
