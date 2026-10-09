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
    expect(errors[0]).toContain('kind must be "server" or "artifact"');
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
      expect(cfg.devTargetErrors?.length).toBe(1);
      expect(cfg.devTargetErrors?.[0]).toContain('kind must be "server" or "artifact"');
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
