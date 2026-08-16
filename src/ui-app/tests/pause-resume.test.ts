/**
 * 0070 — pausing an active task must stop the agent without demoting the
 * task's status back to `ready`. Regression for the old behavior where
 * `/pause` transitioned `active -> ready`, losing the task's place on the
 * board. `/start` must also be able to relaunch a paused-but-still-active
 * task (not just a `ready` one), keeping it in `active` throughout.
 *
 * Drives the real HTTP server against a fixture git repo and a fake
 * `opencode` binary that stays alive (a live agent).
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
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

/**
 * Reap fixtures a PAST run leaked before this suite's own fixtures exist.
 * The per-test `try/finally` cleanup can't fire if the whole process is torn
 * down (Ctrl-C, a killed CI job) — vitest's thread pool means signal handlers
 * registered in a test file never fire either — so the next run self-heals.
 * Shared logic in tests/helpers.ts; see `reapStaleFixtures` there.
 */
const FIXTURE_PREFIX = "repoos-pause-";

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  // A live agent: node keeps the process alive until it is signalled.
  writeFileSync(
    join(bin, "opencode"),
    `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }) + "\\n");
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
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

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForAsync(fn: () => Promise<boolean>, label: string): Promise<void> {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > 10_000) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
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

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

beforeAll(() => {
  reapStaleFixtures(FIXTURE_PREFIX);
});

describe("pause keeps the task active instead of reverting to ready (#0070)", () => {
  it("stops the agent but leaves status active, then /start relaunches it in place", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const created = await api(server, "POST", "/api/tasks", {
        title: "Pause and resume",
        status: "ready",
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      const started = await api(server, "POST", `/api/tasks/${id}/start`);
      expect(started.status).toBe(200);
      await waitForAsync(
        async () => (await running(server)).some((r) => r.id === id),
        "agent appears in the running registry",
      );
      const firstInfo = (await running(server)).find((r) => r.id === id)!;
      expect(alive(firstInfo.pid)).toBe(true);

      const paused = await api(server, "POST", `/api/tasks/${id}/pause`);
      expect(paused.status).toBe(200);
      expect(paused.body.ok).toBe(true);
      // The status must stay `active` — this is the core of the fix.
      expect((paused.body.task as Record<string, unknown>).status).toBe("active");

      await waitForAsync(
        async () => !(await running(server)).some((r) => r.id === id),
        "agent leaves the running registry after pause",
      );
      expect(alive(firstInfo.pid)).toBe(false);

      // The task file on disk also stays active, not ready.
      const fetched = await api(server, "GET", `/api/tasks/${id}`);
      expect(fetched.body.status).toBe("active");

      // /start relaunches a paused-but-active task without going through ready.
      const restarted = await api(server, "POST", `/api/tasks/${id}/start`);
      expect(restarted.status).toBe(200);
      expect((restarted.body.task as Record<string, unknown>).status).toBe("active");

      await waitForAsync(
        async () => (await running(server)).some((r) => r.id === id),
        "agent re-appears in the running registry after restart",
      );
      const secondInfo = (await running(server)).find((r) => r.id === id)!;
      expect(alive(secondInfo.pid)).toBe(true);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  });

  it("rejects pausing a task that isn't active", async () => {
    const fx = makeFixture();
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const created = await api(server, "POST", "/api/tasks", {
        title: "Not active",
        status: "ready",
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      const paused = await api(server, "POST", `/api/tasks/${id}/pause`);
      expect(paused.status).toBe(400);
    } finally {
      await server.close();
      fx.clean();
    }
  });
});
