import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPageGateCollector,
  formatPageGateIssues,
  type PageGateListenerPage,
} from "../../core/page-browser-gate.js";
import { runUiHandoffGate, type UiHandoffGateDeps } from "../../server/ui-handoff-gate.js";
import * as shotCapture from "../../server/shot-capture.js";
import type { RepoOSConfig } from "../../core/types.js";
import type { Task } from "../../core/types.js";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("UI handoff verification gate (#0680)", () => {
  const temps: string[] = [];
  afterEach(() => {
    for (const t of temps.splice(0)) rmSync(t, { recursive: true, force: true });
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
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("overflow");
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
});
