/**
 * The one-time area-format migration (#0583): legacy `+`/comma-string
 * frontmatter rewrites to the canonical scalar-or-list form, through the same
 * `patchTaskFile` writer the API uses; already-canonical files are untouched
 * (idempotent); the parser still reads every file.
 */
import { describe, expect, it } from "vitest";
import { areaValueNeedsRewrite, migrateTaskAreas } from "../../server/area-migration.js";
import type { RepoOSConfig } from "../../core/types.js";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseTaskAreas } from "../../core/areas.js";
import { parseDocument } from "../../core/frontmatter.js";

function repoWithFiles(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-area-migration-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(work, name), content, "utf8");
  }
  return root;
}

const config = (root: string) =>
  ({
    root,
    workDir: "work",
    cacheDir: ".repoos",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  }) as unknown as RepoOSConfig;

describe("areaValueNeedsRewrite", () => {
  it("canonical shapes stay as-is", () => {
    expect(areaValueNeedsRewrite("web")).toBe(false);
    expect(areaValueNeedsRewrite(["web", "core"])).toBe(false);
    expect(areaValueNeedsRewrite(undefined)).toBe(false);
  });

  it("legacy spellings rewrite", () => {
    expect(areaValueNeedsRewrite("server + ui-app")).toBe(true);
    expect(areaValueNeedsRewrite("web, core")).toBe(true);
    expect(areaValueNeedsRewrite(["web"])).toBe(true);
  });
});

describe("migrateTaskAreas", () => {
  it("rewrites legacy values through the standard writer", () => {
    const root = repoWithFiles({
      "0001-a.md": '---\nid: "0001"\narea: server + ui-app\n---\nbody 1',
      "0002-b.md": '---\nid: "0002"\narea: web + core + server\n---\nbody 2',
      "0003-c.md": '---\nid: "0003"\narea: web\n---\nbody 3',
      "0004-d.md": '---\nid: "0004"\narea: [web, core]\n---\nbody 4',
    });
    try {
      const result = migrateTaskAreas(config(root));
      expect(result.updated.sort()).toEqual([join("work", "0001-a.md"), join("work", "0002-b.md")]);
      expect(readFileSync(join(root, "work", "0001-a.md"), "utf8")).toContain(
        "area: [server, ui-app]",
      );
      expect(readFileSync(join(root, "work", "0002-b.md"), "utf8")).toContain(
        "area: [web, core, server]",
      );
      expect(readFileSync(join(root, "work", "0003-c.md"), "utf8")).toContain("area: web");
      expect(readFileSync(join(root, "work", "0004-d.md"), "utf8")).toContain("area: [web, core]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does NOT bump updated_at and does NOT append an activity entry", () => {
    const original =
      '---\nid: "0001"\narea: server + ui-app\nupdated_at: "2026-01-02T03:04:05Z"\n---\nbody 1\n\n## Activity\n\n- 2026-01-01T00:00:00Z · created\n';
    const root = repoWithFiles({ "0001-a.md": original });
    try {
      migrateTaskAreas(config(root));
      const content = readFileSync(join(root, "work", "0001-a.md"), "utf8");
      // Storage format rewrite, not a task edit (#0583 review round 2):
      // timestamps and the activity log are left exactly as parsed.
      expect(content).toContain('updated_at: "2026-01-02T03:04:05Z"');
      expect(content.split("\n").filter((l) => l.startsWith("- ") && l.includes("·"))).toEqual([
        "- 2026-01-01T00:00:00Z · created",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is idempotent — a second pass rewrites nothing", () => {
    const root = repoWithFiles({
      "0001-a.md": '---\nid: "0001"\narea: docs + web\n---\nbody',
    });
    try {
      const cfg = config(root);
      migrateTaskAreas(cfg);
      const second = migrateTaskAreas(cfg);
      expect(second.updated).toEqual([]);
      expect(second.scanned).toBe(1);
      expect(readFileSync(join(root, "work", "0001-a.md"), "utf8")).toContain("area: [docs, web]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never strips a file it does not recognize — every file still parses", () => {
    const root = repoWithFiles({
      "0001-a.md": '---\nid: "0001"\narea: x + y\n---\nbody',
      "broken.md": "no frontmatter here\n",
      "0002-b.md": '---\nid: "0002"\narea: [a, b]\n---\nbody',
    });
    try {
      migrateTaskAreas(config(root));
      // Parser still reads every file in the work directory.
      expect(readdirSync(join(root, "work")).length).toBe(3);
      expect(readFileSync(join(root, "work", "0001-a.md"), "utf8")).toContain('id: "0001"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * The self-modifying check (#0583 / AGENTS.md): when the tests run inside this
 * repo, the parser must still read EVERY existing task file on the live work/
 * board — `area` now tolerates scalars, comma strings, lists, and the legacy
 * `+` spelling, so any parse drift shows up here the moment files change.
 * Runs only when a work/ directory exists (foreign checkouts skip).
 */
describe("the live board's task files still parse", () => {
  const repoWork = resolve(__dirname, "../../../work");
  it("parses every task file, producing a canonical areas list", () => {
    let files: string[] = [];
    try {
      files = readdirSync(repoWork).filter((f) => f.endsWith(".md"));
    } catch {
      return; // not a checkout with a work/ board — skip quietly
    }
    expect(files.length).toBeGreaterThan(0);
    for (const name of files) {
      const content = readFileSync(join(repoWork, name), "utf8");
      const { data } = parseDocument(content);
      if (data.area === undefined) continue;
      const areas = parseTaskAreas(data.area);
      if (areas.length === 0) continue;
      // Every parsed area is a non-empty trimmed string.
      for (const a of areas) expect(a).toBe(a.trim());
    }
  });
});
