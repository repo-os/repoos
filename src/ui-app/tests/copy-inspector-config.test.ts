/**
 * `[dev.inspector]` configuration (#0509).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigSchema, loadConfig } from "../../core/config.js";

function load(toml: string): ReturnType<typeof loadConfig> {
  const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-config-"));
  try {
    writeFileSync(join(root, "repoos.toml"), toml, "utf8");
    return loadConfig(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("[dev.inspector] configuration", () => {
  it("is exposed in the Advanced Settings schema", () => {
    expect(getConfigSchema().find((field) => field.key === "dev.inspector.enabled")).toMatchObject({
      type: "boolean",
      tier: "guarded",
      default: true,
    });
    expect(
      getConfigSchema().find((field) => field.key === "dev.inspector.editorCommand"),
    ).toMatchObject({
      type: "string",
      tier: "guarded",
      default: "",
    });
  });

  it("loads enabled flag and editor command from repoos.toml", () => {
    const cfg = load(`
dev.inspector.enabled = false
dev.inspector.editorCommand = "zed {file}:{line}"
`);
    expect(cfg.dev?.inspector?.enabled).toBe(false);
    expect(cfg.dev?.inspector?.editorCommand).toBe("zed {file}:{line}");
  });
});
