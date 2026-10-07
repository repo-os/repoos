/**
 * `[stories]` configuration (#0480). Stories are ON by default: a missing or
 * malformed value yields `enabled: true`; only an explicit `enabled = false`
 * keeps the nav item, route and task-edit control dormant.
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
      default: true,
    });
  });

  it("is on by default when the section is missing", () => {
    expect(load('workDir = "work"\n').stories?.enabled).toBe(true);
  });

  it("is dormant when enabled is explicitly false", () => {
    expect(load("[stories]\nenabled = false\n").stories?.enabled).toBe(false);
  });

  it("enables the surface when enabled is true", () => {
    expect(load("[stories]\nenabled = true\n").stories?.enabled).toBe(true);
  });

  it("falls back to the default (on) for a malformed enabled value", () => {
    expect(load('[stories]\nenabled = "yes"\n').stories?.enabled).toBe(true);
    expect(load("[stories]\nenabled = 1\n").stories?.enabled).toBe(true);
  });

  it("exposes the story context excerpt size as a guarded Settings number (#0691)", () => {
    expect(getConfigSchema().find((field) => field.key === "stories.excerptBytes")).toMatchObject({
      label: "Story context excerpt size",
      type: "number",
      tier: "guarded",
      default: 4096,
    });
    expect(SUPPORTED_TOML_KEYS).toContain("stories.excerptBytes");
  });

  it("parses a configured excerpt size and ignores a malformed one", () => {
    expect(load("[stories]\nexcerptBytes = 8192\n").stories?.excerptBytes).toBe(8192);
    expect(load('[stories]\nexcerptBytes = "big"\n').stories?.excerptBytes).toBeUndefined();
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

describe("inputsDir and layout-dir validation (#0726)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to inputs", () => {
    expect(load('workDir = "work"\n').inputsDir).toBe("inputs");
  });

  it("is exposed as a guarded, restart-required Settings control, like storiesDir", () => {
    expect(getConfigSchema().find((f) => f.key === "inputsDir")).toMatchObject({
      label: "Inputs directory",
      type: "string",
      tier: "guarded",
      restartRequired: true,
      default: "inputs",
    });
    expect(SUPPORTED_TOML_KEYS).toContain("inputsDir");
  });

  it("parses a custom relative inputs directory", () => {
    expect(load('inputsDir = "inbox"\n').inputsDir).toBe("inbox");
    expect(load('inputsDir = "meta/inbox"\n').inputsDir).toBe("meta/inbox");
    expect(load('inputsDir = "./inbox/"\n').inputsDir).toBe("inbox");
  });

  it.each([
    'inputsDir = ""\n',
    'inputsDir = "/abs/inbox"\n',
    'inputsDir = "../escape"\n',
    'inputsDir = "ok/../escape"\n',
    'inputsDir = "C:\\\\inbox"\n',
    'inputsDir = "~/inbox"\n',
    'inputsDir = "a//b"\n',
    "inputsDir = 3\n",
  ])("falls back to the default with a warning for %s", (toml) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(load(toml).inputsDir).toBe("inputs");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("inputsDir"));
  });

  it("validates workDir/docsDir/cacheDir the same way (#0726)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cfg = load(
      ['workDir = "../tasks"', 'docsDir = "/abs/docs"', 'cacheDir = "~/cache"'].join("\n"),
    );
    expect(cfg.workDir).toBe("work");
    expect(cfg.docsDir).toBe("docs");
    expect(cfg.cacheDir).toBe(".repoos");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("workDir"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("docsDir"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("cacheDir"));
  });
});
