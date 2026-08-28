/**
 * Protected body sections (#0317): the freeform PM "flesh it out" flow rewrites
 * a task by running `repoos update --body`, which lands in `patchTaskFile` with
 * a wholesale new body. That must never drop the user's attached screenshots,
 * their original prompt, or the append-only activity history — all three live
 * in the body but are carried over from the on-disk copy on every body write.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types";
import { extractSection, removeSection } from "../../core/task";
import { patchTaskFile } from "../../server/write";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

function setupFile(content: string): { root: string; absPath: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-protected-"));
  const work = join(root, "work");
  mkdirSync(work, { recursive: true });
  const absPath = join(work, "0317-stop-work-modal.md");
  writeFileSync(absPath, content);
  return { root, absPath, clean: () => rmSync(root, { recursive: true, force: true }) };
}

const WITH_SECTIONS = `---
id: "0317"
title: Stop work modal
type: feature
status: ready
---
The stop work confirm should be a proper modal.

## Original prompt

not whatever this is in the screenshot

## Screenshots

![shot](/api/tasks/0317/attachments/screenshot-1.png)

## Activity

- 2026-08-28T15:51:55Z · created · hello@repoos.org
- 2026-08-28T15:51:56Z · body
`;

// The body a freeform PM rewrite produces: fully restructured spec, none of the
// preserved sections.
const PM_REWRITE = `The stop work confirmation dialog should be a proper modal component.

## Requirements

1. Replace the dialog with a modal
2. ESC + click-outside to close

## Technical Notes

- Follow existing modal patterns
`;

describe("patchTaskFile protected body sections", () => {
  it("keeps screenshots, the original prompt, and activity history on a full body rewrite", () => {
    const { root, absPath, clean } = setupFile(WITH_SECTIONS);
    try {
      const updated = patchTaskFile(config(root), absPath, { body: PM_REWRITE });

      // New spec landed.
      expect(updated.body).toContain("## Requirements");
      expect(updated.body).toContain("click-outside to close");
      // User-owned / append-only sections survived.
      expect(updated.body).toContain("## Screenshots");
      expect(updated.body).toContain("![shot](/api/tasks/0317/attachments/screenshot-1.png)");
      expect(updated.body).toContain("## Original prompt");
      expect(updated.body).toContain("not whatever this is in the screenshot");
      expect(updated.body).toContain("- 2026-08-28T15:51:55Z · created · hello@repoos.org");
      // The rewrite is recorded, not the history wiped.
      const bodyEntries = updated.body.split("\n").filter((l) => l.endsWith("· body"));
      expect(bodyEntries.length).toBe(2);

      // Canonical trailing order: spec, then original prompt, then screenshots,
      // then activity (always last).
      const iReq = updated.body.indexOf("## Requirements");
      const iPrompt = updated.body.indexOf("## Original prompt");
      const iShots = updated.body.indexOf("## Screenshots");
      const iActivity = updated.body.indexOf("## Activity");
      expect(iReq).toBeLessThan(iPrompt);
      expect(iPrompt).toBeLessThan(iShots);
      expect(iShots).toBeLessThan(iActivity);
    } finally {
      clean();
    }
  });

  it("takes the on-disk screenshots section when the caller sends a stale copy", () => {
    const { root, absPath, clean } = setupFile(WITH_SECTIONS);
    try {
      const staleRewrite = `${PM_REWRITE}
## Screenshots

![old-wrong](/api/tasks/0317/attachments/does-not-exist.png)
`;
      const updated = patchTaskFile(config(root), absPath, { body: staleRewrite });

      expect(updated.body).toContain("![shot](/api/tasks/0317/attachments/screenshot-1.png)");
      expect(updated.body).not.toContain("does-not-exist.png");
      // Exactly one Screenshots section.
      expect(updated.body.split("## Screenshots").length - 1).toBe(1);
    } finally {
      clean();
    }
  });

  it("appends an uploaded screenshot and a later body rewrite keeps it", () => {
    const plain = `---
id: "0317"
title: Stop work modal
type: feature
status: ready
---
The stop work confirm should be a proper modal.

## Activity

- 2026-08-28T15:51:55Z · created · someone
`;
    const { root, absPath, clean } = setupFile(plain);
    try {
      const withShot = patchTaskFile(config(root), absPath, {
        addScreenshot: {
          id: "1",
          name: "bug",
          path: "work/.attachments/0317/screenshot-1.png",
          url: "/api/tasks/0317/attachments/screenshot-1.png",
          size: 1,
          mime: "image/png",
        },
      });
      expect(withShot.body).toContain("## Screenshots");
      expect(withShot.body).toContain("![bug](/api/tasks/0317/attachments/screenshot-1.png)");
      // Screenshots sits before Activity.
      expect(withShot.body.indexOf("## Screenshots")).toBeLessThan(
        withShot.body.indexOf("## Activity"),
      );

      const rewritten = patchTaskFile(config(root), absPath, { body: PM_REWRITE });
      expect(rewritten.body).toContain("![bug](/api/tasks/0317/attachments/screenshot-1.png)");
      expect(rewritten.body).toContain("## Requirements");
    } finally {
      clean();
    }
  });

  it("still replaces the body of a task with no protected sections", () => {
    const plain = `---
id: "0317"
title: Stop work modal
type: feature
status: ready
---
Old body.
`;
    const { root, absPath, clean } = setupFile(plain);
    try {
      const updated = patchTaskFile(config(root), absPath, { body: "New body.\n" });
      expect(updated.body).toContain("New body.");
      expect(updated.body).not.toContain("Old body.");
      expect(updated.body).toContain("## Activity");
      expect(updated.body).toContain("· body");
    } finally {
      clean();
    }
  });
});

describe("section helpers", () => {
  const body = [
    "Spec text.",
    "",
    "## Screenshots",
    "",
    "![a](x.png)",
    "",
    "## Activity",
    "",
    "- 2026-01-01T00:00:00Z · created",
  ].join("\n");

  it("extractSection returns the heading through the next section boundary", () => {
    expect(extractSection(body, "## Screenshots")).toBe("## Screenshots\n\n![a](x.png)");
    expect(extractSection(body, "## Missing")).toBeNull();
  });

  it("removeSection drops the section and collapses the gap", () => {
    const out = removeSection(body, "## Screenshots");
    expect(out).not.toContain("![a](x.png)");
    expect(out).toContain("Spec text.");
    expect(out).toContain("## Activity");
    expect(out).not.toMatch(/\n\n\n/);
  });
});
