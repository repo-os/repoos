/**
 * `[stories]` configuration (#0480). Missing, malformed or false must preserve
 * current behavior exactly — i.e. `cfg.stories` stays undefined, so the nav
 * item, route and task-edit control all stay dormant.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";

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
  it("is exposed as a live Settings toggle", () => {
    expect(getConfigSchema().find((field) => field.key === "stories.enabled")).toMatchObject({
      label: "Stories",
      type: "boolean",
      tier: "live",
      default: false,
    });
  });

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

describe("storiesDir (#0637)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to stories and needs no migration in existing repos", () => {
    expect(load('workDir = "work"\n').storiesDir).toBe("stories");
  });

  it("is exposed as a guarded, restart-required Settings control", () => {
    expect(getConfigSchema().find((f) => f.key === "storiesDir")).toMatchObject({
      label: "Stories directory",
      type: "string",
      tier: "guarded",
      restartRequired: true,
      default: "stories",
    });
    expect(SUPPORTED_TOML_KEYS).toContain("storiesDir");
  });

  it("parses a custom relative directory", () => {
    expect(load('storiesDir = "epics"\n').storiesDir).toBe("epics");
    expect(load('storiesDir = "notes/epics"\n').storiesDir).toBe("notes/epics");
    // Redundant ./ prefix and trailing slash are normalized, not rejected.
    expect(load('storiesDir = "./epics/"\n').storiesDir).toBe("epics");
  });

  it.each([
    'storiesDir = ""\n',
    'storiesDir = "/abs/epics"\n',
    'storiesDir = "../escape"\n',
    'storiesDir = "ok/../escape"\n',
    'storiesDir = "C:\\\\epics"\n',
    'storiesDir = "~/epics"\n',
    'storiesDir = "a//b"\n',
    "storiesDir = 3\n",
  ])("falls back to the default with a warning for %s", (toml) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(load(toml).storiesDir).toBe("stories");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("storiesDir"));
  });
});
