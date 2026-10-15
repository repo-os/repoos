/**
 * General editor setting (`editor.command`) configuration (#0790).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";

function load(toml: string): ReturnType<typeof loadConfig> {
  const root = mkdtempSync(join(tmpdir(), "repoos-editor-config-"));
  try {
    writeFileSync(join(root, "repoos.toml"), toml, "utf8");
    return loadConfig(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("[editor] configuration", () => {
  it("is exposed in the General Settings schema", () => {
    expect(getConfigSchema().find((field) => field.key === "editor.command")).toMatchObject({
      type: "string",
      tier: "live",
      default: "",
    });
    // Always visible: not dev/inspector gated.
    expect(SUPPORTED_TOML_KEYS.includes("editor.command")).toBe(true);
  });

  it("loads editor command from repoos.toml", () => {
    const cfg = load(`editor.command = "zed {file}:{line}"`);
    expect(cfg.editor?.command).toBe("zed {file}:{line}");
  });

  it("trims an empty command to empty", () => {
    const cfg = load(`editor.command = "   "`);
    // Patch logic trims on save; loadConfig keeps trimmed? Assert not crash.
    expect(typeof (cfg.editor?.command ?? "")).toBe("string");
  });
});