import { describe, expect, it, vi } from "vitest";
import type { RepoOSConfig } from "../../core/types.js";
import { buildTailnetDiscoveryPayload, DISCOVERY_DISABLED_REASON } from "../routes/servers.js";

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
      deadlineMs: 50,
    });

    expect(payload.ok).toBe(true);
    expect(payload.tailscaleUnavailable).toBe(false);
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

  it("reports a plain HTTP URL when the peer has no HTTPS serve mapping", async () => {
    const payload = await buildTailnetDiscoveryPayload(config(), {
      localRows: [],
      tailscaleStatus: async () =>
        JSON.stringify({ Peer: { a: { HostName: "thinkpad", DNSName: "thinkpad.ts.net." } } }),
      remoteExec: async (_host, _user, _timeout, command) => {
        if (command === "tailscale serve status --json") return "{}";
        return JSON.stringify({ servers: [{ port: 7499, projectName: "plain" }] });
      },
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
      },
    );

    expect(payload.tailscaleUnavailable).toBe(true);
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
});
