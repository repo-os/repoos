/**
 * `localShotStore.remove` (#0627): delete one shot's PNG and manifest entry,
 * from the task drawer's per-shot delete. Also pins that `removeAuto` still
 * only touches `origin: "auto"` shots and that a removed name lists as gone
 * (the PNG bytes are the source of truth for existence).
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { localShotStore, shotsDir } from "../../server/shots.js";
import { loadConfig } from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const roots: string[] = [];

function setup(): { config: RepoOSConfig; root: string } {
  const root = mkdtempSync(join(tmpdir(), "repoos-shot-store-"));
  roots.push(root);
  return { config: loadConfig(root), root };
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe("localShotStore.remove (#0627)", () => {
  it("deletes one shot's file and manifest entry, and returns its metadata", () => {
    const { config } = setup();
    const store = localShotStore(config, "0627");
    const saved = store.save({
      target: "default",
      route: "/",
      label: "Task drawer open",
      provenance: "declared: Task drawer open",
      data: PNG_1PX,
    });
    expect("error" in saved).toBe(false);
    if ("error" in saved) return;

    const dir = shotsDir(config.root, config.workDir, "0627");
    expect(existsSync(join(dir, saved.name))).toBe(true);

    const removed = store.remove(saved.name);
    expect(removed).not.toBeNull();
    expect(removed!.label).toBe("Task drawer open");
    expect(existsSync(join(dir, saved.name))).toBe(false);
    expect(store.list()).toEqual([]);
    expect(store.remove(saved.name)).toBeNull();
  });

  it("removes only the named shot; other shots (auto or not) survive", () => {
    const { config } = setup();
    const store = localShotStore(config, "0627");
    const a = store.save({ target: "default", data: PNG_1PX });
    const b = store.save({
      target: "docs",
      label: "Guide",
      origin: "auto",
      provenance: "auto: matched docs/**",
      data: PNG_1PX,
    });
    if ("error" in a || "error" in b) throw new Error("save failed");

    expect(store.remove(a.name)?.name).toBe(a.name);
    const left = store.list();
    expect(left).toHaveLength(1);
    expect(left[0]!.name).toBe(b.name);
    // removeAuto is untouched by this change: still origin-scoped.
    expect(store.removeAuto()).toBe(1);
    expect(store.list()).toEqual([]);
  });
});
