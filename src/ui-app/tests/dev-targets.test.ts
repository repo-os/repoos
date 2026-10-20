/**
 * #0747 — dev targets: config validation and the supervisor.
 *
 * Covers the `[[dev.targets]]` TOML parsing (and its loud validation errors),
 * the start/stop/restart lifecycle and status transitions, the log tail, and
 * the trust boundary — a bad command is reported as `failed` without crashing
 * the server, and no request body can ever supply a command.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, DevTargetConfig, DevServiceConfig } from "../../core/types";
import { loadConfig, parseDevTargets } from "../../core/config";
import { devTargetServiceErrors, parseDevServices } from "../../core/dev-targets";
import { PORT_IN_USE } from "../../core/dev-failure";
import { DevTargetManager, DEV_LOG_MAX_LINES } from "../../server/dev";
import type { RouteContext } from "../../server/routes/types";
import {
  explainDevFailure,
  getDevTarget,
  getDevTargets,
  restartDevTarget,
  startDevTarget,
  stopDevTarget,
} from "../../server/routes/dev";

function baseConfig(dev?: RepoOSConfig["dev"], root = "/tmp/repoos-dev-unit"): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ...(dev ? { dev } : {}),
  } as RepoOSConfig;
}

function target(over: Partial<DevTargetConfig>): DevTargetConfig {
  // Deliberately no `url`/healthCheck by default: a server with no health
  // check is "running" as soon as the process is still alive, which keeps the
  // lifecycle tests fast. Tests that exercise readiness set one explicitly.
  return { name: "web", kind: "server", command: "true", ...over };
}

/** Whether a PID is alive (best-effort; signal 0 sends nothing). */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll until a PID is gone (or the deadline passes), so a kill is given time to reap. */
async function waitForDead(pid: number, ms = 2000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isAlive(pid);
}

/** Hold a free TCP port in-process (the "port is taken" side of a test). */
function holdPort(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      resolve({ port, close: () => new Promise<void>((r) => srv.close(() => r())) });
    });
  });
}

/** Reserve then release a port, leaving it free for the target to bind. */
async function freePort(): Promise<number> {
  const held = await holdPort();
  await held.close();
  return held.port;
}

/**
 * A process-heavy supervisor test: spawns real children, waits for readiness
 * and teardown, so it needs more than vitest's default 5s under machine load.
 */
const itSlow = (name: string, fn: () => Promise<void>): void => {
  it(name, fn, 15_000);
};

/**
 * A genuinely foreign process holding a port RepoOS did not start — a helper
 * `bun -e` child that binds an OS-assigned port and reports it. Used to prove
 * auto-pick never stops such a process.
 */
function spawnPortHolder(): Promise<{ pid: number; port: number; kill: () => void }> {
  const script =
    "const n=require('node:net');const s=n.createServer();" +
    "s.listen(0,'127.0.0.1',()=>console.log(s.address().port));setInterval(()=>{},1000)";
  const child = spawn(process.execPath, ["-e", script], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("holder did not report a port")), 5000);
    child.stdout!.on("data", (c: Buffer) => {
      buf += c.toString("utf8");
      const m = buf.match(/(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ pid: child.pid!, port: Number(m[1]), kill: () => child.kill("SIGKILL") });
      }
    });
    child.once("error", reject);
  });
}

describe("parseDevTargets", () => {
  it("parses a valid server and artifact target", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        { name: "web", kind: "server", command: "bun run dev", url: "http://localhost:5173" },
        {
          name: "apk",
          kind: "artifact",
          command: "bun run build",
          artifactPath: "dist/app.apk",
          label: "Debug APK",
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      name: "web",
      kind: "server",
      command: "bun run dev",
      url: "http://localhost:5173",
    });
    expect(targets[1]).toMatchObject({
      name: "apk",
      kind: "artifact",
      artifactPath: "dist/app.apk",
      label: "Debug APK",
    });
  });

  it("returns nothing when there is no dev.targets section", () => {
    expect(parseDevTargets({})).toEqual({ targets: [], errors: [] });
  });

  it("reports a clear error for a missing name", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [{ kind: "server", command: "x", url: "http://x" }],
    });
    expect(targets).toHaveLength(0);
    expect(errors[0]).toContain("missing a name");
  });

  it("rejects an unknown kind", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [{ name: "web", kind: "daemon", command: "x" }],
    });
    expect(errors[0]).toContain('kind must be "server", "artifact" or "process"');
  });

  it("requires a command", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [{ name: "web", kind: "server", url: "http://x" }],
    });
    expect(errors[0]).toContain("command is required");
  });

  it("requires url for server and artifactPath for artifact", () => {
    expect(
      parseDevTargets({ "dev.targets": [{ name: "web", kind: "server", command: "x" }] }).errors[0],
    ).toContain("needs a url");
    expect(
      parseDevTargets({ "dev.targets": [{ name: "apk", kind: "artifact", command: "x" }] })
        .errors[0],
    ).toContain("needs an artifactPath");
  });

  it("parses a process target with no url, artifactPath or healthCheck", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "divot",
          kind: "process",
          command: "swift run --package-path macos divot",
          label: "Divot bar",
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      name: "divot",
      kind: "process",
      command: "swift run --package-path macos divot",
      label: "Divot bar",
    });
    expect(targets[0].url).toBeUndefined();
    expect(targets[0].artifactPath).toBeUndefined();
    expect(targets[0].healthCheck).toBeUndefined();
  });

  it("points a URL-less server at kind = process instead of accepting it", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [{ name: "divot", kind: "server", command: "swift run" }],
    });
    expect(errors[0]).toContain("needs a url");
    expect(errors[0]).toContain('use kind = "process"');
  });

  it("rejects a url or an artifactPath on a process target", () => {
    expect(
      parseDevTargets({
        "dev.targets": [{ name: "web", kind: "process", command: "x", url: "http://x" }],
      }).errors[0],
    ).toContain('a "process" target cannot have a url');
    expect(
      parseDevTargets({
        "dev.targets": [{ name: "apk", kind: "process", command: "x", artifactPath: "dist/a" }],
      }).errors[0],
    ).toContain('a "process" target cannot have an artifactPath');
  });

  it("rejects a healthCheck on a process target", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [
        { name: "p", kind: "process", command: "x", healthCheck: { file: "ready.txt" } },
      ],
    });
    expect(errors[0]).toContain('a "process" target cannot have a healthCheck');
  });

  it("rejects a url on an artifact and an artifactPath on a server", () => {
    expect(
      parseDevTargets({
        "dev.targets": [
          { name: "apk", kind: "artifact", command: "x", artifactPath: "a", url: "http://x" },
        ],
      }).errors[0],
    ).toContain("cannot have a url");
    expect(
      parseDevTargets({
        "dev.targets": [
          { name: "web", kind: "server", command: "x", url: "http://x", artifactPath: "a" },
        ],
      }).errors[0],
    ).toContain("cannot have an artifactPath");
  });

  it("rejects duplicate names", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [
        { name: "web", kind: "server", command: "x", url: "http://x" },
        { name: "web", kind: "server", command: "y", url: "http://y" },
      ],
    });
    expect(errors[0]).toContain('duplicate target name "web"');
  });

  it("parses an optional healthCheck (url or file) and rejects an empty one", () => {
    const { targets } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "x",
          url: "http://x",
          healthCheck: { url: "http://x/health" },
        },
      ],
    });
    expect(targets[0].healthCheck).toEqual({ url: "http://x/health" });

    const { errors } = parseDevTargets({
      "dev.targets": [
        { name: "web", kind: "server", command: "x", url: "http://x", healthCheck: {} },
      ],
    });
    expect(errors[0]).toContain("healthCheck needs a url or a file");
  });

  it("parses healthCheck written as the inline table string the flat parser yields", () => {
    // `parseFlatToml` has no inline-table support, so `healthCheck = { url = … }`
    // reaches parseDevTargets as a raw string. The documented syntax must work.
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "x",
          url: "http://x",
          healthCheck: '{ url = "http://x/health" }',
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets[0].healthCheck).toEqual({ url: "http://x/health" });
  });

  it("parses healthCheck written as dotted keys (healthCheck.url / healthCheck.file)", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "apk",
          kind: "artifact",
          command: "x",
          artifactPath: "dist/app.apk",
          "healthCheck.file": "dist/app.apk",
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets[0].healthCheck).toEqual({ file: "dist/app.apk" });
  });

  // #0802 — per-target port handling: auto-pick on by default, a fixed port
  // when it is turned off.
  it("parses auto-pick off with a fixed port, and defaults auto-pick on", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "bun run dev --port {port}",
          url: "http://localhost:{port}",
          autoPort: false,
          port: 5173,
        },
        {
          name: "docs",
          kind: "server",
          command: "bun run dev --port {port}",
          url: "http://localhost:{port}",
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets[0]).toMatchObject({ autoPort: false, port: 5173 });
    // Auto-pick is on by default: nothing is stored, the manager treats the
    // absent value as true.
    expect(targets[1].autoPort).toBeUndefined();
    expect(targets[1].port).toBeUndefined();
  });

  it("accepts a numeric-string port (the Settings form sends a string)", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "x {port}",
          url: "http://localhost:{port}",
          autoPort: false,
          port: "4321",
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets[0].port).toBe(4321);
  });

  it("rejects an out-of-range port", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "x {port}",
          url: "http://localhost:{port}",
          port: 70000,
        },
      ],
    });
    expect(errors[0]).toContain("port must be a whole number between 1 and 65535");
  });

  it("rejects auto-pick off with a {port} and no port to pin", () => {
    const { errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "x {port}",
          url: "http://localhost:{port}",
          autoPort: false,
        },
      ],
    });
    expect(errors[0]).toContain("auto-pick is off but no port is set");
  });

  it("allows auto-pick off with a literal fixed port and no {port}", () => {
    const { targets, errors } = parseDevTargets({
      "dev.targets": [
        {
          name: "web",
          kind: "server",
          command: "bun run dev --port 5173",
          url: "http://localhost:5173",
          autoPort: false,
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(targets[0].autoPort).toBe(false);
  });
});

describe("loadConfig dev target wiring", () => {
  it("records parsed targets and validation errors on the config", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-toml-"));
    try {
      writeFileSync(
        join(dir, "repoos.toml"),
        [
          "[[dev.targets]]",
          'name = "web"',
          'kind = "server"',
          'command = "bun run dev"',
          'url = "http://localhost:5173"',
          'healthCheck = { url = "http://localhost:5173/health" }',
          "",
          "[[dev.targets]]",
          'name = "broken"',
          'kind = "nope"',
          'command = "x"',
          "",
        ].join("\n"),
      );
      const cfg = loadConfig(dir);
      expect(cfg.dev?.targets).toHaveLength(1);
      expect(cfg.dev?.targets?.[0].name).toBe("web");
      // The documented inline-table healthCheck survives the real flat parser.
      expect(cfg.dev?.targets?.[0].healthCheck).toEqual({
        url: "http://localhost:5173/health",
      });
      expect(cfg.devTargetErrors?.length).toBe(1);
      expect(cfg.devTargetErrors?.[0]).toContain('kind must be "server", "artifact" or "process"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DevTargetManager lifecycle", () => {
  it("starts a server target to running, then stops it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-mgr-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [target({ name: "web", command: 'bun -e "setTimeout(()=>{},60000)"' })],
        },
        dir,
      ),
    );
    try {
      // No healthCheck → a still-live process a moment later is "running".
      const start = await mgr.start("web");
      expect(start.ok).toBe(true);
      expect(mgr.get("web")?.status).toBe("running");

      const stop = await mgr.stop("web");
      expect(stop.ok).toBe(true);
      expect(mgr.get("web")?.status).toBe("stopped");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is idempotent when starting an already-running target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-idem-"));
    const mgr = new DevTargetManager(
      baseConfig({ targets: [target({ command: 'bun -e "setTimeout(()=>{},60000)"' })] }, dir),
    );
    try {
      const first = await mgr.start("web");
      const pidFirst = first.target?.pid;
      const second = await mgr.start("web");
      expect(second.ok).toBe(true);
      expect(second.target?.pid).toBe(pidFirst);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs an artifact target to completion and reports running", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-art-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            { name: "build", kind: "artifact", command: "true", artifactPath: "dist/out.txt" },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("build");
      expect(result.ok).toBe(true);
      // A successful one-shot build exits 0 and stays shown as running/complete.
      expect(mgr.get("build")?.status).toBe("running");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a bad command as failed without crashing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-bad-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [{ name: "web", kind: "server", command: "exit 7" }],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(false);
      expect(mgr.get("web")?.status).toBe("failed");
      expect(mgr.get("web")?.error).toBeTruthy();
      // The manager is still usable after the failure.
      expect(mgr.list()).toHaveLength(1);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs a process target (no URL) while its process lives, then stops it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-process-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            { name: "divot", kind: "process", command: 'bun -e "setTimeout(()=>{},60000)"' },
          ],
        },
        dir,
      ),
    );
    try {
      // No url and no healthCheck — a process is running as soon as it is
      // still alive after the settle, which is its whole health check.
      const start = await mgr.start("divot");
      expect(start.ok).toBe(true);
      expect(mgr.get("divot")?.kind).toBe("process");
      expect(mgr.get("divot")?.status).toBe("running");
      expect(mgr.get("divot")?.pid).toBeGreaterThan(0);

      const stop = await mgr.stop("divot");
      expect(stop.ok).toBe(true);
      expect(mgr.get("divot")?.status).toBe("stopped");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a process target that exits on its own as failed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-process-exit-"));
    const mgr = new DevTargetManager(
      baseConfig({ targets: [{ name: "divot", kind: "process", command: "exit 5" }] }, dir),
    );
    try {
      const result = await mgr.start("divot");
      expect(result.ok).toBe(false);
      expect(mgr.get("divot")?.status).toBe("failed");
      expect(mgr.get("divot")?.error).toBeTruthy();
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("waits for a server target's health check URL before reporting running", async () => {
    // A tiny real HTTP server the dev target command boots, so the configured
    // healthCheck.url genuinely answers.
    const port = 18700 + Math.floor(Math.random() * 200);
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-health-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            {
              name: "web",
              kind: "server",
              command: `bun -e "const h=require('node:http');h.createServer((q,s)=>s.end('ok')).listen(${port});setTimeout(()=>{},60000)"`,
              url: `http://127.0.0.1:${port}`,
            },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(true);
      expect(mgr.get("web")?.status).toBe("running");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("captures output into the log, capped at DEV_LOG_MAX_LINES", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-log-"));
    const cmd = `bun -e "for(let i=0;i<${DEV_LOG_MAX_LINES + 50};i++)console.log('line',i);setTimeout(()=>{},5000)"`;
    const mgr = new DevTargetManager(baseConfig({ targets: [target({ command: cmd })] }, dir));
    try {
      await mgr.start("web");
      // Give the child a moment to flush its output.
      await new Promise((r) => setTimeout(r, 1200));
      const log = mgr.get("web")?.log ?? [];
      expect(log.length).toBeLessThanOrEqual(DEV_LOG_MAX_LINES);
      expect(log.length).toBeGreaterThan(0);
      // The cap is a full last-run log, not a 6-line tail (#0775).
      expect(DEV_LOG_MAX_LINES).toBe(2000);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("restart stops then starts a fresh process", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-restart-"));
    const mgr = new DevTargetManager(
      baseConfig({ targets: [target({ command: 'bun -e "setTimeout(()=>{},60000)"' })] }, dir),
    );
    try {
      await mgr.start("web");
      const pid1 = mgr.get("web")?.pid;
      const restarted = await mgr.restart("web");
      expect(restarted.ok).toBe(true);
      expect(mgr.get("web")?.status).toBe("running");
      expect(mgr.get("web")?.pid).not.toBe(pid1);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("restart of a process target leaves no orphan behind", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-process-restart-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            { name: "divot", kind: "process", command: 'bun -e "setTimeout(()=>{},60000)"' },
          ],
        },
        dir,
      ),
    );
    try {
      await mgr.start("divot");
      const pid1 = mgr.get("divot")?.pid;
      expect(pid1).toBeGreaterThan(0);

      const restarted = await mgr.restart("divot");
      expect(restarted.ok).toBe(true);
      expect(mgr.get("divot")?.status).toBe("running");
      const pid2 = mgr.get("divot")?.pid;
      expect(pid2).not.toBe(pid1);

      // The old process was killed as part of restart — nothing orphaned.
      expect(await waitForDead(pid1!)).toBe(true);
      expect(mgr.get("divot")?.pid).toBe(pid2);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects an unknown target without spawning anything", async () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const result = await mgr.start("nope");
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown dev target "nope"');
  });

  it("exposes config validation errors via configErrors()", () => {
    const cfg = baseConfig({ targets: [] });
    cfg.devTargetErrors = ["[dev.targets] web: a command is required"];
    const mgr = new DevTargetManager(cfg);
    expect(mgr.configErrors()).toEqual(["[dev.targets] web: a command is required"]);
  });

  it("reaps/records a persisted running target as stopped on cold boot", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-boot-"));
    try {
      // Simulate a previous server's registry with a dead PID.
      const file = join(dir, ".repoos", "dev-targets.json");
      mkdirSync(join(dir, ".repoos"), { recursive: true });
      writeFileSync(
        file,
        JSON.stringify({
          mainPid: 999999,
          targets: { web: { name: "web", status: "running", pid: 999999, log: [] } },
        }),
      );
      const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }, dir));
      mgr.cleanupOrphans(false);
      expect(mgr.get("web")?.status).toBe("stopped");
      // The registry file is dropped after reconciliation.
      let existsAfter = true;
      try {
        readFileSync(file);
      } catch {
        existsAfter = false;
      }
      expect(existsAfter).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0751: a `{port}` placeholder in the command/url/healthCheck is filled with
  // a free, OS-assigned port chosen at start — the same handling
  // `[[preview.targets]]` uses — so a dev server never clashes with another app.
  it("starts a `{port}` target on a free port and substitutes it everywhere", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-port-"));
    // The command listens on the port the shell substitutes; the health check
    // url carries the SAME placeholder, so a pass proves both got one port.
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            {
              name: "web",
              kind: "server",
              command:
                `bun -e "const h=require('node:http');` +
                `const p=Number(process.argv[1]);` +
                `h.createServer((q,s)=>s.end('ok')).listen(p);setTimeout(()=>{},60000)" {port}`,
              url: "http://127.0.0.1:{port}",
              healthCheck: { url: "http://127.0.0.1:{port}/health" },
            },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(true);
      expect(mgr.get("web")?.status).toBe("running");
      // The real url is what the target actually bound, not the template.
      const url = mgr.get("web")?.url ?? "";
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(url).not.toContain("{port}");
      const port = Number(url.split(":").pop());
      expect(port).toBeGreaterThan(0);
      // The configured command shown back is the resolved one.
      expect(mgr.get("web")?.command).toContain(String(port));
      expect(mgr.get("web")?.command).not.toContain("{port}");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves a target with no `{port}` placeholder exactly as declared", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-noport-"));
    // A fixed port the command binds directly — no placeholder, so nothing is
    // reassigned and the declared url/command come back verbatim.
    const port = 18900 + Math.floor(Math.random() * 200);
    const command =
      `bun -e "const h=require('node:http');h.createServer((q,s)=>s.end('ok')).listen(${port});` +
      `setTimeout(()=>{},60000)"`;
    const fixedUrl = `http://127.0.0.1:${port}`;
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [{ name: "web", kind: "server", command, url: fixedUrl }],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(true);
      // No `{port}` → the fixed url is untouched and the command is verbatim.
      expect(mgr.get("web")?.url).toBe(fixedUrl);
      expect(mgr.get("web")?.command).toBe(command);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves the url placeholder to the same port the command bound", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-urlport-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            {
              name: "web",
              kind: "server",
              command:
                `bun -e "const h=require('node:http');` +
                `const p=Number(process.argv[1]);` +
                `h.createServer((q,s)=>s.end('ok')).listen(p);setTimeout(()=>{},60000)" {port}`,
              url: "http://127.0.0.1:{port}",
            },
          ],
        },
        dir,
      ),
    );
    try {
      await mgr.start("web");
      const view = mgr.get("web");
      const urlPort = Number((view?.url ?? "").split(":").pop());
      expect(view?.command).toContain(String(urlPort));
      // A restart picks a fresh free port and both fields follow it.
      const restarted = await mgr.restart("web");
      expect(restarted.ok).toBe(true);
      const url2 = restarted.target?.url ?? "";
      expect(url2).not.toContain("{port}");
      expect(restarted.target?.command).toContain(String(Number(url2.split(":").pop())));
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dev target auto-pick (#0802)", () => {
  /** A `{port}` server that answers its health check, so `start` can report running. */
  function portServerTarget(over: Partial<DevTargetConfig>): DevTargetConfig {
    return {
      name: "web",
      kind: "server",
      command:
        `bun -e "const h=require('node:http');` +
        `const p=Number(process.argv[1]);` +
        `h.createServer((q,s)=>s.end('ok')).listen(p);setTimeout(()=>{},60000)" {port}`,
      url: "http://127.0.0.1:{port}",
      healthCheck: { url: "http://127.0.0.1:{port}/health" },
      ...over,
    };
  }

  it("starts on a free port when the preferred port is taken (auto-pick on)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-autoport-"));
    const held = await holdPort();
    const mgr = new DevTargetManager(
      baseConfig({ targets: [portServerTarget({ port: held.port })] }, dir),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(true);
      const view = mgr.get("web");
      const port = Number((view?.url ?? "").split(":").pop());
      expect(port).toBeGreaterThan(0);
      // The taken preferred port was skipped for a free one.
      expect(port).not.toBe(held.port);
      expect(view?.port).toBe(port);
      expect(view?.command).toContain(String(port));
    } finally {
      await mgr.stopAll();
      await held.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the preferred port when it is free (auto-pick on)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-prefport-"));
    const port = await freePort();
    const mgr = new DevTargetManager(baseConfig({ targets: [portServerTarget({ port })] }, dir));
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(true);
      expect(mgr.get("web")?.port).toBe(port);
      expect(mgr.get("web")?.url).toBe(`http://127.0.0.1:${port}`);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails with the port-in-use summary when auto-pick is off and the port is taken", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-fixedport-"));
    const held = await holdPort();
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            {
              name: "web",
              kind: "server",
              // No url: the child exits on EADDRINUSE and the summary is read
              // from its output. A health file that never appears makes
              // `waitForReady` loop until the child dies, so the failure is
              // deterministic rather than relying on a single 500ms check.
              command:
                `bun -e "const h=require('node:http');` +
                `h.createServer((q,s)=>s.end('ok')).listen(Number(process.argv[1]),'127.0.0.1')" {port}`,
              healthCheck: { file: "never-appears.txt" },
              autoPort: false,
              port: held.port,
            },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(false);
      const detail = await mgr.getDetailed("web");
      expect(detail?.status).toBe("failed");
      expect(detail?.failure?.kind).toBe(PORT_IN_USE);
      expect(detail?.failure?.port).toBe(held.port);
      // The fixed port was the one substituted into the command.
      expect(detail?.command).toContain(String(held.port));
    } finally {
      await mgr.stopAll();
      await held.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never stops a process RepoOS did not start", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-foreign-"));
    const holder = await spawnPortHolder();
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            {
              name: "web",
              kind: "server",
              command:
                `bun -e "const h=require('node:http');` +
                `h.createServer((q,s)=>s.end('ok')).listen(Number(process.argv[1]),'127.0.0.1')" {port}`,
              healthCheck: { file: "never-appears.txt" },
              autoPort: false,
              port: holder.port,
            },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("web");
      expect(result.ok).toBe(false);
      // The foreign holder is untouched — auto-pick only reserves a port, it
      // never signals a process RepoOS did not start.
      expect(isAlive(holder.pid)).toBe(true);
    } finally {
      await mgr.stopAll();
      holder.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dev target routes", () => {
  function makeRes(): { res: ServerResponse; fake: { status: number; payload: any } } {
    const fake = { status: 0, payload: undefined as any };
    const res = {
      setHeader() {},
      writeHead(code: number) {
        fake.status = code;
      },
      end(p: string) {
        fake.payload = JSON.parse(p);
      },
    };
    return { res: res as unknown as ServerResponse, fake };
  }
  const req = {} as IncomingMessage;

  function makeCtx(mgr: DevTargetManager | undefined): RouteContext {
    return { devTargets: mgr } as unknown as RouteContext;
  }

  it("lists targets with their state", async () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const { res, fake } = makeRes();
    await getDevTargets(makeCtx(mgr), req, res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload.targets).toHaveLength(1);
    expect(fake.payload.targets[0].status).toBe("stopped");
  });

  it("surfaces config validation errors on list", async () => {
    const cfg = baseConfig({ targets: [] });
    cfg.devTargetErrors = ["[dev.targets] web: a command is required"];
    const { res, fake } = makeRes();
    await getDevTargets(makeCtx(new DevTargetManager(cfg)), req, res, {});
    expect(fake.payload.errors).toEqual(["[dev.targets] web: a command is required"]);
  });

  it("404s an unknown target", async () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const { res, fake } = makeRes();
    await getDevTarget(makeCtx(mgr), req, res, { param1: "nope" });
    expect(fake.status).toBe(404);
  });

  it("503s when the manager is absent (partial context)", async () => {
    const { res, fake } = makeRes();
    await getDevTargets(makeCtx(undefined), req, res, {});
    expect(fake.status).toBe(503);
  });

  it("403s the AI explanation when the setting is off (#0775)", async () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const ctx = { devTargets: mgr, config: baseConfig({ targets: [] }) } as unknown as RouteContext;
    const { res, fake } = makeRes();
    await explainDevFailure(ctx, req, res, { param1: "web" });
    expect(fake.status).toBe(403);
  });

  it("400s the AI explanation for a target that is not failed (#0775)", async () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const ctx = {
      devTargets: mgr,
      config: baseConfig({ targets: [target({})], failureSummary: { ai: true } }),
    } as unknown as RouteContext;
    const { res, fake } = makeRes();
    await explainDevFailure(ctx, req, res, { param1: "web" });
    expect(fake.status).toBe(400);
  });

  it("starts, then stops, a target through the routes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-route-"));
    const mgr = new DevTargetManager(
      baseConfig({ targets: [target({ command: 'bun -e "setTimeout(()=>{},60000)"' })] }, dir),
    );
    try {
      const start = makeRes();
      await startDevTarget(makeCtx(mgr), req, start.res, { param1: "web" });
      expect(start.fake.status).toBe(200);
      expect(start.fake.payload.target.status).toBe("running");

      const stop = makeRes();
      await stopDevTarget(makeCtx(mgr), req, stop.res, { param1: "web" });
      expect(stop.fake.status).toBe(200);
      expect(stop.fake.payload.target.status).toBe("stopped");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts, then stops, a process target through the routes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-route-process-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            { name: "divot", kind: "process", command: 'bun -e "setTimeout(()=>{},60000)"' },
          ],
        },
        dir,
      ),
    );
    try {
      const start = makeRes();
      await startDevTarget(makeCtx(mgr), req, start.res, { param1: "divot" });
      expect(start.fake.status).toBe(200);
      expect(start.fake.payload.target.status).toBe("running");
      expect(start.fake.payload.target.kind).toBe("process");

      const stop = makeRes();
      await stopDevTarget(makeCtx(mgr), req, stop.res, { param1: "divot" });
      expect(stop.fake.status).toBe(200);
      expect(stop.fake.payload.target.status).toBe("stopped");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("502s a target whose command fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-route-fail-"));
    const mgr = new DevTargetManager(
      baseConfig({ targets: [{ name: "web", kind: "server", command: "exit 3" }] }, dir),
    );
    try {
      const { res, fake } = makeRes();
      await startDevTarget(makeCtx(mgr), req, res, { param1: "web" });
      expect(fake.status).toBe(502);
      expect(fake.payload.error).toBeTruthy();
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("404s start for an unknown target and never runs anything", async () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({ command: "exit 9" })] }));
    const { res, fake } = makeRes();
    await startDevTarget(makeCtx(mgr), req, res, { param1: "nope" });
    expect(fake.status).toBe(404);
  });

  it("ignores any command in the request body — only config commands run (#0747)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-route-body-"));
    // The declared command writes a marker; a body-supplied command would
    // write a DIFFERENT marker. Only the declared one may ever appear.
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            {
              name: "web",
              kind: "artifact",
              command: "printf declared > declared.txt",
              artifactPath: "declared.txt",
            },
          ],
        },
        dir,
      ),
    );
    const bodyReq = {
      on(ev: string, cb: (chunk?: Buffer) => void) {
        if (ev === "data") cb(Buffer.from(JSON.stringify({ command: "printf pwned > pwned.txt" })));
        if (ev === "end") cb();
        return bodyReq;
      },
    } as unknown as IncomingMessage;
    try {
      const { res, fake } = makeRes();
      await startDevTarget(makeCtx(mgr), bodyReq, res, { param1: "web" });
      expect(fake.status).toBe(200);
      expect(readFileSync(join(dir, "declared.txt"), "utf8")).toBe("declared");
      // The body command was never run.
      let pwned = true;
      try {
        readFileSync(join(dir, "pwned.txt"));
      } catch {
        pwned = false;
      }
      expect(pwned).toBe(false);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("restarts a target through the route", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-route-restart-"));
    const mgr = new DevTargetManager(
      baseConfig({ targets: [target({ command: 'bun -e "setTimeout(()=>{},60000)"' })] }, dir),
    );
    try {
      const { res, fake } = makeRes();
      await restartDevTarget(makeCtx(mgr), req, res, { param1: "web" });
      expect(fake.status).toBe(200);
      expect(fake.payload.target.status).toBe("running");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---- [[dev.services]] (#0843): companion processes booted on their own ports ----

/** A long-lived fake API the manager boots as a companion service. */
function apiService(over: Partial<DevServiceConfig> = {}): DevServiceConfig {
  return {
    name: "api",
    command:
      "bun -e \"const h=require('node:http');h.createServer((q,s)=>s.end('ok')).listen(Number(process.env.PORT),'127.0.0.1');setTimeout(()=>{},60000)\"",
    healthCheck: { url: "http://localhost:{port}/api/health" },
    ...over,
  };
}

/** A long-lived fake web target that boots after its services. */
function webTarget(over: Partial<DevTargetConfig> = {}): DevTargetConfig {
  return {
    name: "app",
    kind: "server",
    services: ["api"],
    command: `bun -e "setTimeout(()=>{},60000)"`,
    url: "http://localhost:{api.port}",
    ...over,
  };
}

describe("parseDevServices", () => {
  it("parses a valid service with every optional field", () => {
    const { services, errors } = parseDevServices({
      "dev.services": [
        {
          name: "api",
          command: "bun --watch src/server/index.ts",
          cwd: "server",
          port: "4100",
          autoPort: false,
          healthCheck: { url: "http://x/health" },
          env: { FOO: "bar" },
        },
      ],
    });
    expect(errors).toEqual([]);
    expect(services[0]).toMatchObject({
      name: "api",
      command: "bun --watch src/server/index.ts",
      cwd: "server",
      port: 4100,
      autoPort: false,
      healthCheck: { url: "http://x/health" },
      env: { FOO: "bar" },
    });
  });

  it("returns nothing when there is no dev.services section", () => {
    expect(parseDevServices({})).toEqual({ services: [], errors: [] });
  });

  it("rejects a missing name, a missing command, and duplicates", () => {
    expect(parseDevServices({ "dev.services": [{ command: "x" }] }).errors[0]).toContain(
      "missing a name",
    );
    expect(parseDevServices({ "dev.services": [{ name: "api" }] }).errors[0]).toContain(
      "a command is required",
    );
    const dup = parseDevServices({
      "dev.services": [
        { name: "api", command: "x" },
        { name: "api", command: "y" },
      ],
    });
    expect(dup.errors[0]).toContain('duplicate service name "api"');
    expect(dup.services).toHaveLength(1);
  });

  it("rejects an out-of-range port and a non-boolean autoPort", () => {
    expect(
      parseDevServices({ "dev.services": [{ name: "api", command: "x", port: "99999" }] })
        .errors[0],
    ).toContain("port must be a whole number between 1 and 65535");
    expect(
      parseDevServices({ "dev.services": [{ name: "api", command: "x", autoPort: "yes" }] })
        .errors[0],
    ).toContain("autoPort must be true or false");
  });

  it("parses healthCheck in the same three shapes a target's takes", () => {
    const obj = parseDevServices({
      "dev.services": [{ name: "api", command: "x", healthCheck: { url: "http://x/health" } }],
    });
    expect(obj.errors).toEqual([]);
    expect(obj.services[0].healthCheck).toEqual({ url: "http://x/health" });
    const inline = parseDevServices({
      "dev.services": [
        {
          name: "api",
          command: "x",
          healthCheck: '{ url = "http://localhost:{port}/api/health" }',
        },
      ],
    });
    expect(inline.errors).toEqual([]);
    // The flat TOML parser leaves the inline table as a string; the documented
    // `{ url = ... }` syntax must work through it.
    expect(inline.services[0].healthCheck).toEqual({
      url: "http://localhost:{port}/api/health",
    });
    const dotted = parseDevServices({
      "dev.services": [{ name: "api", command: "x", "healthCheck.file": "ready.txt" }],
    });
    expect(dotted.errors).toEqual([]);
    expect(dotted.services[0].healthCheck).toEqual({ file: "ready.txt" });
    expect(
      parseDevServices({ "dev.services": [{ name: "api", command: "x", healthCheck: {} }] })
        .errors[0],
    ).toContain("healthCheck needs a url or a file");
  });

  it("rejects auto-pick off without a port at CONFIG time (review round 1)", () => {
    const { errors } = parseDevServices({
      "dev.services": [
        { name: "api", command: "bun --watch src/server/index.ts", autoPort: false },
      ],
    });
    // The exact same message the live start would produce (dev.ts), now upfront.
    expect(errors[0]).toContain("auto-pick is off but no port is set");
  });

  it("parses env from an object, the inline-table string, or dotted env.KEY keys", () => {
    const obj = parseDevServices({
      "dev.services": [{ name: "api", command: "x", env: { FOO: "bar" } }],
    });
    expect(obj.services[0].env).toEqual({ FOO: "bar" });
    const inline = parseDevServices({
      "dev.services": [{ name: "api", command: "x", env: '{ FOO = "bar", BAZ = "qux" }' }],
    });
    expect(inline.errors).toEqual([]);
    expect(inline.services[0].env).toEqual({ FOO: "bar", BAZ: "qux" });
    const dotted = parseDevServices({
      "dev.services": [{ name: "api", command: "x", "env.FOO": "bar" }],
    });
    expect(dotted.errors).toEqual([]);
    expect(dotted.services[0].env).toEqual({ FOO: "bar" });
    expect(
      parseDevServices({ "dev.services": [{ name: "api", command: "x", env: "{ }" }] }).errors[0],
    ).toContain("env must be a table");
  });

  it.each([
    {
      name: "escaped quote",
      raw: String.raw`{ MESSAGE = "say \"hi\"" }`,
      expected: 'say "hi"',
    },
    {
      name: "escaped backslash",
      raw: String.raw`{ MESSAGE = "C:\\tmp" }`,
      expected: "C:\\tmp",
    },
    {
      name: "newline and tab escapes",
      raw: String.raw`{ MESSAGE = "line\n\t\rend" }`,
      expected: "line\n\t\rend",
    },
    {
      name: "unicode escape",
      raw: String.raw`{ MESSAGE = "\u263A" }`,
      expected: "☺",
    },
    {
      name: "single-quoted literal",
      raw: String.raw`{ MESSAGE = 'like this' }`,
      expected: "like this",
    },
    { name: "hash inside value", raw: String.raw`{ MESSAGE = "a#b" }`, expected: "a#b" },
    { name: "comma inside value", raw: String.raw`{ MESSAGE = "a,b" }`, expected: "a,b" },
    { name: "closing brace inside value", raw: String.raw`{ MESSAGE = "a}b" }`, expected: "a}b" },
    { name: "empty value", raw: String.raw`{ MESSAGE = "" }`, expected: "" },
    {
      name: "unterminated string",
      raw: String.raw`{ MESSAGE = "unfinished }`,
      error: 'unterminated string value for key "MESSAGE"',
    },
  ])("parses TOML env string: $name", ({ raw, expected, error }) => {
    const parsed = parseDevServices({
      "dev.services": [{ name: "api", command: "x", env: raw }],
    });
    if (error) {
      expect(parsed.errors).toEqual([`[dev.services] api: env ${error}`]);
      expect(parsed.services).toEqual([]);
      return;
    }
    expect(parsed.errors).toEqual([]);
    expect(parsed.services[0]?.env).toEqual({ MESSAGE: expected });
  });
});

describe("devTargetServiceErrors", () => {
  const targets = [
    {
      name: "web",
      kind: "server" as const,
      command: "x",
      url: "http://x",
      services: ["api", "api", "db"],
    },
    { name: "solo", kind: "server" as const, command: "x", url: "http://x", services: [] },
  ];

  it("rejects unknown and repeated service names", () => {
    const errors = devTargetServiceErrors(targets, [{ name: "api", command: "x" }]);
    expect(errors).toEqual([
      '[dev.targets] web: service "api" is listed more than once',
      '[dev.targets] web: references unknown service "db" — declare it as a [[dev.services]] block in repoos.toml',
    ]);
  });

  it("passes a clean reference list", () => {
    const clean = [
      {
        name: "web",
        kind: "server" as const,
        command: "x",
        url: "http://x",
        services: ["api", "db"],
      },
    ];
    expect(
      devTargetServiceErrors(clean, [
        { name: "api", command: "x" },
        { name: "db", command: "y" },
      ]),
    ).toEqual([]);
    // A target with no `services` list passes with or without declarations.
    expect(
      devTargetServiceErrors(
        [clean[0]!, { name: "solo", kind: "server", command: "x" }],
        [
          { name: "api", command: "x" },
          { name: "db", command: "y" },
        ],
      ),
    ).toEqual([]);
  });

  // #0843 review — two distinct names can normalize to the SAME placeholder
  // token; that is a config error, never a silent undocumented suffix.
  it("rejects two service names that normalize to the same token", () => {
    const colliding = [
      {
        name: "web",
        kind: "server" as const,
        command: "x",
        url: "http://x",
        services: ["api-v1", "api_v1"],
      },
    ];
    const errors = devTargetServiceErrors(colliding, [
      { name: "api-v1", command: "x" },
      { name: "api_v1", command: "y" },
    ]);
    expect(errors).toEqual([
      '[dev.targets] web: services "api-v1" and "api_v1" both map to the placeholder "{api_v1.port}" — rename one so each has a distinct token',
    ]);
    // A collision across two DIFFERENT targets' service lists is not an error:
    // each target's placeholders are scoped to the services it lists.
    const separateTargets = [
      { name: "a", kind: "server" as const, command: "x", url: "http://x", services: ["api-v1"] },
      { name: "b", kind: "server" as const, command: "x", url: "http://x", services: ["api_v1"] },
    ];
    expect(
      devTargetServiceErrors(separateTargets, [
        { name: "api-v1", command: "x" },
        { name: "api_v1", command: "y" },
      ]),
    ).toEqual([]);
  });
});

describe("loadConfig dev services wiring", () => {
  it.each([
    {
      label: "an unrelated malformed target does not hide an unknown service",
      targets: [
        "[[dev.targets]]",
        'name = "app"',
        'kind = "server"',
        'command = "bun run dev"',
        'url = "http://localhost:5173"',
        'services = ["missing"]',
        "",
        "[[dev.targets]]",
        'name = "broken"',
        'kind = "invalid"',
        'command = "ignored"',
      ],
      services: [],
      expected: [
        '[dev.targets] broken: kind must be "server", "artifact" or "process" (got "invalid")',
        '[dev.targets] app: references unknown service "missing" — declare it as a [[dev.services]] block in repoos.toml',
      ],
    },
    {
      label: "a malformed service row does not hide an unknown service",
      targets: [
        "[[dev.targets]]",
        'name = "app"',
        'kind = "server"',
        'command = "bun run dev"',
        'url = "http://localhost:5173"',
        'services = ["missing"]',
      ],
      services: ["[[dev.services]]", 'name = "broken"'],
      expected: [
        "[dev.services] broken: a command is required",
        '[dev.targets] app: references unknown service "missing" — declare it as a [[dev.services]] block in repoos.toml',
      ],
    },
    {
      label: "valid target and service rows have no errors",
      targets: [
        "[[dev.targets]]",
        'name = "app"',
        'kind = "server"',
        'command = "bun run dev"',
        'url = "http://localhost:5173"',
        'services = ["api"]',
      ],
      services: ["[[dev.services]]", 'name = "api"', 'command = "bun run api"'],
      expected: [],
    },
  ])("validates parsed rows independently: $label", ({ targets, services, expected }) => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svc-independent-errors-"));
    try {
      writeFileSync(join(dir, "repoos.toml"), [...services, "", ...targets, ""].join("\n"));
      const cfg = loadConfig(dir);
      for (const message of expected) expect(cfg.devTargetErrors).toContain(message);
      if (expected.length === 0) expect(cfg.devTargetErrors).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("parses [[dev.services]] and a referencing target", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svc-"));
    try {
      writeFileSync(
        join(dir, "repoos.toml"),
        [
          "[[dev.services]]",
          'name = "api"',
          'command = "bun --watch src/server/index.ts"',
          'healthCheck = { url = "http://localhost:{port}/api/health" }',
          "",
          "[[dev.targets]]",
          'name = "app"',
          'kind = "server"',
          'services = ["api"]',
          'command = "bun run dev -- --port {port} --api-port {api.port}"',
          'url = "http://localhost:{port}"',
          "",
        ].join("\n"),
      );
      const cfg = loadConfig(dir);
      expect(cfg.dev?.services).toHaveLength(1);
      expect(cfg.dev?.services?.[0]).toMatchObject({ name: "api" });
      expect(cfg.dev?.targets?.[0].services).toEqual(["api"]);
      expect(cfg.devTargetErrors).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records an unknown service reference as a config error", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcerr-"));
    try {
      writeFileSync(
        join(dir, "repoos.toml"),
        [
          "[[dev.services]]",
          'name = "api"',
          'command = "bun --watch src/server/index.ts"',
          "",
          "[[dev.targets]]",
          'name = "app"',
          'kind = "server"',
          'services = ["api", "nope"]',
          'command = "bun run dev"',
          'url = "http://localhost:5173"',
          "",
        ].join("\n"),
      );
      const cfg = loadConfig(dir);
      // Both targets parse, and the unknown reference is surfaced loudly.
      expect(cfg.dev?.targets).toHaveLength(1);
      expect(cfg.devTargetErrors).toEqual([
        '[dev.targets] app: references unknown service "nope" — declare it as a [[dev.services]] block in repoos.toml',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DevTargetManager with services (#0843)", () => {
  const stackLifecycleCases = [
    ...(["target", "service-a", "service-b"] as const).flatMap((member) =>
      (["starting", "after-ready"] as const).flatMap((phase) =>
        (["crash", "stop", "restart"] as const).map((action) => ({
          member,
          phase,
          action,
        })),
      ),
    ),
  ];
  for (const { member, phase, action } of stackLifecycleCases) {
    itSlow(`tears down the whole stack when ${member} ${action}s during ${phase}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "repoos-dev-stack-matrix-"));
      const readyFile = join(dir, "target-ready");
      if (phase === "after-ready") writeFileSync(readyFile, "ready");
      const service = (name: string): DevServiceConfig => ({
        name,
        command: `bun -e "setTimeout(()=>{},60000)"`,
      });
      const mgr = new DevTargetManager(
        baseConfig(
          {
            services: [service("service-a"), service("service-b")],
            targets: [
              webTarget({
                services: ["service-a", "service-b"],
                command: `bun -e "setTimeout(()=>{},60000)"`,
                url: undefined,
                healthCheck: { file: "target-ready" },
              }),
            ],
          },
          dir,
        ),
      );
      let start: Promise<unknown> | undefined;
      try {
        start = mgr.start("app");
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          const view = mgr.get("app");
          const allPidsPresent =
            typeof view?.pid === "number" &&
            view.services?.length === 2 &&
            view.services.every((row) => typeof row.pid === "number");
          if (allPidsPresent && (phase === "after-ready" ? view?.status === "running" : true))
            break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const before = mgr.get("app");
        const pids = [before?.pid, ...(before?.services ?? []).map((row) => row.pid)].filter(
          (pid): pid is number => typeof pid === "number",
        );
        expect(pids).toHaveLength(3);

        if (action === "crash") {
          const pid =
            member === "target"
              ? before?.pid
              : before?.services?.[member === "service-a" ? 0 : 1]?.pid;
          expect(typeof pid).toBe("number");
          try {
            process.kill(process.platform === "win32" ? pid! : -pid!, "SIGKILL");
          } catch {
            // The startup readiness loop may have observed an early exit.
          }
        } else if (action === "stop") {
          await mgr.stop("app");
        } else {
          writeFileSync(readyFile, "ready");
          const restarted = await mgr.restart("app");
          expect(restarted.ok).toBe(true);
          const restartedPids = [
            restarted.target?.pid,
            ...(restarted.target?.services ?? []).map((row) => row.pid),
          ].filter((pid): pid is number => typeof pid === "number");
          expect(restartedPids).toHaveLength(3);
          for (const pid of restartedPids) expect(await waitForDead(pid)).toBe(true);
        }
        await start.catch(() => {});
        const deadlineAfter = Date.now() + 6000;
        while (Date.now() < deadlineAfter && pids.some(isAlive)) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        for (const pid of pids) expect(await waitForDead(pid)).toBe(true);
        const final = mgr.get("app");
        expect(final?.pid).toBeUndefined();
        expect(final?.services?.every((row) => row.pid === undefined)).toBe(true);
        expect(final?.status).toBe(action === "crash" ? "failed" : "stopped");
      } finally {
        await mgr.stopAll();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }

  const reloadStopCases = [
    { kind: "server" as const, services: false, action: "stop" as const },
    { kind: "server" as const, services: false, action: "restart" as const },
    { kind: "server" as const, services: true, action: "stop" as const },
    { kind: "server" as const, services: true, action: "restart" as const },
    { kind: "process" as const, services: false, action: "stop" as const },
    { kind: "process" as const, services: false, action: "restart" as const },
    { kind: "process" as const, services: true, action: "stop" as const },
    { kind: "process" as const, services: true, action: "restart" as const },
  ];
  for (const { kind, services, action } of reloadStopCases) {
    itSlow(
      `${action} reaps adopted ${kind} target and companion processes (services=${services})`,
      async () => {
        const dir = mkdtempSync(join(tmpdir(), "repoos-dev-reload-stop-"));
        const defs = services ? [apiService({ healthCheck: undefined })] : [];
        const childPidFile = join(dir, "child.pid");
        const t = webTarget({
          kind,
          url: undefined,
          services: services ? ["api"] : undefined,
          command: `bun -e "const fs=require('node:fs');const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>{},60000)']);fs.writeFileSync('${childPidFile}',String(c.pid));setTimeout(()=>{},60000)"`,
        });
        const cfg = baseConfig({ services: defs, targets: [t] }, dir);
        const original = new DevTargetManager(cfg);
        let reloaded: DevTargetManager | undefined;
        try {
          expect((await original.start("app")).ok).toBe(true);
          const oldTargetPid = original.get("app")?.pid;
          const oldServicePid = original.get("app")?.services?.[0]?.pid;
          const childDeadline = Date.now() + 5000;
          while (Date.now() < childDeadline && !existsSync(childPidFile)) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          const childPid = Number(readFileSync(childPidFile, "utf8"));
          expect(typeof oldTargetPid).toBe("number");
          if (services) expect(typeof oldServicePid).toBe("number");

          // Model the replacement server adopting the persisted target and service
          // PIDs, with no ChildProcess handles in the new manager.
          reloaded = new DevTargetManager(cfg);
          reloaded.cleanupOrphans(true);
          expect(reloaded.get("app")?.status).toBe("running");
          const result = await reloaded[action]("app");
          expect(result.ok).toBe(true);

          expect(await waitForDead(oldTargetPid!)).toBe(true);
          expect(await waitForDead(childPid)).toBe(true);
          if (oldServicePid) expect(await waitForDead(oldServicePid)).toBe(true);
          if (action === "stop") {
            expect(reloaded.get("app")?.status).toBe("stopped");
            expect(reloaded.get("app")?.pid).toBeUndefined();
          } else {
            const newTargetPid = reloaded.get("app")?.pid;
            expect(typeof newTargetPid).toBe("number");
            expect(newTargetPid).not.toBe(oldTargetPid);
            if (services) {
              expect(reloaded.get("app")?.services?.every((s) => s.pid !== oldServicePid)).toBe(
                true,
              );
            }
            await reloaded.stop("app");
            expect(await waitForDead(newTargetPid!)).toBe(true);
          }
        } finally {
          await reloaded?.stopAll();
          await original.stopAll();
          rmSync(dir, { recursive: true, force: true });
        }
      },
    );
  }

  it("boots the service first, then the target, and exposes both states", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcorder-"));
    // The target command only records success if the API answers its health
    // check before the target's own command runs — the boot-order proof.
    const proof = join(dir, "boot-order.json");
    const ordered = webTarget({
      command: [
        "bun -e \"const h=require('node:http');const f=require('node:fs');",
        `h.get('http://127.0.0.1:' + process.env.REPOOS_DEV_API_PORT + '/api/health', (r) => f.writeFileSync('${proof}', JSON.stringify({first:'api', status:r.statusCode})));`,
        'setTimeout(()=>{},60000)"',
      ].join(""),
    });
    const mgr = new DevTargetManager(
      baseConfig({ services: [apiService()], targets: [ordered] }, dir),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(true);
      const view = mgr.get("app");
      expect(view?.status).toBe("running");
      const svc = view?.services?.[0];
      expect(svc).toMatchObject({ name: "api", status: "running" });
      expect(typeof svc?.port).toBe("number");
      expect(typeof svc?.pid).toBe("number");
      // `{api.port}` in the target's url resolves to the service's real port.
      expect(view?.url).toBe(`http://localhost:${svc?.port}`);
      // The service genuinely answered before the target command ran: poll for
      // the proof file the target command writes after its own GET succeeds.
      const deadline = Date.now() + 5000;
      let proofData: string | null = null;
      while (Date.now() < deadline) {
        try {
          proofData = readFileSync(proof, "utf8");
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      expect(JSON.parse(proofData ?? "{}")).toEqual({ first: "api", status: 200 });
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails the target when a service never becomes ready, naming the service", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcfail-"));
    const mgr = new DevTargetManager(
      baseConfig({ services: [apiService({ command: "exit 3" })], targets: [webTarget()] }, dir),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      expect(result.error).toContain('service "api"');
      const view = mgr.get("app");
      expect(view?.status).toBe("failed");
      expect(view?.error).toContain('service "api"');
      // The service records its own failed state — its exit ran before the
      // readiness gate noticed — so nothing is left recorded as live.
      expect(view?.services?.[0].status).toBe("failed");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a target referencing a service no [[dev.services]] block declares", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcmis-"));
    const mgr = new DevTargetManager(baseConfig({ targets: [webTarget()] }, dir));
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      expect(result.error).toContain('unknown dev service(s) "api"');
      expect(mgr.get("app")?.status).toBe("failed");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stops the services with the target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcstop-"));
    const mgr = new DevTargetManager(
      baseConfig({ services: [apiService()], targets: [webTarget()] }, dir),
    );
    try {
      await mgr.start("app");
      const svcPid = mgr.get("app")?.services?.[0].pid;
      expect(typeof svcPid).toBe("number");
      const targetPid = mgr.get("app")?.pid;
      const stop = await mgr.stop("app");
      expect(stop.ok).toBe(true);
      const view = mgr.get("app");
      expect(view?.status).toBe("stopped");
      expect(view?.services?.[0].status).toBe("stopped");
      // Both processes are actually gone.
      expect(await waitForDead(targetPid!)).toBe(true);
      expect(await waitForDead(svcPid!)).toBe(true);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("restarts the target and its services together", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcrestart-"));
    const mgr = new DevTargetManager(
      baseConfig({ services: [apiService()], targets: [webTarget()] }, dir),
    );
    try {
      await mgr.start("app");
      const firstServicePid = mgr.get("app")?.services?.[0].pid;
      const restart = await mgr.restart("app");
      expect(restart.ok).toBe(true);
      const view = mgr.get("app");
      expect(view?.status).toBe("running");
      expect(view?.services?.[0].status).toBe("running");
      expect(view?.services?.[0].pid).not.toBe(firstServicePid);
      // The first service process is gone.
      expect(await waitForDead(firstServicePid!)).toBe(true);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps the service's own {port} and PORT env consistent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcenv-"));
    const memo = join(dir, "env.json");
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              command: `bun -e "const f=require('node:fs');f.writeFileSync('${memo}', JSON.stringify({port:Number(process.env.PORT), foo:process.env.FOO}));setTimeout(()=>{},60000)"`,
              env: { FOO: "bar" },
              // No HTTP services in this fixture: ready = alive-after-settle.
              healthCheck: undefined,
            }),
          ],
          // A process target is running as soon as it is alive — no probe, so
          // the test doesn't wait on a URL nothing serves in this fixture.
          targets: [webTarget({ kind: "process", url: undefined })],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(true);
      const svc = mgr.get("app")?.services?.[0];
      const recorded = JSON.parse(readFileSync(memo, "utf8"));
      // PORT (and therefore `{port}`) is the same reserved port the state carries.
      expect(recorded).toEqual({ port: svc?.port, foo: "bar" });
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks the target failed, naming the service, when a running service crashes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svccrash-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              command: 'bun -e "setTimeout(()=>process.exit(1),1200)"',
              healthCheck: undefined,
            }),
          ],
          // A process target is "running" as soon as it is alive — no probe,
          // so the timeline is deterministic: service alive at the 500ms
          // settle, target running at ~1s, service exits at 1.2s and the
          // crash must degrade the target naming the service.
          targets: [webTarget({ kind: "process", url: undefined })],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(true);
      // Wait for the service to exit and the crash to degrade the target.
      const deadline = Date.now() + 6000;
      let seen: { status?: string; error?: string } = {};
      while (Date.now() < deadline) {
        seen = { status: mgr.get("app")?.status, error: mgr.get("app")?.error };
        if (seen.status === "failed") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(seen.status).toBe("failed");
      expect(seen.error).toContain('service "api"');
      expect(mgr.get("app")?.services?.[0].status).toBe("failed");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("pinned service port: used when free, refused when taken, named in the error", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcpin-"));
    const free = await freePort();
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [apiService({ autoPort: false, port: free })],
          targets: [webTarget()],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(true);
      expect(mgr.get("app")?.services?.[0].port).toBe(free);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
    // Now hold the same port and expect a refusal that names the service.
    const held = await holdPort();
    try {
      const takenPort = held.port;
      const mgr2 = new DevTargetManager(
        baseConfig(
          {
            services: [apiService({ autoPort: false, port: takenPort })],
            targets: [webTarget()],
          },
          dir,
        ),
      );
      try {
        const result = await mgr2.start("app");
        expect(result.ok).toBe(false);
        expect(result.error).toContain(`service "api" port ${takenPort} is already in use`);
      } finally {
        await mgr2.stopAll();
      }
    } finally {
      await held.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Review round 1 — a start that fails AT THE TARGET tears the companion
  // services down with it: the target owns their lifecycle, so a half-booted
  // stack never outlives the failed start.
  it("stops already-booted services when the target's readiness check fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svclaunch-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [apiService()],
          // A process target whose command exits immediately: readiness
          // (alive-settle) fails, the target fails, and the services — already
          // running — are stopped with the failed start.
          targets: [webTarget({ kind: "process", url: undefined, command: "exit 7" })],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      expect(mgr.get("app")?.status).toBe("failed");
      const view = mgr.get("app");
      expect(view?.status).toBe("failed");
      expect(view?.services?.[0].status).toBe("stopped");
      const svcPid = view?.services?.[0].pid;
      // The service process is actually gone.
      expect(await waitForDead(svcPid!)).toBe(true);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Review round 1 — after a reload handover an adopted service has no
  // process handle; the same lazy PID-liveness check that guards adopted
  // targets guards their services, so a crash degrades the target visibly.
  it("marks an adopted service's crash after reload on the target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcreload-"));
    const mgr1 = new DevTargetManager(
      baseConfig(
        {
          services: [apiService()],
          targets: [webTarget()],
        },
        dir,
      ),
    );
    try {
      const started = await mgr1.start("app");
      expect(started.ok).toBe(true);
      const svcPid = mgr1.get("app")?.services?.[0].pid;
      const targetPid = mgr1.get("app")?.pid;
      expect(typeof svcPid).toBe("number");
      expect(typeof targetPid).toBe("number");
      // The registration file persists every state change; a reload handover
      // is a NEW manager over the same root re-adopting the recorded PIDs.
      const mgr2 = new DevTargetManager(
        baseConfig({ services: [apiService()], targets: [webTarget()] }, dir),
      );
      mgr2.cleanupOrphans(/* isReload */ true);
      expect(mgr2.get("app")?.status).toBe("running");
      expect(mgr2.get("app")?.services?.[0].status).toBe("running");

      // The service now crashes with no live handle watching it.
      let verifiedDead = await waitForDead(svcPid!);
      if (!verifiedDead) process.kill(svcPid!, "SIGKILL");
      verifiedDead = await waitForDead(svcPid!);
      expect(verifiedDead).toBe(true);

      // The next lazy view discovers the death: the service is failed, and
      // the target is degraded naming it.
      const deadline = Date.now() + 5000;
      let status: string | undefined;
      let error: string | undefined;
      while (Date.now() < deadline) {
        const view = mgr2.get("app");
        status = view?.status;
        error = view?.error;
        if (status === "failed") break;
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(status).toBe("failed");
      expect(error).toContain('service "api"');
      expect(mgr2.get("app")?.services?.[0].status).toBe("failed");

      // The failed state survives a server reload. Reconciliation must reap
      // the still-live target instead of skipping it because it is no longer
      // marked running; otherwise restart can launch a duplicate stack.
      const mgr3 = new DevTargetManager(
        baseConfig({ services: [apiService()], targets: [webTarget()] }, dir),
      );
      mgr3.cleanupOrphans(/* isReload */ true);
      expect(await waitForDead(targetPid!)).toBe(true);
      await mgr2.stopAll();
    } finally {
      await mgr1.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Review round 2 — a service can exit AFTER its readiness gate passed but
  // BEFORE the target finished starting: the exit handler degrades the target,
  // and the start must not plow on (or come back as success with a dead API).
  it("reports a service exit that lands between its gate and the target's readiness", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcrace-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              // Healthy at its 500ms alive-settle; gone shortly after, while
              // the target's own gate is still polling a URL nothing serves.
              command: 'bun -e "setTimeout(()=>process.exit(3),1000)"',
              healthCheck: undefined,
            }),
          ],
          // A server target with a `{own-port}` url: its readiness poll runs
          // long after the service has exited, so the degraded mark set by the
          // service's exit handler would otherwise be wiped by the target's
          // own `starting` write or answered with a late generic timeout.
          targets: [
            webTarget({
              url: "http://localhost:{port}",
              command: 'bun -e "setTimeout(()=>{},60000)"',
            }),
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      // The reason is the service's crash, surfaced promptly (well inside the
      // target's 30s readiness window), not a generic "did not answer".
      expect(result.error).toContain('service "api"');
      expect(mgr.get("app")?.error).toContain('service "api"');
      expect(mgr.get("app")?.services?.[0].status).toBe("failed");
      // The start did not churn on for the whole readiness timeout.
      expect(mgr.get("app")?.services?.[0].pid).toBeDefined();
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  itSlow(
    "stops the full stack when a service exits during a successful target health probe",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcproberace-"));
      const proof = join(dir, "target-answered-health.json");
      const mgr = new DevTargetManager(
        baseConfig(
          {
            services: [
              apiService({
                // The API answers its startup health check, then exits after
                // the target begins its health request but before its response.
                command: `bun -e "const h=require('node:http');const f=require('node:fs');h.createServer((q,s)=>s.end('ok')).listen(Number(process.env.PORT),'127.0.0.1');setInterval(()=>{if(f.existsSync('${proof}'))process.exit(3)},10)"`,
              }),
            ],
            targets: [
              webTarget({
                url: "http://127.0.0.1:{port}/health",
                command: `bun -e "const h=require('node:http');const f=require('node:fs');h.createServer((q,s)=>{f.writeFileSync('${proof}','answered');setTimeout(()=>s.end('ok'),500)}).listen({port},'127.0.0.1');setTimeout(()=>{},60000)"`,
              }),
            ],
          },
          dir,
        ),
      );
      try {
        const result = await mgr.start("app");
        expect(existsSync(proof)).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('service "api"');
        const view = mgr.get("app");
        expect(view?.status).toBe("failed");
        expect(view?.services?.[0].status).toBe("failed");
        expect(typeof view?.pid).toBe("number");
        expect(typeof view?.services?.[0].pid).toBe("number");
        expect(await waitForDead(view!.pid!)).toBe(true);
        expect(await waitForDead(view!.services![0]!.pid!)).toBe(true);
      } finally {
        await mgr.stopAll();
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );

  // Review round 3 — when a sibling's exit aborts a later service's readiness
  // gate, the target's failure reason must stay the DEAD sibling's (it names
  // the service that died), not the gate's generic abort notice.
  it("keeps the dead sibling's name in the summary when its exit aborts a later service's gate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcsibling-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              // Healthy within its first poll, gone shortly after — while the
              // worker's gate is still polling a URL nothing serves.
              command:
                "bun -e \"const h=require('node:http');h.createServer((q,s)=>s.end('ok')).listen(Number(process.env.PORT),'127.0.0.1');setTimeout(()=>process.exit(3),800)\"",
            }),
            {
              name: "worker",
              command: 'bun -e "setTimeout(()=>{},60000)"',
              healthCheck: { url: "http://localhost:{port}/never" },
            },
          ],
          targets: [webTarget({ services: ["api", "worker"] })],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      // The reason names the service that died, with its exit code — not the
      // worker whose gate merely noticed.
      expect(result.error).toContain('service "api"');
      expect(result.error).toContain("exited with code 3");
      expect(result.error).not.toContain('service "worker"');
      const view = mgr.get("app");
      expect(view?.status).toBe("failed");
      expect(view?.error).toContain('service "api"');
      expect(view?.services?.find((s) => s.name === "api")?.status).toBe("failed");
      // The aborted worker did not keep running: a failed start tears every
      // companion down, whatever already-booted.
      expect(
        await waitForDead(mgr.get("app")?.services?.find((s) => s.name === "worker")?.pid!),
      ).toBe(true);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Review round 2 — on reload, a service whose target died still gets reaped,
  // so a companion process cannot outlive the stack it belongs to; and a
  // service already dead at adoption degrades the target NOW, not later.
  it("reaps a dead target's live service on reload, and reports a dead service at adoption", async () => {
    // Case A — dead target, live service: on reload the service is reaped.
    const dirA = mkdtempSync(join(tmpdir(), "repoos-dev-svcreap-"));
    const mgrA = new DevTargetManager(
      baseConfig({ services: [apiService()], targets: [webTarget()] }, dirA),
    );
    try {
      const started = await mgrA.start("app");
      expect(started.ok).toBe(true);
      const targetPid = mgrA.get("app")?.pid!;
      const svcPid = mgrA.get("app")?.services?.[0].pid!;
      expect(typeof targetPid).toBe("number");
      expect(typeof svcPid).toBe("number");

      process.kill(targetPid, "SIGKILL");
      expect(await waitForDead(targetPid)).toBe(true);
      const reaper = new DevTargetManager(
        baseConfig({ services: [apiService()], targets: [webTarget()] }, dirA),
      );
      reaper.cleanupOrphans(/* isReload */ true);
      // The companion process did not outlive its dead target.
      expect(await waitForDead(svcPid)).toBe(true);
      // Its row no longer claims "running" under the dead target — the reap
      // settles the state, not just the process (#0843 review round 3). The
      // target itself reads "failed" (the live first manager watched it die)
      // or "stopped" (the exit event had not landed yet); never "running".
      const reapView = reaper.get("app");
      expect(reapView?.status).not.toBe("running");
      expect(reapView?.services?.[0].status).toBe("stopped");
      await reaper.stopAll();
    } finally {
      await mgrA.stopAll();
      rmSync(dirA, { recursive: true, force: true });
    }

    // Case B — live target, dead service: adoption ITSELF marks the service
    // failed and degrades the target naming it; no later poll is needed.
    const dirB = mkdtempSync(join(tmpdir(), "repoos-dev-svcreadb-"));
    const mgrB = new DevTargetManager(
      baseConfig({ services: [apiService()], targets: [webTarget()] }, dirB),
    );
    try {
      const started = await mgrB.start("app");
      expect(started.ok).toBe(true);
      const svcPid = mgrB.get("app")?.services?.[0].pid!;
      process.kill(svcPid, "SIGKILL");
      expect(await waitForDead(svcPid)).toBe(true);

      const adopted = new DevTargetManager(
        baseConfig({ services: [apiService()], targets: [webTarget()] }, dirB),
      );
      adopted.cleanupOrphans(/* isReload */ true);
      const view = adopted.get("app");
      expect(view?.status).toBe("failed");
      expect(view?.error).toContain('service "api"');
      expect(view?.services?.[0].status).toBe("failed");
      await adopted.stopAll();
    } finally {
      await mgrB.stopAll();
      rmSync(dirB, { recursive: true, force: true });
    }
  });

  // #0843 review — a target's own crash must not leave its companion services
  // running: they would otherwise hold ports (and resources) until a later
  // stop or a server shutdown.
  itSlow("stops the companion services when the target itself crashes", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svctargetcrash-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [apiService({ healthCheck: undefined })],
          // A process target is running as soon as it is alive, then crashes
          // well after the start has settled, so this exercises the RUNNING
          // exit handler, not the readiness gate.
          targets: [
            webTarget({
              kind: "process",
              url: undefined,
              command: 'bun -e "setTimeout(()=>process.exit(1),3000)"',
            }),
          ],
        },
        dir,
      ),
    );
    try {
      const started = await mgr.start("app");
      expect(started.ok).toBe(true);
      expect(mgr.get("app")?.status).toBe("running");
      const svcPid = mgr.get("app")?.services?.[0].pid;
      expect(typeof svcPid).toBe("number");

      // Wait for the target to crash.
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline && mgr.get("app")?.status !== "failed") {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(mgr.get("app")?.status).toBe("failed");
      // The companion process is genuinely gone and its row settles to
      // stopped once the asynchronous teardown completes.
      expect(await waitForDead(svcPid!)).toBe(true);
      const settleDeadline = Date.now() + 4000;
      while (Date.now() < settleDeadline && mgr.get("app")?.services?.[0].status !== "stopped") {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(mgr.get("app")?.services?.[0].status).toBe("stopped");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — a Stop that lands while an in-flight start is still booting
  // must cancel it: the start may not launch the stack after Stop returned.
  itSlow("cancels an in-flight start when stopped before it launches anything", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcstoprace-"));
    const targetMarker = join(dir, "target-launched.txt");
    const serviceMarker = join(dir, "service-launched.txt");
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              command: `bun -e "require('node:fs').writeFileSync('${serviceMarker}','yes');setTimeout(()=>{},60000)"`,
              healthCheck: undefined,
            }),
          ],
          targets: [
            webTarget({
              kind: "process",
              url: undefined,
              command: `bun -e "require('node:fs').writeFileSync('${targetMarker}','yes');setTimeout(()=>{},60000)"`,
            }),
          ],
        },
        dir,
      ),
    );
    try {
      // Start and Stop in the same tick: the stop lands while `doStart` is
      // still at its first await, before any service port is even reserved.
      const startPromise = mgr.start("app");
      const stopResult = await mgr.stop("app");
      const startResult = await startPromise;
      expect(stopResult.ok).toBe(true);
      expect(startResult.ok).toBe(true);
      const view = mgr.get("app");
      expect(view?.status).toBe("stopped");
      expect(view?.services?.[0].status).toBe("stopped");
      // Nothing was ever launched: neither marker exists, and no PID is held.
      expect(existsSync(serviceMarker)).toBe(false);
      expect(existsSync(targetMarker)).toBe(false);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — two services that normalize to the same placeholder token
  // must fail the start loudly rather than resolve `{api_v1.port}` to whichever
  // happened to boot last.
  itSlow("refuses to start when two services collide on the placeholder token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svctokenclash-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            {
              name: "api-v1",
              command: 'bun -e "setTimeout(()=>{},60000)"',
              healthCheck: undefined,
            },
            {
              name: "api_v1",
              command: 'bun -e "setTimeout(()=>{},60000)"',
              healthCheck: undefined,
            },
          ],
          targets: [webTarget({ services: ["api-v1", "api_v1"] })],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("both map to the placeholder");
      expect(result.error).toContain("{api_v1.port}");
      expect(mgr.get("app")?.status).toBe("failed");
      expect((mgr.get("app")?.services ?? []).every((s) => s.status === "stopped")).toBe(true);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — a health file that already exists from a previous run must
  // not satisfy the service gate. Readiness requires a file NEWER than the
  // pre-spawn snapshot, so the target cannot start against an unready service.
  itSlow("does not accept a stale health file left by a previous run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcstale-"));
    const readiness = join(dir, "ready.txt");
    const memo = join(dir, "what-target-saw.txt");
    // A marker from an earlier run, older than this start.
    writeFileSync(readiness, "stale");
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            {
              name: "api",
              command: `bun -e "const f=require('node:fs');setTimeout(()=>f.writeFileSync('${readiness}','fresh'),800);setTimeout(()=>{},60000)"`,
              healthCheck: { file: "ready.txt" },
            },
          ],
          targets: [
            // The target records what the readiness file held when it finally
            // ran: "stale" means the gate raced ahead of the fresh marker.
            webTarget({
              kind: "process",
              url: undefined,
              command: `bun -e "const f=require('node:fs');f.writeFileSync('${memo}', f.readFileSync('${readiness}','utf8'));setTimeout(()=>{},60000)"`,
            }),
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(true);
      // Wait for the target process to run and record what it saw; bun's own
      // startup can lag the readiness settle under load.
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && !existsSync(memo)) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(readFileSync(memo, "utf8")).toBe("fresh");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — a Start arriving while Stop is terminating the target must
  // wait, not claim a new generation and launch mid-stop; Stop's outcome is
  // settled before the Start runs.
  itSlow("serializes a Start that arrives while Stop is still terminating", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-stopstart-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          targets: [
            webTarget({
              kind: "process",
              url: undefined,
              services: undefined,
              command: 'bun -e "setTimeout(()=>{},60000)"',
            }),
          ],
        },
        dir,
      ),
    );
    try {
      const started = await mgr.start("app");
      expect(started.ok).toBe(true);
      const firstPid = mgr.get("app")?.pid;
      expect(typeof firstPid).toBe("number");

      const stopPromise = mgr.stop("app");
      // Let stop reach its SIGTERM grace wait, then race a Start in.
      await new Promise((r) => setTimeout(r, 100));
      const startPromise = mgr.start("app");

      const stopResult = await stopPromise;
      // Stop's result reflects a stopped target — the racing Start waited.
      expect(stopResult.ok).toBe(true);
      expect(stopResult.target?.status).toBe("stopped");

      const startResult = await startPromise;
      expect(startResult.ok).toBe(true);
      const view = mgr.get("app");
      expect(view?.status).toBe("running");
      expect(view?.pid).not.toBe(firstPid);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — a service crash during an artifact build must not be erased
  // by the build's successful exit: the stack is still failed.
  itSlow("reports an artifact target failed when a service crashed during the build", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-artifactcrash-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              // Alive at its 500ms settle, then crashes while the artifact runs.
              command: 'bun -e "setTimeout(()=>process.exit(1),1200)"',
              healthCheck: undefined,
            }),
          ],
          targets: [
            {
              name: "app",
              kind: "artifact",
              services: ["api"],
              // Exits 0 well AFTER the service crash above.
              command: 'bun -e "setTimeout(()=>{},2500)"',
              artifactPath: "dist/out.txt",
            },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      expect(result.error).toContain('service "api"');
      const view = mgr.get("app");
      expect(view?.status).toBe("failed");
      expect(view?.services?.[0].status).toBe("failed");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  itSlow("stops companion services when an artifact build succeeds", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-artifact-service-stop-"));
    const servicePidFile = join(dir, "service.pid");
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [
            apiService({
              command: `bun -e "const f=require('node:fs');f.writeFileSync('${servicePidFile}',String(process.pid));setTimeout(()=>{},60000)"`,
              healthCheck: { file: "service.pid" },
            }),
          ],
          targets: [
            {
              name: "build",
              kind: "artifact",
              services: ["api"],
              command: "true",
              artifactPath: "dist/out.txt",
            },
          ],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("build");
      const servicePid = Number(readFileSync(servicePidFile, "utf8"));
      expect(result.ok).toBe(true);
      expect(typeof servicePid).toBe("number");
      expect(await waitForDead(servicePid!)).toBe(true);
      expect(mgr.get("build")?.services?.[0]).toMatchObject({ status: "stopped" });
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — a service that fails before it can spawn (port reservation,
  // cwd, launch) must surface as a failed sub-row with its reason, not as an
  // unexplained "stopped".
  itSlow("records a service whose port reservation failed as failed, with the reason", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcportrow-"));
    const held = await holdPort();
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [apiService({ autoPort: false, port: held.port })],
          targets: [webTarget()],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      const svc = mgr.get("app")?.services?.[0];
      expect(svc?.status).toBe("failed");
      expect(svc?.error).toContain(`service "api" port ${held.port} is already in use`);
      expect(mgr.get("app")?.status).toBe("failed");
    } finally {
      await mgr.stopAll();
      await held.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  itSlow("records a service with an escaping cwd as failed, with the reason", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svccwd-"));
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [apiService({ cwd: "../outside", healthCheck: undefined })],
          targets: [webTarget()],
        },
        dir,
      ),
    );
    try {
      const result = await mgr.start("app");
      expect(result.ok).toBe(false);
      const svc = mgr.get("app")?.services?.[0];
      expect(svc?.status).toBe("failed");
      expect(svc?.error).toContain("escapes the project root");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // #0843 review — the port-conflict Stop action must stop the WHOLE stack that
  // owns the port. A listener held by a companion service resolves to its
  // target, and stopping it tears the target and its services down.
  itSlow("stop-holder stops the target stack that owns a service-held port", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-stopholder-"));
    const heldPort = await freePort();
    // Seed a failed `web` whose port clash names `heldPort`.
    mkdirSync(join(dir, ".repoos"), { recursive: true });
    writeFileSync(
      join(dir, ".repoos", "dev-targets.json"),
      JSON.stringify({
        mainPid: 999999,
        targets: {
          web: {
            name: "web",
            status: "failed",
            error: "process exited with code 1",
            log: [`Error: listen EADDRINUSE: address already in use :::${heldPort}`],
          },
        },
      }),
    );
    const mgr = new DevTargetManager(
      baseConfig(
        {
          services: [apiService({ autoPort: false, port: heldPort, healthCheck: undefined })],
          targets: [
            webTarget({
              name: "holder",
              kind: "process",
              url: undefined,
              command: 'bun -e "setTimeout(()=>{},60000)"',
            }),
            webTarget({
              name: "web",
              kind: "process",
              url: undefined,
              services: undefined,
              command: 'bun -e "setTimeout(()=>{},60000)"',
            }),
          ],
        },
        dir,
      ),
    );
    try {
      const started = await mgr.start("holder");
      expect(started.ok).toBe(true);
      const targetPid = mgr.get("holder")?.pid;
      const svcPid = mgr.get("holder")?.services?.[0].pid;
      expect(typeof targetPid).toBe("number");
      expect(typeof svcPid).toBe("number");
      // Resolve the holder to the SERVICE's PID without depending on lsof/ss:
      // the ownership mapping (service PID -> target) is what is under test.
      (
        mgr as unknown as {
          lookupPortHolder: (port: number) => Promise<{ pid: number; command: string } | null>;
        }
      ).lookupPortHolder = async () => ({ pid: svcPid!, command: "api" });

      const detailed = await mgr.getDetailed("web");
      expect(detailed?.failure?.canStopHolder).toBe(true);
      expect(detailed?.failure?.holder?.target).toBe("holder");
      expect(detailed?.failure?.holder?.pid).toBe(svcPid);

      const stopped = await mgr.stopHolder("web");
      expect(stopped.ok).toBe(true);
      expect(mgr.get("holder")?.status).toBe("stopped");
      expect(mgr.get("holder")?.services?.[0].status).toBe("stopped");
      expect(await waitForDead(targetPid!)).toBe(true);
      expect(await waitForDead(svcPid!)).toBe(true);
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dev target services API shape (#0843)", () => {
  const req = {} as IncomingMessage;
  function makeRes(): { res: ServerResponse; fake: { status: number; payload: any } } {
    const fake = { status: 0, payload: undefined as any };
    const res = {
      setHeader() {},
      writeHead(code: number) {
        fake.status = code;
      },
      end(p: string) {
        fake.payload = JSON.parse(p);
      },
    };
    return { res: res as unknown as ServerResponse, fake };
  }
  function makeCtx(mgr: DevTargetManager): RouteContext {
    return { devTargets: mgr } as unknown as RouteContext;
  }

  it("includes services and their state in GET /api/dev/targets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-svcapi-"));
    const mgr = new DevTargetManager(
      baseConfig({ services: [apiService()], targets: [webTarget()] }, dir),
    );
    try {
      const first = makeRes();
      await getDevTargets(makeCtx(mgr), req, first.res, {});
      expect(first.fake.status).toBe(200);
      const view = first.fake.payload.targets[0];
      expect(view.services).toHaveLength(1);
      expect(view.services[0]).toMatchObject({
        name: "api",
        status: "stopped",
        token: "api",
      });
      expect(typeof view.services[0].command).toBe("string");
      // No readiness url is advertised before the service ever resolved a port.
      expect(view.services[0].url).toBeUndefined();
      // After a start the real port is in the row; after a stop the state flips.
      const started = makeRes();
      await startDevTarget(makeCtx(mgr), req, started.res, { param1: "app" });
      expect(started.fake.payload.target.services[0].status).toBe("running");
      expect(typeof started.fake.payload.target.services[0].port).toBe("number");
      const stopped = makeRes();
      await stopDevTarget(makeCtx(mgr), req, stopped.res, { param1: "app" });
      expect(stopped.fake.payload.target.services[0].status).toBe("stopped");
    } finally {
      await mgr.stopAll();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
