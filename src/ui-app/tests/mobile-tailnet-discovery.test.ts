import { describe, expect, it, vi } from "vitest";
import {
  fetchTailnetServers,
  mergeTailnetResults,
  type TailnetServer,
} from "../../../mobile/src/tailnet";

const rows: TailnetServer[] = [
  { host: "bee", port: 7499, projectName: "dev", url: "https://dev.repoos.org", https: true },
  {
    host: "thinkpad",
    port: 7819,
    projectName: "nightly",
    url: "https://thinkpad.tailc0c173.ts.net:8443",
    https: true,
  },
  // Same origin reported by two hosts — must appear once.
  {
    host: "mini",
    port: 7819,
    projectName: "nightly-again",
    url: "https://thinkpad.tailc0c173.ts.net:8443",
    https: true,
  },
  {
    host: "thinkpad",
    port: 7578,
    projectName: "plain",
    url: "http://thinkpad.tailc0c173.ts.net:7578",
    https: false,
  },
  { host: "mini", unreachable: true, reason: "timed out" },
];

describe("mobile tailnet discovery", () => {
  it("de-duplicates by origin and merges results with the saved list", () => {
    const merged = mergeTailnetResults(rows, [{ url: "https://dev.repoos.org" }]);

    expect(merged.map((entry) => entry.key)).toEqual([
      "https://dev.repoos.org",
      "https://thinkpad.tailc0c173.ts.net:8443",
      "http://thinkpad.tailc0c173.ts.net:7578",
      "unreachable:mini",
    ]);

    expect(merged.find((entry) => entry.url === "https://dev.repoos.org")).toMatchObject({
      name: "dev",
      saved: true,
      selectable: false,
      note: "Already saved",
    });
    expect(
      merged.find((entry) => entry.url === "https://thinkpad.tailc0c173.ts.net:8443"),
    ).toMatchObject({
      name: "nightly",
      saved: false,
      selectable: true,
      note: undefined,
    });
    expect(merged.find((entry) => entry.url.startsWith("http://"))).toMatchObject({
      https: false,
      selectable: false,
      note: "Needs HTTPS",
    });
    expect(merged.find((entry) => entry.key === "unreachable:mini")).toMatchObject({
      selectable: false,
      note: "Unreachable — timed out",
    });
    // The duplicate's later row never replaces the first display name.
    expect(merged.some((entry) => entry.name === "nightly-again")).toBe(false);
  });

  it("prefers the HTTPS view when the same origin is reported as plain HTTP first", () => {
    const merged = mergeTailnetResults(
      [
        {
          host: "bee",
          port: 7499,
          projectName: "http-first",
          url: "http://bee.tail.ts.net:7499",
        },
        {
          host: "bee",
          port: 7499,
          projectName: "https-second",
          url: "https://bee.tail.ts.net:7499",
        },
      ],
      [],
    );

    expect(merged).toEqual([
      {
        key: "https://bee.tail.ts.net:7499",
        url: "https://bee.tail.ts.net:7499",
        name: "https-second",
        host: "bee",
        port: 7499,
        https: true,
        saved: false,
        selectable: true,
        note: undefined,
      },
    ]);
  });

  it("calls the authenticated endpoint with the platform cookie jar", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, servers: rows, tailscaleUnavailable: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.servers).toHaveLength(rows.length);
      expect(result.tailscaleUnavailable).toBe(false);
    }
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bee.tailc0c173.ts.net:7499/api/servers/tailnet",
      expect.objectContaining({
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("explains configured-host fallback instead of claiming the tailnet is invisible", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            servers: rows,
            tailscaleUnavailable: true,
            discoverySource: "configured-hosts",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.tailscaleUnavailable).toBe(true);
      expect(result.message).toMatch(/configured hosts/);
      expect(result.message).not.toMatch(/can't see your tailnet/);
    }
  });

  it("does not claim a fallback source an older server never reported", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true, servers: [], tailscaleUnavailable: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.message).toMatch(/used its configured hosts or listed local servers only/);
      expect(result.message).not.toMatch(/only its local servers/);
    }
  });

  it("does not claim a configured-host fallback when the pool is empty", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            servers: [],
            tailscaleUnavailable: true,
            discoverySource: "local-only",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.message).toMatch(/no configured hosts/);
      expect(result.message).not.toMatch(/configured hosts instead/);
    }
  });

  it("turns an auth refusal into a plain message instead of a scan or retry", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Authentication required" }), { status: 401 }),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("auth");
    expect(result.kind === "auth" && result.message).toMatch(/signed-in session/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("names an older server instead of saying the reply was unexpected", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(new Response("Not Found", { status: 404 })),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      serverName: "bee",
    });

    expect(result.kind).toBe("outdated");
    expect(result.kind === "outdated" && result.message).toBe(
      "bee is running an older RepoOS that can't list tailnet servers yet. " +
        "Update RepoOS on that machine, or add servers by URL.",
    );
    expect(result.kind === "outdated" && result.message).not.toMatch(/unexpected reply/i);
  });

  it("treats a non-JSON reply as an older server, named by its host", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response("<!doctype html><title>RepoOS</title>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("outdated");
    expect(result.kind === "outdated" && result.message).toMatch(
      /^bee\.tailc0c173\.ts\.net:7499 is running an older RepoOS/,
    );
  });

  it("surfaces the server's discovery-off message", async () => {
    const fetchImpl = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            servers: [],
            disabled: true,
            reason: "Tailnet discovery is turned off on this server.",
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await fetchTailnetServers("https://bee.tailc0c173.ts.net:7499", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      kind: "disabled",
      message: "Tailnet discovery is turned off on this server.",
    });
  });
});
