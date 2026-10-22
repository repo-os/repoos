/**
 * #0917 — streaming bundle upload deadlines and progress.
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { Writable } from "node:stream";
import {
  formatBundleUploadDetail,
  shouldPreferLocalGate,
  sshTransferArgs,
  bundleUploadLimitsFromConfig,
  uploadFileOverSsh,
  readLastCloseOutGateMs,
} from "../../server/bundle-upload.js";

const HOST = { ip: "203.0.113.9", user: "root" };

describe("sshTransferArgs (#0917)", () => {
  it("includes ServerAlive options for stalled-session detection", () => {
    const args = sshTransferArgs(HOST);
    expect(args.join(" ")).toContain("ServerAliveInterval=15");
    expect(args.join(" ")).toContain("ServerAliveCountMax=4");
  });
});

describe("formatBundleUploadDetail (#0917)", () => {
  it("shows bytes, percent, rate, and stage elapsed", () => {
    const line = formatBundleUploadDetail({
      hostLabel: "thinkpad",
      bytesSent: 45 * 1024 * 1024,
      totalBytes: 201 * 1024 * 1024,
      rateBps: 1.2 * 1024 * 1024,
      etaSecs: 120,
      attempt: 2,
      stageElapsedSecs: 95,
      fullBundleNote: "full bundle (mirror empty)",
    });
    expect(line).toContain("thinkpad");
    expect(line).toContain("22%");
    expect(line).toContain("attempt 2");
    expect(line).toContain("95s in stage");
    expect(line).toContain("mirror empty");
  });
});

describe("shouldPreferLocalGate (#0917)", () => {
  it("honours the metered-link setting when local pressure is ok", () => {
    const r = shouldPreferLocalGate({
      forceMeteredLocal: true,
      probe: null,
      bundleBytes: 1,
      localGateMs: 60_000,
      remoteGateMs: 60_000,
      localPressureOk: true,
    });
    expect(r.prefer).toBe(true);
    expect(r.detail).toContain("metered");
  });

  it("skips remote upload when RTT is high and the laptop is healthy", () => {
    const r = shouldPreferLocalGate({
      forceMeteredLocal: false,
      probe: { ok: true, rttMs: 1500, throughputBps: 500_000 },
      bundleBytes: 10 * 1024 * 1024,
      localGateMs: 120_000,
      remoteGateMs: 120_000,
      localPressureOk: true,
    });
    expect(r.prefer).toBe(true);
    expect(r.detail).toMatch(/latency/i);
  });
});

describe("uploadFileOverSsh stall (#0917)", () => {
  it("aborts when ssh accepts the session then backpressures the write path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-bu-"));
    const bundlePath = join(dir, "candidate.bundle");
    writeFileSync(bundlePath, Buffer.alloc(2 * 1024 * 1024));

    const result = await uploadFileOverSsh(HOST, bundlePath, "/tmp/x.bundle", {
      limits: { budgetMs: 60_000, stallMs: 200 },
      _spawnForTest: () => {
        const child = new EventEmitter() as ChildProcess;
        let chunks = 0;
        const stdin = new Writable({
          write(_chunk, _enc, cb) {
            chunks++;
            if (chunks === 1) {
              cb();
              return true;
            }
            return false;
          },
        });
        stdin.on = EventEmitter.prototype.on.bind(stdin);
        stdin.once = EventEmitter.prototype.once.bind(stdin);
        child.stdin = stdin;
        child.stdout = new Writable({
          write(_c, _e, cb) {
            cb();
          },
        });
        child.stderr = new Writable({
          write(_c, _e, cb) {
            cb();
          },
        });
        child.kill = () => {
          child.emit("close", null);
        };
        return child;
      },
    });

    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.reason).toBe("stall");
  }, 15_000);
});

describe("readLastCloseOutGateMs (#0917)", () => {
  it("reads last_close_out_gate_ms from a task file", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-task-"));
    const work = join(root, "work");
    mkdirSync(work);
    writeFileSync(
      join(work, "0999-sample-task.md"),
      `---
id: "0999"
title: Sample
last_close_out_gate_ms: 255482
---
`,
    );
    expect(readLastCloseOutGateMs(root, "work", "0999")).toBe(255482);
  });
});

describe("bundleUploadLimitsFromConfig (#0917)", () => {
  it("defaults to 180s budget and 90s stall", () => {
    const limits = bundleUploadLimitsFromConfig(undefined);
    expect(limits.budgetMs).toBe(180_000);
    expect(limits.stallMs).toBe(90_000);
  });
});
