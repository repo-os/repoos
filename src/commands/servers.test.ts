import { describe, expect, it, vi } from "vitest";
import { collectTailnetServers, parseTailnetPeers, cmdServers } from "./servers.js";
import * as registry from "../core/server-registry.js";

describe("repoos servers --tailscale", () => {
  it("parses online peers and excludes self and offline peers", () => {
    expect(
      parseTailnetPeers(
        JSON.stringify({
          Self: { HostName: "laptop" },
          Peer: {
            a: { HostName: "bee", Online: true },
            b: { DNSName: "thinkpad.tailnet.ts.net.", Online: true },
            c: { HostName: "sleeping", Online: false },
            d: { HostName: "laptop", Online: true },
          },
        }),
      ),
    ).toEqual(["bee", "thinkpad"]);
  });

  it("lists local and remote entries with hosts, continuing after a timed out peer", async () => {
    const remoteExec = vi.fn(async (host: string) => {
      if (host === "slow") throw new Error("Command timed out");
      return JSON.stringify({ servers: [{ port: 7171, projectName: "remote", valid: true }] });
    });
    const result = await collectTailnetServers([{ host: "local", port: 7000 }], {
      tailscaleStatus: async () =>
        JSON.stringify({
          Peer: {
            a: { HostName: "fast", Online: true },
            b: { HostName: "slow", Online: true },
          },
        }),
      remoteExec,
    });
    expect(result.tailscaleUnavailable).toBe(false);
    expect(result.servers).toEqual([
      { host: "local", port: 7000 },
      { port: 7171, projectName: "remote", valid: true, host: "fast" },
      { host: "slow", unreachable: true, reason: "timed out" },
    ]);
    expect(remoteExec).toHaveBeenCalledTimes(2);
  });

  it("falls back to configured hosts when the Tailscale CLI is unavailable", async () => {
    const result = await collectTailnetServers([], {
      tailscaleStatus: async () => {
        throw new Error("tailscale: not found");
      },
      configuredHosts: ["bee"],
      remoteExec: async () => JSON.stringify({ servers: [] }),
    });
    expect(result.tailscaleUnavailable).toBe(true);
    expect(result.servers).toEqual([]);
  });

  it("refuses --prune --tailscale before touching the local or remote registries", async () => {
    const prune = vi.spyOn(registry, "pruneStaleServerRegistryEntries");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const local = vi.spyOn(registry, "listValidatedServerRegistry");
    try {
      await cmdServers(["--prune", "--tailscale"]);
      expect(prune).not.toHaveBeenCalled();
      expect(local).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("local-only"));
    } finally {
      prune.mockRestore();
      local.mockRestore();
      log.mockRestore();
    }
  });
});
