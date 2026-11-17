import { describe, expect, it, vi } from "vitest";
import {
  fetchTailnetServers,
  mergeTailnetResults,
  tailnetDiscoveryMessage,
  type TailnetServer,
} from "../../../mobile/src/tailnet";
import { serverUrlOf, validateServer } from "../../../mobile/src/reachability";

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
  it("preserves a Serve path when validating and requesting a server", async () => {
    expect(serverUrlOf("https://bee.tail.ts.net/repoos/")).toBe("https://bee.tail.ts.net/repoos");
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    await expect(
      validateServer("https://bee.tail.ts.net/repoos", 500, fetchImpl),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bee.tail.ts.net/repoos/api/health",
      expect.any(Object),
    );
  });

  it("requests discovery below a saved Serve path", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, servers: [] }), { status: 200 }),
    );
    await fetchTailnetServers("https://bee.tail.ts.net/repoos", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://bee.tail.ts.net/repoos/api/servers/tailnet",
      expect.any(Object),
    );
  });

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

  it("marks an unreachable peer as saved when its host matches a saved server URL", () => {
    const merged = mergeTailnetResults(
      [{ host: "bee", dnsName: "bee.tail.ts.net", unreachable: true, reason: "timed out" }],
      [{ url: "https://bee.tail.ts.net" }],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ saved: true, selectable: false, note: "Already saved" });
  });

  it("keeps Serve path URLs distinct even when projects share the same origin", () => {
    const merged = mergeTailnetResults(
      [
        { host: "bee", projectName: "api", url: "https://bee.tail.ts.net/api", https: true },
        { host: "bee", projectName: "web", url: "https://bee.tail.ts.net/web/", https: true },
      ],
      [{ url: "https://bee.tail.ts.net/api" }],
    );
    expect(merged.map(({ key, url }) => [key, url])).toEqual([
      ["https://bee.tail.ts.net/api", "https://bee.tail.ts.net/api"],
      ["https://bee.tail.ts.net/web", "https://bee.tail.ts.net/web"],
    ]);
    expect(merged.map(({ saved }) => saved)).toEqual([true, false]);
  });

  it("reconciles multiple custom-domain saved projects by project name", () => {
    const merged = mergeTailnetResults(
      [{ host: "bee", projectName: "api", unreachable: true, reason: "timed out" }],
      [
        { url: "https://custom.example/api", name: "api" },
        { url: "https://custom.example/jobs", name: "jobs" },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ saved: true, note: "Already saved" });
  });

  it("keeps two saved Serve paths on the same machine as separate saved rows", () => {
    const merged = mergeTailnetResults(
      [{ host: "bee", dnsName: "bee.tail.ts.net", unreachable: true, reason: "timed out" }],
      [
        { url: "https://bee.tail.ts.net/api", name: "api" },
        { url: "https://bee.tail.ts.net/web", name: "web" },
      ],
    );
    expect(merged.map((entry) => entry.url)).toEqual([
      "https://bee.tail.ts.net/api",
      "https://bee.tail.ts.net/web",
    ]);
    expect(merged.map((entry) => entry.name)).toEqual(["api", "web"]);
  });

  it("does not show the already-saved empty message when only machines failed", () => {
    const failed = mergeTailnetResults(
      [{ host: "muse", unreachable: true, reason: "SSH is off on muse" }],
      [],
    );
    expect(tailnetDiscoveryMessage(failed, 0)).toBe("");
  });

  it("uses a peer's readable Tailscale display name when no project is advertised", () => {
    const merged = mergeTailnetResults(
      [
        {
          host: "mini",
          displayName: "Peck’s Mac mini",
          port: 7499,
          url: "https://mini.tailc0c173.ts.net:7499",
          https: true,
        },
      ],
      [],
    );

    expect(merged).toEqual([
      {
        key: "https://mini.tailc0c173.ts.net:7499",
        url: "https://mini.tailc0c173.ts.net:7499",
        name: "Peck’s Mac mini",
        host: "mini",
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
    expect(result.kind === "auth" && result.message).toMatch(/web Hub/i);
    expect(result.kind === "auth" && result.message).toMatch(/add a server manually/i);
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
