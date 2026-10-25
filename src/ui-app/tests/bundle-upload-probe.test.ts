import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LINK_PROBE_BYTES,
  LINK_THROUGHPUT_FLOOR_BPS,
  formatLinkProbeFailure,
  linkProbeAcceptable,
  probeHostLink,
  probeLinkWithRetry,
  type BundleUploadHost,
} from "../../server/bundle-upload.js";

const host: BundleUploadHost = { ip: "192.0.2.1", user: "runner" };

describe("remote link probe", () => {
  afterEach(() => vi.restoreAllMocks());

  it("separates a one-second SSH setup from a fast transfer", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let call = 0;
    const run = vi.fn(async (_cmd: string, _args: string[], opts: { stdin?: Buffer }) => {
      now += call++ === 0 ? 1000 : 1100;
      return { code: 0, output: "", timedOut: false };
    });
    const result = await probeHostLink(host, run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]?.[2].stdin).toHaveLength(LINK_PROBE_BYTES);
    expect(result.rttMs).toBe(1000);
    expect(result.throughputBps).toBeGreaterThan(LINK_THROUGHPUT_FLOOR_BPS);
    expect(linkProbeAcceptable(result)).toBe(true);
  });

  it("rejects a genuinely slow transfer", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    let call = 0;
    const run = vi.fn(async () => {
      now += call++ === 0 ? 1000 : 7000;
      return { code: 0, output: "", timedOut: false };
    });
    const result = await probeHostLink(host, run);
    expect(result.throughputBps).toBeLessThan(LINK_THROUGHPUT_FLOOR_BPS);
    expect(linkProbeAcceptable(result)).toBe(false);
  });

  it("does not reject high RTT by itself", () => {
    expect(
      linkProbeAcceptable({ ok: true, rttMs: 900, throughputBps: LINK_THROUGHPUT_FLOOR_BPS }),
    ).toBe(true);
  });

  it("retries one failed probe after backoff and accepts a recovered link", async () => {
    const probe = vi
      .fn<() => Promise<{ ok: boolean; rttMs: number; throughputBps: number }>>()
      .mockResolvedValueOnce({ ok: false, rttMs: 120, throughputBps: 0 })
      .mockResolvedValueOnce({ ok: true, rttMs: 900, throughputBps: LINK_THROUGHPUT_FLOOR_BPS });
    const wait = vi.fn(async (_ms: number) => {});

    const result = await probeLinkWithRetry(probe, LINK_THROUGHPUT_FLOOR_BPS, wait);

    expect(probe).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledExactlyOnceWith(500);
    expect(linkProbeAcceptable(result)).toBe(true);
  });

  it("reports the final failed probe's RTT, measured rate, and configured floor", async () => {
    const probe = vi
      .fn<() => Promise<{ ok: boolean; rttMs: number; throughputBps: number; detail?: string }>>()
      .mockResolvedValue({ ok: true, rttMs: 190, throughputBps: 80 * 1024 });
    const result = await probeLinkWithRetry(probe, LINK_THROUGHPUT_FLOOR_BPS, async () => {});

    expect(probe).toHaveBeenCalledTimes(2);
    expect(formatLinkProbeFailure("bee", result, LINK_THROUGHPUT_FLOOR_BPS)).toContain(
      "RTT 190 ms, 80 KB/s measured, 200 KB/s floor",
    );
  });
});
