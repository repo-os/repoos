import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEditorSpawnArgs,
  copyInspectorAvailable,
  formatCopyInspectorPath,
  readDevUiBuild,
  resolveCopyInspectorTarget,
  tokenizeEditorCommand,
} from "../../core/copy-inspector.js";

describe("copy inspector helpers", () => {
  it("formats repo-relative paths with optional line", () => {
    expect(formatCopyInspectorPath("src/ui-app/src/components/TaskDrawer.vue", 2589)).toBe(
      "src/ui-app/src/components/TaskDrawer.vue:2589",
    );
    expect(formatCopyInspectorPath("src/ui-app/src/components/TaskDrawer.vue", null)).toBe(
      "src/ui-app/src/components/TaskDrawer.vue",
    );
  });

  it("resolves real files under src/ and rejects escapes", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-"));
    const rel = "src/ui-app/src/components/TaskDrawer.vue";
    const abs = join(root, rel);
    mkdirSync(join(root, "src/ui-app/src/components"), { recursive: true });
    writeFileSync(abs, "<template></template>", "utf8");
    try {
      const ok = resolveCopyInspectorTarget(root, rel, 2589);
      expect(ok?.repoRel).toBe(rel);
      expect(ok?.line).toBe(2589);
      expect(resolveCopyInspectorTarget(root, "../etc/passwd")).toBeNull();
      expect(resolveCopyInspectorTarget(root, "docs/README.md")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("tokenizes editor commands without a shell", () => {
    expect(tokenizeEditorCommand('zed "my file.vue":12')).toEqual(["zed", "my file.vue:12"]);
    expect(tokenizeEditorCommand("cursor {file}")).toEqual(["cursor", "{file}"]);
  });

  it("substitutes {file}/{line} and drops line when placeholder omitted", () => {
    expect(buildEditorSpawnArgs("zed {file}:{line}", "src/ui-app/Foo.vue", 12)).toEqual([
      "zed",
      "src/ui-app/Foo.vue:12",
    ]);
    expect(buildEditorSpawnArgs("cursor {file}", "src/ui-app/Foo.vue", 12)).toEqual([
      "cursor",
      "src/ui-app/Foo.vue",
    ]);
  });

  it("quotes repo-relative paths with spaces for argv tokenizing", () => {
    expect(buildEditorSpawnArgs("zed {file}", "src/my app/Foo.vue", null)).toEqual([
      "zed",
      "src/my app/Foo.vue",
    ]);
  });

  it("copyInspectorAvailable requires devUi in dist/.build-info.json", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-copy-inspector-gate-"));
    mkdirSync(join(root, "src/ui-app"), { recursive: true });
    writeFileSync(join(root, "src/ui-app/vite.config.ts"), "export {}", "utf8");
    expect(copyInspectorAvailable(root)).toBe(false);
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(
      join(root, "dist", ".build-info.json"),
      JSON.stringify({ hash: "a", version: "0", devUi: true }) + "\n",
      "utf8",
    );
    expect(readDevUiBuild(root)).toBe(true);
    expect(copyInspectorAvailable(root)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});
