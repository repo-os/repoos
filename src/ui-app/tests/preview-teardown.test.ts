/**
 * Preview teardown + one-preview cap (#0853).
 *
 * Pins the lifecycle rules that used to leak a preview past its task:
 *   - boot/reload reconciliation stops previews recorded for finished or
 *     archived tasks, and adopts ones whose task is still active/review;
 *   - a preview is stopped when its task leaves active/review (reconcile is the
 *     safety net the server runs on status changes and periodically);
 *   - the one-preview cap counts starts still in flight, so two concurrent
 *     starts cannot both win the slot;
 *   - teardown only signals the PIDs/process groups RepoOS recorded — a
 *     same-shaped process that is not in the registry is never touched, i.e.
 *     nothing is killed by name.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewManager, type PreviewInfo } from "../../server/preview.js";

const children: ChildProcess[] = [];

/** A long-lived process shaped like a preview child (`--port <n>` in `ps`). */
function fakePreview(port: number): number {
  const child = spawn(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)", "--", "--port", String(port), "serve"],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  if (!child.pid) throw new Error("could not spawn fake preview");
  children.push(child);
  return child.pid;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid: number, timeoutMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !alive(pid);
}

function infoFor(pid: number, port: number, extra: Partial<PreviewInfo> = {}): PreviewInfo {
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    startedAt: new Date().toISOString(),
    pid,
    command: `${process.execPath} -e "setInterval(() => {}, 1000)" --port ${port} serve`,
    readyPath: "/",
    processGroup: true,
    ...extra,
  };
}

function managerFixture(): { manager: PreviewManager; root: string; registryPath: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-preview-teardown-"));
  mkdirSync(join(root, ".repoos"), { recursive: true });
  const manager = new PreviewManager(
    { root, cacheDir: ".repoos" } as never,
    () => {},
    (taskId, _level, message) => taskLog.push(`#${taskId} ${message}`),
  );
  return { manager, root, registryPath: join(root, ".repoos", "previews.json") };
}

const taskLog: string[] = [];

function writeRegistry(path: string, entries: Record<string, PreviewInfo>): void {
  writeFileSync(path, JSON.stringify({ mainPid: 1, previews: entries }, null, 2));
}

afterEach(() => {
  for (const child of children.splice(0)) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
    try {
      if (child.pid) process.kill(child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  taskLog.length = 0;
  vi.restoreAllMocks();
});

describe("preview boot reconciliation (#0853)", () => {
  it("stops previews for finished tasks, adopts live ones, and never kills by name", async () => {
    const { manager, root, registryPath } = managerFixture();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const finishedPid = fakePreview(45801);
    const livePid = fakePreview(45802);
    // Same shape (`--port ... serve`) but NOT recorded: must survive.
    const decoyPid = fakePreview(45803);
    writeRegistry(registryPath, {
      "0001": infoFor(finishedPid, 45801),
      "0002": infoFor(livePid, 45802),
    });
    try {
      await manager.cleanupOrphans({
        liveTaskIds: new Set(["0002"]),
        taskStatuses: new Map([
          ["0001", "done"],
          ["0002", "active"],
        ]),
      });

      // Finished task: stopped, with the log line reviewers can grep.
      expect(await waitDead(finishedPid)).toBe(true);
      expect(log.mock.calls.map((c) => String(c[0])).join("\n")).toContain(
        "preview for #0001 stopped (task done)",
      );
      // Live task: adopted in place, still serving.
      expect(alive(livePid)).toBe(true);
      expect(manager.get("0002")?.pid).toBe(livePid);
      // Not recorded anywhere: untouched, proving no name-based kill.
      expect(alive(decoyPid)).toBe(true);

      // The adopted preview is still under the lifecycle rules.
      await manager.stop("0002", "task done");
      expect(await waitDead(livePid)).toBe(true);
    } finally {
      await manager.stopAll();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("preview reconcile (#0853)", () => {
  it("stops a preview whose task is archived and leaves an active task's preview alone", async () => {
    const { manager, root } = managerFixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const archivedPid = fakePreview(45811);
    const activePid = fakePreview(45812);
    const internals = manager as unknown as {
      registry: Map<string, PreviewInfo>;
    };
    internals.registry.set("0001", infoFor(archivedPid, 45811));
    internals.registry.set("0002", infoFor(activePid, 45812));
    try {
      const stopped = await manager.reconcile({
        liveTaskIds: new Set(["0002"]), // archived tasks are excluded from live
        taskStatuses: new Map([
          ["0001", "review"],
          ["0002", "active"],
        ]),
        archivedTaskIds: new Set(["0001"]),
      });

      expect(stopped.stopped).toEqual(["0001"]);
      expect(await waitDead(archivedPid)).toBe(true);
      expect(alive(activePid)).toBe(true);
      expect(manager.get("0002")?.pid).toBe(activePid);
      expect(manager.get("0001")).toBeNull();
    } finally {
      await manager.stopAll();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("one-preview cap (#0853)", () => {
  it("counts a start still in flight as holding the slot", async () => {
    const { manager, root } = managerFixture();
    const internals = manager as unknown as {
      inflight: Map<string, Promise<unknown>>;
      cancelled: Set<string>;
      evictIfAtCapacity: (id: string) => Promise<void>;
    };
    const pending = new Promise(() => {});
    internals.inflight.set("0002", pending);
    try {
      await internals.evictIfAtCapacity("0001");
      // The older in-flight start is cancelled so the newcomer can take the
      // single slot instead of both spawning.
      expect(internals.cancelled.has("0002")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not cancel the starting task itself", async () => {
    const { manager, root } = managerFixture();
    const internals = manager as unknown as {
      inflight: Map<string, Promise<unknown>>;
      cancelled: Set<string>;
      evictIfAtCapacity: (id: string) => Promise<void>;
    };
    internals.inflight.set("0001", new Promise(() => {}));
    try {
      await internals.evictIfAtCapacity("0001");
      expect(internals.cancelled.size).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
