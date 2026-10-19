/**
 * Integration: control-plane `startServer` registers in ~/.repoos/servers (override dir).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server.js";
import {
  readServerRegistryEntry,
  shouldRegisterServerRegistry,
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

  it("does not register preview child or port 0", async () => {
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

    const ephemeral = await startServer({ root, host: "127.0.0.1", port: 0, disableAuth: true });
    expect(
      shouldRegisterServerRegistry({ root, previewOverrides: undefined }, { port: ephemeral.port }),
    ).toBe(false);
    expect(existsSync(join(registryDir, `${ephemeral.port}.json`))).toBe(false);
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
      const lines: string[] = [];
      const orig = console.log;
      console.log = (...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      };
      await cmdServers([]);
      console.log = orig;
      const text = lines.join("\n");
      expect(text).toMatch(/ok/);
      expect(text).toMatch(String(port));
      const entry = readServerRegistryEntry(port);
      expect(entry?.root).toBeTruthy();
    } finally {
      await handle?.close();
    }
  });
});
