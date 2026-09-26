import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEditorSpawnArgs,
  formatCopyInspectorPath,
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
    expect(buildEditorSpawnArgs("zed {file}:{line}", "/abs/TaskDrawer.vue", 12)).toEqual([
      "zed",
      "/abs/TaskDrawer.vue:12",
    ]);
    expect(buildEditorSpawnArgs("cursor {file}", "/abs/TaskDrawer.vue", 12)).toEqual([
      "cursor",
      "/abs/TaskDrawer.vue",
    ]);
  });
});
