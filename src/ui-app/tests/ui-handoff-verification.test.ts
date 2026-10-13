import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPageGateCollector,
  formatPageGateIssues,
  type PageGateListenerPage,
} from "../../core/page-browser-gate.js";
import {
  handoffTreeNote,
  handoffTreeStatus,
  readUiHandoffGateEvidence,
  runUiHandoffGate,
  taskUiVerificationMode,
  type UiHandoffGateDeps,
} from "../../server/ui-handoff-gate.js";
import * as shotCapture from "../../server/shot-capture.js";
import * as shotStore from "../../server/shots.js";
import {
  resetPreviewVerificationSlot,
  withPreviewVerificationSlot,
} from "../../server/preview-verification-slot.js";
import type { RepoOSConfig } from "../../core/types.js";
import type { Task } from "../../core/types.js";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  it("passes handoff with warnings when a declared highlight matches nothing (#0743)", async () => {
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
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("shot warning");
    const evidence = readUiHandoffGateEvidence(config, task.id);
    expect(evidence?.warnings?.some((w) => w.includes(".agent-row"))).toBe(true);
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
    // A loading-state capture is a warning (a failed step), not a hard block, so
    // the handoff still completes — but the shot is never presented as a match.
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("shot warning");
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
