/**
 * #0917 — streaming bundle upload deadlines and progress.
 */
import { describe, it, expect } from "vitest";
import {
  formatBundleUploadDetail,
  shouldPreferLocalGate,
  sshTransferArgs,
  bundleUploadLimitsFromConfig,
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

describe("bundleUploadLimitsFromConfig (#0917)", () => {
  it("defaults to 180s budget and 90s stall", () => {
    const limits = bundleUploadLimitsFromConfig(undefined);
    expect(limits.budgetMs).toBe(180_000);
    expect(limits.stallMs).toBe(90_000);
  });
});
