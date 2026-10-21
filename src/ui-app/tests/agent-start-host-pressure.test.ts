/**
 * #0900 — spawning an engineer must not depend on the runner's memory state.
 *
 * The pressure guard samples the HOST's swap/compressor before every new
 * start. On 2026-10-21 the runners sat at 73% (thinkpad) and 50.1% (mini) swap
 * use, so real-spawn tests (agent-review, agent-concurrency, agent-drivers)
 * had their engineer/review turns deferred as `pressure` and timed out — while
 * the same tests passed on an idle laptop. The guard is correct production
 * behaviour; the tests were measuring the machine.
 *
 * These tests pin both halves of the contract:
 *   - a fixture that disables the guard spawns even when the injected host
 *     sample is critical (swap 73%, compressor 40%);
 *   - with the guard enabled, the same sample queues the start (`pressure`),
 *     and relief drains it — so the guard itself still works.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { MemoryPressureProbe, MemoryReadings } from "../../core/memory-pressure.js";
import { startServer, type ServerHandle } from "../../server/server.js";
import { reapStaleFixtures, waitFor } from "./helpers";

const FIXTURE_PREFIX = "repoos-host-pressure-";
const GB = 1024 ** 3;
/** A real server boot + worktree provisioning + spawn; the 5s default is too tight. */
const E2E_TIMEOUT_MS = 60_000;

interface Fixture {
  root: string;
  bin: string;
  log: string;
  clean: () => void;
}

/** A live fake engineer: stays up until the test releases it. */
const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }) + "\\n");
setInterval(() => {}, 1000);
`;

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function makeFixture(opts: { pressureGuard: boolean }): Fixture {
  const root = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode"), FAKE_OPENCODE, { mode: 0o755 });
  mkdirSync(join(root, "work"), { recursive: true });
  // The fixture decides the guard's enabled switch; the injected probe decides
  // what the host "reports". Spawn tests use enabled = false so a busy runner
  // can never turn a green test red (#0900).
  writeFileSync(
    join(root, "repoos.toml"),
    `[pressureGuard]\nenabled = ${opts.pressureGuard}\n`,
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  const worktrees = join(dirname(root), `${basename(root)}-worktrees`);
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktrees, { recursive: true, force: true });
    },
  };
}

/**
 * The exact reading that broke the runners (swap 73%, compressor 40% of RAM),
 * with the swap ratio configurable so the isolation test can also cover the
 * 90% sample from the acceptance criteria.
 */
function criticalReadings(swapRatio = 0.73): MemoryReadings {
  const totalMemBytes = 16 * GB;
  const swapTotalBytes = 4 * GB;
  return {
    loadPerCpu: 0.2,
    availableMemRatio: 0.4,
    totalMemBytes,
    swapTotalBytes,
    swapUsedBytes: Math.round(swapTotalBytes * swapRatio),
    compressorBytes: Math.round(totalMemBytes * 0.4),
    memoryFreePercent: 60,
    memoryStatsAvailable: true,
  };
}

function healthyReadings(): MemoryReadings {
  return {
    loadPerCpu: 0.2,
    availableMemRatio: 0.5,
    totalMemBytes: 16 * GB,
    swapTotalBytes: 4 * GB,
    swapUsedBytes: 0,
    compressorBytes: 0,
    memoryFreePercent: 70,
    memoryStatsAvailable: true,
  };
}

/** A probe whose reading the test can flip, standing in for a recovering host. */
function mutableProbe(readings: MemoryReadings): MemoryPressureProbe & {
  set(next: MemoryReadings): void;
} {
  let current = readings;
  return {
    read: () => current,
    set: (next) => {
      current = next;
    },
  };
}

function spawnCount(fx: Fixture): number {
  try {
    const text = readFileSync(fx.log, "utf8").trim();
    return text ? text.split("\n").length : 0;
  } catch {
    return 0;
  }
}

function killSpawns(fx: Fixture): void {
  let text: string;
  try {
    text = readFileSync(fx.log, "utf8");
  } catch {
    return;
  }
  for (const line of text.trim().split("\n")) {
    if (!line) continue;
    try {
      const rec = JSON.parse(line) as { pid?: number };
      if (typeof rec.pid === "number") process.kill(rec.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

async function api(
  server: ServerHandle,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function startTask(server: ServerHandle): Promise<{ id: string; queued: boolean }> {
  const created = await api(server, "POST", "/api/tasks", {
    title: "Host pressure spawn",
    status: "ready",
  });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const started = await api(server, "POST", `/api/tasks/${id}/start`);
  expect(started.status).toBe(200);
  const spawn = started.body.spawn as { queued?: boolean } | undefined;
  return { id, queued: Boolean(spawn?.queued) };
}

beforeAll(() => {
  reapStaleFixtures(FIXTURE_PREFIX);
});

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

describe("engineer starts are isolated from host memory pressure (#0900)", () => {
  it.each([
    { swap: 0.73, label: "73% swap / 40% compressor (the 2026-10-21 runners)" },
    { swap: 0.9, label: "90% swap / 40% compressor" },
  ])(
    "spawns under a $label host when the fixture disables the guard",
    async ({ swap }) => {
      const fx = makeFixture({ pressureGuard: false });
      const probe = mutableProbe(criticalReadings(swap));
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      const server = await startServer({
        root: fx.root,
        host: "127.0.0.1",
        port: 0,
        pressureProbe: probe,
      });
      try {
        const { id, queued } = await startTask(server);
        expect(queued).toBe(false);
        await waitFor(() => spawnCount(fx) === 1, "the engineer spawns despite host pressure");
        // A disabled guard must not leave a pressure marker behind either.
        expect(
          existsSync(join(fx.root, ".repoos", "queue-markers", `${id}-pressure.json`)),
        ).toBe(false);
      } finally {
        killSpawns(fx);
        process.env.PATH = oldPath;
        await server.close();
        fx.clean();
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    "queues while the guard sees critical pressure, then drains when the host recovers",
    async () => {
      const fx = makeFixture({ pressureGuard: true });
      const probe = mutableProbe(criticalReadings());
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      const server = await startServer({
        root: fx.root,
        host: "127.0.0.1",
        port: 0,
        pressureProbe: probe,
      });
      try {
        const { id, queued } = await startTask(server);
        expect(queued).toBe(true);
        expect(spawnCount(fx)).toBe(0);

        // The queue is legible: API reason + the on-disk marker the UI reads.
        const queuedRes = await api(server, "GET", "/api/agents/queued");
        const rows = queuedRes.body.tasks as Array<{ id: string; reason?: string; detail?: string }>;
        expect(rows).toContainEqual(
          expect.objectContaining({ id, reason: "pressure", detail: expect.stringMatching(/swap/i) }),
        );
        const markerPath = join(fx.root, ".repoos", "queue-markers", `${id}-pressure.json`);
        const marker = JSON.parse(readFileSync(markerPath, "utf8")) as {
          kind: string;
          message: string;
        };
        expect(marker.kind).toBe("pressure");
        expect(marker.message).toMatch(/swap/i);

        // Relief is what unblocks it; the retry timer polls every ~3s.
        probe.set(healthyReadings());
        await waitFor(
          () => spawnCount(fx) === 1,
          "the queued engineer starts after pressure relief",
          20_000,
        );
        expect(existsSync(markerPath)).toBe(false);
      } finally {
        killSpawns(fx);
        process.env.PATH = oldPath;
        await server.close();
        fx.clean();
      }
    },
    E2E_TIMEOUT_MS,
  );
});
