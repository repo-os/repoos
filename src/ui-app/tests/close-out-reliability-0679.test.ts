/**
 * #0679 — adaptive close-out timeout, monotonic budget, repair handback, review messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adaptiveCloseOutTimeoutMs,
  CLOSE_OUT_MIN_TIMEOUT_MS,
  CLOSE_OUT_TIMEOUT_SCALE,
  effectiveCloseOutTimeoutMs,
  readCloseOutGateTimingStats,
  recordCloseOutGateTimingStats,
} from "../../core/close-out-timing.js";
import { isLockfileOnlyConflicts } from "../../core/lockfile-conflict.js";
import type { RepoOSConfig, Task } from "../../core/types";
import { scheduleCloseOutRepairHandback } from "../../server/close-out-repair.js";
import { closeOutMonotonicElapsedMs, closeOutTimeoutMs } from "../../server/integration-orchestrator.js";
import type { IntegrationJob } from "../../server/integration-job.js";
import type { AgentRunner } from "../../server/agents.js";
import { parseTask } from "../../core/task";

describe("adaptive close-out timeout (#0679)", () => {
  it("uses 10 min minimum when there is no gate history", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-timeout-"));
    try {
      expect(adaptiveCloseOutTimeoutMs(root)).toBe(CLOSE_OUT_MIN_TIMEOUT_MS);
      const config: RepoOSConfig = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 360_000 },
      };
      expect(effectiveCloseOutTimeoutMs(config)).toBe(CLOSE_OUT_MIN_TIMEOUT_MS);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("scales from the last successful gate duration when not explicitly configured", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-timeout-"));
    try {
      recordCloseOutGateTimingStats(root, ".repoos", 120_000);
      expect(adaptiveCloseOutTimeoutMs(root)).toBe(
        Math.max(CLOSE_OUT_MIN_TIMEOUT_MS, 120_000 * CLOSE_OUT_TIMEOUT_SCALE),
      );
      const stats = readCloseOutGateTimingStats(root);
      expect(stats?.lastSuccessfulGateDurationMs).toBe(120_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("honours an explicit repoos.toml timeout over the adaptive default", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-timeout-"));
    try {
      recordCloseOutGateTimingStats(root, ".repoos", 500_000);
      const config: RepoOSConfig = {
        root,
        workDir: "work",
        docsDir: "docs",
        skillsDir: "skills",
        taskExtensions: [".md"],
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
        cacheDir: ".repoos",
        closeOut: { timeoutMs: 180_000, timeoutMsFromToml: true },
      };
      expect(closeOutTimeoutMs(config)).toBe(180_000);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("monotonic close-out budget (#0679)", () => {
  it("tracks elapsed time from budgetMonotonicStartNs", () => {
    const job: IntegrationJob = {
      taskId: "0001",
      phase: "validating",
      enqueuedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      baseMainSha: null,
      branchSha: null,
      candidateSha: null,
      budgetMonotonicStartNs: process.hrtime.bigint().toString(),
    };
    const elapsed = closeOutMonotonicElapsedMs(job);
    expect(elapsed).not.toBeNull();
    expect(elapsed!).toBeGreaterThanOrEqual(0);
    expect(elapsed!).toBeLessThan(50);
  });
});

describe("lockfile-only conflicts (#0679)", () => {
  it("recognises lockfile-only path lists", () => {
    expect(isLockfileOnlyConflicts(["bun.lock"])).toBe(true);
    expect(isLockfileOnlyConflicts(["bun.lock", "package-lock.json"])).toBe(true);
    expect(isLockfileOnlyConflicts(["bun.lock", "src/a.ts"])).toBe(false);
  });
});

describe("scheduleCloseOutRepairHandback (#0679)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("moves a review task to active and messages the engineer", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0679-repair-"));
    mkdirSync(join(root, "work"), { recursive: true });
    const path = join(root, "work/0001-fixture.md");
    writeFileSync(
      path,
      `---
id: "0001"
title: Fixture
type: feature
status: review
priority: p2
area: server
assigned_to: ai
branch: feat/fixture
---
`,
    );
    const task = parseTask({
      content: readFileSync(path, "utf8"),
      absPath: path,
      root,
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
    });
    const sent: string[] = [];
    const runner = {
      send: (_id: string, message: string) => {
        sent.push(message);
        return { ok: true };
      },
      system: () => {},
      persistHandoffFailure: () => {},
    } as unknown as AgentRunner;
    const config: RepoOSConfig = {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      agents: [{ name: "engineer", enabled: true, cli: "cursor", model: "test" }],
    };
    try {
      const scheduled = scheduleCloseOutRepairHandback(
        config,
        task,
        "gate-failure",
        "check failed: tests — foo is not a function",
        runner,
      );
      expect(scheduled).toBe(true);
      await vi.runAllTimersAsync();
      expect(sent[0]).toContain("foo is not a function");
      expect(sent[0]).toContain("Merge main into your branch");
      const updated = parseTask({
        content: readFileSync(path, "utf8"),
        absPath: path,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(updated.status).toBe("active");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
