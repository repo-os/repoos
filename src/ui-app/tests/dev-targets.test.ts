/**
 * #0747 — dev targets: config validation and the supervisor.
 *
 * Covers the `[[dev.targets]]` TOML parsing (and its loud validation errors),
 * the start/stop/restart lifecycle and status transitions, the log tail, and
 * the trust boundary — a bad command is reported as `failed` without crashing
 * the server, and no request body can ever supply a command.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, DevTargetConfig } from "../../core/types";
import { loadConfig, parseDevTargets } from "../../core/config";
import { DevTargetManager, DEV_LOG_TAIL_LINES } from "../../server/dev";
import type { RouteContext } from "../../server/routes/types";
import {
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

  it("captures output into the log tail, capped at DEV_LOG_TAIL_LINES", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-log-"));
    const cmd = `bun -e "for(let i=0;i<${DEV_LOG_TAIL_LINES + 50};i++)console.log('line',i);setTimeout(()=>{},5000)"`;
    const mgr = new DevTargetManager(baseConfig({ targets: [target({ command: cmd })] }, dir));
    try {
      await mgr.start("web");
      // Give the child a moment to flush its output.
      await new Promise((r) => setTimeout(r, 800));
      const log = mgr.get("web")?.log ?? [];
      expect(log.length).toBeLessThanOrEqual(DEV_LOG_TAIL_LINES);
      expect(log.length).toBeGreaterThan(0);
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

  it("lists targets with their state", () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const { res, fake } = makeRes();
    getDevTargets(makeCtx(mgr), req, res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload.targets).toHaveLength(1);
    expect(fake.payload.targets[0].status).toBe("stopped");
  });

  it("surfaces config validation errors on list", () => {
    const cfg = baseConfig({ targets: [] });
    cfg.devTargetErrors = ["[dev.targets] web: a command is required"];
    const { res, fake } = makeRes();
    getDevTargets(makeCtx(new DevTargetManager(cfg)), req, res, {});
    expect(fake.payload.errors).toEqual(["[dev.targets] web: a command is required"]);
  });

  it("404s an unknown target", () => {
    const mgr = new DevTargetManager(baseConfig({ targets: [target({})] }));
    const { res, fake } = makeRes();
    getDevTarget(makeCtx(mgr), req, res, { param1: "nope" });
    expect(fake.status).toBe(404);
  });

  it("503s when the manager is absent (partial context)", () => {
    const { res, fake } = makeRes();
    getDevTargets(makeCtx(undefined), req, res, {});
    expect(fake.status).toBe(503);
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
