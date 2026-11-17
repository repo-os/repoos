import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types.js";
import { createTailnetPeerDiscoveryHandler } from "../../server/routes/servers.js";
import type { RouteContext } from "../../server/routes/types.js";
import {
  groupMembersFromServers,
  propagateAllowlistGroup,
} from "../../core/allowlist-group-sync.js";
import type { AllowlistGroup } from "../../core/allowlist-groups.js";

function request(remoteAddress: string, headers: Record<string, string> = {}) {
  return {
    method: "GET",
    url: "/api/servers/discovery",
    headers,
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

function response() {
  const result: { status?: number; body?: unknown } = {};
  const res = {
    headersSent: false,
    writeHead(status: number) {
      result.status = status;
      return this;
    },
    end(body: string) {
      result.body = JSON.parse(body);
      return this;
    },
  } as unknown as ServerResponse;
  return { res, result };
}

function context(tailnetDiscovery = true) {
  return { config: { tailnetDiscovery } as RepoOSConfig } as RouteContext;
}

describe("GET /api/servers/discovery", () => {
  it("rejects loopback requests even when they forge Tailscale identity and forwarding headers", async () => {
    const listRows = vi.fn(async () => []);
    const handler = createTailnetPeerDiscoveryHandler({ listRows });
    const { res, result } = response();
    await handler(
      context(),
      request("127.0.0.1", {
        "tailscale-user-login": "attacker@example.com",
        "x-forwarded-for": "100.100.10.2",
      }),
      res,
      {},
    );
    expect(result.status).toBe(403);
    expect(listRows).not.toHaveBeenCalled();
  });

  it("accepts a direct socket from a Tailscale IPv4 peer without identity headers", async () => {
    const handler = createTailnetPeerDiscoveryHandler({
      listRows: async () => [],
      serveUrls: async () => ({}),
    });
    const { res, result } = response();
    await handler(context(), request("100.100.10.2"), res, {});
    expect(result).toMatchObject({
      status: 200,
      body: { discoveryVersion: 1, disabled: true, reason: expect.any(String) },
    });
  });

  it("uses each project's setting when the listener owner is disabled", async () => {
    const listRows = vi.fn(
      async () =>
        [
          { entry: { projectName: "hidden", port: 7171, tailnetDiscovery: false }, valid: true },
          { entry: { projectName: "visible", port: 7172 }, valid: true },
        ] as never,
    );
    const handler = createTailnetPeerDiscoveryHandler({ listRows });
    const { res, result } = response();
    await handler(context(false), request("100.100.10.2"), res, {});
    expect(result).toMatchObject({
      status: 200,
      body: { discoveryVersion: 1, servers: [{ projectName: "visible", port: 7172 }] },
    });
    expect((result.body as { servers: unknown[] }).servers).toHaveLength(1);
  });

  it("returns project identity, group membership, and tailnet URLs for each project", async () => {
    const rows = [
      {
        entry: { projectName: "api", port: 7171, root: "/srv/api", allowlistGroup: "agents" },
        valid: true,
      },
      {
        entry: { projectName: "web", port: 7172, root: "/srv/web", allowlistGroup: "agents" },
        valid: true,
      },
    ];
    const handler = createTailnetPeerDiscoveryHandler({
      listRows: async () => rows as never,
      serveUrls: async () => ({
        7171: "https://bee.tail.ts.net/api",
        7172: "https://bee.tail.ts.net/web",
      }),
    });
    const { res, result } = response();
    await handler(context(), request("100.100.10.2"), res, {});
    expect(result).toMatchObject({
      status: 200,
      body: {
        discoveryVersion: 1,
        servers: [
          {
            projectName: "api",
            port: 7171,
            root: "/srv/api",
            allowlistGroup: "agents",
            valid: true,
            url: "https://bee.tail.ts.net/api",
          },
          {
            projectName: "web",
            port: 7172,
            root: "/srv/web",
            allowlistGroup: "agents",
            valid: true,
            url: "https://bee.tail.ts.net/web",
          },
        ],
      },
    });
    expect(JSON.stringify(result.body)).toContain('"allowlistGroup":"agents"');
  });

  it("keeps HTTP-discovered peers in allowlist groups and applies from their project root", async () => {
    const handler = createTailnetPeerDiscoveryHandler({
      listRows: async () =>
        [
          {
            entry: {
              projectName: "api",
              port: 7171,
              root: "/srv/repoos/api",
              allowlistGroup: "personal",
            },
            valid: true,
          },
        ] as never,
      serveUrls: async () => ({ 7171: "https://bee.tail.ts.net/api" }),
    });
    const { res, result } = response();
    await handler(context(), request("100.100.10.2"), res, {});

    const discovered = (result.body as { servers: Array<Record<string, unknown>> }).servers.map(
      (server) => ({ ...server, host: "bee.tail.ts.net" }),
    );
    const members = groupMembersFromServers(discovered as never, "personal");
    expect(members).toEqual([
      {
        host: "bee.tail.ts.net",
        local: false,
        reachable: true,
        projectName: "api",
        root: "/srv/repoos/api",
        port: 7171,
      },
    ]);

    const commands: string[] = [];
    const group = {
      name: "personal",
      version: 1,
      updatedAt: "2026-11-17T00:00:00Z",
      allowlist: [],
    } as AllowlistGroup;
    await propagateAllowlistGroup(group, members, "air", {
      remoteExec: async (_host, _user, _timeout, command) => {
        commands.push(command);
        return JSON.stringify({ applied: true });
      },
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatch(/^cd '\/srv\/repoos\/api' && repoos allowlist group apply/);
  });
});
