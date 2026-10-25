/**
 * Integration: control-plane `startServer` registers in ~/.repoos/servers (override dir).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server.js";
import {
  listValidatedServerRegistry,
  pruneStaleServerRegistryEntries,
  type ServerRegistryEntry,
} from "../../core/server-registry.js";
import { cmdServers } from "../../commands/servers.js";

const roots: string[] = [];
let registryDir: string;
let priorRegistryDir: string | undefined;
let priorPreview: string | undefined;

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
  delete process.env.REPOOS_NO_REGISTRY;
});

afterEach(async () => {
  if (priorRegistryDir === undefined) delete process.env.REPOOS_SERVERS_REGISTRY_DIR;
  else process.env.REPOOS_SERVERS_REGISTRY_DIR = priorRegistryDir;
  if (priorPreview === undefined) delete process.env.REPOOS_PREVIEW_CHILD;
  else process.env.REPOOS_PREVIEW_CHILD = priorPreview;
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
  });

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
  });

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
  });

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
