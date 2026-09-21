/**
 * `[stories]` configuration (#0480). Missing, malformed or false must preserve
 * current behavior exactly — i.e. `cfg.stories` stays undefined, so the nav
 * item, route and task-edit control all stay dormant.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";

function load(toml: string): ReturnType<typeof loadConfig> {
  const root = mkdtempSync(join(tmpdir(), "repoos-stories-config-"));
  try {
    writeFileSync(join(root, "repoos.toml"), toml, "utf8");
    return loadConfig(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("[stories] configuration", () => {
  it("is dormant when the section is missing", () => {
    expect(load('workDir = "work"\n').stories).toBeUndefined();
  });

  it("is dormant when enabled is false", () => {
    expect(load("[stories]\nenabled = false\n").stories?.enabled).toBe(false);
  });

  it("enables the surface when enabled is true", () => {
    expect(load("[stories]\nenabled = true\n").stories?.enabled).toBe(true);
  });

  it("ignores a malformed enabled value without enabling the surface", () => {
    expect(load('[stories]\nenabled = "yes"\n').stories).toBeUndefined();
    expect(load("[stories]\nenabled = 1\n").stories).toBeUndefined();
  });
});
