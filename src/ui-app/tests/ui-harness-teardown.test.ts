/**
 * #0859 E1/E3: the shared UI-harness teardown is now failure-isolated.
 *
 * - E1: a throwing `context.close()` / `browser.close()` must never skip
 *   `server.close()`, and the fixture dir is removed only after every close has
 *   run. When several closes fail, every error surfaces.
 * - E3: running the smoke/contrast fixture setup and teardown against a
 *   temporary TMPDIR leaves zero new `repoos-*` entries behind, including on
 *   the throwing-close path.
 *
 * These tests use fake closers and the real fixture builders, so they need no
 * Playwright and run in the normal suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  combineHarnessErrors,
  teardownUiHarness,
  type HarnessCloser,
} from "../../commands/ui-harness.js";

vi.mock("../../commands/ui-harness.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../commands/ui-harness.js")>();
  return {
    ...actual,
    startPreviewServer: vi.fn(),
    launchWebkit: vi.fn(),
  };
});

import { startPreviewServer, launchWebkit } from "../../commands/ui-harness.js";
import { cmdUISmoke, makeSmokeFixture } from "../../commands/ui-smoke.js";
import { makeAuditFixture } from "../../commands/ui-contrast-audit.js";

const made: string[] = [];

beforeEach(() => {
  vi.mocked(startPreviewServer).mockReset();
  vi.mocked(launchWebkit).mockReset();
});

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function track(dir: string): string {
  made.push(dir);
  return dir;
}

/**
 * Build a fixture with this test's own TMPDIR, then restore the environment
 * immediately. Both builders are synchronous, so no other test file can
 * observe (or race) the override. Returns the fixture path plus the isolated
 * tmpdir it was created in, so residue is asserted against the right directory
 * rather than the shared process tmpdir.
 */
function buildIsolated(build: () => string): { fixture: string; isolated: string } {
  const isolated = track(mkdtempSync(join(tmpdir(), "repoos-harness-spec-")));
  const saved = {
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
  };
  process.env.TMPDIR = isolated;
  process.env.TMP = isolated;
  process.env.TEMP = isolated;
  try {
    return { fixture: track(build()), isolated };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** `repoos-*` entries remaining in an isolated TMPDIR. */
function residue(isolated: string): string[] {
  return readdirSync(isolated).filter((name) => name.startsWith("repoos-"));
}

function throwingCloser(label: string): HarnessCloser & { called: number } {
  const closer = {
    called: 0,
    close: async () => {
      closer.called++;
      throw new Error(`${label} boom`);
    },
  };
  return closer;
}

describe("UI harness teardown (#0859 E1)", () => {
  it("closes the server and removes the fixture when context.close() throws", async () => {
    const { fixture } = buildIsolated(makeSmokeFixture);
    const context = throwingCloser("context");
    let fixtureStillPresentDuringServerClose = false;
    const server: HarnessCloser = {
      close: async () => {
        fixtureStillPresentDuringServerClose = existsSync(fixture);
      },
    };

    await expect(
      teardownUiHarness({
        context,
        server,
        removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
      }),
    ).rejects.toThrow(/context boom/);

    expect(context.called).toBe(1);
    // The server is closed before the fixture is deleted, so its async state
    // persistence cannot recreate the directory afterwards.
    expect(fixtureStillPresentDuringServerClose).toBe(true);
    expect(existsSync(fixture)).toBe(false);
  });

  it("still closes the server when a closer throws synchronously", async () => {
    const { fixture } = buildIsolated(makeSmokeFixture);
    let serverClosed = false;
    const context: HarnessCloser = {
      // A synchronous throw must be isolated too: an earlier
      // Promise.allSettled(map(close)) skipped every closer after it.
      close: () => {
        throw new Error("sync context boom");
      },
    };
    const server: HarnessCloser = {
      close: async () => {
        serverClosed = true;
      },
    };

    await expect(
      teardownUiHarness({
        context,
        server,
        removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
      }),
    ).rejects.toThrow(/sync context boom/);

    expect(serverClosed).toBe(true);
    expect(existsSync(fixture)).toBe(false);
  });

  it("surfaces every failure when context, browser and server all throw", async () => {
    const { fixture } = buildIsolated(makeSmokeFixture);
    const context = throwingCloser("context");
    const browser = throwingCloser("browser");
    const server = throwingCloser("server");

    const error = await teardownUiHarness({
      context,
      browser,
      server,
      removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
    }).catch((err: Error) => err);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain("context boom");
    expect(message).toContain("browser boom");
    expect(message).toContain("server boom");
    // Each close was attempted despite the others failing.
    expect(context.called).toBe(1);
    expect(browser.called).toBe(1);
    expect(server.called).toBe(1);
    // Cleanup still ran, and the original fixture is gone.
    expect(existsSync(fixture)).toBe(false);
  });

  it("keeps the original body error when teardown also fails", () => {
    const combined = combineHarnessErrors(
      new Error("body boom"),
      new Error("UI harness teardown failed: server.close() failed: server boom"),
    );
    expect(combined.message).toContain("body boom");
    expect(combined.message).toContain("server boom");
    expect(combined.cause).toEqual([expect.any(Error), expect.any(Error)]);
  });

  it("cmdUISmoke exits 1 and reports both a launch and a server-close failure", async () => {
    vi.mocked(startPreviewServer).mockResolvedValue({
      url: "http://127.0.0.1:1",
      close: async () => {
        throw new Error("server boom");
      },
    });
    vi.mocked(launchWebkit).mockRejectedValue(new Error("launch boom"));
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });

    const code = await cmdUISmoke();

    log.mockRestore();
    expect(code).toBe(1);
    const output = lines.join("\n");
    expect(output).toContain("launch boom");
    expect(output).toContain("server boom");
  });
});

describe("smoke/contrast fixture leaves no tmpdir residue (#0859 E3)", () => {
  it.each([
    ["smoke", makeSmokeFixture],
    ["contrast", makeAuditFixture],
  ])("removes the %s fixture and adds no repoos-* dir", async (_name, build) => {
    const { fixture, isolated } = buildIsolated(build);
    expect(existsSync(fixture)).toBe(true);
    expect(residue(isolated)).toHaveLength(1);

    await teardownUiHarness({
      removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
    });

    expect(existsSync(fixture)).toBe(false);
    expect(residue(isolated)).toEqual([]);
  });

  it("removes the fixture even when a fake browser close throws", async () => {
    const { fixture, isolated } = buildIsolated(makeSmokeFixture);
    const context = throwingCloser("context");

    await expect(
      teardownUiHarness({
        context,
        server: { close: async () => {} },
        removeFixture: () => rmSync(fixture, { recursive: true, force: true }),
      }),
    ).rejects.toThrow(/context boom/);

    expect(existsSync(fixture)).toBe(false);
    expect(residue(isolated)).toEqual([]);
  });
});
