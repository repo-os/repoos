/**
 * #0681 — reload `repoos.toml` when it changes on disk without restarting
 * `repoos serve`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyReloadedConfig, loadConfig } from "../../core/config";
import type { RepoOSConfig } from "../../core/types";
import { ConfigWatcher } from "../../server/config-watch";
import { PreviewManager, resolvePreviewTarget } from "../../server/preview";
import type { Task } from "../../core/types";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function tmpRoot(initialToml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-config-watch-"));
  roots.push(dir);
  mkdirSync(join(dir, "work"), { recursive: true });
  writeFileSync(join(dir, "repoos.toml"), initialToml, "utf8");
  return dir;
}

describe("ConfigWatcher", () => {
  it("re-reads repoos.toml and adopts preview config in place", () => {
    const root = tmpRoot('workDir = "work"\n');
    const holder = { config: loadConfig(root) };
    expect(holder.config.preview).toBeUndefined();

    const manager = new PreviewManager(holder.config, () => {});
    const onChange = vi.fn();
    const watcher = new ConfigWatcher({ root, holder, onChange });
    watcher.start();

    writeFileSync(
      join(root, "repoos.toml"),
      [
        'workDir = "work"',
        "",
        "[[preview.targets]]",
        'name = "Web"',
        'areas = ["web"]',
        'command = "bun run dev --port {port}"',
        "",
      ].join("\n"),
      "utf8",
    );

    expect(watcher.reloadIfChanged()).toBe(true);
    expect(holder.config.preview?.targets?.[0]?.name).toBe("Web");
    expect(onChange).toHaveBeenCalledOnce();

    const task = { id: "0681", area: "web", branch: "feat/x", status: "active" } as Task;
    expect(resolvePreviewTarget(holder.config, task).kind).toBe("command");
    // PreviewManager was constructed with the same object reference as `holder`.
    expect(manager.get("nope")).toBeNull();

    watcher.stop();
  });

  it("is a no-op when file content is unchanged", () => {
    const root = tmpRoot('workDir = "work"\n');
    const holder = { config: loadConfig(root) };
    const watcher = new ConfigWatcher({ root, holder });
    watcher.start();
    expect(watcher.reloadIfChanged()).toBe(false);
    watcher.stop();
  });
});

describe("applyReloadedConfig", () => {
  it("clears preview when the reloaded file drops [preview]", () => {
    const base: RepoOSConfig = {
      root: "/tmp",
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
      preview: {
        targets: [{ name: "Web", areas: ["web"], command: "echo hi" }],
      },
    };
    const holder = { config: { ...base, preview: base.preview } };
    const fresh: RepoOSConfig = { ...base };
    delete fresh.preview;
    applyReloadedConfig(holder, fresh);
    expect(holder.config.preview).toBeUndefined();
  });
});
