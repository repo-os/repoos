/**
 * Local check and Playwright caps (#0836): third waiter blocks until a slot frees.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import {
  acquireCrossProcessSlot,
  localCheckLockRoot,
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
