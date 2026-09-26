/**
 * 0087 — a task that leaves `active` releases its agent process and registry
 * entry. Regression for the observed #0069 leak: an agent turn kept running
 * for hours against a task that had long finished, consuming CPU and competing
 * with the agents that were actually working. The cleanup must fire for every
 * route that can change status — API PATCH and a direct task-file edit on disk
 * (the watcher path) — and must reuse the graceful `runner.stop` path (SIGTERM,
 * SIGKILL after grace), never a bare kill.
 *
 * #0507 changes WHEN a task leaves `active` on these routes: a move into
 * `review` is now a request that runs the handoff finalization, and only that
 * finalization writes `status: review`. So the agent is released when the
 * checks pass, not when the request is made. These tests drive the whole thing
 * end-to-end against a fake `repoos` on PATH whose `check` exits 0 — which is
 * the real shape of the fix, and also the acceptance criterion: the task
 * reaches `review` after a green check, and the agent is gone with it.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const FIXTURE_PREFIX = "repoos-release-";

/**
 * Reap fixtures a PAST run leaked before this suite's own fixtures exist.
 * The per-test `try/finally` cleanup can't fire if the whole process is torn
 * down (Ctrl-C, a killed CI job) — vitest's thread pool means signal handlers
 * registered in a test file never fire either — so the next run self-heals.
 * Shared logic in tests/helpers.ts; see `reapStaleFixtures` there.
 */
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
  // A green `repoos check`. Since #0507 every route into `review` runs the
  // handoff finalization, which spawns `repoos check` in the worktree; without
  // a fake here the fixture would invoke the REAL linked CLI against a
  // throwaway temp repo. `check` exits 0 and records that it ran, so a test can
  // assert the check really was part of the path.
  writeFileSync(
    join(bin, "repoos"),
    `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ repoos: process.argv.slice(2) }) + "\\n");
process.exit(0);
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

/**
 * Poll for an observable outcome. The default ceiling is generous because each
 * handoff finalization resolves the worktree, runs the commit/vacuity gate and
 * writes two task files — ~10 `git` subprocess spawns, each ~200ms inside a
 * vitest worker under Bun versus ~4ms in a plain process, and multiplied on a
 * busy machine. A real hang is unbounded, so 45s still catches one; a 10s
 * ceiling mostly caught the harness.
 */
async function waitForAsync(fn: () => Promise<boolean>, label: string, timeoutMs = 45_000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
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
  reapStaleFixtures(FIXTURE_PREFIX);
});

afterEach(() => {
  delete process.env.REPOOS_FAKEBIN_LOG;
});

/**
 * Each test here boots a real server, spawns a fake agent, waits for it to
 * exit, and then drives a full handoff finalization to completion. Since #0507
 * that finalization is the real one — resolve worktree, run the commit/vacuity
 * gate, write two task files — which is ~10 `git` subprocess spawns at a few
 * hundred ms each inside a vitest worker under Bun. The 120s per-test budget
 * below is harness headroom, not a sloppier assertion: a real hang is
 * unbounded and `waitForAsync` still caps each step.
 */
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

      // #0507: a transition into `review` is a REQUEST. Give the agent's
      // worktree a real source change so the finalization's commit gate has
      // something to commit and the transition is not rejected as vacuous.
      const branch = started.body.branch as string;
      const worktreeDir = join(dirname(fx.root), `${basename(fx.root)}-worktrees`, branch);
      // /start already registered the git worktree; just write a source file
      // so guardReviewTransition sees a non-vacuous change to commit.
      writeFileSync(join(worktreeDir, "release-agent.txt"), "implemented\n");

      const patched = await api(server, "PATCH", `/api/tasks/${id}`, {
        status: "review",
      });
      // 202, and the task is still `active`: the response acknowledges the
      // request, it does not claim the move already happened.
      expect(patched.status).toBe(202);
      expect(patched.body.status).toBe("active");
      expect(patched.body.pendingHandoff).toBe(true);
      // Crucially, the agent is NOT killed by asking — the task has not left
      // `active`, so it is still legitimately working.
      expect((await running(server)).some((r) => r.id === id)).toBe(true);
      expect(alive(info.pid)).toBe(true);

      // The fake `repoos check` exits 0, so the finalization completes and the
      // task reaches `review` — which is when the agent is released.
      await waitForAsync(
        async () => {
          const t = await api(server, "GET", `/api/tasks/${id}`);
          return t.body.status === "review";
        },
        "the handoff finalization moves the task to review",
      );

      await waitForAsync(
        async () => !(await running(server)).some((r) => r.id === id),
        "agent leaves the running registry",
      );
      expect(alive(info.pid)).toBe(false);
      // The full finalization ran, check included — the whole point of 0507.
      expect(readFileSync(fx.log, "utf8")).toMatch(/"repoos":\[[^\]]*"check"/);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  }, 120_000);

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

      // Give the agent's worktree real source work, so the handoff
      // finalization's commit gate has something to commit.
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

      // #0507: a bare file edit is no longer a transition. The index reverts it
      // to `active` and hands the task to the same finalization every other
      // route uses, so the file momentarily says `review` and then does not.
      await waitForAsync(async () => /repoos":\[[^\]]*"check"/.test(readFileSync(fx.log, "utf8")), "the file-edit route starts the handoff finalization");
      // The agent is untouched until the task genuinely leaves `active`.
      await waitForAsync(
        async () => {
          const t = await api(server, "GET", `/api/tasks/${id}`);
          return t.body.status === "review";
        },
        "the handoff finalization moves the task to review",
      );
      await waitForAsync(
        async () => !(await running(server)).some((r) => r.id === id),
        "agent leaves the running registry after a direct file edit",
      );
      expect(alive(info.pid)).toBe(false);
      // The board reflects what the finalization decided, not the raw edit.
      expect(readFileSync(absPath, "utf8")).toMatch(/^status: review$/m);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  }, 120_000);

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

      // A task with no branch/worktree (never started, nothing to finalize)
      // cannot reach `review` at all. The request is accepted (202) and the
      // finalization then fails at `validate` — which is the honest outcome and
      // the one that keeps the task `active` instead of a rejected write. No
      // agent is released and the server does not crash.
      const patched = await api(server, "PATCH", `/api/tasks/${id}`, {
        status: "review",
      });
      expect(patched.status).toBe(202);
      expect(patched.body.status).toBe("active");
      await waitForAsync(
        async () => (await api(server, "GET", `/api/tasks/${id}`)).body.status === "active",
        "the task stays active after a failed finalization",
      );
      // The failure is recorded rather than swallowed: it is in the activity
      // log, which is what the watchdog and any later reader can see.
      await waitForAsync(
        async () =>
          /no branch to finalize from/.test(readFileSync(created.body.absPath as string, "utf8")),
        "the finalization failure is persisted to the activity log",
      );
      expect(await running(server)).toEqual([]);
    } finally {
      killSpawns(fx);
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      await server.close();
      fx.clean();
    }
  }, 120_000);
});
