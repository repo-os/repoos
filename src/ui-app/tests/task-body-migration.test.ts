import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import { migrateTaskBodies } from "../../server/task-body-migration.js";
import { ACTIVITY_HEADING } from "../../core/task.js";

function repoWithFiles(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-task-body-migration-"));
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

describe("migrateTaskBodies (#0702)", () => {
  it("rewrites duplicate Activity through serializeTask without touching updated_at", () => {
    const original = `---
id: "0004"
updated_at: "2026-10-06T03:00:00Z"
---

## Problem

x

## Activity

- 2026-10-05T01:00:00Z · created

## Activity

- 2026-10-05T02:00:00Z · status inbox→ready
`;
    const root = repoWithFiles({ "0004-a.md": original });
    try {
      const result = migrateTaskBodies(config(root));
      expect(result.updated).toEqual([join("work", "0004-a.md")]);
      const content = readFileSync(join(root, "work", "0004-a.md"), "utf8");
      expect(content).toContain('updated_at: "2026-10-06T03:00:00Z"');
      expect(content.split(ACTIVITY_HEADING).length - 1).toBe(1);
      expect(content).toContain("inbox→ready");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is idempotent", () => {
    const root = repoWithFiles({
      "0001-a.md": `---
id: "0001"
---

## Activity

- a

## Activity

- b
`,
    });
    try {
      const cfg = config(root);
      migrateTaskBodies(cfg);
      const second = migrateTaskBodies(cfg);
      expect(second.updated).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
