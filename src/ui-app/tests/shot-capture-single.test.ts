/**
 * Single-entry capture (#0627): `captureDeclaredShot` — the drawer's Add-shot
 * path. Pins the busy semantics that DIFFER from the handoff pass (a manual
 * capture never evicts a preview a human is viewing), the declared provenance
 * with NO `origin: "auto"` (so re-handoff cleanup never deletes it), and that
 * a preview the capture started is stopped again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import type { PreviewConfig, RepoOSConfig, Task } from "../../core/types.js";
import type { PreviewInfo, PreviewManager } from "../../server/preview.js";
import { formatRemoteShotActivity } from "../../server/shot-capture.js";

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
  startResult: { ok: boolean; url?: string; error?: string; label?: string } = {
    ok: true,
    url: "http://127.0.0.1:9000",
  },
  // A preview that registers AFTER the capture's `runningPreviews()` snapshot
  // (e.g. while WebKit launches): visible to `get`/`start`, not to the
  // snapshot — the race window under review round 2.
  racePreview?: { taskId: string; info: PreviewInfo },
): PreviewManager & { stops: string[]; starts: unknown[] } {
  const stops: string[] = [];
  const starts: unknown[] = [];
  const runningList = [...running];
  return {
    runningPreviews: () => runningList,
    get: (taskId: string) =>
      runningList.find((r) => r.taskId === taskId)?.info ??
      (racePreview && racePreview.taskId === taskId ? racePreview.info : null),
    // Mirror the real manager: a started preview joins the registry so a later
    // stop finds it (the real stop is a no-op with nothing registered). With a
    // race preview armed, `start` idempotently returns the existing preview
    // instead of spawning — the real manager's existing-check runs first.
    start: async (_task: unknown, _target: unknown, opts: unknown) => {
      starts.push(opts);
      if (racePreview && racePreview.taskId === "0627") {
        return {
          ok: true,
          url: racePreview.info.url,
          ...(racePreview.info.label ? { label: racePreview.info.label } : {}),
        };
      }
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
    starts,
  } as unknown as PreviewManager & { stops: string[]; starts: unknown[] };
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

import {
  captureDeclaredShot,
  importRemoteShots,
  runAutoShotCapture,
} from "../../server/shot-capture.js";
import { captureShotPage } from "../../core/shot-page.js";
import { localShotStore } from "../../server/shots.js";
import type { BrowserEvidenceArtifacts } from "../../server/browser-capture-policy.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function initGitRoot(root: string): void {
  execFileSync("git", ["init", "-b", "feat/x"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "RepoOS test"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root, stdio: "ignore" });
  writeFileSync(join(root, "tracked.txt"), "fixture\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
}

function remoteConfig(): RepoOSConfig {
  const config = setup();
  initGitRoot(config.root);
  return {
    ...config,
    remoteValidation: {
      ...config.remoteValidation,
      enabled: true,
      browserCaptureMode: "runner-available",
    },
  };
}

function deferredCapture(
  taskId: string,
  payload: Omit<BrowserEvidenceArtifacts, "taskId">,
): {
  transport: { capture: () => Promise<BrowserEvidenceArtifacts> };
  started: Promise<void>;
  release: () => void;
} {
  let resolveStart!: () => void;
  let resolveCapture!: (artifacts: BrowserEvidenceArtifacts) => void;
  const started = new Promise<void>((resolve) => (resolveStart = resolve));
  const transport = {
    capture: () =>
      new Promise<BrowserEvidenceArtifacts>((resolve) => {
        resolveCapture = resolve;
        resolveStart();
      }),
  };
  return {
    transport,
    started,
    release: () => resolveCapture({ ...payload, taskId }),
  };
}

const ENTRY = {
  target: "default",
  route: "/",
  label: "Task drawer open",
  provenance: { kind: "declared" as const, label: "Task drawer open" },
};

describe("captureDeclaredShot busy semantics (#0627)", () => {
  it("does not duplicate the shots prefix from runner details", () => {
    expect(
      formatRemoteShotActivity({ status: "captured", detail: "shots: 2 screenshots captured" }),
    ).toBe("shots: 2 screenshots captured");
  });

  it("reserves a remote declared-shot capture so a duplicate cannot overlap", async () => {
    const config = remoteConfig();
    const task = makeTask("0627-remote", { branch: "feat/x" });
    const remote = deferredCapture(task.id, {
      version: 1,
      ok: true,
      detail: "captured",
      results: {
        singleShot: {
          shot: { name: "runner.png", target: "default", route: "/" },
          warnings: [],
        },
      },
      files: [{ name: "shots/runner.png", data: PNG_1PX }],
    });
    const first = captureDeclaredShot(config, task, fakePreviews(), ENTRY, remote.transport);
    await remote.started;

    const duplicate = await captureDeclaredShot(
      config,
      task,
      fakePreviews(),
      ENTRY,
      remote.transport,
    );
    expect("error" in duplicate && duplicate.busy).toBe(true);
    remote.release();
    expect("shot" in (await first)).toBe(true);
  });

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

  it("is busy when the task's own preview has NO identifiable target label", async () => {
    const config = setup();
    const previews = fakePreviews([
      { taskId: "0627", info: info({ url: "http://127.0.0.1:8000" }) },
    ]);
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, ENTRY);
    // An unlabeled preview could be serving ANY target — reusing it for
    // "default" might shoot the wrong one (review round 2).
    expect("error" in result && result.busy).toBe(true);
    expect("error" in result && result.error).toContain("could not be identified");
    expect(previews.starts).toEqual([]);
    expect(previews.stops).toEqual([]);
    expect(localShotStore(config, "0627").list()).toEqual([]);
  });

  it("is busy and stops nothing when a DIFFERENT-target preview races in after the snapshot", async () => {
    const config = setup();
    // The human clicks Preview while WebKit is launching: the snapshot saw
    // nothing, but by the time the capture starts a preview, task #0627's own
    // "docs" preview is registered. Evicting it would be the exact bug the
    // noEvict option exists to prevent (review round 2).
    const previews = fakePreviews(
      [],
      { ok: true, url: "http://127.0.0.1:9000" },
      { taskId: "0627", info: info({ label: "docs", url: "http://127.0.0.1:8000" }) },
    );
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, ENTRY);
    expect("error" in result && result.busy).toBe(true);
    expect("error" in result && result.error).toContain("docs");
    // Nothing was stopped, and nothing was captured.
    expect(previews.stops).toEqual([]);
    expect(localShotStore(config, "0627").list()).toEqual([]);
  });

  it("reuses a same-target preview that races in after the snapshot without stopping it", async () => {
    const config = setup();
    const previews = fakePreviews(
      [],
      { ok: true, url: "http://127.0.0.1:9000" },
      { taskId: "0627", info: info({ label: "default", url: "http://127.0.0.1:8000" }) },
    );
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, ENTRY);
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    // Captured from the racing preview, which is left running — it is the
    // human's, not the capture's to stop.
    expect(localShotStore(config, "0627").list()[0]!.provenance).toBe("declared: Task drawer open");
    expect(previews.stops).toEqual([]);
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
    // The busy decision is made atomically inside `start` via the no-evict
    // option — a preview starting between the snapshot check and the start can
    // never be evicted by this capture (review round 1).
    expect(previews.starts).toEqual([{ noEvict: true }]);
    const stored = localShotStore(config, "0627").list();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.target).toBe("default");
  });

  it("refuses to store a declared shot whose state never rendered (#0866)", async () => {
    const config = setup();
    const previews = fakePreviews();
    vi.mocked(captureShotPage).mockImplementationOnce(
      async (_page, _url, entry, _options, misses) => {
        misses?.onStateMiss?.(
          `state "${entry.state}" did not render on target "${entry.target}"`,
          entry.route,
        );
        return Buffer.from("png-bytes");
      },
    );
    const result = await captureDeclaredShot(config, makeTask("0866-state"), previews, {
      ...ENTRY,
      route: "/work?task=9999&tab=changes",
      state: "drawer:shotEvidence",
    });
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain('state "drawer:shotEvidence" did not render');
    // The wrong-screen frame is never saved as evidence.
    expect(localShotStore(config, "0866-state").list()).toEqual([]);
  });

  it("stores the full declaration on the shot for exact delete sync", async () => {
    const config = setup();
    const previews = fakePreviews();
    const declared = {
      target: "default",
      label: "Task drawer open",
      selector: ".drawer",
      steps: [{ click: ".toggle" }],
    };
    const result = await captureDeclaredShot(config, makeTask("0627"), previews, {
      ...ENTRY,
      declared,
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.shot.declared).toEqual(declared);
  });
});

describe("runAutoShotCapture remote reservation", () => {
  it("skips a duplicate while the runner is capturing the same task", async () => {
    const config = {
      ...remoteConfig(),
      preview: { command: "echo preview" } as PreviewConfig,
    };
    const task = makeTask("0854-remote", {
      branch: "feat/x",
      body: '## Shots\n```json\n[{ "target": "default", "route": "/" }]\n```\n',
    });
    const shotsJson = Buffer.from(
      JSON.stringify({ shots: [{ name: "runner.png", target: "default", origin: "auto" }] }),
    ).toString("base64");
    const remote = deferredCapture(task.id, {
      version: 1,
      ok: true,
      detail: "captured",
      results: { shots: { status: "captured", detail: "1 screenshot captured", count: 1 } },
      files: [
        { name: "shots/shots.json", data: shotsJson },
        { name: "shots/runner.png", data: PNG_1PX },
      ],
    });
    const first = runAutoShotCapture(config, task, fakePreviews(), vi.fn(), remote.transport);
    await remote.started;

    const duplicate = await runAutoShotCapture(
      config,
      task,
      fakePreviews(),
      vi.fn(),
      remote.transport,
    );
    expect(duplicate).toMatchObject({ status: "skipped" });
    remote.release();
    expect(await first).toMatchObject({ status: "captured" });
  });

  it("sends the canonical task body, config and plan with the request (#0854)", async () => {
    const config = {
      ...remoteConfig(),
      preview: { command: "echo preview" } as PreviewConfig,
    };
    const body = '## Shots\n```json\n[{ "target": "default", "route": "/new" }]\n```\n';
    const task = makeTask("0854-plan", { branch: "feat/x", body, area: "core" });
    let request:
      | { canonical?: { task?: { body?: string }; plan?: { entries: unknown[] } } }
      | undefined;
    const transport = {
      capture: async (req: never) => {
        request = req;
        return {
          version: 1,
          taskId: task.id,
          ok: true,
          detail: "captured",
          results: { shots: { status: "captured", detail: "1 screenshot captured", count: 1 } },
          files: [],
        } satisfies BrowserEvidenceArtifacts;
      },
    };
    const result = await runAutoShotCapture(
      config,
      task,
      fakePreviews(),
      vi.fn(),
      transport as never,
    );
    expect(result.status).toBe("captured");
    expect(request?.canonical?.task?.body).toBe(body);
    expect(
      (request?.canonical?.plan?.entries ?? []).map((e) => (e as { route?: string }).route),
    ).toEqual(["/new"]);
  });
});

describe("captureDeclaredShot runner-only structured error (#0854)", () => {
  it("returns an error result instead of throwing when runner-only capture fails", async () => {
    const base = setup();
    const config = {
      ...base,
      remoteValidation: {
        ...base.remoteValidation,
        enabled: true,
        browserCaptureMode: "runner-only" as const,
      },
    };
    const result = await captureDeclaredShot(
      config,
      makeTask("0854-struct"),
      fakePreviews(),
      ENTRY,
    );
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("remote capture failed");
  });
});

describe("importRemoteShots partial success (#0854)", () => {
  function failedArtifacts(taskId: string, files: { name: string; data: string }[]) {
    return {
      version: 1,
      taskId,
      ok: false,
      detail: "runner browser capture reported failures",
      results: { shots: { status: "failed", detail: "shots: capture of b.png failed" } },
      files,
    } satisfies BrowserEvidenceArtifacts;
  }

  const manifest = (names: string[]): string =>
    Buffer.from(
      JSON.stringify({
        shots: names.map((name) => ({ name, target: "default", origin: "auto" })),
      }),
    ).toString("base64");

  it("keeps the shots a partially failed run did produce", async () => {
    const config = setup();
    const result = await importRemoteShots(
      config,
      makeTask("0854-partial"),
      failedArtifacts("0854-partial", [
        { name: "shots/shots.json", data: manifest(["a.png"]) },
        { name: "shots/a.png", data: PNG_1PX },
      ]),
      vi.fn(),
    );
    expect(result.status).toBe("failed");
    expect(result.detail).toContain("kept 1 earlier shot");
    expect(localShotStore(config, "0854-partial").list()).toHaveLength(1);
  });

  it("imports nothing when a failed run produced no manifest", async () => {
    const config = setup();
    const result = await importRemoteShots(
      config,
      makeTask("0854-noshots"),
      failedArtifacts("0854-noshots", []),
      vi.fn(),
    );
    expect(result.status).toBe("failed");
    expect(localShotStore(config, "0854-noshots").list()).toEqual([]);
  });
});
