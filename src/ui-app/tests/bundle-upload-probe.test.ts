import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LINK_PROBE_BYTES,
  LINK_THROUGHPUT_FLOOR_BPS,
  linkProbeAcceptable,
  probeHostLink,
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
});
