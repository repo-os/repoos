/**
 * Server-backed CLI commands (#0723).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import { clearCliSession } from "../../cli/cli-session";
import {
  cmdAgentsRunning,
  cmdConfig,
  cmdDone,
  cmdMessage,
  cmdOverride,
  cmdPause,
  cmdPreview,
  cmdReview,
  cmdReviewAgain,
  cmdRunners,
  cmdStart,
  cmdStats,
  cmdSync,
  cmdVerify,
  controlApiServerDownMessage,
} from "../../commands/control-api";
import { RepoOsApi } from "../../cli/repoos-api";

const tmpRoots: string[] = [];
const FIXTURE_PREFIX = "repoos-cli-api-";

interface Fixture {
  root: string;
  bin: string;
  log: string;
}

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  tmpRoots.push(dir);
  return dir;
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function makeFixture(liveAgent = false): Fixture {
  const root = mkdtempSync(join(tmpdir(), FIXTURE_PREFIX));
  tmpRoots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "opencode"),
    liveAgent
      ? `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ pid: process.pid }) + "\\n");
setInterval(() => {}, 1000);
`
      : `#!/usr/bin/env node
process.exit(0);
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "repoos"),
    `#!/usr/bin/env node
process.exit(0);
`,
    { mode: 0o755 },
  );
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(root, "repoos.toml"),
    `[[agents]]
name = "engineer"
cli = "opencode"
model = "deepseek/deepseek-v4.1-flash"
enabled = true

[[preview.targets]]
name = "default"
areas = ["general"]
command = "echo preview"
`,
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
  };
}

function killSpawns(fx: Fixture): void {
  try {
    for (const line of readFileSync(fx.log, "utf8").trim().split("\n")) {
      if (!line) continue;
      const rec = JSON.parse(line) as { pid?: number };
      if (typeof rec.pid === "number") process.kill(rec.pid, "SIGKILL");
    }
  } catch {
    /* no log */
  }
  const wtDir = join(dirname(fx.root), `${basename(fx.root)}-worktrees`);
  rmSync(fx.root, { recursive: true, force: true });
  rmSync(wtDir, { recursive: true, force: true });
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

async function withServer(
  root: string,
  fn: (s: ServerHandle) => Promise<void>,
  opts: { auth?: boolean } = {},
): Promise<void> {
  if (opts.auth) {
    writeFileSync(
      join(root, "repoos.toml"),
      `[auth]
enabled = true
bootstrapAdmin = "hello@repoos.org"

[auth.emailProvider]
type = "resend"
apiKey = "re_test"
fromAddress = "noreply@repoos.org"

[[agents]]
name = "engineer"
cli = "opencode"
model = "deepseek/deepseek-v4.1-flash"
enabled = true
`,
      "utf8",
    );
    const store = getAuthStore(root)!;
    store.upsertUser("hello@repoos.org", "admin", null);
  }
  const server = await startServer({ root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

async function runJsonCmd(
  port: number,
  fn: (args: string[]) => Promise<number>,
  args: string[],
): Promise<unknown> {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  const code = await fn([...args, "--json", "--port", String(port)]);
  if (code !== 0) {
    const errText = err.mock.calls.map((c) => c.join(" ")).join("\n");
    err.mockRestore();
    log.mockRestore();
    throw new Error(`command failed (exit ${code}): ${errText}`);
  }
  err.mockRestore();
  const printed = log.mock.calls[0]?.[0];
  log.mockRestore();
  return JSON.parse(printed as string);
}

async function createReadyTask(s: ServerHandle): Promise<string> {
  const created = await api(s, "POST", "/api/tasks", {
    title: "CLI control API",
    status: "ready",
  });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

function useAgentPath(fx: Fixture): void {
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
}

beforeAll(() => {
  /* reap handled globally in other suites */
});

afterEach(() => {
  resetAuthStoreInstance();
  vi.unstubAllEnvs();
  delete process.env.REPOOS_FAKEBIN_LOG;
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

describe("control API CLI", () => {
  it("reports a clear error when the server is down", async () => {
    const msg = await controlApiServerDownMessage(59999);
    expect(msg).toMatch(/Can't reach the RepoOS server/);
  });

  it("stats --json hits /api/stats/board", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const port = Number(new URL(s.url).port);
      const printed = await runJsonCmd(port, cmdStats, []);
      expect(printed).toHaveProperty("ok", true);
    });
  });

  it("re-authenticates on 401 via dev backdoor without printing the code", async () => {
    const root = tmpDir();
    vi.stubEnv("REPOOS_AUTH_DEV_BACKDOOR_CODE", "test-backdoor-secret");
    vi.stubEnv("NODE_ENV", "development");
    await withServer(
      root,
      async (s) => {
        const port = Number(new URL(s.url).port);
        writeFileSync(join(root, ".repoos", "local-cli-token"), "deadbeef\n", { mode: 0o600 });
        clearCliSession(root, ".repoos");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const err = vi.spyOn(console, "error").mockImplementation(() => {});
        const code = await cmdStats(["--json", "--port", String(port)]);
        expect(code).toBe(0);
        const output = log.mock.calls.map((c) => c[0]).join("\n");
        expect(output).not.toContain("test-backdoor-secret");
        err.mockRestore();
        log.mockRestore();
      },
      { auth: true },
    );
  });

  it("start --json", async () => {
    const fx = makeFixture(false);
    useAgentPath(fx);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      await runJsonCmd(port, cmdStart, [id]);
    });
    killSpawns(fx);
  }, 30_000);

  it("pause and message --json", async () => {
    const fx = makeFixture(true);
    useAgentPath(fx);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      await runJsonCmd(port, cmdStart, [id]);
      await runJsonCmd(port, cmdPause, [id]);
      await runJsonCmd(port, cmdMessage, [id, "continue"]);
    });
    killSpawns(fx);
  }, 20_000);

  it("preview --stop --json", async () => {
    const fx = makeFixture(false);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      await runJsonCmd(port, cmdPreview, [id, "--stop"]);
    });
    killSpawns(fx);
  });

  it("review --json (no wait)", async () => {
    const fx = makeFixture(false);
    useAgentPath(fx);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      await runJsonCmd(port, cmdStart, [id]);
      const reviewed = await runJsonCmd(port, cmdReview, [id]);
      expect(reviewed).toMatchObject({ ok: true, pendingHandoff: true });
    });
  }, 30_000);

  it("override --json resolves effective engineer from server config", async () => {
    const fx = makeFixture(false);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      const overridden = (await runJsonCmd(port, cmdOverride, [
        id,
        "--cli",
        "opencode",
        "--model",
        "gpt-5",
      ])) as { effective?: { cli: string; model: string } };
      expect(overridden.effective?.cli).toBe("opencode");
      expect(overridden.effective?.model).toBe("gpt-5");
    });
  });

  it("config get --json", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const port = Number(new URL(s.url).port);
      const cfg = await runJsonCmd(port, cmdConfig, ["get", "agents"]);
      expect(cfg).toHaveProperty("key", "agents");
    });
  });

  it("runners --json", async () => {
    const fx = makeFixture(false);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      await runJsonCmd(port, cmdRunners, []);
    });
    killSpawns(fx);
  });

  it("agents --json", async () => {
    const fx = makeFixture(false);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      await runJsonCmd(port, cmdAgentsRunning, []);
    });
    killSpawns(fx);
  });

  it("agents pause/resume writes the allowlist config (#0850)", async () => {
    const fx = makeFixture(false);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const put = await api(s, "PATCH", "/api/config", {
        "budget.allowlist": [{ cli: "opencode", models: ["big pickle", "deepseek v4"] }],
      });
      expect(put.status).toBe(200);

      const paused = (await runJsonCmd(port, cmdAgentsRunning, [
        "pause",
        "opencode",
        "--model",
        "big pickle",
        "--reason",
        "credits",
        "--until",
        "2099-01-01T00:00:00Z",
      ])) as { action: string; rows: Array<Record<string, unknown>> };
      expect(paused.action).toBe("pause");
      expect(paused.rows[0]?.pausedModels).toMatchObject([
        { model: "big pickle", pausedReason: "credits" },
      ]);
      const text = readFileSync(join(fx.root, "repoos.toml"), "utf8");
      expect(text).toContain("pausedModels");
      expect(text).toContain("credits");

      const resumed = (await runJsonCmd(port, cmdAgentsRunning, [
        "resume",
        "opencode",
        "--model",
        "big pickle",
      ])) as { rows: Array<Record<string, unknown>> };
      expect(resumed.rows[0]?.pausedModels).toBeUndefined();
    });
    killSpawns(fx);
  }, 30_000);

  it("sync --json on an active task with a worktree", async () => {
    const fx = makeFixture(false);
    useAgentPath(fx);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      await runJsonCmd(port, cmdStart, [id]);
      await runJsonCmd(port, cmdPause, [id]);
      const synced = await runJsonCmd(port, cmdSync, [id]);
      expect(synced).toMatchObject({ ok: true });
    });
    killSpawns(fx);
  }, 30_000);

  it("sync exits 1 without throwing when the API reports merge conflicts", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "request").mockResolvedValue({
      status: 409,
      body: {
        ok: false,
        conflicts: ["src/core/git.ts", "src/foo.ts"],
        error: "merge conflict",
      },
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await cmdSync(["0826"]);
    expect(code).toBe(1);
    expect(request).toHaveBeenCalledWith("POST", "/api/tasks/0826/sync", {});
    const lines = err.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("merge conflict"))).toBe(true);
    expect(lines.some((l) => l.includes("src/core/git.ts"))).toBe(true);
    err.mockRestore();
    health.mockRestore();
    request.mockRestore();
  });

  it("sync renders API errors (no branch, no worktree) and exits 1", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "request");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});

    request.mockResolvedValueOnce({
      status: 400,
      body: { error: "Task #0826 has no branch to sync" },
    });
    expect(await cmdSync(["0826"])).toBe(1);
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/no branch to sync/i);

    request.mockResolvedValueOnce({
      status: 409,
      body: { ok: false, conflicts: [], error: "no worktree for branch" },
    });
    expect(await cmdSync(["0826"])).toBe(1);
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/no worktree for branch/i);

    err.mockRestore();
    health.mockRestore();
    request.mockRestore();
  });

  it("sync --json prints success body", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "request").mockResolvedValue({
      status: 200,
      body: { ok: true, conflicts: [] },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await cmdSync(["--json", "0826"]);
    expect(code).toBe(0);
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({ ok: true, conflicts: [] });
    log.mockRestore();
    health.mockRestore();
    request.mockRestore();
  });

  it("review again posts to the API and prints success", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "request").mockResolvedValue({
      status: 200,
      body: { ok: true, task: { id: "0832", status: "review" } },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await cmdReviewAgain(["0832"]);
    expect(code).toBe(0);
    expect(request).toHaveBeenCalledWith("POST", "/api/tasks/0832/review/again", {});
    expect(log.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/review started/i);
    log.mockRestore();
    health.mockRestore();
    request.mockRestore();
  });

  it("review again renders refusal reasons and exits 1", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "request").mockResolvedValue({
      status: 409,
      body: { error: "Task #0832 has an agent turn in progress — wait for it to finish" },
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const code = await cmdReviewAgain(["0832"]);
    expect(code).toBe(1);
    expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toMatch(/agent turn in progress/i);
    err.mockRestore();
    health.mockRestore();
    request.mockRestore();
  });

  it("review again --json prints refusal body", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "request").mockResolvedValue({
      status: 400,
      body: { error: "Only review tasks can be re-reviewed (#0832 is active)" },
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await cmdReviewAgain(["--json", "0832"]);
    expect(code).toBe(1);
    const parsed = JSON.parse(String(log.mock.calls[0]?.[0])) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/Only review tasks/i);
    log.mockRestore();
    health.mockRestore();
    request.mockRestore();
  });

  it("verify exits 1 without throwing when verification issues arrive in a 200 body", async () => {
    const health = vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const requestOk = vi.spyOn(RepoOsApi.prototype, "requestOk").mockResolvedValue({
      ok: false,
      headIdentity: "abc1234",
      detail: "ui verification failed (1 issue(s)): boom",
      issues: [{ message: "boom" }],
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const code = await cmdVerify(["0766"]);
    expect(code).toBe(1);
    expect(requestOk).toHaveBeenCalledWith("POST", "/api/tasks/0766/verify", {});
    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes("verification issues"))).toBe(true);
    expect(lines.some((l) => l.includes("evidence refreshed"))).toBe(false);
    log.mockRestore();
    health.mockRestore();
    requestOk.mockRestore();
  });

  it("done --json refuses when the task is not in review", async () => {
    const fx = makeFixture(false);
    useAgentPath(fx);
    await withServer(fx.root, async (s) => {
      const port = Number(new URL(s.url).port);
      const id = await createReadyTask(s);
      await runJsonCmd(port, cmdStart, [id]);
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const code = await cmdDone(["--json", "--port", String(port), id]);
      expect(code).toBe(1);
      err.mockRestore();
    });
    killSpawns(fx);
  }, 30_000);
});
