/**
 * Fixture E2E for the serve auto-reload manager (0066). A fake `repoos`
 * binary on a fixture PATH records spawn args/env and, for the "ready"
 * variant, serves /api/health with the reload handshake — so we can assert
 * hash-change detection, deferred-while-running, and the replacement
 * readiness handoff without touching a real `repoos serve` process.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createServer as createTcpServer } from "node:net";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReloadManager, readBuildHash, type ReloadManagerOptions } from "../../server/reload";
import { startServer } from "../../server/server";

/** Replacement variant: records the spawn, serves the handshake, stays alive. */
const FAKEBIN = `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REPOOS_RELOAD_FAKE_LOG, JSON.stringify({
  pid: process.pid,
  args,
  reload: process.env.REPOOS_RELOAD || "",
  secret: process.env.REPOOS_RELOAD_SECRET || "",
}) + "\\n");
const port = Number(args[args.indexOf("--port") + 1]);
const host = args[args.indexOf("--host") + 1] || "127.0.0.1";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/health") {
    const secret = process.env.REPOOS_RELOAD_SECRET || "";
    const handshake = secret && url.searchParams.get("reload") === secret;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...(handshake ? { reloadHandshake: true } : {}) }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});
server.listen(port, host);
`;

/** Dead-on-arrival variant: exits immediately — the no-outage failure path. */
const FAKEBIN_DEAD = `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.REPOOS_RELOAD_FAKE_LOG, JSON.stringify({
  pid: process.pid,
  args: process.argv.slice(2),
  dead: true,
}) + "\\n");
process.exit(1);
`;

/**
 * Flash variant (#0096): answers /api/health with the handshake for a brief
 * moment, then dies — the incident shape where a replacement seemed ready, was
 * confirmed, and left the port listenerless after the old process exited. The
 * sustained-health window must treat this as a FAILED reload, not a handover.
 */
const FAKEBIN_FLASH = `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REPOOS_RELOAD_FAKE_LOG, JSON.stringify({
  pid: process.pid,
  args,
  flash: true,
}) + "\\n");
const port = Number(args[args.indexOf("--port") + 1]);
const host = args[args.indexOf("--host") + 1] || "127.0.0.1";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/health") {
    const secret = process.env.REPOOS_RELOAD_SECRET || "";
    const handshake = secret && url.searchParams.get("reload") === secret;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, ...(handshake ? { reloadHandshake: true } : {}) }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});
server.listen(port, host);
setTimeout(() => process.exit(1), 150);
`;

interface SpawnRecord {
  pid?: number;
  args?: string[];
  reload?: string;
  secret?: string;
  dead?: boolean;
  flash?: boolean;
}

interface Fixture {
  repo: string;
  bin: string;
  readyCli: string;
  deadCli: string;
  flashCli: string;
  log: string;
  port: number;
  clean: () => void;
}

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

async function makeFixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), "repoos-reload-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(join(repo, "dist"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-aaa" }));
  writeFileSync(join(bin, "repoos"), FAKEBIN, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-dead"), FAKEBIN_DEAD, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-flash"), FAKEBIN_FLASH, { mode: 0o755 });
  const port = await reservePort();
  return {
    repo,
    bin,
    readyCli: join(bin, "repoos"),
    deadCli: join(bin, "repoos-dead"),
    flashCli: join(bin, "repoos-flash"),
    log: join(root, "spawns.log"),
    port,
    clean: () => rmSync(root, { recursive: true, force: true }),
  };
}

function spawns(fx: Fixture): SpawnRecord[] {
  try {
    const text = readFileSync(fx.log, "utf8").trim();
    if (!text) return [];
    return text.split("\n").map((l) => JSON.parse(l) as SpawnRecord);
  } catch {
    return [];
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn: () => boolean, label: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(20);
  }
}

/** Kill a spawned fake replacement (the manager unrefs it after handover). */
async function killPid(pid: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  await sleep(200);
  try {
    process.kill(pid, 0);
  } catch {
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
}

async function killReplacement(fx: Fixture): Promise<void> {
  for (const s of spawns(fx)) {
    if (typeof s.pid === "number" && s.pid > 0 && !s.dead) await killPid(s.pid);
  }
}

interface Calls {
  confirmed: number;
  failed: number;
  drained: number;
  reListen: number;
}

function makeManager(
  fx: Fixture,
  opts: Partial<ReloadManagerOptions> = {},
): { manager: ReloadManager; calls: Calls } {
  const calls: Calls = { confirmed: 0, failed: 0, drained: 0, reListen: 0 };
  const manager = new ReloadManager({
    root: fx.repo,
    host: "127.0.0.1",
    port: fx.port,
    loadedHash: "hash-aaa",
    enabled: true,
    isBusy: () => 0,
    cliEntry: () => fx.readyCli,
    stopListening: async () => {
      calls.drained++;
    },
    listen: async () => {
      calls.reListen++;
    },
    onReloadConfirmed: async () => {
      calls.confirmed++;
    },
    onReloadFailed: () => {
      calls.failed++;
    },
    pollMs: 50,
    retryMs: 50,
    graceMs: 100,
    confirmMs: 100,
    handshakeTimeoutMs: 4000,
    ...opts,
  });
  return { manager, calls };
}

afterEach(() => {
  delete process.env.REPOOS_RELOAD_FAKE_LOG;
});

describe("ReloadManager", () => {
  it("reads the build hash from dist/.build-info.json", async () => {
    const fx = await makeFixture();
    try {
      expect(readBuildHash(fx.repo)).toBe("hash-aaa");
      writeFileSync(join(fx.repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-zzz" }));
      expect(readBuildHash(fx.repo)).toBe("hash-zzz");
      expect(readBuildHash(join(fx.repo, "nope"))).toBeNull();
    } finally {
      fx.clean();
    }
  });

  it("detects a build hash change and reloads via a replacement", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    const { manager, calls } = makeManager(fx);
    try {
      manager.start();
      writeFileSync(join(fx.repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-bbb" }));

      await waitFor(() => calls.confirmed > 0, "reload confirmed after hash change");
      const [spawn] = spawns(fx);
      expect(spawn.reload).toBe("1");
      expect(spawn.secret).toBeTruthy();
      expect(spawn.args).toEqual(["serve", "--port", String(fx.port), "--host", "127.0.0.1"]);
      // The manager reported the handover only after the replacement answered
      // health with the handshake — not before it was ready.
      expect(calls.drained).toBeGreaterThan(0);
    } finally {
      await killReplacement(fx);
      manager.stop();
      fx.clean();
    }
  });

  it("self-heals at boot when a newer build is already on disk", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    writeFileSync(join(fx.repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-ccc" }));
    const { manager, calls } = makeManager(fx);
    try {
      manager.start();
      manager.bootSelfHeal();
      await waitFor(() => calls.confirmed > 0, "boot self-heal reload");
      expect(spawns(fx)).toHaveLength(1);
    } finally {
      await killReplacement(fx);
      manager.stop();
      fx.clean();
    }
  });

  it("skips the boot self-heal for a replacement child (REPOOS_RELOAD=1)", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    writeFileSync(join(fx.repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-ccc" }));
    // A replacement would be stale relative to disk, but must not boot-self-heal
    // (that is the parent's job — it would race the handover). bootSelfHeal is
    // the only trigger here: the watcher/timer are never started (the poll would
    // be a red herring — a real replacement boots with a fresh loadedHash).
    const { manager } = makeManager(fx, { isReplacement: true, pollMs: 100_000 });
    try {
      manager.bootSelfHeal();
      await sleep(250);
      expect(spawns(fx)).toHaveLength(0);
    } finally {
      manager.stop();
      fx.clean();
    }
  });

  it("defers a reload while an agent runs and fires it when the runner drains", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    let busy = true;
    const { manager, calls } = makeManager(fx, { isBusy: () => (busy ? 1 : 0) });
    try {
      manager.start();
      const state = manager.requestReload("test");
      expect(state.state).toBe("deferred");
      expect(state).toMatchObject({ running: 1 });

      await sleep(200);
      expect(spawns(fx)).toHaveLength(0); // nothing spawned while busy

      busy = false;
      manager.onEvent({ type: "agent.exited" });
      await waitFor(() => calls.confirmed > 0, "deferred reload after drain");
      expect(spawns(fx)).toHaveLength(1);
    } finally {
      await killReplacement(fx);
      manager.stop();
      fx.clean();
    }
  });

  it("returns not-stale when the build hash is unchanged", async () => {
    const fx = await makeFixture();
    const { manager } = makeManager(fx);
    try {
      manager.start();
      const state = manager.requestReload("test");
      expect(state.state).toBe("not-stale");
      await sleep(200);
      expect(spawns(fx)).toHaveLength(0);
    } finally {
      manager.stop();
      fx.clean();
    }
  });

  it("keeps serving (no outage) when the replacement fails to become ready", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    const { manager, calls } = makeManager(fx, {
      cliEntry: () => fx.deadCli,
      handshakeTimeoutMs: 1000,
    });
    try {
      manager.start();
      writeFileSync(join(fx.repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-bbb" }));
      const state = manager.requestReload("test");
      expect(state.state).toBe("reloading");

      await waitFor(() => calls.failed > 0, "reload failure reported");
      expect(calls.confirmed).toBe(0); // never handed over
      expect(calls.reListen).toBeGreaterThan(0); // listener re-bound: old process keeps serving
      const [spawn] = spawns(fx);
      expect(spawn.dead).toBe(true);
    } finally {
      manager.stop();
      fx.clean();
    }
  });

  it("#0096: a replacement that flashes healthy then dies is NOT confirmed (no listenerless handover)", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    // confirmMs (500) is longer than the flash lifetime (150ms): a single
    // handshake answer must never be enough to hand over.
    const { manager, calls } = makeManager(fx, {
      cliEntry: () => fx.flashCli,
      confirmMs: 500,
      graceMs: 50,
      handshakeTimeoutMs: 4000,
    });
    try {
      manager.start();
      writeFileSync(join(fx.repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-bbb" }));
      manager.requestReload("test");

      await waitFor(() => calls.failed > 0, "flash replacement treated as failed");
      expect(calls.confirmed).toBe(0); // never logged "replacement is up" / handed over
      expect(calls.reListen).toBeGreaterThan(0); // old process re-bound and kept serving
      const [spawn] = spawns(fx);
      expect(spawn.flash).toBe(true);
      // The flash process must not survive the failed handoff — the parent
      // kills it (or it already died), never leaving a listenerless serve.
      await waitFor(
        () => {
          try {
            process.kill(spawn.pid!, 0);
            return false;
          } catch {
            return true;
          }
        },
        "flash replacement process is gone",
      );
    } finally {
      manager.stop();
      fx.clean();
    }
  });
});

describe("POST /api/server/restart", () => {
  it("returns a reload state from the running server", async () => {
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${server.url}/api/server/restart`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { state: string };
      expect(["reloading", "deferred", "not-stale"]).toContain(body.state);
    } finally {
      await server.close();
    }
  });
});
