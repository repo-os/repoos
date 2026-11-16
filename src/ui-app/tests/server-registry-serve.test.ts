/**
 * Integration: control-plane `startServer` registers in ~/.repoos/servers (override dir).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server.js";
import {
  listValidatedServerRegistry,
  pruneStaleServerRegistryEntries,
  type ServerRegistryEntry,
} from "../../core/server-registry.js";
import { loadConfig } from "../../core/config.js";
import { collectStatus } from "../../commands/status.js";
import { cmdServers } from "../../commands/servers.js";
import { buildTailnetDiscoveryPayload } from "../../server/routes/servers.js";

const roots: string[] = [];
let registryDir: string;
let priorRegistryDir: string | undefined;
let priorPreview: string | undefined;
let priorNoRegistry: string | undefined;

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

function minimalRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-srv-reg-serve-"));
  roots.push(root);
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "repoos.toml"), "servePort = 0\n");
  git(root, ["add", "repoos.toml"]);
  git(root, ["commit", "-q", "-m", "init"]);
  return root;
}

function captureStdout(fn: () => Promise<void>): Promise<string> {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return fn()
    .finally(() => {
      console.log = orig;
    })
    .then(() => lines.join("\n"));
}

beforeEach(() => {
  registryDir = mkdtempSync(join(tmpdir(), "repoos-srv-reg-dir-"));
  priorRegistryDir = process.env.REPOOS_SERVERS_REGISTRY_DIR;
  process.env.REPOOS_SERVERS_REGISTRY_DIR = registryDir;
  priorPreview = process.env.REPOOS_PREVIEW_CHILD;
  delete process.env.REPOOS_PREVIEW_CHILD;
  priorNoRegistry = process.env.REPOOS_NO_REGISTRY;
  delete process.env.REPOOS_NO_REGISTRY;
});

afterEach(async () => {
  if (priorRegistryDir === undefined) delete process.env.REPOOS_SERVERS_REGISTRY_DIR;
  else process.env.REPOOS_SERVERS_REGISTRY_DIR = priorRegistryDir;
  if (priorPreview === undefined) delete process.env.REPOOS_PREVIEW_CHILD;
  else process.env.REPOOS_PREVIEW_CHILD = priorPreview;
  if (priorNoRegistry === undefined) delete process.env.REPOOS_NO_REGISTRY;
  else process.env.REPOOS_NO_REGISTRY = priorNoRegistry;
  rmSync(registryDir, { recursive: true, force: true });
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("startServer running-server registry", () => {
  it("does not tune git config from a preview child server", async () => {
    const root = minimalRepo();
    process.env.REPOOS_PREVIEW_CHILD = "1";
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port: 0,
      disableAuth: true,
    });
    try {
      expect(() =>
        execFileSync("git", ["config", "--get", "core.fsmonitor"], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toThrow();
    } finally {
      await handle.close();
      delete process.env.REPOOS_PREVIEW_CHILD;
    }
  }, 30_000);

  it("does not tune git config when --preview-overrides is active", async () => {
    const root = minimalRepo();
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port: 0,
      disableAuth: true,
      previewOverrides: true,
    });
    try {
      expect(() =>
        execFileSync("git", ["config", "--get", "core.fsmonitor"], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toThrow();
    } finally {
      await handle.close();
    }
  }, 30_000);

  it("does not tune git config when serving from a linked worktree", async () => {
    const main = minimalRepo();
    const wt = join(main, "task-wt");
    git(main, ["worktree", "add", "-q", wt, "-b", "feat/task"]);
    const handle = await startServer({
      root: wt,
      host: "127.0.0.1",
      port: 0,
      disableAuth: true,
    });
    try {
      expect(() =>
        execFileSync("git", ["config", "--get", "core.fsmonitor"], {
          cwd: main,
          encoding: "utf8",
        }),
      ).toThrow();
    } finally {
      await handle.close();
    }
  }, 30_000);

  it("keeps human-disabled fsmonitor when a preview child serves from a linked worktree (#0958)", async () => {
    const main = minimalRepo();
    git(main, ["config", "core.fsmonitor", "false"]);
    git(main, ["config", "core.untrackedCache", "false"]);
    const wt = join(main, "task-wt");
    git(main, ["worktree", "add", "-q", wt, "-b", "feat/preview-shot"]);
    process.env.REPOOS_PREVIEW_CHILD = "1";
    const handle = await startServer({
      root: wt,
      host: "127.0.0.1",
      port: 0,
      disableAuth: true,
    });
    try {
      expect(
        execFileSync("git", ["config", "--get", "core.fsmonitor"], {
          cwd: main,
          encoding: "utf8",
        }).trim(),
      ).toBe("false");
      expect(
        execFileSync("git", ["config", "--get", "core.untrackedCache"], {
          cwd: main,
          encoding: "utf8",
        }).trim(),
      ).toBe("false");
    } finally {
      await handle.close();
      delete process.env.REPOOS_PREVIEW_CHILD;
    }
  }, 30_000);

  it("honors git.tuneForScale = false during startup", async () => {
    const root = minimalRepo();
    writeFileSync(join(root, "repoos.toml"), "servePort = 0\ngit.tuneForScale = false\n");
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port: 0,
      disableAuth: true,
    });
    try {
      expect(() =>
        execFileSync("git", ["config", "--get", "core.fsmonitor"], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toThrow();
      expect(() =>
        execFileSync("git", ["config", "--get", "core.untrackedCache"], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toThrow();
    } finally {
      await handle.close();
    }
  }, 30_000);

  it("leaves git acceleration off by default on a main checkout", async () => {
    const root = minimalRepo();
    const handle = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    try {
      expect(() =>
        execFileSync("git", ["config", "--get", "core.fsmonitor"], {
          cwd: root,
          encoding: "utf8",
        }),
      ).toThrow();
    } finally {
      await handle.close();
    }
  }, 30_000);

  it("writes registry file once listening and removes it on close", async () => {
    const root = minimalRepo();
    const port = await reservePort();
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port,
      disableAuth: true,
    });
    const path = join(registryDir, `${port}.json`);
    expect(existsSync(path)).toBe(true);
    const entry = JSON.parse(readFileSync(path, "utf8")) as ServerRegistryEntry;
    expect(entry.port).toBe(port);
    expect(entry.pid).toBe(process.pid);
    expect(entry.schema).toBe(1);
    expect(entry.kind).toBe("server");
    await handle.close();
    expect(existsSync(path)).toBe(false);
  });

  it("registers a hand-run serve rooted in a linked worktree so status, servers and tailnet discovery agree (#1140)", async () => {
    const main = minimalRepo();
    const wt = join(main, "task-wt");
    git(main, ["worktree", "add", "-q", wt, "-b", "feat/hand-run"]);
    const port = await reservePort();
    const handle = await startServer({
      root: wt,
      host: "127.0.0.1",
      port,
      disableAuth: true,
    });
    try {
      const path = join(registryDir, `${port}.json`);
      expect(existsSync(path)).toBe(true);
      const entry = JSON.parse(readFileSync(path, "utf8")) as ServerRegistryEntry;
      expect(entry.root).toBe(realpathSync(wt));

      // `repoos servers`-equivalent registry read sees it.
      const registered = await listValidatedServerRegistry();
      expect(registered.map((row) => row.entry.port)).toContain(port);

      // `repoos status` reports it as registered, not "running but unknown".
      const status = await collectStatus(loadConfig(wt), { probeTimeoutMs: 1_000 });
      expect(status.server.running).toBe(true);
      expect(status.server.registration).toBe("registered");
      expect(status.server.registrationReason).toBeNull();

      // Tailnet discovery reads the same registry; the local row is present.
      const payload = await buildTailnetDiscoveryPayload(loadConfig(wt), {
        tailscaleStatus: async () => {
          throw new Error("tailscale: not found");
        },
        remoteExec: async () => JSON.stringify({ servers: [] }),
        deadlineMs: 100,
      });
      expect(payload.discoverySource).toBe("local-only");
      expect(payload.servers.some((row) => row.port === port && row.host === "local")).toBe(true);
    } finally {
      await handle.close();
    }
    expect(existsSync(join(registryDir, `${port}.json`))).toBe(false);
  }, 30_000);

  it("reports an intentionally unregistered running server in status (#1140)", async () => {
    const root = minimalRepo();
    process.env.REPOOS_NO_REGISTRY = "1";
    const port = await reservePort();
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port,
      disableAuth: true,
    });
    try {
      // `servers`/tailnet discovery read only the registry: nothing there.
      expect(existsSync(join(registryDir, `${port}.json`))).toBe(false);
      expect(await listValidatedServerRegistry()).toEqual([]);

      const status = await collectStatus(loadConfig(root), { probeTimeoutMs: 1_000 });
      expect(status.server.running).toBe(true);
      expect(status.server.registration).toBe("excluded");
      expect(status.server.registrationReason).toBe("REPOOS_NO_REGISTRY=1");

      const payload = await buildTailnetDiscoveryPayload(loadConfig(root), {
        tailscaleStatus: async () => {
          throw new Error("tailscale: not found");
        },
        remoteExec: async () => JSON.stringify({ servers: [] }),
        deadlineMs: 100,
      });
      expect(payload.servers).toEqual([]);
    } finally {
      await handle.close();
    }
  }, 30_000);

  it("keeps --preview-overrides out of the registry on a real port and explains why (#1140)", async () => {
    const root = minimalRepo();
    // A real `[preview.*]` overlay is what sets config.previewOverrides; the
    // boolean startServer option alone is not enough.
    writeFileSync(join(root, "repoos.toml"), "servePort = 0\n[preview.auth]\nenabled = false\n");
    const port = await reservePort();
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port,
      disableAuth: true,
      previewOverrides: true,
    });
    try {
      expect(existsSync(join(registryDir, `${port}.json`))).toBe(false);
      const status = await collectStatus(loadConfig(root), { probeTimeoutMs: 1_000 });
      expect(status.server.running).toBe(true);
      expect(status.server.registration).toBe("excluded");
      expect(status.server.registrationReason).toBe("preview overrides");
    } finally {
      await handle.close();
    }
  }, 30_000);

  it("keeps registry entry on close after reload handover overwrote the pid", async () => {
    const root = minimalRepo();
    const port = await reservePort();
    const handle = await startServer({
      root,
      host: "127.0.0.1",
      port,
      disableAuth: true,
    });
    const path = join(registryDir, `${port}.json`);
    const replacementPid = 424_243;
    const live = JSON.parse(readFileSync(path, "utf8")) as ServerRegistryEntry;
    writeFileSync(
      path,
      JSON.stringify({
        ...live,
        pid: replacementPid,
        startedAt: "2026-10-19T00:00:01.000Z",
      }) + "\n",
    );
    await handle.close();
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).pid).toBe(replacementPid);
    rmSync(path);
  });

  it("does not register preview child or harness port 0", async () => {
    const root = minimalRepo();
    process.env.REPOOS_PREVIEW_CHILD = "1";
    const port = await reservePort();
    const preview = await startServer({
      root,
      host: "127.0.0.1",
      port,
      disableAuth: true,
    });
    expect(existsSync(join(registryDir, `${port}.json`))).toBe(false);
    await preview.close();
    delete process.env.REPOOS_PREVIEW_CHILD;

    const ephemeral = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    expect(readdirSync(registryDir).filter((n) => n.endsWith(".json"))).toHaveLength(0);
    await ephemeral.close();
  });

  it("repoos servers lists a valid entry as ok", async () => {
    const root = minimalRepo();
    const port = await reservePort();
    let handle: ServerHandle | undefined;
    try {
      handle = await startServer({
        root,
        host: "127.0.0.1",
        port,
        disableAuth: true,
      });
      const text = await captureStdout(() => cmdServers([]));
      expect(text).toMatch(/ok/);
      expect(text).toMatch(String(port));
    } finally {
      await handle?.close();
    }
  });

  it("flags and prunes health-mismatch when registry root drifts from live server", async () => {
    const root = minimalRepo();
    const port = await reservePort();
    let handle: ServerHandle | undefined;
    try {
      handle = await startServer({
        root,
        host: "127.0.0.1",
        port,
        disableAuth: true,
      });
      const path = join(registryDir, `${port}.json`);
      const entry = JSON.parse(readFileSync(path, "utf8")) as ServerRegistryEntry;
      writeFileSync(path, JSON.stringify({ ...entry, root: "/stale/wrong-root" }) + "\n");
      const rows = await listValidatedServerRegistry();
      expect(rows).toHaveLength(1);
      expect(rows[0].valid).toBe(false);
      expect(rows[0].staleReason).toBe("health-mismatch");
      expect(await pruneStaleServerRegistryEntries()).toBe(1);
      expect(existsSync(path)).toBe(false);
    } finally {
      await handle?.close();
    }
  });

  it("repoos servers --json includes validity fields", async () => {
    const root = minimalRepo();
    const port = await reservePort();
    let handle: ServerHandle | undefined;
    try {
      handle = await startServer({
        root,
        host: "127.0.0.1",
        port,
        disableAuth: true,
      });
      const text = await captureStdout(() => cmdServers(["--json"]));
      const payload = JSON.parse(text) as {
        servers: { port: number; valid: boolean; staleReason: string | null }[];
      };
      expect(payload.servers).toHaveLength(1);
      expect(payload.servers[0].port).toBe(port);
      expect(payload.servers[0].valid).toBe(true);
      expect(payload.servers[0].staleReason).toBeNull();
    } finally {
      await handle?.close();
    }
  });
});
