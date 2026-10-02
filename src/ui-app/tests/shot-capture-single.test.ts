/**
 * Single-entry capture (#0627): `captureDeclaredShot` — the drawer's Add-shot
 * path. Pins the busy semantics that DIFFER from the handoff pass (a manual
 * capture never evicts a preview a human is viewing), the declared provenance
 * with NO `origin: "auto"` (so re-handoff cleanup never deletes it), and that
 * a preview the capture started is stopped again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import type { RepoOSConfig, Task } from "../../core/types.js";
import type { PreviewInfo, PreviewManager } from "../../server/preview.js";

const roots: string[] = [];

function setup(): RepoOSConfig {
  const root = mkdtempSync(join(tmpdir(), "repoos-shot-capture-"));
  roots.push(root);
  return loadConfig(root);
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    status: "active",
    branch: "feat/x",
    ...(overrides as object),
  } as Task;
}

function info(partial: Partial<PreviewInfo>): PreviewInfo {
  return {
    port: 8000,
    url: "http://127.0.0.1:8000",
    startedAt: new Date().toISOString(),
    pid: 123,
    ...partial,
  };
}

function fakePreviews(
  running: { taskId: string; info: PreviewInfo }[] = [],
  startResult: { ok: boolean; url?: string; error?: string } = {
    ok: true,
    url: "http://127.0.0.1:9000",
  },
): PreviewManager & { stops: string[] } {
  const stops: string[] = [];
  const runningList = [...running];
  return {
    runningPreviews: () => runningList,
    get: (taskId: string) => runningList.find((r) => r.taskId === taskId)?.info ?? null,
    // Mirror the real manager: a started preview joins the registry so a later
    // stop finds it (the real stop is a no-op with nothing registered).
    start: async () => {
      if (startResult.ok && startResult.url) {
        runningList.push({
          taskId: "0627",
          info: info({ label: "default", url: startResult.url }),
        });
      }
      return startResult;
    },
    stop: async (taskId: string) => {
      const i = runningList.findIndex((r) => r.taskId === taskId);
      if (i === -1) return;
      runningList.splice(i, 1);
      stops.push(taskId);
    },
    stops,
  } as unknown as PreviewManager & { stops: string[] };
}

// The real page choreography is tested elsewhere; the capture is mocked so the
// busy/store/preview-lifecycle contract is what these tests pin.
vi.mock("../../core/shot-page.js", () => ({
  captureShotPage: vi.fn(async () => Buffer.from("png-bytes")),
  SHOT_NAV_TIMEOUT_MS: 30_000,
  SHOT_SELECTOR_TIMEOUT_MS: 5_000,
}));
vi.mock("../../commands/ui-harness.js", () => ({
  launchWebkit: vi.fn(async () => ({
    newContext: async () => ({
      // captureEntryPage uses the page directly for the viewport + close.
      newPage: async () => ({
        setViewportSize: async () => {},
        close: async () => {},
      }),
      close: async () => {},
    }),
    close: async () => {},
  })),
}));

import { captureDeclaredShot } from "../../server/shot-capture.js";
import { localShotStore } from "../../server/shots.js";

const ENTRY = {
  target: "default",
  route: "/",
  label: "Task drawer open",
  provenance: { kind: "declared" as const, label: "Task drawer open" },
};

describe("captureDeclaredShot busy semantics (#0627)", () => {
  it("is busy when another task's preview holds the single slot", async () => {
    const config = setup();
    const previews = fakePreviews([{ taskId: "0999", info: info({ label: "docs" }) }]);
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, ENTRY);
    expect("error" in result && result.busy).toBe(true);
    // Nothing was captured or started.
    expect(localShotStore(config, "0627").list()).toEqual([]);
    expect(previews.stops).toEqual([]);
  });

  it("is busy when the task's own preview runs a DIFFERENT target", async () => {
    const config = setup();
    const previews = fakePreviews([
      { taskId: "0627", info: info({ label: "docs", url: "http://127.0.0.1:8000" }) },
    ]);
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, {
      ...ENTRY,
      target: "web",
    });
    expect("error" in result && result.busy).toBe(true);
    expect("error" in result && result.error).toContain("docs");
  });

  it("reuses the task's own same-target preview without stopping it", async () => {
    const config = setup();
    const previews = fakePreviews([
      { taskId: "0627", info: info({ label: "default", url: "http://127.0.0.1:8000" }) },
    ]);
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, ENTRY);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.shot.provenance).toBe("declared: Task drawer open");
    // Deliberately NOT origin: "auto" (#0627) — re-handoff cleanup keeps it.
    expect(result.shot.origin).toBeUndefined();
    expect(previews.stops).toEqual([]);
  });

  it("stops a preview it started itself", async () => {
    const config = setup();
    const previews = fakePreviews([], { ok: true, url: "http://127.0.0.1:9000/" });
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, ENTRY);
    expect("error" in result).toBe(false);
    expect(previews.stops).toEqual(["0627"]);
    const stored = localShotStore(config, "0627").list();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.target).toBe("default");
  });
});
