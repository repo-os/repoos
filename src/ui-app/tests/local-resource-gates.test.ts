/**
 * Local check and Playwright caps (#0836): third waiter blocks until a slot frees.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { RepoOSConfig } from "../../core/types.js";
import {
  acquireCrossProcessSlot,
  inspectCrossProcessSlots,
  reapOrphanedLocalCheckGroups,
  localCheckLockRoot,
  localFallbackSerializeLockRoot,
  playwrightLockRoot,
} from "../../core/cross-process-slots.js";
import { ConcurrencyGate } from "../../core/concurrency-gate.js";
import { pressureReason } from "../../core/pressure-guard.js";
import {
  localCheckLimitForRun,
  localChecksMaxConcurrent,
  playwrightMaxConcurrent,
} from "../../core/resource-limits.js";
import { REPOOS_REMOTE_FALLBACK_DETAIL } from "../../server/pre-review-remote-gate.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function cfg(root: string, max = 2): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    localChecks: { maxConcurrent: max },
  };
}

describe("ConcurrencyGate", () => {
  it("with limit 2, a third acquire waits then runs", async () => {
    const gate = new ConcurrencyGate(2);
    const order: string[] = [];
    const r1 = await gate.acquire();
    const r2 = await gate.acquire();
    let thirdStarted = false;
    const third = gate.acquire().then((release) => {
      thirdStarted = true;
      order.push("third");
      release();
    });
    await Promise.resolve();
    expect(thirdStarted).toBe(false);
    r1();
    await third;
    r2();
    expect(order).toEqual(["third"]);
  });
});

describe("cross-process local check slots", () => {
  it("reclaims a slot immediately when its recorded holder is dead", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-dead-slot-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, ".holder"), "2147483647");
    writeFileSync(join(slot, ".meta.json"), JSON.stringify({ kind: "test" }));
    const holders = inspectCrossProcessSlots(lockRoot);
    expect(holders[0]).toMatchObject({ slot: 0, dead: true, wedged: false });
    const release = await acquireCrossProcessSlot({ slots: 1, lockRoot, waitTimeoutMs: 100 });
    release();
  });

  it("treats a reused PID as dead when the process start token changed", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-reused-pid-slot-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, ".holder"), String(process.pid));
    writeFileSync(
      join(slot, ".meta.json"),
      JSON.stringify({ processStartToken: "a process incarnation that cannot match" }),
    );
    expect(inspectCrossProcessSlots(lockRoot)[0]).toMatchObject({ dead: true });
  });

  it("recognizes the current live process as a slot holder", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-live-slot-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, ".holder"), String(process.pid));
    writeFileSync(join(slot, ".meta.json"), JSON.stringify({ processStartToken: "" }));
    expect(inspectCrossProcessSlots(lockRoot)[0]).toMatchObject({ dead: false, wedged: false });
  });

  it("makes a cancelled check release its slot before the queued check acquires it", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-cancel-slot-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const releaseCancelled = await acquireCrossProcessSlot({
      slots: 1,
      lockRoot,
      waitTimeoutMs: 100,
    });
    let acquired = false;
    const waiting = acquireCrossProcessSlot({ slots: 1, lockRoot, waitTimeoutMs: 2_000 }).then(
      (release) => {
        acquired = true;
        release();
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseCancelled();
    await waiting;
    expect(acquired).toBe(true);
  });

  it("uses the monotonic heartbeat when the wall clock and directory time jump", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-slot-clock-jump-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, ".holder"), String(process.pid));
    writeFileSync(join(slot, ".meta.json"), JSON.stringify({ processStartToken: "" }));
    writeFileSync(
      join(slot, ".heartbeat.json"),
      JSON.stringify({ wallMs: 0, monotonicMs: Number(process.hrtime.bigint() / 1_000_000n) }),
    );
    writeFileSync(
      join(slot, ".started.json"),
      JSON.stringify({ wallMs: 0, monotonicMs: Number(process.hrtime.bigint() / 1_000_000n) }),
    );
    const old = new Date(0);
    utimesSync(slot, old, old);
    expect(inspectCrossProcessSlots(lockRoot)[0]).toMatchObject({ dead: false, wedged: false });
  });

  it("marks and reclaims a live silent holder after its reclaim grace", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-wedged-slot-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, ".holder"), String(process.pid));
    writeFileSync(join(slot, ".wedged-since"), String(Date.now() - 160_000));
    const old = new Date(Date.now() - 240_000);
    utimesSync(slot, old, old);
    expect(inspectCrossProcessSlots(lockRoot)[0]).toMatchObject({ dead: false, wedged: true });
    const release = await acquireCrossProcessSlot({ slots: 1, lockRoot, waitTimeoutMs: 100 });
    release();
  });

  it("reaps a detached close-out check group after its candidate disappeared", () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "repoos-orphan-slot-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    const candidate = join(root, "missing-candidate");
    const child = spawn("sh", ["-c", "trap '' TERM; while :; do sleep 1; done"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    if (!child.pid) throw new Error("could not start fixture process");
    child.unref();
    const slot = join(lockRoot, "0");
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, ".holder"), String(child.pid));
    writeFileSync(
      join(slot, ".meta.json"),
      JSON.stringify({ kind: "local-check", worktree: candidate, processGroup: true }),
    );
    const startedAt = Date.now();
    expect(reapOrphanedLocalCheckGroups(lockRoot)).toEqual([child.pid]);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1400);
    expect(inspectCrossProcessSlots(lockRoot)).toEqual([]);
  });

  it("never exceeds the configured limit across processes", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-local-slots-"));
    dirs.push(root);
    const lockRoot = localCheckLockRoot(root, ".repoos");
    let peak = 0;
    let running = 0;
    const job = async () => {
      const release = await acquireCrossProcessSlot({
        slots: localChecksMaxConcurrent(cfg(root)),
        lockRoot,
        waitTimeoutMs: 30_000,
      });
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      release();
    };
    await Promise.all([job(), job(), job()]);
    expect(peak).toBe(2);
  });
});

describe("playwright cross-process slots", () => {
  it("never exceeds playwright.maxConcurrent", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-pw-slots-"));
    dirs.push(root);
    const lockRoot = playwrightLockRoot(root, ".repoos");
    const config = cfg(root);
    config.playwright = { maxConcurrent: 2 };
    const limit = playwrightMaxConcurrent(config);
    let peak = 0;
    let running = 0;
    const job = async () => {
      const release = await acquireCrossProcessSlot({
        slots: limit,
        lockRoot,
        waitTimeoutMs: 30_000,
      });
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      release();
    };
    await Promise.all(Array.from({ length: limit + 2 }, () => job()));
    expect(peak).toBe(limit);
  });
});

describe("localFallback serialize", () => {
  it("caps local check concurrency at 1 during remote fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-serialize-"));
    dirs.push(root);
    const config = cfg(root, 3);
    config.remoteValidation = { localFallback: "serialize" };
    const env = { [REPOOS_REMOTE_FALLBACK_DETAIL]: "no healthy runner" };
    expect(localCheckLimitForRun(config, env)).toBe(1);
  });

  it("never exceeds one global serialize slot across processes", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-serialize-slots-"));
    dirs.push(root);
    const lockRoot = localFallbackSerializeLockRoot(root, ".repoos");
    let peak = 0;
    let running = 0;
    const job = async () => {
      const release = await acquireCrossProcessSlot({
        slots: 1,
        lockRoot,
        waitTimeoutMs: 30_000,
      });
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 30));
      running--;
      release();
    };
    await Promise.all([job(), job(), job()]);
    expect(peak).toBe(1);
  });
});

describe("pressure guard", () => {
  it("records a reason when load exceeds the threshold", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-pressure-"));
    dirs.push(root);
    const config = cfg(root);
    config.pressureGuard = { enabled: true, maxLoadPerCpu: 0.01 };
    const reason = pressureReason(config, { loadPerCpu: 99, availableMemRatio: 1 });
    expect(reason).toMatch(/load is high/i);
  });
});
