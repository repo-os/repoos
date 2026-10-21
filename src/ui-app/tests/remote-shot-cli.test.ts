/**
 * `repoos shot` and `browserCaptureMode` (#0874).
 *
 * The CLI used to launch WebKit directly regardless of the configured capture
 * policy, so `browserCaptureMode` only affected handoff evidence. It now routes
 * web captures through the same server policy as the automatic pass. These pin
 * both boundaries: which requests stay local (the remote single-shot path
 * cannot reproduce an arbitrary URL or explicit viewport/settle/full-page
 * flags), and the CLI-side transport contract — runner success, visible local
 * fallback, and a structured `runner-only` failure that is never thrown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureRemoteShot, remoteWebCaptureBlocker } from "../../commands/shot.js";

const ENTRY = {
  target: "default",
  route: "/",
  provenance: { kind: "declared" },
} as unknown as Parameters<typeof captureRemoteShot>[3];

function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

function stubFetch(handler: () => Promise<Response> | Response): void {
  vi.stubGlobal("fetch", vi.fn(handler));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("repoos shot remote capture policy (#0874)", () => {
  const defaults = { fullPage: false, viewportExplicit: false, waitMsExplicit: false };

  it.each(["local", undefined] as const)("never blocks in %s mode", (mode) => {
    expect(remoteWebCaptureBlocker(mode, false, defaults)).toBeUndefined();
    expect(remoteWebCaptureBlocker(mode, true, { ...defaults, fullPage: true })).toBeUndefined();
  });

  it.each(["runner-available", "runner-only"] as const)(
    "allows a plain capture in %s mode",
    (mode) => {
      expect(remoteWebCaptureBlocker(mode, false, defaults)).toBeUndefined();
    },
  );

  it.each([
    ["an absolute URL", true, defaults, "absolute URL"],
    ["--full-page", false, { ...defaults, fullPage: true }, "--full-page"],
    ["--viewport", false, { ...defaults, viewportExplicit: true }, "--viewport"],
    ["--wait", false, { ...defaults, waitMsExplicit: true }, "--wait"],
  ])("keeps %s local with a visible reason", (_label, absolute, opts, reason) => {
    expect(remoteWebCaptureBlocker("runner-available", absolute, opts)).toContain(reason);
  });
});

describe("repoos shot remote capture transport (#0874)", () => {
  it("returns the runner-captured shot", async () => {
    const shot = { name: "default-1.png", path: "shots/default-1.png", url: "/shots/1" };
    stubFetch(() => jsonResponse(201, { ok: true, shot, warnings: ["a warning"] }));

    const result = await captureRemoteShot(8741, "0874", null, ENTRY);

    expect(result).toEqual({
      entry: ENTRY,
      ok: true,
      shot,
      warnings: ["a warning"],
    });
  });

  it("surfaces the server's local-fallback note in runner-available mode", async () => {
    const shot = { name: "default-1.png", path: "shots/default-1.png", url: "/shots/1" };
    stubFetch(() =>
      jsonResponse(201, {
        ok: true,
        shot,
        warnings: [],
        note: "remote browser capture unavailable (runner offline); falling back to local capture",
      }),
    );

    const result = await captureRemoteShot(8741, "0874", null, ENTRY);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.note).toContain("falling back to local capture");
      expect(result.shot.name).toBe("default-1.png");
    }
  });

  it("returns a structured runner-only error instead of throwing", async () => {
    stubFetch(() =>
      jsonResponse(400, {
        ok: false,
        error: "remote capture failed: runner-only browser capture failed: no runner",
      }),
    );

    const result = await captureRemoteShot(8741, "0874", null, ENTRY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("runner-only browser capture failed");
      expect(result.unsupported).not.toBe(true);
    }
  });

  it("marks an older server without the route as unsupported", async () => {
    stubFetch(() =>
      jsonResponse(404, { error: "Not found", path: "/api/tasks/0874/shots/capture" }),
    );

    const result = await captureRemoteShot(8741, "0874", null, ENTRY);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unsupported).toBe(true);
  });

  it("treats a route-level 404 as a real error, not an unsupported server", async () => {
    stubFetch(() => jsonResponse(404, { error: "Task #0874 not found" }));

    const result = await captureRemoteShot(8741, "0874", null, ENTRY);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Task #0874 not found");
      expect(result.unsupported).not.toBe(true);
    }
  });
});
