import { describe, expect, it, vi } from "vitest";
import type { RepoOSConfig } from "../../core/types.js";
import {
  buildTailnetDiscoveryPayload,
  DISCOVERY_DISABLED_REASON,
} from "../../server/routes/servers.js";
import { parseTailnetInfo, tailnetPeerFailureReason } from "../../core/tailnet-servers.js";

const config = (
  over: Partial<RepoOSConfig> = {},
): Pick<RepoOSConfig, "remoteValidation" | "tailnetDiscovery"> =>
  ({ tailnetDiscovery: true, ...over }) as Pick<
    RepoOSConfig,
    "remoteValidation" | "tailnetDiscovery"
  >;

const status = () =>
  JSON.stringify({
    Self: { HostName: "bee", DNSName: "bee.tailc0c173.ts.net." },
    Peer: {
      a: { HostName: "thinkpad", DNSName: "thinkpad.tailc0c173.ts.net.", Online: true },
      b: { HostName: "slow", Online: true },
      c: { HostName: "asleep", Online: false },
    },
  });

describe("GET /api/servers/tailnet", () => {
  it.each([
    [
      Object.assign(new Error("Permission denied (publickey)."), {
        stderr: "Permission denied (publickey).",
      }),
      "thinkpad",
      "no SSH key from thinkpad",
    ],
    [
      Object.assign(new Error("connect: Connection refused"), {
        stderr: "ssh: connect to host muse port 22: Connection refused",
      }),
      "muse",
      "SSH is off on muse",
    ],
  ])("explains SSH failures with a plain fix", (failure, host, expected) => {
    expect(tailnetPeerFailureReason(failure, host)).toBe(expected);
  });

  it("filters mobile devices by OS or device model without dropping generic phone-named servers", () => {
    const info = parseTailnetInfo(
      JSON.stringify({
        Peer: {
          nothing: { HostName: "Nothing Phone (3a)", DNSName: "nothing.tail.ts.net", Online: true },
          dnsPhone: { HostName: "nothing", DNSName: "nothing-phone.tail.ts.net", Online: true },
          ios: { HostName: "ipad", OS: "iOS", Online: true },
          server: { HostName: "phone-01", OS: "linux", Online: true },
        },
      }),
    );
    expect(info.peers.map((peer) => peer.host)).toEqual(["phone-01"]);
  });

  it("lists local and remote servers with HTTPS MagicDNS URLs and partial failures", async () => {
    const remoteExec = vi.fn(
      async (host: string, _user: string, _timeout: number, command?: string) => {
        if (host === "slow") return new Promise<string>(() => {});
        if (command === "tailscale serve status --json") {
          return JSON.stringify({
            Web: {
              [`${host}.tailc0c173.ts.net:8443`]: {
                Handlers: {
                  "/": { Proxy: `http://127.0.0.1:${host === "thinkpad" ? 7499 : 7819}` },
                },
              },
            },
          });
        }
        return JSON.stringify({
          servers: [{ port: host === "thinkpad" ? 7499 : 7819, projectName: `${host}-project` }],
        });
      },
    );

    const payload = await buildTailnetDiscoveryPayload(config(), {
      localRows: [{ host: "local", port: 7171, projectName: "trusted" }],
      tailscaleStatus: async () => status(),
      localServeStatus: async () =>
        JSON.stringify({
          Web: {
            "bee.tailc0c173.ts.net:443": {
              Handlers: { "/": { Proxy: "http://127.0.0.1:7171" } },
            },
          },
        }),
      remoteExec,
      httpDiscovery: async () => null,
      deadlineMs: 50,
    });

    expect(payload.ok).toBe(true);
    expect(payload.tailscaleUnavailable).toBe(false);
    expect(payload.discoverySource).toBe("tailscale");
    expect(payload.servers).toEqual([
      {
        host: "local",
        port: 7171,
        projectName: "trusted",
        url: "https://bee.tailc0c173.ts.net",
        https: true,
      },
      {
        host: "thinkpad",
        port: 7499,
        projectName: "thinkpad-project",
        url: "https://thinkpad.tailc0c173.ts.net:8443",
        https: true,
      },
      { host: "slow", unreachable: true, reason: "timed out" },
    ]);
    // `slow` never resolves; the deadline turns it into a per-host failure
    // instead of holding the whole response open.
    expect(remoteExec).toHaveBeenCalledWith(
      "thinkpad",
      "root",
      1_500,
      "tailscale serve status --json",
    );
  });

  it("reports duplicate HostNames individually by MagicDNS identity and skips mobile peers", async () => {
    const remoteExec = vi.fn(
      async (host: string, _user: string, _timeout: number, command?: string) => {
        if (command === "tailscale serve status --json") {
          return JSON.stringify({
            Web: {
              [`${host}.tailc0c173.ts.net:443`]: {
                Handlers: { "/": { Proxy: "http://127.0.0.1:7499" } },
              },
            },
          });
        }
        return JSON.stringify({
          servers: [{ port: 7499, projectName: `${host}-project` }],
        });
      },
    );

    const payload = await buildTailnetDiscoveryPayload(config(), {
      localRows: [],
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            a: {
              HostName: "omarchy",
              DNSName: "bee.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
            b: {
              HostName: "omarchy",
              DNSName: "thinkpad.tailc0c173.ts.net.",
              OS: "linux",
              Online: true,
            },
            c: {
              HostName: "Peck’s Mac mini",
              DNSName: "mini.tailc0c173.ts.net.",
              OS: "macOS",
              Online: true,
            },
            phone: {
              HostName: "Nothing Phone (3a)",
              DNSName: "nothing-phone.tailc0c173.ts.net.",
              OS: "android",
              Online: true,
            },
          },
        }),
      remoteExec,
      httpDiscovery: async () => null,
    });

    expect(payload.servers).toEqual([
      {
        host: "bee",
        displayName: "omarchy",
        port: 7499,
        projectName: "bee-project",
        url: "https://bee.tailc0c173.ts.net",
        https: true,
      },
      {
        host: "thinkpad",
        displayName: "omarchy",
        port: 7499,
        projectName: "thinkpad-project",
        url: "https://thinkpad.tailc0c173.ts.net",
        https: true,
      },
      {
        host: "mini",
        displayName: "Peck’s Mac mini",
        port: 7499,
        projectName: "mini-project",
        url: "https://mini.tailc0c173.ts.net",
        https: true,
      },
    ]);
    const probed = remoteExec.mock.calls
      .filter(([, , , command]) => command === "repoos servers --json")
      .map(([host]) => host);
    expect(probed).toEqual(["bee", "thinkpad", "mini"]);
    expect(probed).not.toContain("nothing-phone");
  });

  it("reports a plain HTTP URL when the peer has no HTTPS serve mapping", async () => {
    const payload = await buildTailnetDiscoveryPayload(config(), {
      localRows: [],
      tailscaleStatus: async () =>
        JSON.stringify({ Peer: { a: { HostName: "thinkpad", DNSName: "thinkpad.ts.net." } } }),
      remoteExec: async (_host, _user, _timeout, command) => {
        if (command === "tailscale serve status --json") return "{}";
        return JSON.stringify({ servers: [{ port: 7499, projectName: "plain" }] });
      },
      httpDiscovery: async () => null,
    });

    expect(payload.servers).toEqual([
      {
        host: "thinkpad",
        port: 7499,
        projectName: "plain",
        url: "http://thinkpad.ts.net:7499",
        https: false,
      },
    ]);
  });

  it("falls back to configured hosts when the Tailscale CLI is unavailable", async () => {
    const remoteExec = vi.fn(async () => JSON.stringify({ servers: [] }));
    const payload = await buildTailnetDiscoveryPayload(
      config({
        remoteValidation: {
          enabled: true,
          provider: "tailscale",
          tailscaleHosts: [{ host: "bee" }],
        },
      }),
      {
        localRows: [],
        tailscaleStatus: async () => {
          throw new Error("tailscale: not found");
        },
        remoteExec,
        httpDiscovery: async () => null,
      },
    );

    expect(payload.tailscaleUnavailable).toBe(true);
    expect(payload.discoverySource).toBe("configured-hosts");
    expect(payload.servers).toEqual([]);
    expect(remoteExec).toHaveBeenCalledWith("bee", "root", 4_000, "repoos servers --json");
  });

  it("refuses to run discovery when the server owner turned it off", async () => {
    const remoteExec = vi.fn(async () => JSON.stringify({ servers: [] }));
    const statusSpy = vi.fn(async () => status());
    const payload = await buildTailnetDiscoveryPayload(config({ tailnetDiscovery: false }), {
      localRows: [],
      tailscaleStatus: statusSpy,
      remoteExec,
      httpDiscovery: async () => null,
    });

    expect(payload).toEqual({
      ok: true,
      servers: [],
      tailscaleUnavailable: false,
      disabled: true,
      reason: DISCOVERY_DISABLED_REASON,
    });
    expect(statusSpy).not.toHaveBeenCalled();
    expect(remoteExec).not.toHaveBeenCalled();
  });

  it("discovers peer projects over HTTPS without invoking SSH", async () => {
    const remoteExec = vi.fn(async () => {
      throw new Error("SSH must not run");
    });
    const payload = await buildTailnetDiscoveryPayload(config(), {
      localRows: [],
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            bee: { HostName: "bee", DNSName: "bee.tail.ts.net.", OS: "linux", Online: true },
          },
        }),
      httpDiscovery: async (peer) =>
        peer.host === "bee"
          ? JSON.stringify({
              discoveryVersion: 1,
              servers: [
                {
                  projectName: "api",
                  port: 7171,
                  root: "/srv/api",
                  valid: true,
                  allowlistGroup: "agents",
                  url: "https://bee.tail.ts.net",
                },
              ],
            })
          : null,
      remoteExec,
    });
    expect(payload.servers).toEqual([
      {
        host: "bee",
        dnsName: "bee.tail.ts.net",
        projectName: "api",
        root: "/srv/api",
        valid: true,
        allowlistGroup: "agents",
        port: 7171,
        url: "https://bee.tail.ts.net",
        https: true,
      },
    ]);
    expect(remoteExec).not.toHaveBeenCalled();
  });

  it("keeps a peer that disabled discovery in the collapsed machine-failure results", async () => {
    const remoteExec = vi.fn(async () => {
      throw new Error("SSH should not run for a current peer endpoint");
    });
    const payload = await buildTailnetDiscoveryPayload(config(), {
      localRows: [],
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: { bee: { HostName: "bee", DNSName: "bee.tail.ts.net", Online: true } },
        }),
      httpDiscovery: async () =>
        JSON.stringify({ discoveryVersion: 1, disabled: true, servers: [] }),
      remoteExec,
    });
    expect(payload.servers).toEqual([
      {
        host: "bee",
        dnsName: "bee.tail.ts.net",
        unreachable: true,
        reason: "tailnet discovery is turned off on this machine",
      },
    ]);
    expect(remoteExec).not.toHaveBeenCalled();
  });
});
