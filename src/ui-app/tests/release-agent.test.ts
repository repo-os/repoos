/**
 * 0087 — a task that leaves `active` releases its agent process and registry
 * entry. Regression for the observed #0069 leak: an agent turn kept running
 * for hours against a task that had long finished, consuming CPU and competing
 * with the agents that were actually working. The cleanup must fire for every
 * route that can change status — API PATCH and a direct task-file edit on disk
 * (the watcher path) — and must reuse the graceful `runner.stop` path (SIGTERM,
 * SIGKILL after grace), never a bare kill.
 *
 * Drives the real HTTP server against a fixture git repo and a fake `opencode`
 * binary that stays alive (a live agent), then asserts the process dies and
 * the registry clears when the task is transitioned out of `active`.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import type { RunningAgentInfo } from "../../server/agents";

interface Fixture {
  root: string;
  bin: string;
  log: string;
  clean: () => void;
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

const FIXTURE_PREFIX = "repoos-release-";

/**
 * Reap fixtures a PAST run leaked. A per-test `try/finally` only unwinds when
 * the TEST throws — it never runs if the whole process is torn down (Ctrl-C,
 * a CI job killed mid-suite). Vitest's default pool runs test files in
 * worker threads, and OS signals go to the main vitest process only — it
 * kills workers via `worker.terminate()` on interrupt, so even a
 * `process.on('SIGINT', ...)` registered in this file never fires. That gap
 * is how 900+ of these fixtures (each holding a real, deliberately-infinite
 * fake-agent process) were found leaked in `/tmp` days later (see #0185
 * investigation). Self-healing on the next run is the only mechanism that
 * survives every kill path, so sweep before this suite's own fixtures exist —
 * anything younger than the sweep age is presumed still in use by a
 * concurrently running suite and left alone.
 */
const STALE_FIXTURE_AGE_MS = 10 * 60 * 1000;

function reapStaleFixtures(): void {
  let entries: string[];
  try {
    entries = readdirSync(tmpdir());
  } catch {
    return;
  }
  const cutoff = Date.now() - STALE_FIXTURE_AGE_MS;
  for (const name of entries) {
    if (!name.startsWith(FIXTURE_PREFIX) || name.endsWith("-worktrees")) continue;
    const root = join(tmpdir(), name);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(root).mtimeMs;
    } catch {
      continue;
    }
    if (mtimeMs >= cutoff) continue;
    try {
      const log = readFileSync(join(root, "spawns.log"), "utf8");
      for (const line of log.trim().split("\n")) {
        if (!line) continue;
        try {
          const rec = JSON.parse(line) as { pid?: number };
          if (typeof rec.pid === "number") process.kill(rec.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
      }
    } catch {
      /* no log — nothing to kill */
    }
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), `${name}-worktrees`), { recursive: true, force: true });
  }
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  // A live agent: node keeps the process alive until it is signalled. It
  // records its pid/args so the test can prove the process actually died.
  writeFileSync(
    join(bin, "opencode"),
    `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ pid: process.pid, args: process.argv.slice(2) }) + "\\n");
setInterval(() => {}, 1000);
`,
    { mode: 0o755 },
  );
  // The watcher only starts watching work/ when it exists at boot — create it
  // up front so the direct-file-edit path is exercised.
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  // The start route provisions the task's worktree in a sibling directory
  // (git worktree add) — remove it too so the fixture is fully cleaned up.
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

async function waitForAsync(
  fn: () => Promise<boolean>,
  label: string,
): Promise<void> {
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

beforeAll(() => {
  reapStaleFixtures();
});

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

describe("release agent when a task leaves active (#0087)", () => {
  it("stops the live agent and clears the registry on API PATCH active -> review", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const created = await api(server, "POST", "/api/tasks", {
        title: "Release the agent",
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
      const info = (await running(server)).find((r) => r.id === id)!;
      expect(info.pid).toBeGreaterThan(0);
      expect(alive(info.pid)).toBe(true);

      // #0210: a transition into `review` now auto-commits the worktree's
      // implementation work. Give the agent's worktree a real source change so
      // the PATCH behaves like the trusted handoff and genuinely arrives in
      // review (rather than being rejected as a vacuous transition).
      const branch = started.body.branch as string;
      const worktreeDir = join(dirname(fx.root), `${basename(fx.root)}-worktrees`, branch);
      mkdirSync(worktreeDir, { recursive: true });
      writeFileSync(join(worktreeDir, "release-agent.txt"), "implemented\n");

      const patched = await api(server, "PATCH", `/api/tasks/${id}`, {
        status: "review",
      });
      expect(patched.status).toBe(200);
      expect(patched.body.status).toBe("review");

      await waitForAsync(
        async () => !(await running(server)).some((r) => r.id === id),
        "agent leaves the running registry",
      );
      expect(alive(info.pid)).toBe(false);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  });

  it("stops the live agent when a direct task-file edit to review is picked up by the watcher", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const created = await api(server, "POST", "/api/tasks", {
        title: "Release by file edit",
        status: "ready",
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      const absPath = created.body.absPath as string;

      const started = await api(server, "POST", `/api/tasks/${id}/start`);
      expect(started.status).toBe(200);
      await waitForAsync(
        async () => (await running(server)).some((r) => r.id === id),
        "agent appears in the running registry",
      );
      const info = (await running(server)).find((r) => r.id === id)!;
      expect(alive(info.pid)).toBe(true);

      // Give the agent's worktree real source work, so the #0210 review gate
      // (which the watcher applies to a direct edit) commits and lets the
      // transition through instead of reverting it as vacuous.
      const branch = started.body.branch as string;
      const worktreeDir = join(dirname(fx.root), `${basename(fx.root)}-worktrees`, branch);
      mkdirSync(worktreeDir, { recursive: true });
      writeFileSync(join(worktreeDir, "release-by-edit.txt"), "implemented\n");

      // The agent's own self-transition edits the MAIN copy on disk directly
      // (never via the API) — the watcher is the only thing that sees it.
      writeFileSync(
        absPath,
        readFileSync(absPath, "utf8").replace(/^status: active$/m, "status: review"),
      );

      await waitForAsync(
        async () => !(await running(server)).some((r) => r.id === id),
        "agent leaves the running registry after a direct file edit",
      );
      expect(alive(info.pid)).toBe(false);
      // The board reflects the file as the agent left it.
      expect(readFileSync(absPath, "utf8")).toMatch(/^status: review$/m);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  });

  it("is a clean no-op when no agent is running (already exited on its own)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = fx.log;
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const created = await api(server, "POST", "/api/tasks", {
        title: "No-op release",
        status: "active",
      });
      expect(created.status).toBe(201);
      const id = created.body.id as string;

      // #0210: a task with no branch/worktree (never started, nothing to
      // finalize) cannot be transitioned into `review` — it is rejected with a
      // clean error and no agent is released, never a crash.
      const patched = await api(server, "PATCH", `/api/tasks/${id}`, {
        status: "review",
      });
      expect(patched.status).toBe(400);
      expect((patched.body.error as string) ?? "").toMatch(/review/);
      expect(await running(server)).toEqual([]);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  });
});
