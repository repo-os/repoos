import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import * as serverRegistry from "./server-registry.js";
import {
  checkServerRegistryPortConflict,
  readServerRegistryEntry,
  removeServerRegistryEntry,
  shouldRegisterServerRegistry,
  writeServerRegistryEntry,
  SERVER_REGISTRY_SCHEMA,
  type ServerRegistryEntry,
} from "./server-registry.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function tmpRegistryDir(): string {
  const dir = join(tmpdir(), `repoos-srv-reg-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function sampleEntry(port: number, root: string, pid: number): ServerRegistryEntry {
  return {
    schema: SERVER_REGISTRY_SCHEMA,
    port,
    host: "127.0.0.1",
    pid,
    root,
    projectName: "demo",
    version: "0.0.0",
    startedAt: "2026-10-19T00:00:00.000Z",
    kind: "server",
  };
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

describe("shouldRegisterServerRegistry", () => {
  it("returns false for preview child, requested port 0, preview overrides, and REPOOS_NO_REGISTRY", () => {
    const base = { root: "/tmp/main", previewOverrides: undefined };
    expect(shouldRegisterServerRegistry(base, { requestedPort: 7171 }, {})).toBe(true);
    expect(
      shouldRegisterServerRegistry(base, { requestedPort: 7171 }, { REPOOS_PREVIEW_CHILD: "1" }),
    ).toBe(false);
    expect(shouldRegisterServerRegistry(base, { requestedPort: 0 }, {})).toBe(false);
    expect(
      shouldRegisterServerRegistry(base, { requestedPort: 7171 }, { REPOOS_NO_REGISTRY: "1" }),
    ).toBe(false);
    expect(
      shouldRegisterServerRegistry(
        { root: "/tmp/main", previewOverrides: ["auth.enabled"] },
        { requestedPort: 7171 },
        {},
      ),
    ).toBe(false);
  });

  it("returns false for a linked task worktree root", () => {
    const main = mkdtempSync(join(tmpdir(), "repoos-srv-reg-main-"));
    git(main, ["init", "-q", "-b", "main"]);
    git(main, ["config", "user.email", "t@example.com"]);
    git(main, ["config", "user.name", "Test"]);
    writeFileSync(join(main, "repoos.toml"), "\n");
    git(main, ["add", "repoos.toml"]);
    git(main, ["commit", "-q", "-m", "init"]);
    const wt = join(main, "task-wt");
    git(main, ["worktree", "add", "-q", wt, "-b", "feat/task"]);
    expect(
      shouldRegisterServerRegistry(
        { root: main, previewOverrides: undefined },
        { requestedPort: 7171 },
        {},
      ),
    ).toBe(true);
    expect(
      shouldRegisterServerRegistry(
        { root: wt, previewOverrides: undefined },
        { requestedPort: 7171 },
        {},
      ),
    ).toBe(false);
    rmSync(main, { recursive: true, force: true });
  });
});

describe("server registry files", () => {
  let dir: string;
  let priorDir: string | undefined;

  beforeEach(() => {
    dir = tmpRegistryDir();
    priorDir = process.env.REPOOS_SERVERS_REGISTRY_DIR;
    process.env.REPOOS_SERVERS_REGISTRY_DIR = dir;
  });

  afterEach(() => {
    if (priorDir === undefined) delete process.env.REPOOS_SERVERS_REGISTRY_DIR;
    else process.env.REPOOS_SERVERS_REGISTRY_DIR = priorDir;
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes atomically with documented fields and mode 0600", () => {
    writeServerRegistryEntry(sampleEntry(7559, "/tmp/repo-a", process.pid));
    const path = join(dir, "7559.json");
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as ServerRegistryEntry;
    expect(parsed.schema).toBe(1);
    expect(parsed.port).toBe(7559);
    expect(parsed.host).toBe("127.0.0.1");
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.root).toBe("/tmp/repo-a");
    expect(parsed.kind).toBe("server");
    expect(parsed.startedAt).toBeDefined();
  });

  it("removes entry on unregister", () => {
    writeServerRegistryEntry(sampleEntry(7200, "/tmp/repo-b", process.pid));
    expect(existsSync(join(dir, "7200.json"))).toBe(true);
    removeServerRegistryEntry(7200);
    expect(existsSync(join(dir, "7200.json"))).toBe(false);
  });

  it("overwrites stale entry when pid is dead", () => {
    writeServerRegistryEntry(sampleEntry(7300, "/other/root", 999_999));
    expect(checkServerRegistryPortConflict(7300, "/tmp/new-root")).toBeNull();
    writeServerRegistryEntry(sampleEntry(7300, "/tmp/new-root", process.pid));
    expect(readServerRegistryEntry(7300)?.root).toBe("/tmp/new-root");
  });

  it("reports conflict when pid is alive and root differs", () => {
    writeServerRegistryEntry(sampleEntry(7400, "/tmp/other", process.pid));
    const msg = checkServerRegistryPortConflict(7400, "/tmp/mine");
    expect(msg).toMatch(/already registered/);
    expect(msg).toMatch(String(process.pid));
  });

  it("prune removes dead pid files", async () => {
    writeServerRegistryEntry(sampleEntry(7500, "/tmp/x", 999_998));
    expect(await serverRegistry.pruneStaleServerRegistryEntries()).toBe(1);
    expect(existsSync(join(dir, "7500.json"))).toBe(false);
  });
});
