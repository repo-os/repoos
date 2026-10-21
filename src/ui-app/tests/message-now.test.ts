/**
 * #0760 — `repoos message <id> "<text>" --now` interrupts a busy agent and
 * delivers the message immediately, in one call.
 *
 * Drives the real HTTP server against a fixture git repo and a fake `opencode`
 * binary that stays alive (a live agent). Covers:
 *   - an idle agent with `now` (delivered immediately, nothing to interrupt)
 *   - a busy agent with `now` (interrupt the turn, then deliver a new turn)
 *   - a busy agent whose process will not stop (fail clearly, deliver nothing)
 *   - the default (no `now`) path, which still queues while the agent is busy
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import type { RunningAgentInfo } from "../../server/agents";
import { reapStaleFixtures } from "./helpers";

interface Fixture {
  root: string;
  bin: string;
  log: string;
  clean: () => void;
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

const FIXTURE_PREFIX = "repoos-msg-now-";
/** Each case boots a real server and spawns agents; well over the 5s default. */
const E2E_TIMEOUT_MS = 60_000;

/**
 * A fake `opencode` that keeps running until signalled, appending one JSON line
 * per spawn so a test can count spawns and see how many turns were launched.
 * With REPOOS_FAKEBIN_IGNORE_SIGTERM=1 it also traps SIGTERM (the pause path's
 * graceful signal), so the agent survives the graceful-stop window and only
 * SIGKILL can end it — the "pause did not stop the run" case.
 */
const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ pid: process.pid, at: Date.now() }) + "\\n");
if (process.env.REPOOS_FAKEBIN_IGNORE_SIGTERM === "1") {
  process.on("SIGTERM", () => {});
}
setInterval(() => {}, 1000);
`;

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "opencode"), FAKE_OPENCODE, { mode: 0o755 });
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  // Isolate spawn behaviour from the host's memory pressure (#0900).
  writeFileSync(join(root, "repoos.toml"), "[pressureGuard]\nenabled = false\n");
  const wtDir = join(dirname(root), `${basename(root)}-worktrees`);
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(wtDir, { recursive: true, force: true });
    },
  };
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
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function running(server: ServerHandle): Promise<RunningAgentInfo[]> {
  const res = await fetch(`${server.url}/api/agents/running`);
  const body = (await res.json()) as { tasks: RunningAgentInfo[] };
  return body.tasks;
}

async function waitForAsync(fn: () => Promise<boolean>, label: string): Promise<void> {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > 10_000) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function spawnCount(fx: Fixture): number {
  try {
    const text = readFileSync(fx.log, "utf8").trim();
    return text ? text.split("\n").length : 0;
  } catch {
    return 0;
  }
}

/**
 * "Running" flips true when the server registers the child, before the fake
 * agent (a Node script) has logged its spawn. Wait for that line so a baseline
 * count never misses the agent's own first spawn.
 */
async function waitForFirstSpawn(fx: Fixture): Promise<number> {
  await waitForAsync(async () => spawnCount(fx) >= 1, "first agent spawn logged");
  return spawnCount(fx);
}

/** Best-effort kill of any spawned fake agents, so a failed test leaks nothing. */
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

async function startActiveTask(server: ServerHandle): Promise<string> {
  const created = await api(server, "POST", "/api/tasks", {
    title: "Message now",
    status: "ready",
  });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const started = await api(server, "POST", `/api/tasks/${id}/start`);
  expect(started.status).toBe(200);
  return id;
}

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
  delete process.env.REPOOS_FAKEBIN_IGNORE_SIGTERM;
});

beforeAll(() => {
  reapStaleFixtures(FIXTURE_PREFIX);
});

describe("repoos message --now (#0760)", () => {
  it(
    "delivers immediately to an idle agent (nothing to interrupt)",
    async () => {
      const fx = makeFixture();
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        const id = await startActiveTask(server);
        await waitForAsync(
          async () => (await running(server)).some((r) => r.id === id),
          "agent running",
        );
        // Let the fake agent log its spawn before pausing; pausing first can
        // kill it before it logs, and the wait below then times out.
        const before = await waitForFirstSpawn(fx);
        // Idle it: pause stops the run, then we send with `now`.
        await api(server, "POST", `/api/tasks/${id}/pause`);
        await waitForAsync(
          async () => !(await running(server)).some((r) => r.id === id),
          "agent stopped",
        );

        const sent = await api(server, "POST", `/api/tasks/${id}/message`, {
          text: "steer me",
          now: true,
        });
        expect(sent.status).toBe(200);
        expect(sent.body.ok).toBe(true);
        expect(sent.body.deliveredNow).toBe(true);
        expect(sent.body.interrupted).toBe(false);
        expect(sent.body.queued).toBeUndefined();
        // A fresh process was spawned for the delivered message.
        await waitForAsync(async () => spawnCount(fx) > before, "delivered turn spawned");
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
    "interrupts a busy agent then delivers as a fresh turn",
    async () => {
      const fx = makeFixture();
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        const id = await startActiveTask(server);
        await waitForAsync(
          async () => (await running(server)).some((r) => r.id === id),
          "agent running",
        );
        const before = await waitForFirstSpawn(fx);

        const sent = await api(server, "POST", `/api/tasks/${id}/message`, {
          text: "change of plan",
          now: true,
        });
        expect(sent.status).toBe(200);
        expect(sent.body.ok).toBe(true);
        expect(sent.body.deliveredNow).toBe(true);
        expect(sent.body.interrupted).toBe(true);
        expect(sent.body.queued).toBeUndefined();
        // The interrupted turn was replaced by a delivered one.
        await waitForAsync(
          async () => spawnCount(fx) > before,
          "delivered turn spawned after interrupt",
        );
        await waitForAsync(
          async () => (await running(server)).some((r) => r.id === id),
          "new turn running",
        );
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
    "fails clearly and delivers nothing when the pause does not stop the run",
    async () => {
      const fx = makeFixture();
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      // The agent ignores SIGTERM, so the graceful pause window cannot stop it.
      process.env.REPOOS_FAKEBIN_IGNORE_SIGTERM = "1";
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        const id = await startActiveTask(server);
        await waitForAsync(
          async () => (await running(server)).some((r) => r.id === id),
          "agent running",
        );
        const before = await waitForFirstSpawn(fx);

        const sent = await api(server, "POST", `/api/tasks/${id}/message`, {
          text: "should not deliver",
          now: true,
        });
        expect(sent.status).toBe(409);
        expect(sent.body.ok).toBe(false);
        expect(sent.body.deliveredNow).toBeUndefined();
        expect(String(sent.body.error)).toContain("Could not interrupt");
        // No second turn was spawned on top of the running one.
        expect(spawnCount(fx)).toBe(before);
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
    "still queues while busy without now (default unchanged)",
    async () => {
      const fx = makeFixture();
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      process.env.REPOOS_FAKEBIN_LOG = fx.log;
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        const id = await startActiveTask(server);
        await waitForAsync(
          async () => (await running(server)).some((r) => r.id === id),
          "agent running",
        );
        const before = await waitForFirstSpawn(fx);

        const sent = await api(server, "POST", `/api/tasks/${id}/message`, {
          text: "queued by default",
        });
        expect(sent.status).toBe(200);
        expect(sent.body.queued).toBe(true);
        expect(sent.body.deliveredNow).toBeUndefined();
        // Queueing spawns nothing — the running turn is untouched.
        expect(spawnCount(fx)).toBe(before);
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
