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
  createHubReturnToken,
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

  it("asks the shell to navigate to the return href", () => {
    const navigate = vi.fn<(href: string) => void>();
    returnToHubServerPicker(session(), navigate);
    expect(navigate).toHaveBeenCalledWith(hubReturnHref(session()));
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
    expect(browser).toMatch(/hubNavigationAction\(data\.url, activeSession\)/);
    expect(browser).toMatch(/InAppBrowser\.close\(\)/);
  });

  it("does not inject a JavaScript bridge into server content", () => {
    expect(browser).not.toContain("addJavascriptInterface");
    expect(browser).not.toContain("messageHandlers");
    expect(browser).not.toContain("injectJavaScript");
  });
});
