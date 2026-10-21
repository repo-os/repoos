import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeRepoColor,
  parseRepoColorCookie,
  readRepoColor,
  repoColorCookieValue,
  repoColorStorageKey,
  REPO_COLOR_COOKIE,
  writeRepoColor,
} from "../src/repo-color";

function clearPreferenceCookie(): void {
  document.cookie = `${REPO_COLOR_COOKIE}=; Path=/; Max-Age=0`;
}

beforeEach(() => {
  localStorage.clear();
  clearPreferenceCookie();
});

describe("repo color preference", () => {
  it("scopes the legacy storage key to the repo name", () => {
    expect(repoColorStorageKey("lightingai")).toBe("repoos.repoColor.lightingai");
    expect(repoColorStorageKey("Tuk/Private")).toBe("repoos.repoColor.tuk-private");
  });

  it("normalizes only six-digit hex colors", () => {
    expect(normalizeRepoColor(" #ffffba ")).toBe("#FFFFBA");
    expect(normalizeRepoColor("#fff")).toBeNull();
    expect(normalizeRepoColor("yellow")).toBeNull();
    expect(normalizeRepoColor(null)).toBeNull();
  });

  it("round-trips a color and an explicit Default through the cookie value", () => {
    expect(parseRepoColorCookie(repoColorCookieValue("lightingai", "#FFFFBA"))).toEqual({
      repoName: "lightingai",
      color: "#FFFFBA",
    });
    expect(parseRepoColorCookie(repoColorCookieValue("lightingai", null))).toEqual({
      repoName: "lightingai",
      color: null,
    });
    expect(parseRepoColorCookie("not-a-color")).toBeNull();
  });

  it("reads the cookie as the shared preference", () => {
    writeRepoColor("lightingai", "#FFFFBA");
    expect(readRepoColor("lightingai")).toBe("#FFFFBA");
  });

  it("migrates a legacy localStorage color into the cookie", () => {
    localStorage.setItem(repoColorStorageKey("pn"), "#9e8fd0");
    expect(readRepoColor("pn")).toBe("#9E8FD0");
    expect(document.cookie).toContain(
      `${REPO_COLOR_COOKIE}=${repoColorCookieValue("pn", "#9E8FD0")}`,
    );
  });

  it("ignores a cookie saved for a different repo", () => {
    document.cookie = `${REPO_COLOR_COOKIE}=${repoColorCookieValue("other", "#FFFFBA")}; Path=/`;
    expect(readRepoColor("lightingai")).toBeNull();
  });

  it("writes an explicit clear marker when Default is chosen", () => {
    writeRepoColor("lightingai", "#FFFFBA");
    writeRepoColor("lightingai", null);

    expect(localStorage.getItem(repoColorStorageKey("lightingai"))).toBeNull();
    expect(readRepoColor("lightingai")).toBeNull();
    // The cookie still exists, so the Hub can tell "cleared" from "not chosen".
    expect(document.cookie).toContain(`${REPO_COLOR_COOKIE}=`);
    expect(readRepoColor("lightingai")).toBeNull();
  });
});
