import { describe, expect, it, vi } from "vitest";
import { runBrowserCaptureRemoteFirst } from "../../server/remote-browser-capture.js";

describe("remote browser capture policy", () => {
  it("returns runner artifacts without requesting local capture", async () => {
    const artifacts = {
      files: [{ name: "shots/home.png", data: "aGVsbG8=" }],
      result: { ok: true },
    };
    const capture = vi.fn(async () => artifacts);
    const result = await runBrowserCaptureRemoteFirst("runner-available", "0854", "both", {
      capture,
    });
    expect(result).toEqual({ artifacts, localRequired: false });
    expect(capture).toHaveBeenCalledWith("0854", "both");
  });

  it("falls back with a visible notice when no runner is available", async () => {
    const result = await runBrowserCaptureRemoteFirst(
      "runner-available",
      "0854",
      "shots",
      undefined,
    );
    expect(result.localRequired).toBe(true);
    expect(result.notice).toMatch(/no capable runner/i);
  });

  it("falls back with a visible notice when runner capture fails", async () => {
    const result = await runBrowserCaptureRemoteFirst("runner-available", "0854", "verify", {
      capture: async () => {
        throw new Error("WebKit missing");
      },
    });
    expect(result.localRequired).toBe(true);
    expect(result.notice).toMatch(/WebKit missing/);
  });

  it("fails runner-only mode and rejects unsafe artifacts", async () => {
    await expect(
      runBrowserCaptureRemoteFirst("runner-only", "0854", "shots", undefined),
    ).rejects.toThrow(/no capable runner/);
    await expect(
      runBrowserCaptureRemoteFirst("runner-available", "0854", "shots", {
        capture: async () => ({ files: [{ name: "../secret", data: "eA==" }], result: {} }),
      }),
    ).resolves.toMatchObject({
      localRequired: true,
      notice: expect.stringMatching(/unsafe artifact/),
    });
  });
});
