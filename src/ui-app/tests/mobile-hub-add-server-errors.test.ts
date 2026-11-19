// @vitest-environment jsdom
/**
 * Hub add-server error copy and rules (QA #1242).
 *
 * Every rejected address must say what is wrong and what to do next, and an
 * unsafe scheme must never be rewritten into an https request to some host. The
 * network is always an injected fetch here; nothing contacts a real server.
 */
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { serverUrlOf, serverUrlProblem, validateServer } from "../../../mobile/src/reachability";
import { duplicateNameProblem, duplicateUrlProblem } from "../../../mobile/src/server-entries";
import type { ServerEntry } from "../../../mobile/src/types";
import AddServerView from "../../../mobile/src/components/AddServerView.vue";

const SAVED: ServerEntry[] = [
  { id: "a", url: "https://dev.repoos.org", name: "dev", order: 0, createdAt: 1 },
  { id: "b", url: "https://bee.tail.ts.net/alpha", name: "alpha", order: 1, createdAt: 2 },
];

describe("add-server URL problems", () => {
  it.each([
    ["", "Enter a server URL."],
    ["   ", "Enter a server URL."],
    ["http://dev.repoos.org", "uses http://, which Hub doesn't connect to"],
    ["HTTP://dev.repoos.org", "uses http://"],
    ["http:/dev.repoos.org", "uses http://"],
    ["file:///etc/passwd", "starts with file:, which Hub can't use"],
    ["javascript:alert(1)", "starts with javascript:, which Hub can't use"],
    ["ftp://dev.repoos.org", "starts with ftp:, which Hub can't use"],
    ["data:text/html,hi", "starts with data:, which Hub can't use"],
    ["https://dev.repoos.org?x=1", "Remove everything after the ? or #"],
    ["https://dev.repoos.org/#top", "Remove everything after the ? or #"],
    ["https://dev repoos", "doesn't look like a web address"],
    // WebKit and Chromium would turn these into a host `ok%20example`; refuse them here.
    ["https://ok example", "doesn't look like a web address"],
    ["https://ok%20example", "doesn't look like a web address"],
    ["https://dev.repoos.org:99999", "doesn't look like a web address"],
  ])("rejects %j with a plain reason", (input, reason) => {
    const problem = serverUrlProblem(input);
    expect(problem).not.toBeNull();
    expect(problem).toContain(reason);
    expect(serverUrlOf(input)).toBeNull();
  });

  it.each([
    "https://dev.repoos.org",
    "dev.repoos.org",
    "dev.repoos.org:8443",
    "https://dev.repoos.org/",
    "https://bee.tail.ts.net/repoos/",
    "  https://dev.repoos.org  ",
  ])("accepts %j", (input) => {
    expect(serverUrlProblem(input)).toBeNull();
    expect(serverUrlOf(input)).not.toBeNull();
  });

  it("never rewrites an unsafe scheme into a request to a host", () => {
    // Before the fix, `file:///x` became `https://file/x` and was fetched.
    expect(serverUrlOf("file:///etc/passwd")).toBeNull();
    expect(serverUrlOf("ftp://dev.repoos.org")).toBeNull();
    expect(serverUrlOf("http:/dev.repoos.org")).toBeNull();
    expect(serverUrlOf("javascript:alert(1)")).toBeNull();
  });

  it("keeps the Serve path and drops the trailing slash", () => {
    expect(serverUrlOf("https://bee.tail.ts.net/repoos/")).toBe("https://bee.tail.ts.net/repoos");
  });
});

describe("add-server reachability problems", () => {
  const healthy = (body: unknown, status = 200) =>
    vi.fn(
      async () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
    );

  it("accepts a RepoOS health reply", async () => {
    await expect(
      validateServer("https://dev.repoos.org", 500, healthy({ ok: true })),
    ).resolves.toEqual({
      ok: true,
    });
  });

  it("asks the server's health path under the saved origin", async () => {
    const fetchImpl = healthy({ ok: true });
    await validateServer("https://bee.tail.ts.net/repoos/", 500, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bee.tail.ts.net/repoos/api/health",
      expect.any(Object),
    );
  });

  it.each([
    [
      "an HTTP 404",
      healthy({ ok: true }, 404),
      "answered with HTTP 404, so it isn't a RepoOS server",
    ],
    ["an HTTP 500", healthy({ ok: true }, 500), "answered with HTTP 500"],
    [
      "a 200 sign-in page",
      healthy("<html><body>Sign in</body></html>", 200),
      "answered, but it isn't a RepoOS server",
    ],
    [
      "a 200 JSON body that is not RepoOS",
      healthy({ status: "ok" }, 200),
      "answered, but it isn't a RepoOS server",
    ],
  ])("explains %s", async (_label, fetchImpl, reason) => {
    const result = await validateServer("https://dev.repoos.org", 500, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.error).toContain(reason);
  });

  it("says the server can't be reached when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const result = await validateServer("https://offline.example.test", 500, fetchImpl);
    expect(result).toEqual({
      ok: false,
      error: "Can't reach that server. Check the address and your connection, then try again.",
    });
  });

  it("says the server didn't answer in time when a slow server aborts", async () => {
    // A server that never replies; only the abort signal ends the request.
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const result = await validateServer("https://slow.example.test", 2000, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("didn't answer within 2 seconds");
    expect(result.error).toContain("Check that it's running");
  });

  it("does not contact the network for an unsafe address", async () => {
    const fetchImpl = healthy({ ok: true });
    const result = await validateServer("file:///etc/passwd", 500, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("file:");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("duplicate servers", () => {
  it.each([
    ["https://dev.repoos.org", 'already saved as "dev"'],
    ["https://dev.repoos.org/", 'already saved as "dev"'],
    ["dev.repoos.org", 'already saved as "dev"'],
  ])("refuses the saved origin %j", (input, reason) => {
    const serverUrl = serverUrlOf(input);
    expect(serverUrl).not.toBeNull();
    expect(duplicateUrlProblem(SAVED, serverUrl as string)).toContain(reason);
  });

  it("allows a different Serve path on the same host", () => {
    expect(duplicateUrlProblem(SAVED, "https://bee.tail.ts.net/beta")).toBeNull();
    expect(duplicateUrlProblem(SAVED, "https://bee.tail.ts.net/alpha")).toContain(
      'already saved as "alpha"',
    );
  });

  it.each([
    ["dev", 'A server named "dev" is already saved.'],
    ["DEV", 'A server named "dev" is already saved.'],
    ["  Dev  ", 'A server named "dev" is already saved.'],
  ])("refuses the name %j regardless of case and spaces", (name, reason) => {
    expect(duplicateNameProblem(SAVED, name)).toContain(reason);
  });

  it("allows a new name and an empty name", () => {
    expect(duplicateNameProblem(SAVED, "staging")).toBeNull();
    expect(duplicateNameProblem(SAVED, "   ")).toBeNull();
  });

  it("lets a server keep its own name and URL when renaming", () => {
    expect(duplicateNameProblem(SAVED, "dev", "a")).toBeNull();
    expect(duplicateUrlProblem(SAVED, "https://dev.repoos.org", "a")).toBeNull();
  });
});

describe("add-server error announcement", () => {
  it("announces the inline error so a failed Save is read aloud", () => {
    const wrapper = mount(AddServerView, {
      props: {
        mode: "add",
        name: "",
        url: "http://dev.repoos.org",
        busy: false,
        validating: false,
        error: "This address uses http://, which Hub doesn't connect to.",
        platform: "web",
      },
    });
    const error = wrapper.find(".form-error");
    expect(error.attributes("role")).toBe("alert");
    expect(error.text()).toContain("uses http://");
  });
});
