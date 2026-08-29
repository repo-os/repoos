/**
 * Fixture E2E for the serve auto-reload manager (0066). A fake `repoos`
 * binary on a fixture PATH records spawn args/env and, for the "ready"
 * variant, serves /api/health with the reload handshake — so we can assert
 * hash-change detection, deferred-while-running, and the replacement
 * readiness handoff without touching a real `repoos serve` process.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer as createTcpServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReloadManager, readBuildHash, type ReloadManagerOptions } from "../../server/reload";
import { startServer } from "../../server/server";
import { reapStaleFixtures } from "./helpers";

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

/** Binds and responds, but never answers the reload handshake — always "failed". */
const FAKEBIN_NEVER_CONFIRM = `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REPOOS_RELOAD_FAKE_LOG, JSON.stringify({
  pid: process.pid, args, neverConfirm: true,
}) + "\\n");
const port = Number(args[args.indexOf("--port") + 1]);
const host = args[args.indexOf("--host") + 1] || "127.0.0.1";
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});
server.listen(port, host);
`;

/** A failed replacement that starts a descendant before it becomes ready. */
const FAKEBIN_WITH_DESCENDANT = `#!/usr/bin/env node
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const log = process.env.REPOOS_RELOAD_FAKE_LOG;
fs.appendFileSync(log, JSON.stringify({ pid: process.pid, tree: "parent" }) + "\\n");
const descendant = spawn(process.execPath, ["-e", \
  "require('node:fs').appendFileSync(process.env.REPOOS_RELOAD_FAKE_LOG, JSON.stringify({pid:process.pid,tree:'child'})+'\\\\n'); setInterval(()=>{}, 1000)"],
  { stdio: "ignore", env: process.env });
descendant.unref();
setInterval(() => {}, 1000);
`;

/** Stays alive without binding the control port (used to model a replacement
 *  that survives long enough for the old process to drain, while a foreign
 *  process already holds the port). */
const FAKEBIN_IDLE = `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(process.env.REPOOS_RELOAD_FAKE_LOG, JSON.stringify({
  pid: process.pid, idle: true,
}) + "\\n");
setInterval(() => {}, 1000);
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
  descendantCli: string;
  neverConfirmCli: string;
  idleCli: string;
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

/**
 * Reap fixtures a PAST run leaked before this suite's own fixtures exist.
 * The per-test `try/finally` cleanup can't fire if the whole process is torn
 * down (Ctrl-C, a killed CI job) — vitest's thread pool means signal handlers
 * registered in a test file never fire either — so the next run self-heals.
 * Shared logic in tests/helpers.ts; see `reapStaleFixtures` there.
 */
const FIXTURE_PREFIX = "repoos-reload-";

async function makeFixture(): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(join(repo, "dist"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(repo, "dist", ".build-info.json"), JSON.stringify({ hash: "hash-aaa" }));
  writeFileSync(join(bin, "repoos"), FAKEBIN, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-dead"), FAKEBIN_DEAD, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-flash"), FAKEBIN_FLASH, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-descendant"), FAKEBIN_WITH_DESCENDANT, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-never-confirm"), FAKEBIN_NEVER_CONFIRM, { mode: 0o755 });
  writeFileSync(join(bin, "repoos-idle"), FAKEBIN_IDLE, { mode: 0o755 });
  const port = await reservePort();
  return {
    repo,
    bin,
    readyCli: join(bin, "repoos"),
    deadCli: join(bin, "repoos-dead"),
    flashCli: join(bin, "repoos-flash"),
    descendantCli: join(bin, "repoos-descendant"),
    neverConfirmCli: join(bin, "repoos-never-confirm"),
    idleCli: join(bin, "repoos-idle"),
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
  failedReason?: string;
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
    closingOut: () => false,
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
    onReloadFailed: (reason) => {
      calls.failed++;
      calls.failedReason = reason;
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

beforeAll(() => {
  reapStaleFixtures(FIXTURE_PREFIX);
});

describe("ReloadManager", () => {
  it("reads the build hash from dist/.build-info.json", async () => {
    const fx = await makeFixture();
    try {
      expect(readBuildHash(fx.repo)).toBe("hash-aaa");
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-zzz" }),
      );
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
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );

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

  it("no longer defers a reload while an agent runs (0214: agents survive a restart)", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    let busy = true;
    const { manager, calls } = makeManager(fx, { isBusy: () => (busy ? 1 : 0) });
    try {
      manager.start();
      // Write a new build hash so the reload actually fires (not not-stale).
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );
      const state = manager.requestReload("test");
      // 0214: agent-turn deferral was removed — a reload proceeds immediately
      // even while an agent is running, because the new server re-attaches to
      // still-alive children via the durable registry.
      expect(state.state).toBe("reloading");

      await waitFor(() => calls.confirmed > 0, "reload confirmed while agent is still running");
      expect(spawns(fx)).toHaveLength(1); // replacement was spawned
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
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );
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

  it("#0271: backs off automatic retries after a failed handoff, but a manual restart bypasses it", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    const { manager, calls } = makeManager(fx, {
      cliEntry: () => fx.deadCli,
      handshakeTimeoutMs: 1000,
    });
    try {
      manager.start();
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );
      expect(manager.requestReload("test").state).toBe("reloading");
      await waitFor(() => calls.failed > 0, "first reload failure reported");
      expect(spawns(fx).length).toBe(1);

      // Automatic trigger (no `manual`), same as the poll/self-heal path:
      // still stale, but the just-armed backoff defers it — no second spawn.
      const deferred = manager.requestReload("build changed (poll)");
      expect(deferred.state).toBe("deferred");
      expect(deferred.reason).toMatch(/backing off/);
      await sleep(150);
      expect(spawns(fx).length).toBe(1);

      // A human explicitly retrying (POST /api/server/restart) bypasses it.
      const manual = manager.requestReload("manual restart", { manual: true });
      expect(manual.state).toBe("reloading");
      await waitFor(() => calls.failed > 1, "second reload failure reported");
      expect(spawns(fx).length).toBe(2);
    } finally {
      manager.stop();
      fx.clean();
    }
  });

  it("0143: parks a build that lands while a close-out holds the lock (no auto-reload, notice emitted)", async () => {
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    let closingOut = true;
    let available: string | null = null;
    const { manager, calls } = makeManager(fx, {
      closingOut: () => closingOut,
      onBuildAvailable: (hash) => {
        available = hash;
      },
    });
    try {
      manager.start();
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-closeout" }),
      );

      await waitFor(() => available === "hash-closeout", "build parked and surfaced");
      await sleep(300);
      expect(spawns(fx)).toHaveLength(0); // never spawned a replacement mid-close-out
      expect(calls.confirmed).toBe(0);

      // Once the close-out releases, the parked build must NOT auto-fire — it
      // waits for the user's POST /api/server/restart.
      closingOut = false;
      await sleep(300);
      expect(spawns(fx)).toHaveLength(0);

      // A manual restart applies it now.
      manager.requestReload("manual restart");
      await waitFor(() => calls.confirmed > 0, "manual restart applies parked build");
      expect(spawns(fx)).toHaveLength(1);
    } finally {
      await killReplacement(fx);
      manager.stop();
      fx.clean();
    }
  });

  it("0143: requestReload defers while a close-out holds the lock and reports the parked state", async () => {
    const fx = await makeFixture();
    let available: string | null = null;
    const { manager } = makeManager(fx, {
      closingOut: () => true,
      onBuildAvailable: (hash) => {
        available = hash;
      },
    });
    try {
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-closeout" }),
      );
      const state = manager.requestReload("manual restart");
      expect(state.state).toBe("deferred");
      expect(available).toBe("hash-closeout");
    } finally {
      manager.stop();
      fx.clean();
    }
  });

  it("0179: exposes a parked build via the buildAvailable getter (hash + buildAt)", async () => {
    const fx = await makeFixture();
    let available: string | null = null;
    const { manager } = makeManager(fx, {
      closingOut: () => true,
      onBuildAvailable: (hash) => {
        available = hash;
      },
    });
    try {
      expect(manager.buildAvailable).toBeNull();
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-closeout", generatedAt: "2026-08-13T12:00:00.000Z" }),
      );
      manager.requestReload("manual restart");
      expect(available).toBe("hash-closeout");
      expect(manager.buildAvailable).toEqual({
        hash: "hash-closeout",
        buildAt: "2026-08-13T12:00:00.000Z",
      });
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
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );
      manager.requestReload("test");

      await waitFor(() => calls.failed > 0, "flash replacement treated as failed");
      expect(calls.confirmed).toBe(0); // never logged "replacement is up" / handed over
      expect(calls.reListen).toBeGreaterThan(0); // old process re-bound and kept serving
      const [spawn] = spawns(fx);
      expect(spawn.flash).toBe(true);
      // The flash process must not survive the failed handoff — the parent
      // kills it (or it already died), never leaving a listenerless serve.
      await waitFor(() => {
        try {
          process.kill(spawn.pid!, 0);
          return false;
        } catch {
          return true;
        }
      }, "flash replacement process is gone");
    } finally {
      manager.stop();
      fx.clean();
    }
  });

  it("#leak: never leaves an orphaned replacement alive when poll ticks race the failure cleanup", async () => {
    // Regression for a real incident: `reloading` was reset to false BEFORE
    // killChild()/tryRebind() finished, reopening reload()'s re-entry guard
    // mid-cleanup. A fast poll tick firing in that window started a new
    // reload() that overwrote `this.child` with the NEW attempt before the
    // failed attempt's killChild() read it — so killChild() killed the wrong
    // (newer) process and the original failed replacement leaked forever,
    // unmanaged. A fast poll interval against a replacement that never
    // confirms reproduces many overlapping poll ticks during one failed
    // attempt's cleanup window.
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    const { manager, calls } = makeManager(fx, {
      cliEntry: () => fx.neverConfirmCli,
      pollMs: 30,
      handshakeTimeoutMs: 400,
      graceMs: 20,
      confirmMs: 50,
    });
    try {
      manager.start();
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );

      await waitFor(() => calls.failed > 0, "first reload failure reported");
      // Let any racing poll ticks that fired during the cleanup window settle.
      await sleep(500);

      const allPids = spawns(fx)
        .map((s) => s.pid)
        .filter((pid): pid is number => typeof pid === "number");
      expect(allPids.length).toBeGreaterThan(0);
      const alive = allPids.filter((pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
      // Every spawned replacement so far must be dead — none leaked, even
      // though the manager may have legitimately retried more than once.
      expect(alive).toEqual([]);
    } finally {
      await killReplacement(fx);
      manager.stop();
      fx.clean();
    }
  });

  it('#0284: reports a loud "port stolen" reason when a foreign process grabs the port during the drain', async () => {
    if (process.platform === "win32") return;
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    // A foreign HTTP listener holds the port from before the reload (an HTTP
    // server so the handshake probe's GET completes cleanly rather than hanging
    // on a bare TCP accept). Once the old process drains (releases its
    // listener), this foreign process is what `isPortListening` finds — the
    // reload must say the port was STOLEN, not merely "could not re-bind".
    const foreign = createHttpServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve, reject) => {
      foreign.once("error", reject);
      foreign.listen(fx.port, "127.0.0.1", () => resolve());
    });
    // listen() must fail for the whole re-bind window (the foreign server holds
    // the port), which is exactly what a stolen port does to a real process:
    // every re-bind attempt EADDRINUSEs. We model that with a rejecting bind.
    const listen = async (): Promise<void> => {
      await new Promise<void>((resolve, reject) => {
        const srv = createTcpServer();
        srv.once("error", (e) => {
          srv.close();
          reject(e);
        });
        srv.listen({ port: fx.port, host: "127.0.0.1" }, () => {
          srv.close();
          resolve();
        });
      });
    };
    const { manager, calls } = makeManager(fx, {
      cliEntry: () => fx.idleCli, // stays alive, never confirms → drain then failure branch
      listen,
      rebindTimeoutMs: 300,
      graceMs: 20,
      handshakeTimeoutMs: 1000,
    });
    try {
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );
      manager.requestReload("test drain-window steal");

      await waitFor(() => calls.failed > 0, "reload failure reported");
      expect(calls.failedReason).toMatch(/stolen by another process/);
    } finally {
      manager.stop();
      await killReplacement(fx);
      await new Promise<void>((resolve) => {
        foreign.closeAllConnections?.();
        foreign.close(() => resolve());
      });
      fx.clean();
    }
  });

  it("terminates the full failed-replacement process group", async () => {
    if (process.platform === "win32") return;
    const fx = await makeFixture();
    process.env.REPOOS_RELOAD_FAKE_LOG = fx.log;
    const { manager, calls } = makeManager(fx, {
      cliEntry: () => fx.descendantCli,
      graceMs: 20,
      handshakeTimeoutMs: 500,
    });
    try {
      writeFileSync(
        join(fx.repo, "dist", ".build-info.json"),
        JSON.stringify({ hash: "hash-bbb" }),
      );
      manager.requestReload("test descendant cleanup");
      await waitFor(() => calls.failed > 0, "descendant replacement failure");
      const tree = spawns(fx);
      const pids = tree
        .map((entry) => entry.pid)
        .filter((pid): pid is number => typeof pid === "number");
      expect(tree.map((entry) => (entry as { tree?: string }).tree).sort()).toEqual([
        "child",
        "parent",
      ]);
      await waitFor(
        () =>
          pids.every((pid) => {
            try {
              process.kill(pid, 0);
              return false;
            } catch {
              return true;
            }
          }),
        "failed replacement process group is gone",
      );
    } finally {
      await killReplacement(fx);
      manager.stop();
      fx.clean();
    }
  }, 12_000);
});

describe("Agent adoption across restarts (0214)", () => {
  // Import AgentRunner for the adoption test
  it("adopts a still-running agent on boot via the durable registry", async () => {
    // We test the registry read/write and adoption logic at the AgentRunner level
    // without spawning a full server. The test writes a registry entry and
    // verifies that adoptRunningAgents() picks it up when the PID is alive.
    const { AgentRunner } = await import("../../server/agents");
    const { resolve } = await import("node:path");
    const { appendFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } =
      await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const root = mkdtempSync(join(tmpdir(), "repoos-adopt-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(fullCacheDir, { recursive: true });
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });

      // Write a task file so loadHotSessions doesn't fail
      const taskFile = join(root, "work", "0001-adopt.md");
      writeFileSync(
        taskFile,
        `---
id: "0001"
title: Adoption test
type: feature
status: active
priority: p2
area: server
assigned_to: ai
branch: feat/adopt-test
---
## Test
`,
      );

      // Write a durable registry entry pointing at our OWN pid (always alive)
      const registryFile = join(fullCacheDir, "agents.json");
      writeFileSync(
        registryFile,
        JSON.stringify({
          entries: [
            {
              taskId: "0001",
              pid: process.pid,
              workdir: root,
              branch: "feat/adopt-test",
              runId: "adopt-run-1",
            },
            // Also include a stale entry pointing at a PID that can't possibly exist
            {
              taskId: "0002",
              pid: 999999,
              workdir: root,
              branch: "feat/dead-test",
              runId: "adopt-run-2",
            },
          ],
        }),
      );

      // Separate durable stream logs retain the original output classification
      // while the server process is absent.
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      // Multi-byte text makes the initial file's byte size differ from its
      // decoded string length. The live tail below must still begin at the
      // correct byte offset after adoption.
      const outLog = join(fullCacheDir, "agent-logs", "0001.out.log");
      writeFileSync(outLog, "hello 🙂 from stdout gap\n");
      writeFileSync(join(fullCacheDir, "agent-logs", "0001.err.log"), "hello from stderr gap\n");

      // Create a fresh runner — it reads the registry on adoptRunningAgents()
      const config = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox" as const,
        defaultAssignee: "unassigned" as const,
        cacheDir,
      };

      const events: Array<{ type: string; id?: string }> = [];
      const runner = new AgentRunner(config as any, (e) => events.push(e));

      expect(runner.isRunning("0001")).toBe(false); // not running yet
      expect(runner.isRunning("0002")).toBe(false);

      runner.adoptRunningAgents();

      // The live entry (our own PID) should be adopted
      expect(runner.isRunning("0001")).toBe(true);
      // Listing running agents must also work for an adopted (proc-less) entry.
      expect(runner.running()).toMatchObject([{ id: "0001", pid: process.pid }]);

      // The stale entry should NOT be adopted (PID doesn't exist)
      expect(runner.isRunning("0002")).toBe(false);

      // Verify the gap output was caught up
      const session = runner.output("0001");
      expect(session).not.toBeNull();
      expect(
        session!.lines.some((l: any) => l.d === "hello 🙂 from stdout gap" && l.s === "out"),
      ).toBe(true);
      expect(
        session!.lines.some((l: any) => l.d === "hello from stderr gap" && l.s === "err"),
      ).toBe(true);

      appendFileSync(outLog, "live output ✓ after adoption\n");
      await waitFor(
        () =>
          runner
            .output("0001")
            ?.lines.some((l: any) => l.d === "live output ✓ after adoption" && l.s === "out") ===
          true,
        "Unicode output tailed after adoption",
      );

      // The registry should be cleaned of the stale entry
      const fs = await import("node:fs");
      if (fs.existsSync(registryFile)) {
        const updated = JSON.parse(fs.readFileSync(registryFile, "utf8"));
        expect(updated.entries).toHaveLength(1);
        expect(updated.entries[0].taskId).toBe("0001");
      }

      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Review reload durability (0288)", () => {
  it("finalizes a dead review entry on adoption (process finished during handoff)", async () => {
    const { AgentRunner } = await import("../../server/agents");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const root = mkdtempSync(join(tmpdir(), "repoos-review-adopt-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(
        join(root, "work", "0001-review.md"),
        `---
id: "0001"
title: Review adopt
type: feature
status: review
priority: p2
area: server
assigned_to: ai
branch: feat/review-adopt
---
## Test
`,
      );

      // A registry entry for a REVIEW whose PID is long dead (its process
      // finished during the reload handoff before the new server could adopt).
      writeFileSync(
        join(fullCacheDir, "agents.json"),
        JSON.stringify({
          entries: [
            {
              taskId: "review:0001",
              pid: 999999,
              workdir: root,
              branch: "",
              runId: "r1",
              kind: "review",
              reviewKind: "run",
            },
          ],
        }),
      );
      // Its durable stdout log still holds the report.
      writeFileSync(
        join(fullCacheDir, "agent-logs", "review:0001.out.log"),
        "## Verdict\n`good to go` — durability works.\n",
      );

      let doneKey: string | null = null;
      let doneKind: string | undefined;
      const runner = new AgentRunner(configForRoot(root, cacheDir) as any, () => {}, {
        onReviewDone: (sessionKey, _exited, reviewKind) => {
          doneKey = sessionKey;
          doneKind = reviewKind;
        },
      });
      runner.adoptRunningAgents();

      // The completion hook is deferred so the server has built its
      // ReviewManager before it fires; wait for it here.
      const deadline = Date.now() + 5000;
      while (!doneKey && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(doneKey).toBe("review:0001");
      const session = runner.output("review:0001");
      // The report text was replayed into the durable session.
      expect(session?.lines.some((l: any) => l.d?.includes("good to go"))).toBe(true);
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("threads the adopted review's kind (run/chat) through completion (0288 Bug 3)", async () => {
    const { AgentRunner } = await import("../../server/agents");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const root = mkdtempSync(join(tmpdir(), "repoos-review-adopt-chat-"));
    try {
      const cacheDir = ".repoos";
      const fullCacheDir = join(root, cacheDir);
      mkdirSync(join(fullCacheDir, "agent-logs"), { recursive: true });
      mkdirSync(join(root, "work"), { recursive: true });
      writeFileSync(
        join(root, "work", "0001-review.md"),
        `---
id: "0001"
title: Chat adopt
type: feature
status: review
priority: p2
area: server
assigned_to: ai
branch: feat/review-chat
---
## Test
`,
      );

      // A dead CHAT review entry (reviewKind: "chat") whose process finished
      // during the handoff. Its session holds a follow-up ANSWER, not a report.
      writeFileSync(
        join(fullCacheDir, "agents.json"),
        JSON.stringify({
          entries: [
            {
              taskId: "review:0001",
              pid: 999999,
              workdir: root,
              branch: "",
              runId: "r1",
              kind: "review",
              reviewKind: "chat",
            },
          ],
        }),
      );
      writeFileSync(
        join(fullCacheDir, "agent-logs", "review:0001.out.log"),
        "the empty-list case is handled by the early return\n",
      );

      let doneKind: string | undefined;
      const runner = new AgentRunner(configForRoot(root, cacheDir) as any, () => {}, {
        onReviewDone: (_key, _exited, reviewKind) => {
          doneKind = reviewKind;
        },
      });
      runner.adoptRunningAgents();

      const deadline = Date.now() + 5000;
      while (doneKind === undefined && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
      }
      // The adopted chat turn is finalized as a chat, not a fresh run — so the
      // ReviewManager will not treat a follow-up answer as a new report.
      expect(doneKind).toBe("chat");
      runner.dispose();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("ReviewManager adopted-turn completion (0288)", () => {
  function makeConfig(root: string) {
    return {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox" as const,
      defaultAssignee: "unassigned" as const,
      cacheDir: ".repoos",
      agents: [
        { name: "engineer", cli: "opencode", model: "default", enabled: true },
        { name: "reviewer", cli: "opencode", model: "default", enabled: true },
      ],
    };
  }

  function writeTask(root: string, id: string, extra = ""): string {
    const absPath = join(root, "work", `${id}-t.md`);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(
      absPath,
      `---
id: "${id}"
title: Review
type: feature
status: review
priority: p2
area: server
assigned_to: ai
branch: feat/review
${extra}
---
## Test
`,
    );
    return absPath;
  }

  it("finalizes an adopted CHAT turn as a chat — no report overwrite, no pass bump (Bug 3)", async () => {
    const { ReviewManager } = await import("../../server/review");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } =
      await import("node:fs");
    const { tmpdir } = await import("node:os");

    const root = mkdtempSync(join(tmpdir(), "repoos-revchat-"));
    try {
      const config = makeConfig(root);
      writeTask(root, "0001", "review_passes: 1\n");
      // A previously-written report that a chat follow-up must NOT clobber.
      const reportFile = join(root, ".repoos", "reviews", "0001.md");
      mkdirSync(join(root, ".repoos", "reviews"), { recursive: true });
      writeFileSync(reportFile, 'task: "0001"\nstate: ok\n\nORIGINAL REVIEW REPORT\n');
      const absPath = join(root, "work", "0001-t.md");

      const events: Array<{ type: string; state?: unknown; id?: unknown }> = [];
      // A mock runner exposing just enough of the AgentRunner surface.
      const runner: any = {
        output: () => ({
          lines: [
            {
              type: "text",
              text: "the empty-list case is handled by the early return in src/thing.ts.",
            },
          ],
          accumulatedMs: 500,
        }),
        reviewKindOf: () => "chat" as const,
        system: () => {},
        isRunning: () => false,
        running: () => [],
        hasSession: () => true,
        clearSession: () => {},
        stop: () => ({ stopped: false }),
      };
      const index: any = {
        getTask: (id: string) => ({
          id,
          absPath,
          path: `work/0001-t.md`,
          branch: "feat/review",
          status: "review",
          title: "Review",
          needsInput: false,
          extra: {},
        }),
        applyFileChange: () => {},
      };
      const reviews = new ReviewManager(config as any, (e) => events.push(e), runner, index);

      // Adopted turn: no `Run` record in this process, but the kind is supplied
      // through the completion hook. A run would overwrite the report and bump
      // review_passes; a chat must do neither.
      reviews.handleReviewDone("review:0001", true, "chat");

      expect(readFileSync(reportFile, "utf8")).toContain("ORIGINAL REVIEW REPORT");
      expect(readFileSync(absPath, "utf8")).toMatch(/^review_passes: 1$/m);
      // The chat completed as "ready" on the review event stream, not failed.
      expect(events.some((e) => e.type === "review" && e.state === "ready")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("honours a durable cancellation for an adopted review — no spurious report (Edge cases 1-2)", async () => {
    const { ReviewManager } = await import("../../server/review");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");

    const root = mkdtempSync(join(tmpdir(), "repoos-revcancel-"));
    try {
      const config = makeConfig(root);
      writeTask(root, "0001");
      const absPath = join(root, "work", "0001-t.md");

      // Process A's ReviewManager cancels the review (durable marker written).
      const eventsA: Array<{ type: string; state?: unknown; id?: unknown }> = [];
      const runnerA: any = {
        output: () => ({ lines: [], accumulatedMs: 0 }),
        reviewKindOf: () => "run" as const,
        system: () => {},
        isRunning: () => true,
        running: () => [{ id: "review:0001" }],
        hasSession: () => true,
        clearSession: () => {},
        stop: () => ({ stopped: true }),
      };
      const indexA: any = {
        getTask: (id: string) => ({
          id,
          absPath,
          path: `work/0001-t.md`,
          branch: "feat/review",
          status: "review",
          title: "Review",
          needsInput: false,
          extra: {},
        }),
        applyFileChange: () => {},
      };
      new ReviewManager(config as any, (e) => eventsA.push(e), runnerA, indexA).cancelAll();

      // Process B (after the reload) adopts the same review: empty in-memory
      // `runs`, no knowledge of the cancel except the durable marker. Its
      // completion must finalize as cancelled, never write a failed report.
      const eventsB: Array<{ type: string; state?: unknown; id?: unknown }> = [];
      const runnerB: any = {
        output: () => ({ lines: [], accumulatedMs: 0 }),
        reviewKindOf: () => "run" as const,
        system: () => {},
        isRunning: () => false,
        running: () => [],
        hasSession: () => true,
        clearSession: () => {},
        stop: () => ({ stopped: false }),
      };
      const indexB: any = {
        getTask: (id: string) => ({
          id,
          absPath,
          path: `work/0001-t.md`,
          branch: "feat/review",
          status: "review",
          title: "Review",
          needsInput: false,
          extra: {},
        }),
        applyFileChange: () => {},
      };
      const reviewsB = new ReviewManager(config as any, (e) => eventsB.push(e), runnerB, indexB);
      reviewsB.handleReviewDone("review:0001", false, "run");

      expect(existsSync(join(root, ".repoos", "reviews", "0001.md"))).toBe(false);
      expect(eventsB.some((e) => e.type === "review" && e.state === "cancelled")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("re-arms the hard timeout for an adopted review run (Bug 2)", async () => {
    const { ReviewManager } = await import("../../server/review");
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");

    const root = mkdtempSync(join(tmpdir(), "repoos-revtimeout-"));
    try {
      const config = makeConfig(root);
      writeTask(root, "0001");

      // The runner has adopted a live review session whose `Run` (and its
      // spawner's timeout timer) died with the previous process.
      const stopped: string[] = [];
      const runner: any = {
        output: () => ({ lines: [], accumulatedMs: 0 }),
        reviewKindOf: () => "run" as const,
        system: () => {},
        isRunning: () => true,
        running: () => [{ id: "review:0001" }],
        hasSession: () => true,
        clearSession: () => {},
        stop: (id: string) => {
          stopped.push(id);
          return { stopped: true };
        },
      };
      const reviews = new ReviewManager(config as any, () => {}, runner as any, undefined);

      // Adopt: an adopted review session reads as running...
      expect(reviews.isRunning("0001")).toBe(true);
      reviews.armAdoptedTimeouts();

      // ...and is counted EXACTLY once in runningCount(): armAdoptedTimeouts
      // registered it in this.runs, so it must not ALSO be counted separately
      // from runner.running() (0288 review — the old code double-counted).
      expect(reviews.runningCount()).toBe(1);

      // ...and gets a Run record whose timer stops the child if it fires.
      // REVIEW_TIMEOUT_MS is 900s, so instead of waiting, verify the wiring by
      // simulating a cancelled adopted turn via cancel(), which the Run now
      // supports (an adopted proc-less review previously had no Run and could
      // never be marked cancelled).
      reviews.cancel("0001");
      expect(stopped).toContain("review:0001");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/** Shared config helper for the review-adoption test above. */
function configForRoot(root: string, cacheDir: string) {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox" as const,
    defaultAssignee: "unassigned" as const,
    cacheDir,
  };
}

describe("POST /api/server/restart", () => {
  it.skip("returns a reload state from the running server", async () => {
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    try {
      const res = await fetch(`${server.url}/api/server/restart`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { state: string };
      expect(["reloading", "deferred", "not-stale"]).toContain(body.state);
    } finally {
      await server.close();
    }
  }, 30_000);
});
