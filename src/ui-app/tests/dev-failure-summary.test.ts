/**
 * #0775 — dev-target failure analysis: the deterministic port-conflict
 * detection, the plain-language summary text, the full-log cap, and the
 * RepoOS-ownership rule that gates the Stop action for a port holder.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, DevTargetConfig } from "../../core/types";
import {
  detectPortConflict,
  failureSummary,
  DEV_LOG_MAX_LINES,
  PORT_IN_USE,
} from "../../core/dev-failure";
import { DevTargetManager, devPidOwner, parseNetstatListenerPid } from "../../server/dev";
import { getConfigSchema } from "../../core/config";

function baseConfig(
  dev?: RepoOSConfig["dev"],
  root = "/tmp/repoos-dev-failure-unit",
): RepoOSConfig {
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
  return { name: "web", kind: "server", command: "true", ...over };
}

describe("port-conflict detection (#0775)", () => {
  it("reads the port from the common server messages", () => {
    // Node's `listen` error.
    expect(detectPortConflict(["Error: listen EADDRINUSE: address already in use :::5173"])).toBe(
      5173,
    );
    // Vite with --strictPort.
    expect(detectPortConflict(["Error: Port 5173 is already in use"])).toBe(5173);
    expect(detectPortConflict(["Port 8080 is in use, trying another one..."])).toBe(8080);
    // Host:port form.
    expect(detectPortConflict(["Error: listen EADDRINUSE 127.0.0.1:3000"])).toBe(3000);
  });

  it("returns null when the output shows no port conflict", () => {
    expect(detectPortConflict(["booting…", "listening on 5173", "ready"])).toBeNull();
    expect(detectPortConflict([])).toBeNull();
    // A stack trace for a different error must not be mistaken for a clash.
    expect(detectPortConflict(["TypeError: x is not a function"])).toBeNull();
  });
});

describe("failure summary text (#0775)", () => {
  it("names the port and the fix for a port conflict", () => {
    const summary = failureSummary({
      label: "Landing page (HMR)",
      error: "process exited with code 1",
      log: ["Error: listen EADDRINUSE: address already in use :::5173"],
    });
    expect(summary.kind).toBe(PORT_IN_USE);
    expect(summary.port).toBe(5173);
    expect(summary.what).toContain("Landing page (HMR)");
    expect(summary.cause).toContain("5173");
    expect(summary.fix.toLowerCase()).toContain("stop the process");
    expect(summary.fix).toContain("5173");
  });

  it("falls back to a configured port when the output names none", () => {
    const summary = failureSummary({
      label: "web",
      error: "process exited",
      log: ["EADDRINUSE: address already in use"],
      portHint: 4321,
    });
    expect(summary.kind).toBe(PORT_IN_USE);
    expect(summary.port).toBe(4321);
    expect(summary.cause).toContain("4321");
  });

  it("gives an honest generic summary when nothing is detectable", () => {
    const summary = failureSummary({
      label: "web",
      error: "process exited with code 1",
      log: ["some unrelated output"],
    });
    expect(summary.kind).toBe("process-exited");
    expect(summary.what).toContain("web");
    expect(summary.cause).toContain("process exited with code 1");
  });
});

describe("log cap (#0775)", () => {
  it("keeps a full last-run log, not a short tail", () => {
    expect(DEV_LOG_MAX_LINES).toBe(2000);
  });

  it("exposes the failure summary through the manager for a failed target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-dev-failure-"));
    try {
      // Seed a persisted failed state with a port-clash log, so no process is
      // spawned: the manager reads it back on construction.
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
              pid: 424242,
              log: ["Error: listen EADDRINUSE: address already in use :::54321"],
            },
          },
        }),
      );
      const mgr = new DevTargetManager(
        baseConfig({ targets: [target({ label: "Web app" })] }, dir),
      );
      const detailed = await mgr.getDetailed("web");
      expect(detailed?.status).toBe("failed");
      expect(detailed?.failure?.kind).toBe(PORT_IN_USE);
      expect(detailed?.failure?.port).toBe(54321);
      expect(detailed?.failure?.what).toContain("Web app");
      // Not ours: no recorded target owns whatever holds that port.
      expect(detailed?.failure?.canStopHolder).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("AI summary setting (#0775)", () => {
  it("is a schema-backed boolean, default off", () => {
    const field = getConfigSchema().find((f) => f.key === "dev.failureSummary.ai");
    expect(field).toMatchObject({ type: "boolean", default: false, tier: "live" });
  });
});

describe("Windows port-holder fallback (#0775)", () => {
  it("reads the listening PID from netstat output", () => {
    const out = [
      "  Proto  Local Address          Foreign Address        State           PID",
      "  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       41337",
      "  TCP    [::]:5173              [::]:0                 LISTENING       41337",
      "  TCP    0.0.0.0:15173          0.0.0.0:0              LISTENING       99999",
      "  TCP    0.0.0.0:3000           0.0.0.0:0              ESTABLISHED     1",
    ].join("\n");
    expect(parseNetstatListenerPid(out, 5173)).toBe(41337);
    expect(parseNetstatListenerPid(out, 15173)).toBe(99999);
    expect(parseNetstatListenerPid(out, 8080)).toBeUndefined();
  });
});

describe("port-holder ownership (#0775)", () => {
  it("identifies a RepoOS-started PID and flags a leftover as stale", () => {
    const states = new Map([
      [
        "web",
        {
          name: "web",
          status: "running" as const,
          pid: 111,
          log: [],
          services: [{ name: "api", token: "api", status: "running" as const, pid: 333, log: [] }],
        },
      ],
      [
        "old",
        {
          name: "old",
          status: "stopped" as const,
          pid: 222,
          log: [],
          services: [{ name: "api", token: "api", status: "stopped" as const, pid: 444, log: [] }],
        },
      ],
    ]);
    // A live handle means the process is currently supervised.
    expect(devPidOwner(states, new Set(["web"]), 111)).toEqual({ target: "web", stale: false });
    // No live handle for `old`: a stale process from an earlier run.
    expect(devPidOwner(states, new Set(["web"]), 222)).toEqual({ target: "old", stale: true });
    // A companion service's PID resolves to its TARGET (not treated as foreign),
    // so the port-conflict Stop action can stop the whole stack (#0843 review).
    expect(devPidOwner(states, new Set(["web"]), 333)).toEqual({ target: "web", stale: false });
    expect(devPidOwner(states, new Set(["web"]), 444)).toEqual({ target: "old", stale: true });
    // An unknown PID is not ours — the Stop action must never be offered.
    expect(devPidOwner(states, new Set(["web"]), 999)).toBeNull();
  });
});
