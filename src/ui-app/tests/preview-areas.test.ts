/**
 * Preview routing with the multi-area task model (#0583), and the write-side
 * patch normalization.
 */
import { describe, expect, it } from "vitest";
import { resolvePreviewTarget, previewTargetOptions } from "../../server/preview.js";
import { patchTaskFile } from "../../server/write.js";
import { parseTask } from "../../core/task.js";
import type { RepoOSConfig } from "../../core/types.js";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function taskFromText(text: string, root: string) {
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0001-x.md");
  writeFileSync(absPath, text, "utf8");
  return parseTask({
    content: text,
    absPath,
    root,
    defaultStatus: "active",
    defaultAssignee: "unassigned",
  });
}

const baseConfig = {
  root: "/tmp/nonexistent",
  cacheDir: ".repoos",
  workDir: "work",
  preview: {
    targets: [
      { name: "Landing page", areas: ["landing"], command: "echo landing" },
      { name: "Docs site", areas: ["docs"], command: "echo docs" },
    ],
  },
} as unknown as RepoOSConfig;

const patchConfig = {
  root: "",
  workDir: "work",
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
} as unknown as RepoOSConfig;

describe("preview routing with multiple areas", () => {
  it("multi-area task resolves to the matching target", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-preview-areas-"));
    try {
      const task = taskFromText('---\nid: "0001"\narea: web, docs\n---\nbody', root);
      const resolved = resolvePreviewTarget(baseConfig, task);
      expect(resolved).toMatchObject({ kind: "command", label: "Docs site" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("legacy `+` areas still route", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-preview-areas-"));
    try {
      const task = taskFromText('---\nid: "0001"\narea: landing + server\n---\nbody', root);
      expect(resolvePreviewTarget(baseConfig, task)).toMatchObject({
        kind: "command",
        label: "Landing page",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("no match still returns an actionable multi-area message", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-preview-areas-"));
    try {
      const task = taskFromText('---\nid: "0001"\narea: web, core\n---\nbody', root);
      const resolved = resolvePreviewTarget(baseConfig, task);
      if (resolved.kind !== "none") throw new Error("expected none");
      expect(resolved.reason).toContain('area "web", "core"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("the ranked picker lists all targets", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-preview-areas-"));
    try {
      const task = taskFromText('---\nid: "0001"\narea: [web, docs]\n---\nbody', root);
      expect(previewTargetOptions(baseConfig, task).map((o) => o.name)).toEqual([
        "Docs site",
        "Landing page",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const patchTaskConfig = {
  root: "",
  workDir: "work",
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
} as unknown as RepoOSConfig;

describe("patchTaskFile — area patch normalization", () => {
  const writeTask = (root: string, content: string): string => {
    mkdirSync(join(root, "work"), { recursive: true });
    const absPath = join(root, "work", "0001-x.md");
    writeFileSync(absPath, content, "utf8");
    return absPath;
  };

  it("accepts a comma string and stores the canonical pair", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-area-patch-"));
    try {
      const absPath = writeTask(root, '---\nid: "0001"\narea: server + ui-app\n---\nbody');
      const next = patchTaskFile({ ...patchTaskConfig, root }, absPath, { area: "web,core" });
      expect(next.areas).toEqual(["web", "core"]);
      expect(next.area).toBe("web, core");
      const raw = readFileSync(absPath, "utf8");
      expect(raw).toContain("area: [web, core]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts a list patch too", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-area-patch-"));
    try {
      const absPath = writeTask(root, '---\nid: "0001"\narea: web\n---\nbody');
      const next = patchTaskFile({ ...patchTaskConfig, root }, absPath, { area: ["a", "b"] });
      expect(next.areas).toEqual(["a", "b"]);
      expect(readFileSync(absPath, "utf8")).toContain("area: [a, b]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
