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
  cmdRunners,
  cmdStart,
  cmdStats,
  controlApiServerDownMessage,
} from "../../commands/control-api";

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
