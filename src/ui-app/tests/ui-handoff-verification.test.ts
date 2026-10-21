import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createPageGateCollector,
  formatPageGateIssues,
  type PageGateListenerPage,
} from "../../core/page-browser-gate.js";
import {
  effectiveHandoffTreeStatus,
  handoffTreeNote,
  handoffTreeStatus,
  readUiHandoffGateEvidence,
  runUiHandoffGate,
  importRemoteVerification,
  taskUiVerificationMode,
  type UiHandoffGateDeps,
} from "../../server/ui-handoff-gate.js";
import * as shotCapture from "../../server/shot-capture.js";
import * as shotStore from "../../server/shots.js";
import {
  DOCS_SHOT_ROUTE_DOC,
  isDocsShotSkip,
  runLevelIssueLines,
} from "../src/lib/handoff-verification";
import {
  resetPreviewVerificationSlot,
  withPreviewVerificationSlot,
} from "../../server/preview-verification-slot.js";
import type { RepoOSConfig } from "../../core/types.js";
import type { Task } from "../../core/types.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("UI handoff verification gate (#0680)", () => {
  const temps: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    resetPreviewVerificationSlot();
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  it("uses an existing manual shot as the refresh plan when no declaration or path plan exists", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-manual-refresh-"));
    temps.push(root);
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      preview: { targets: [{ name: "web", paths: ["src/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "manual-refresh",
      title: "t",
      path: "work/manual-refresh.md",
      absPath: join(root, "work/manual-refresh.md"),
      status: "review",
      branch: "feat/manual-refresh",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotStore, "localShotStore").mockReturnValue({
      list: () => [
        {
          name: "manual.png",
          target: "web",
          route: "/settings?tab=general",
          label: "Settings view",
          path: "work/.attachments/manual-refresh/shots/manual.png",
          url: "/api/tasks/manual-refresh/shots/manual.png",
          size: 10,
          mime: "image/png",
          capturedAt: new Date().toISOString(),
        },
      ],
    } as ReturnType<typeof shotStore.localShotStore>);
    const plan = shotCapture.planAutoCapture(config, task, { forceRefresh: true });
    expect(plan).toMatchObject({
      entries: [{ target: "web", route: "/settings?tab=general", label: "Settings view" }],
    });
  });

  it("validates remote verification evidence before replacing existing shots", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-invalid-artifacts-"));
    temps.push(root);
    const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
    const task = {
      id: "invalid-record",
      title: "t",
      path: "work/invalid-record.md",
      absPath: join(root, "work/invalid-record.md"),
      status: "review",
      branch: "feat/invalid-record",
      area: "web",
      body: "",
    } as Task;
    const store = shotStore.localShotStore(config, task.id);
    const prior = store.save({ target: "web", origin: "auto", data: PNG_1PX });
    if ("error" in prior) throw new Error(prior.error);
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
    const shots = encode({
      shots: [{ name: "replacement.png", target: "web", origin: "auto" }],
    });
    await expect(
      importRemoteVerification(
        config,
        task,
        {
          version: 1,
          taskId: task.id,
          ok: true,
          detail: "captured",
          results: { verification: { ok: true, detail: "ok" } },
          files: [
            { name: "shots/shots.json", data: shots },
            { name: "shots/replacement.png", data: PNG_1PX },
            {
              name: "verification.json",
              data: encode({ at: new Date().toISOString(), issues: [], blankShots: [] }),
            },
          ],
        },
        vi.fn(),
      ),
    ).rejects.toThrow("invalid UI verification record");
    expect(store.list().map((shot) => shot.name)).toEqual([prior.name]);
  });

  it("keeps the shots a partially failed verification did produce (#0854)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-partial-"));
    temps.push(root);
    const config = { root, workDir: "work", cacheDir: ".repoos" } as RepoOSConfig;
    const task = {
      id: "partial-verify",
      title: "t",
      path: "work/partial-verify.md",
      absPath: join(root, "work/partial-verify.md"),
      status: "review",
      branch: "feat/partial-verify",
      area: "web",
      body: "",
    } as Task;
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
    await expect(
      importRemoteVerification(
        config,
        task,
        {
          version: 1,
          taskId: task.id,
          ok: false,
          detail: "runner browser capture reported failures",
          results: { verification: { ok: false, detail: "capture of / broke" } },
          files: [
            {
              name: "shots/shots.json",
              data: encode({ shots: [{ name: "kept.png", target: "web", origin: "auto" }] }),
            },
            { name: "shots/kept.png", data: PNG_1PX },
          ],
        },
        vi.fn(),
      ),
    ).rejects.toThrow(/kept 1 earlier shot/);
    expect(shotStore.localShotStore(config, task.id).list()).toHaveLength(1);
  });

  it("reserves the task capture lock during remote UI verification", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-remote-lock-"));
    temps.push(root);
    execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "runner-test@example.com"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Runner test"], {
      cwd: root,
      stdio: "ignore",
    });
    writeFileSync(join(root, "README.md"), "fixture\n");
    execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      uiVerification: { enabled: true },
      preview: { command: "echo preview" },
      remoteValidation: { enabled: true, browserCaptureMode: "runner-available" },
    } as RepoOSConfig;
    const task = {
      id: "remote-lock",
      title: "t",
      path: "work/remote-lock.md",
      absPath: join(root, "work/remote-lock.md"),
      status: "review",
      branch: "main",
      area: "web",
      body: '## Shots\n```json\n[{ "target": "default", "route": "/" }]\n```\n',
    } as Task;
    let release!: (value: {
      version: 1;
      taskId: string;
      ok: boolean;
      detail: string;
      results: Record<string, unknown>;
      files: [];
    }) => void;
    let started!: () => void;
    const captureStarted = new Promise<void>((resolve) => (started = resolve));
    const captureResult = new Promise<{
      version: 1;
      taskId: string;
      ok: boolean;
      detail: string;
      results: Record<string, unknown>;
      files: [];
    }>((resolve) => (release = resolve));
    const transport = {
      capture: () => {
        started();
        return captureResult;
      },
    };
    const verification = runUiHandoffGate(config, task, undefined, vi.fn(), {
      forceRefresh: true,
      remoteTransport: transport,
    });
    await captureStarted;
    const shots = await shotCapture.runAutoShotCapture(
      config,
      task,
      {} as never,
      vi.fn(),
      transport,
    );
    expect(shots.status).toBe("skipped");
    release({
      version: 1,
      taskId: task.id,
      ok: true,
      detail: "no capture required",
      results: { verification: { ok: true, skipped: true, detail: "no capture required" } },
      files: [],
    });
    await expect(verification).resolves.toMatchObject({ ok: true, skipped: true });
  });

  it("returns a structured runner-only failure from verify instead of throwing", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-runner-only-"));
    temps.push(root);
    execFileSync("git", ["init", "-b", "main"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "runner-test@example.com"], {
      cwd: root,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Runner test"], {
      cwd: root,
      stdio: "ignore",
    });
    writeFileSync(join(root, "README.md"), "fixture\n");
    execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      uiVerification: { enabled: true },
      preview: { command: "echo preview" },
      remoteValidation: { enabled: true, browserCaptureMode: "runner-only" },
    } as RepoOSConfig;
    const task = {
      id: "runner-only-verify",
      title: "t",
      path: "work/runner-only-verify.md",
      absPath: join(root, "work/runner-only-verify.md"),
      status: "review",
      branch: "main",
      area: "web",
      body: '## Shots\n```json\n[{ "target": "default", "route": "/" }]\n```\n',
    } as Task;
    const result = await runUiHandoffGate(config, task, undefined, vi.fn(), {
      forceRefresh: true,
      remoteTransport: {
        capture: async () => {
          throw new Error("runner offline");
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("runner-only browser capture failed");
    expect(result.detail).toContain("runner offline");
  });

  it("explicit refresh bypasses the normal engineer-capture pre-emption check", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-force-manual-"));
    temps.push(root);
    const config = {
      root,
      workDir: "work",
      cacheDir: ".repoos",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "manual-force",
      title: "t",
      path: "work/manual-force.md",
      absPath: join(root, "work/manual-force.md"),
      status: "review",
      branch: "feat/manual-force",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotStore, "localShotStore").mockReturnValue({
      list: () => [
        {
          name: "manual.png",
          target: "web",
          route: "/settings",
          label: "Settings",
          path: "manual.png",
          url: "/manual.png",
          size: 10,
          mime: "image/png",
          capturedAt: new Date().toISOString(),
        },
      ],
    } as ReturnType<typeof shotStore.localShotStore>);
    const planSpy = vi
      .spyOn(shotCapture, "planAutoCapture")
      .mockImplementation((_config, _task, opts) =>
        opts?.forceRefresh
          ? {
              entries: [
                {
                  target: "web",
                  route: "/settings",
                  provenance: { kind: "declared" },
                },
              ],
              errors: [],
              skips: [],
              collapsed: [],
            }
          : { reason: "an engineer-made capture pre-empts the automatic one" },
      );

    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      forceRefresh: true,
      recordTaskNotes: false,
    });

    expect(result).toMatchObject({
      skipped: true,
      detail: "ui verification skipped — no preview manager",
    });
    expect(planSpy).toHaveBeenCalledWith(config, task, { forceRefresh: true });
  });

  it("collects console errors from a page", () => {
    const collector = createPageGateCollector();
    const handlers: Record<string, Array<(arg: unknown) => void>> = {
      console: [],
      pageerror: [],
      response: [],
    };
    const page = {
      on(event: string, handler: (arg: unknown) => void) {
        handlers[event]?.push(handler);
      },
      async evaluate<T>(fn: () => T): Promise<T> {
        return fn();
      },
      async setViewportSize(): Promise<void> {},
    } as unknown as PageGateListenerPage;
    collector.attach(page);
    handlers.console[0]?.({
      type: () => "error",
      text: () => "MapLibre worker failed",
      location: () => ({ url: "" }),
    });
    expect(collector.drain()).toMatchObject([
      { kind: "console", message: "MapLibre worker failed" },
    ]);
    expect(formatPageGateIssues(collector.drain())).toBe("");
  });

  it("fails handoff with evidence when synthetic console issues are injected", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0680",
      title: "t",
      path: "work/0680.md",
      absPath: join(root, "work/0680.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    writeFileSync(task.absPath, "tracked task contents\n");
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      syntheticIssues: [{ kind: "console", message: "stub page error" }],
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("stub page error");
    expect(result.evidencePath).toBeTruthy();
  });

  it("fails handoff when capture reports horizontal overflow", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0680",
      title: "t",
      path: "work/0680.md",
      absPath: join(root, "work/0680.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    writeFileSync(task.absPath, "tracked task contents\n");
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/",
          label: "home",
          provenance: { kind: "declared", label: "home" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: {
          close: async () => {},
          newPage: async () => ({}),
          newContext: async () => ({}),
        },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [
          {
            kind: "overflow",
            message: "home: body scrollWidth 1200 > innerWidth 1024",
            viewportWidth: 1024,
          },
        ],
        blank: false,
        warnings: [],
        finalUrl: "http://127.0.0.1:9/",
        assertions: [],
      }),
      forceRefresh: true,
      recordTaskNotes: false,
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("overflow");
    expect(shotCapture.planAutoCapture).toHaveBeenCalledWith(config, task, { forceRefresh: true });
    expect(readFileSync(task.absPath, "utf8")).toBe("tracked task contents\n");
    // #0753: the capture keeps its OWN issues, so the Changes tab can show them
    // in that shot's popover instead of repeating the handoff list on every row.
    const evidence = readUiHandoffGateEvidence(config, task.id);
    expect(evidence?.captureDetails?.[0]?.issues?.map((i) => i.kind)).toEqual(["overflow"]);
    expect(evidence?.captureDetails?.[0]?.issues?.[0]?.viewportWidth).toBe(1024);
    vi.restoreAllMocks();
  });

  it("fails handoff when the browser lands on a different route (#0734)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0734route",
      title: "t",
      path: "work/0734route.md",
      absPath: join(root, "work/0734route.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/settings",
          label: "Settings",
          provenance: { kind: "declared", label: "Settings" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      // The declaration asked for /settings but the app redirected to /login.
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: [],
        finalUrl: "http://127.0.0.1:9/login",
        assertions: [],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("route");
    expect(result.detail).toContain("/login");
    vi.restoreAllMocks();
  });

  it("fails handoff when a declared highlight matches nothing (#0830)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0734hl",
      title: "t",
      path: "work/0734hl.md",
      absPath: join(root, "work/0734hl.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/agents",
          label: "Agents",
          highlight: ".agent-row",
          provenance: { kind: "declared", label: "Agents" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: ["highlight .agent-row matched nothing on /agents"],
        finalUrl: "http://127.0.0.1:9/agents",
        assertions: [],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing-target");
    expect(result.detail).toContain("Agents");
    expect(result.detail).toContain(".agent-row");
    const evidence = readUiHandoffGateEvidence(config, task.id);
    expect(evidence?.warnings?.some((w) => w.includes(".agent-row"))).toBe(true);
    vi.restoreAllMocks();
  });

  it("fails handoff when a declared waitFor step times out, and passes when fixed (#0830)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0830wait",
      title: "t",
      path: "work/0830wait.md",
      absPath: join(root, "work/0830wait.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    const entry = {
      target: "web",
      route: "/agents",
      label: "Agents tab",
      steps: [{ waitFor: ".agent-row" }],
      provenance: { kind: "declared" as const, label: "Agents tab" },
    };
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [entry],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const failCapture = async () => ({
      png: Buffer.alloc(5000),
      issues: [],
      blank: false,
      warnings: ["waitFor .agent-row: Timeout 5000ms exceeded on /agents"],
      finalUrl: "http://127.0.0.1:9/agents",
      assertions: [],
    });
    const passCapture = async () => ({
      png: Buffer.alloc(5000),
      issues: [],
      blank: false,
      warnings: [],
      finalUrl: "http://127.0.0.1:9/agents",
      assertions: [],
    });
    const gateDeps = {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: failCapture,
    };
    const failed = await runUiHandoffGate(config, task, undefined, () => {}, gateDeps);
    expect(failed.ok).toBe(false);
    expect(failed.detail).toContain("Agents tab");
    expect(failed.detail).toContain("waitFor .agent-row");

    const passed = await runUiHandoffGate(config, task, undefined, () => {}, {
      ...gateDeps,
      captureEntry: passCapture,
    });
    expect(passed.ok).toBe(true);
    vi.restoreAllMocks();
  });

  it("passes handoff with warnings when an auto capture misses a target (#0830)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0830auto",
      title: "t",
      path: "work/0830auto.md",
      absPath: join(root, "work/0830auto.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/",
          label: "Board",
          highlight: ".missing",
          provenance: { kind: "auto", globs: ["src/ui-app/**"] },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: ["highlight .missing matched nothing on /"],
        finalUrl: "http://127.0.0.1:9/",
        assertions: [],
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("shot warning");
    vi.restoreAllMocks();
  });

  it("fails handoff when a required assertion is unmet (#0734)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0734assert",
      title: "t",
      path: "work/0734assert.md",
      absPath: join(root, "work/0734assert.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/",
          label: "Reviews",
          assert: [{ selector: ".review-row", minCount: 1, label: "review rows present" }],
          provenance: { kind: "declared", label: "Reviews" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: [],
        finalUrl: "http://127.0.0.1:9/",
        assertions: [
          {
            assertion: { selector: ".review-row", minCount: 1, label: "review rows present" },
            description: "review rows present · selector .review-row · at least 1",
            passed: false,
            detail: "selector .review-row matched 0 element(s), expected at least 1",
            blocking: true,
          },
        ],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("assertion");
    expect(result.detail).toContain("review-row");
    vi.restoreAllMocks();
  });

  it("warns and reports captured vs declared when some declared shots cannot be captured (#0786)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-declwarn-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    // Six declared entries (parses cleanly via the standard fixture list),
    // but the plan only captures two of them — entries 3–6 cannot be
    // captured, so their declarations must be warned about by name and the
    // summary must say 2 of 6, never a clean success.
    const declared = [
      { target: "web", route: "/agents", label: "Agents" },
      { target: "web", route: "/", label: "Board" },
      { target: "web", route: "/bogus", label: "Stalled card" },
      { target: "web", route: "/also-bogus", label: "Upload card" },
      { target: "web", route: "/third-bogus", label: "Drawer" },
      { target: "web", route: "/fourth-bogus", label: "Dev page" },
    ];
    const task = {
      id: "0786warn",
      title: "t",
      path: "work/0786warn.md",
      absPath: join(root, "work/0786warn.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body:
        "## Shots\n```json\n" +
        JSON.stringify(declared, null, 2) +
        "\n```\n#0786 — declared shots, four uncapturable",
    } as Task;
    const shots = declared.slice(0, 2).map((entry) => ({
      ...entry,
      provenance: { kind: "declared", label: entry.label } as const,
    }));
    const uncapturable = declared
      .slice(2)
      .map(
        (entry, i) =>
          `shot #${i + 3}: "${entry.label}" — the declared shot could not be captured: ` +
          'preview for target "web" did not start: port busy',
      );
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: shots,
      errors: uncapturable,
      skips: [],
      collapsed: [],
    });
    const logs: string[] = [];
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(
      config,
      task,
      undefined,
      (id, level, msg) => {
        logs.push(`${id} ${level} ${msg}`);
      },
      {
        startPreview: async () => ({ url: "http://127.0.0.1:9" }),
        launchBrowser: mockBrowser,
        captureEntry: async (_ctx, url) => ({
          png: Buffer.alloc(5000),
          issues: [],
          blank: false,
          warnings: [],
          finalUrl: url,
          assertions: [],
        }),
      },
    );
    expect(result.ok).toBe(true);
    const warnings = logs.filter((l) => l.includes("declared shot not captured"));
    expect(warnings).toHaveLength(4);
    for (const warned of ["Stalled card", "Upload card", "Drawer", "Dev page"]) {
      expect(warnings.join("\n")).toContain(warned);
    }
    // The summary counts captured vs declared, not a bare clean success.
    expect(result.detail).toMatch(/2 of 6 shots captured with clean console/);
    expect(result.detail).toContain("4 shot warnings");
    const evidence = readUiHandoffGateEvidence(config, task.id);
    expect(
      evidence?.warnings?.filter((w) => w.includes("declared shot not captured")),
    ).toHaveLength(4);
    vi.restoreAllMocks();
  });

  it("records exact URL, assertions, and main-checkout evidence path (#0734)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0734ev",
      title: "t",
      path: "work/0734ev.md",
      absPath: join(root, "work/0734ev.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/",
          label: "home",
          assert: [{ selector: "body", label: "body present" }],
          provenance: { kind: "declared", label: "home" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      sourceIdentity: "abc1234",
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: [],
        finalUrl: "http://127.0.0.1:9/",
        assertions: [
          {
            assertion: { selector: "body", label: "body present" },
            description: "body present · selector body",
            passed: true,
            detail: "",
            blocking: false,
          },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    const evidence = readUiHandoffGateEvidence(config, task.id);
    expect(evidence?.sourceIdentity).toBe("abc1234");
    expect(evidence?.evidenceDir).toBe(join(root, "work/.attachments/0734ev/shots"));
    expect(evidence?.captureDetails?.[0]?.url).toBe("http://127.0.0.1:9/");
    expect(evidence?.captureDetails?.[0]?.routeMatched).toBe(true);
    expect(evidence?.captureDetails?.[0]?.assertionsPassed).toBe(1);
    expect(evidence?.captureDetails?.[0]?.shot?.path).toMatch(
      /^work\/\.attachments\/0734ev\/shots\/.+\.png$/,
    );
    vi.restoreAllMocks();
  });

  it("fails handoff on blank-looking captures", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    const config = {
      root,
      cacheDir: ".repoos",
    } as unknown as RepoOSConfig;
    const task = {
      id: "0680b",
      title: "t",
      path: "work/0680b.md",
      absPath: join(root, "work/0680b.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      syntheticIssues: [{ kind: "blank", message: "blank-looking screenshot for web/" }],
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("blank");
  });

  it("serializes concurrent verification runs on the preview slot (#0743)", async () => {
    const order: string[] = [];
    const p1 = withPreviewVerificationSlot(
      "a",
      () => {},
      async () => {
        order.push("a-start");
        await new Promise((r) => setTimeout(r, 40));
        order.push("a-end");
      },
    );
    const p2 = withPreviewVerificationSlot(
      "b",
      () => {},
      async () => {
        order.push("b-start");
        order.push("b-end");
      },
    );
    await Promise.all([p1, p2]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("retries capture once after a preview disconnect (#0743)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0743retry",
      title: "t",
      path: "work/0743retry.md",
      absPath: join(root, "work/0743retry.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/",
          label: "home",
          provenance: { kind: "declared", label: "home" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    let captureCalls = 0;
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const previews = {
      stop: vi.fn(async () => {}),
    } as unknown as import("../../server/preview.js").PreviewManager;
    let previewStarts = 0;
    const result = await runUiHandoffGate(config, task, previews, () => {}, {
      launchBrowser: mockBrowser,
      startPreview: async () => {
        previewStarts++;
        return { url: "http://127.0.0.1:9" };
      },
      captureEntry: async () => {
        captureCalls++;
        if (captureCalls === 1) {
          throw new Error("Could not connect to the server");
        }
        return {
          png: Buffer.alloc(5000),
          issues: [],
          blank: false,
          warnings: [],
          finalUrl: "http://127.0.0.1:9/",
          assertions: [],
        };
      },
    });
    expect(result.ok).toBe(true);
    expect(captureCalls).toBe(2);
    expect(previewStarts).toBe(2);
    expect(previews.stop).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("persists each capture's issues on that capture in the evidence (#0753)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0753issues",
      title: "t",
      path: "work/0753issues.md",
      absPath: join(root, "work/0753issues.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/",
          label: "home",
          provenance: { kind: "declared", label: "home" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const previews = {
      stop: vi.fn(async () => {}),
    } as unknown as import("../../server/preview.js").PreviewManager;
    const result = await runUiHandoffGate(config, task, previews, () => {}, {
      launchBrowser: mockBrowser,
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      captureEntry: async () =>
        ({
          png: Buffer.alloc(5000),
          issues: [
            {
              kind: "console",
              message: "TypeError: x is undefined",
              url: "/",
            },
          ],
          blank: false,
          warnings: [],
          finalUrl: "http://127.0.0.1:9/",
          assertions: [],
        }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["captureEntry"]>>>,
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("TypeError");
    // Verify that the capture's issues are stored on that capture in the evidence.
    const evidence = readUiHandoffGateEvidence(config, task.id);
    expect(evidence?.captureDetails?.[0]?.issues).toContainEqual(
      expect.objectContaining({
        kind: "console",
        message: "TypeError: x is undefined",
        url: "/",
      }),
    );
    vi.restoreAllMocks();
  });
});

/**
 * The effective staleness verdict (#0766): a diff of nothing but `work/*.md`
 * between the captured tree and the reviewed HEAD is task bookkeeping and keeps
 * the capture current; anything else — source, docs, another path — stays
 * stale, and git trouble fails closed.
 */
describe("effective handoff tree status — bookkeeping-only drift (#0766)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  /** A repo at a commit, with paths committed one at a time, latest sha tracked. */
  function gitRepo(): {
    root: string;
    shaOf: (n: number) => string;
    commit: (paths: string[]) => void;
  } {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-bookkeeping-"));
    temps.push(root);
    const run = (args: string) =>
      execSync(`git -C ${root} ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    run("init -b main");
    run("config user.email test@example.com");
    run("config user.name Test");
    writeFileSync(join(root, "README.md"), "repo\n");
    run("add README.md");
    run("commit -q -m base");
    const shas: string[] = [run("rev-parse --short HEAD").trim()];
    return {
      root,
      shaOf: (n: number) => shas[Math.min(n, shas.length - 1)],
      commit: (paths: string[]) => {
        for (const p of paths) {
          const abs = join(root, p);
          mkdirSync(join(abs, ".."), { recursive: true });
          writeFileSync(abs, `content for ${p}\n`);
        }
        run(`add ${paths.join(" ")}`);
        run("commit -q -m change");
        shas.push(run("rev-parse --short HEAD").trim());
      },
    };
  }

  it("keeps the capture current when only task files moved the HEAD", async () => {
    const repo = gitRepo();
    repo.commit(["work/0766.md", "work/0765.md"]);
    const status = await effectiveHandoffTreeStatus(
      repo.root,
      { sourceIdentity: repo.shaOf(0) },
      repo.shaOf(1),
    );
    // A status flip / review-passes bump landing after the capture does not
    // invalidate it.
    expect(status).toBe("current");
    expect(handoffTreeNote(status, { sourceIdentity: repo.shaOf(0) }, repo.shaOf(1))).toContain(
      "only RepoOS bookkeeping changed",
    );
  });

  it("honors custom bookkeeping directories and attachments", async () => {
    const repo = gitRepo();
    repo.commit([
      "repoos/tasks/0861.md",
      "repoos/inbox/.attachments/image.png",
      "repoos/stories/s.md",
      "repoos/reminder-data/r.md",
      "repoos/schedules/daily.md",
    ]);
    const status = await effectiveHandoffTreeStatus(
      repo.root,
      { sourceIdentity: repo.shaOf(0) },
      repo.shaOf(1),
      {
        workDir: "repoos/tasks",
        inputsDir: "repoos/inbox",
        storiesDir: "repoos/stories",
        remindersDir: "repoos/reminder-data",
        schedulesDir: "repoos/schedules",
      } as RepoOSConfig,
    );
    expect(status).toBe("current");
  });

  it("keeps the capture stale when any other path moved the HEAD", async () => {
    const repo = gitRepo();
    repo.commit(["work/0766.md"]);
    repo.commit(["src/feature.ts"]);
    // Real source drifted between capture and review...
    let status = await effectiveHandoffTreeStatus(
      repo.root,
      { sourceIdentity: repo.shaOf(0) },
      repo.shaOf(2),
    );
    expect(status).toBe("stale");
    // ...and so did docs (content a docs-site capture can legitimately show).
    repo.commit(["user-docs/cli.md"]);
    status = await effectiveHandoffTreeStatus(
      repo.root,
      { sourceIdentity: repo.shaOf(0) },
      repo.shaOf(3),
    );
    expect(status).toBe("stale");
  });

  it("fails closed when the captured sha cannot classify the drift", async () => {
    const repo = gitRepo();
    // An unknown sha makes the diff impossible — never presented as current.
    const status = await effectiveHandoffTreeStatus(
      repo.root,
      { sourceIdentity: "deadbee1" },
      repo.shaOf(0),
    );
    expect(status).toBe("stale");
  });

  it("stays current when nothing moved or a side is missing", async () => {
    const repo = gitRepo();
    const head = repo.shaOf(0);
    expect(await effectiveHandoffTreeStatus(repo.root, { sourceIdentity: head }, head)).toBe(
      "current",
    );
    // No recorded tree: the mechanical status already says unknown, unchanged.
    expect(await effectiveHandoffTreeStatus(repo.root, null, head)).toBe("unknown");
  });
});

describe("handoff tree identity (#0755)", () => {
  const temps: string[] = [];
  afterEach(() => {
    resetPreviewVerificationSlot();
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  it("calls a capture current when it describes the reviewed HEAD", () => {
    expect(handoffTreeStatus({ sourceIdentity: "16620c0f4" }, "16620c0f4")).toBe("current");
  });

  it("calls a capture stale when the reviewed HEAD has moved on", () => {
    // The #0753 case: evidence for 4266b301b, reviewed HEAD 16620c0f4.
    expect(handoffTreeStatus({ sourceIdentity: "4266b301b" }, "16620c0f4")).toBe("stale");
  });

  it("never treats a missing side as a match", () => {
    expect(handoffTreeStatus(null, "16620c0f4")).toBe("unknown");
    expect(handoffTreeStatus({ sourceIdentity: "16620c0f4" }, null)).toBe("unknown");
    expect(handoffTreeStatus({ sourceIdentity: "  " }, "16620c0f4")).toBe("unknown");
  });

  it("names the two trees in a stale note and stays quiet when current", () => {
    expect(handoffTreeNote("current", { sourceIdentity: "abc" }, "abc")).toBe("");
    const stale = handoffTreeNote("stale", { sourceIdentity: "4266b301b" }, "16620c0f4");
    expect(stale).toContain("4266b301b");
    expect(stale).toContain("16620c0f4");
    expect(stale).toContain("re-capture");
    expect(handoffTreeNote("unknown", {}, null)).toContain("no recorded tree");
  });

  it("records a loading-state capture as a failed step, reported as check (#0755)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/ui-app/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0755loading",
      title: "t",
      path: "work/0755loading.md",
      absPath: join(root, "work/0755loading.md"),
      status: "active",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;
    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [
        {
          target: "web",
          route: "/repo/commits/abc",
          label: "Commit diff",
          provenance: { kind: "declared", label: "Commit diff" },
        },
      ],
      errors: [],
      skips: [],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      // The declared step timed out and the route never rendered its rows, so
      // the capture lands on "Loading changes…" — captured as a shot warning.
      captureEntry: async () => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: [
          'loading state detected: loading text "Loading changes…" on /repo/commits/abc',
          'click [data-task-id="9999"]: Timeout 5000ms exceeded on /repo/commits/abc',
        ],
        finalUrl: "http://127.0.0.1:9/repo/commits/abc",
        assertions: [],
      }),
    });
    // A loading-state capture is a failed step — declared shots block handoff (#0830).
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("missing-target");
    expect(result.detail).toContain("Commit diff");
    const evidence = readUiHandoffGateEvidence(config, task.id);
    const cap = evidence?.captureDetails?.[0];
    expect(cap?.routeMatched).toBe(true);
    expect(cap?.targetWarnings?.some((w) => w.includes("loading state detected"))).toBe(true);
    expect(cap?.targetWarnings?.some((w) => w.includes('[data-task-id="9999"]'))).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("command-target capture evidence (#0765)", () => {
  const temps: string[] = [];
  afterEach(() => {
    resetPreviewVerificationSlot();
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  function commandRepo() {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-cmd-"));
    temps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      shot: {
        targets: [
          {
            name: "mac",
            areas: ["mac"],
            paths: [],
            command: 'printf PNG > "$REPOOS_SHOT_DIR/main.png"',
          },
        ],
      },
    } as unknown as RepoOSConfig;
    const body = [
      "## Shots",
      "",
      "```json",
      '[{"target":"mac","label":"Menu bar"}]',
      "```",
      "",
    ].join("\n");
    const task = {
      id: "0765cmd",
      title: "t",
      path: "work/0765cmd.md",
      absPath: join(root, "work/0765cmd.md"),
      status: "active",
      branch: "feat/x",
      area: "mac",
      body,
    } as Task;
    return { root, config, task };
  }

  it("records command provenance and no browser console for a command-only task", async () => {
    const { config, task } = commandRepo();
    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      sourceIdentity: "abc1234",
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.detail).toContain("command target");
    const evidence = readUiHandoffGateEvidence(config, task.id);
    // #0765: the tree identity is recorded so stale-capture detection applies.
    expect(evidence?.sourceIdentity).toBe("abc1234");
    // No browser console section: no issues, no web capture details.
    expect(evidence?.issues).toEqual([]);
    expect(evidence?.captureDetails ?? []).toEqual([]);
    const cmd = evidence?.commandCaptures?.[0];
    expect(cmd).toMatchObject({
      target: "mac",
      label: "Menu bar",
      status: "captured",
      exitStatus: 0,
    });
    expect(cmd?.command).toContain("REPOOS_SHOT_DIR");
    expect(cmd?.shots).toHaveLength(1);
    expect(cmd?.shots[0]?.size).toBeGreaterThan(0);
  });

  it("classifies browser, command, and none", () => {
    const { config, task } = commandRepo();
    expect(taskUiVerificationMode(config, task)).toBe("command");

    // A web declaration resolves the web target.
    const webConfig = {
      root: config.root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: {
        targets: [{ name: "web", areas: ["web"], paths: [], command: "echo" }],
      },
    } as unknown as RepoOSConfig;
    const webTask = {
      ...task,
      id: "0765web",
      area: "web",
      body: '## Shots\n\n```json\n[{"target":"web","route":"/","label":"Home"}]\n```\n',
    } as Task;
    expect(taskUiVerificationMode(webConfig, webTask)).toBe("browser");

    const noneTask = { ...task, id: "0765none", body: "## Problem\n\nprose only" } as Task;
    expect(taskUiVerificationMode(config, noneTask)).toBe("none");
  });
});

describe("docs shot skip copy and help link (#0819)", () => {
  const docTemps: string[] = [];
  afterEach(() => {
    for (const t of docTemps.splice(0)) rmSync(t, { recursive: true, force: true });
  });

  it("recognises the actionable docs skip in a run-level warning", () => {
    const warning = "Docs site skipped: no docs shot declared";
    expect(isDocsShotSkip(warning)).toBe(true);
    expect(isDocsShotSkip("declared shot not captured — step timed out")).toBe(false);
    expect(DOCS_SHOT_ROUTE_DOC).toBe("/repo?doc=docs/previews.md");
  });

  it("keeps the skip line as a run-level warning without the failure framing", () => {
    const lines = runLevelIssueLines({
      warnings: ["Docs site skipped: no docs shot declared"],
      issues: [],
      blankShots: [],
      captureDetails: [],
    } as never);
    expect(lines).toEqual(["[shot-warning] Docs site skipped: no docs shot declared"]);
  });

  it("renders the docs-route help link beside the skip in the Changes tab", () => {
    const drawer = readFileSync(join(__dirname, "../src/components/TaskDrawer.vue"), "utf8");
    expect(drawer).toContain("DOCS_SHOT_ROUTE_DOC");
    expect(drawer).toContain("How to declare a docs route");
  });

  it("records the docs skip verbatim, without the declared-shot failure framing", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-uigate-docsskip-"));
    docTemps.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    const config = {
      root,
      cacheDir: ".repoos",
      workDir: "work",
      uiVerification: { enabled: true },
      preview: { targets: [{ name: "web", paths: ["src/**"], command: "echo" }] },
    } as unknown as RepoOSConfig;
    const task = {
      id: "0819docs",
      title: "t",
      path: "work/0819docs.md",
      absPath: join(root, "work/0819docs.md"),
      status: "review",
      branch: "feat/x",
      area: "web",
      body: "",
    } as Task;

    vi.spyOn(shotCapture, "planAutoCapture").mockReturnValue({
      entries: [{ target: "web", route: "/", label: "Board", provenance: { kind: "auto" } }],
      errors: [],
      skips: ["Docs site skipped: no docs shot declared"],
      collapsed: [],
    });
    const mockBrowser: NonNullable<UiHandoffGateDeps["launchBrowser"]> = async () =>
      ({
        browser: { close: async () => {}, newPage: async () => ({}), newContext: async () => ({}) },
        context: { newPage: async () => ({}), close: async () => {} },
      }) as unknown as Awaited<ReturnType<NonNullable<UiHandoffGateDeps["launchBrowser"]>>>;

    const result = await runUiHandoffGate(config, task, undefined, () => {}, {
      startPreview: async () => ({ url: "http://127.0.0.1:9" }),
      launchBrowser: mockBrowser,
      captureEntry: async (_ctx, url) => ({
        png: Buffer.alloc(5000),
        issues: [],
        blank: false,
        warnings: [],
        finalUrl: url,
        assertions: [],
      }),
    });

    expect(result.ok).toBe(true);
    const evidence = readUiHandoffGateEvidence(config, task.id);
    const warnings = evidence?.warnings ?? [];
    expect(warnings).toContain("Docs site skipped: no docs shot declared");
    expect(warnings.some((w) => w.includes("declared shot not captured — Docs"))).toBe(false);
    vi.restoreAllMocks();
  });
});
