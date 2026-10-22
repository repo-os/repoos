/**
 * #0917 — streaming bundle upload deadlines and progress.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import * as childProcess from "node:child_process";
import type { ChildProcess } from "node:child_process";
import {
  formatBundleUploadDetail,
  shouldPreferLocalGate,
  sshTransferArgs,
  uploadFileOverSsh,
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
});

describe("uploadFileOverSsh stall (#0917)", () => {
  let spawnSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    spawnSpy?.mockRestore();
  });

  it("aborts when the remote accepts the connection but never drains stdin", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-0917-upload-"));
    const path = join(root, "bundle.bin");
    writeFileSync(path, Buffer.alloc(512 * 1024, 0x61));
    try {
      const stdin = new EventEmitter() as unknown as NodeJS.WritableStream & {
        write: (c: Buffer) => boolean;
        end: () => void;
      };
      let written = 0;
      stdin.write = (chunk: Buffer) => {
        written += chunk.length;
        return written < 64 * 1024;
      };
      stdin.end = () => undefined;
      const fakeChild = Object.assign(new EventEmitter(), {
        stdin,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(() => {
          fakeChild.emit("close", null);
        }),
      }) as unknown as ChildProcess;
      spawnSpy = vi.spyOn(childProcess, "spawn").mockReturnValue(fakeChild);

      const res = await uploadFileOverSsh(HOST, path, "~/.repoos-x.bundle", {
        limits: { budgetMs: 30_000, stallMs: 250 },
        abortWhenEtaExceedsBudget: false,
      });
      expect(res.ok).toBe(false);
      expect(res.aborted).toBe(true);
      expect(res.reason).toBe("stall");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
