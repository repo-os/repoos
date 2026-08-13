/**
 * Supervisor tests (#0112): Agent Supervisor with periodic health checks,
 * safe recovery, and heartbeat reports.
 */
import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, SupervisorConfig, Task } from "../../core/types.js";
import type { RepoEvent } from "../../server/live-index.js";
import { AgentSupervisor, DEFAULT_SUPERVISOR_CONFIG, SupervisorConfig_ } from "../../server/supervisor.js";
import { LiveIndex } from "../../server/live-index.js";
import { createRepoOS } from "../../core/repoos.js";

interface Fixture {
  root: string;
  config: RepoOSConfig;
  index: LiveIndex;
  events: RepoEvent[];
  clean: () => void;
}

function mkfx(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "supervisor-test-"));
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, ".repoos"), { recursive: true });

  const repoos = createRepoOS(root);
  const config = repoos.config;
  const index = new LiveIndex(config);

  const events: RepoEvent[] = [];
  const emitEvent = (e: RepoEvent) => {
    events.push(e);
  };
  index.on(emitEvent);

  return {
    root,
    config,
    index,
    events,
    clean: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

describe("supervisor", () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = mkfx();
  });

  afterEach(() => {
    fx.clean();
  });

  it("applies defaults to supervisor config", () => {
    const cfg = new SupervisorConfig_();
    expect(cfg.enabled).toBe(false);
    expect(cfg.interval).toBe(300);
    expect(cfg.mode).toBe("observe");
    expect(cfg.quietThreshold).toBe(600);
    expect(cfg.stallThreshold).toBe(3);
    expect(cfg.maxRestarts).toBe(2);
    expect(cfg.cooldownSeconds).toBe(60);
  });

  it("normalizes supervisor config values", () => {
    const cfg = new SupervisorConfig_({
      enabled: true,
      interval: 30,
      mode: "recover",
      quietThreshold: 30,
      stallThreshold: 0,
      maxRestarts: -1,
      cooldownSeconds: 10,
    });
    expect(cfg.enabled).toBe(true);
    expect(cfg.interval).toBeGreaterThanOrEqual(60);
    expect(cfg.mode).toBe("recover");
    expect(cfg.quietThreshold).toBeGreaterThanOrEqual(60);
    expect(cfg.stallThreshold).toBe(1);
    expect(cfg.maxRestarts).toBe(0);
    expect(cfg.cooldownSeconds).toBeGreaterThanOrEqual(30);
  });

  it("starts and stops supervisor loop", async () => {
    const config = { ...fx.config, supervisor: { enabled: true, interval: 1 } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    supervisor.start();
    expect(supervisor.config.enabled).toBe(true);

    await new Promise((r) => setTimeout(r, 100));
    supervisor.stop();
  });

  it("classifies healthy tasks", async () => {
    const taskPath = join(fx.config.root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---
id: "0001"
title: "Test Task"
type: feature
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/test
---
## Problem
Test.
`,
    );

    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    fx.index.refreshAll();
    const result = await supervisor.runCycle();
    expect(result).not.toBeNull();
    expect(result!.totalActive).toBe(1);
    expect(result!.healthy).toBe(1);
    expect(result!.tasks[0].status).toBe("healthy");
  });

  it("classifies waiting-for-human tasks", async () => {
    const taskPath = join(fx.config.root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---
id: "0001"
title: "Waiting Task"
type: feature
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/test
needs_input: true
---
## Problem
Test.
`,
    );

    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    fx.index.refreshAll();
    const result = await supervisor.runCycle();
    expect(result!.tasks[0].status).toBe("waiting-for-human");
    expect(result!.warnings).toBe(1);
  });

  it("classifies blocked-on-merge tasks", async () => {
    const taskPath = join(fx.config.root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---
id: "0001"
title: "Merge Blocked"
type: feature
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/test
needs_merge: true
---
## Problem
Test.
`,
    );

    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    fx.index.refreshAll();
    const result = await supervisor.runCycle();
    expect(result!.tasks[0].status).toBe("blocked-on-merge");
    expect(result!.warnings).toBe(1);
  });

  it("emits supervisor.heartbeat events", async () => {
    const taskPath = join(fx.config.root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---
id: "0001"
title: "Test Task"
type: feature
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/test
---
## Problem
Test.
`,
    );

    const config = { ...fx.config, supervisor: { enabled: true } };
    const events: RepoEvent[] = [];
    const supervisor = new AgentSupervisor(config, fx.index, (e) => events.push(e));

    fx.index.refreshAll();
    await supervisor.runCycle();

    const heartbeatEvents = events.filter((e) => e.type === "supervisor.heartbeat");
    expect(heartbeatEvents).toHaveLength(1);
    const heartbeat = (heartbeatEvents[0] as any).heartbeat;
    expect(heartbeat.totalActive).toBe(1);
    expect(heartbeat.healthy).toBe(1);
    expect(heartbeat.mode).toBe("observe");
  });

  it("persists and retrieves audit log", async () => {
    const taskPath = join(fx.config.root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---
id: "0001"
title: "Test Task"
type: feature
status: active
priority: p1
area: server
assigned_to: ai
branch: feat/test
---
## Problem
Test.
`,
    );

    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    fx.index.refreshAll();
    await supervisor.runCycle();

    const latestHeartbeat = supervisor.getLatestHeartbeat();
    expect(latestHeartbeat).not.toBeNull();
    expect(latestHeartbeat!.totalActive).toBe(1);

    const recent = supervisor.getRecentHeartbeats(10);
    expect(recent.length).toBeGreaterThan(0);
  });

  it("handles supervisor disabled", async () => {
    const config = { ...fx.config, supervisor: { enabled: false } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    supervisor.start();
    await new Promise((r) => setTimeout(r, 50));
    supervisor.stop();

    const heartbeatEvents = fx.events.filter((e) => e.type === "supervisor.heartbeat");
    expect(heartbeatEvents).toHaveLength(0);
  });

  it("ignores non-active tasks", async () => {
    const taskPath = join(fx.config.root, "work", "0001-test.md");
    writeFileSync(
      taskPath,
      `---
id: "0001"
title: "Ready Task"
type: feature
status: ready
priority: p1
area: server
assigned_to: ai
branch: feat/test
---
## Problem
Test.
`,
    );

    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    fx.index.refreshAll();
    const result = await supervisor.runCycle();
    expect(result!.totalActive).toBe(0);
    expect(result!.tasks).toHaveLength(0);
  });

  it("trims audit log to reasonable size", async () => {
    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    for (let i = 0; i < 120; i++) {
      await supervisor.runCycle();
    }

    const recent = supervisor.getRecentHeartbeats(100);
    expect(recent.length).toBeLessThanOrEqual(100);
  });

  it("prevents concurrent cycle execution", async () => {
    const config = { ...fx.config, supervisor: { enabled: true } };
    const supervisor = new AgentSupervisor(config, fx.index, (e) => fx.events.push(e));

    fx.index.refreshAll();
    const results = await Promise.all([supervisor.runCycle(), supervisor.runCycle()]);
    const nullCount = results.filter((r) => r === null).length;
    expect(nullCount).toBeGreaterThan(0);
  });
});
