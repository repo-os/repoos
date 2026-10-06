import { afterEach, describe, expect, it } from "vitest";
import {
  createPageGateCollector,
  formatPageGateIssues,
  type PageGateListenerPage,
} from "../../core/page-browser-gate.js";
import { runUiHandoffGate } from "../../server/ui-handoff-gate.js";
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
});
