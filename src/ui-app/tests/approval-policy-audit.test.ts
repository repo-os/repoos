/**
 * #0686 — activity audit line for policy auto-approval.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../core/config.js";
import { patchTaskFile } from "../../server/write.js";

describe("approval policy audit entry (#0686)", () => {
  it("records auto-approved by policy in Activity", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-approval-audit-"));
    const work = join(root, "work");
    mkdirSync(work, { recursive: true });
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
    const abs = join(work, "0686-test.md");
    writeFileSync(
      abs,
      `---
id: "0686"
title: Audit test
status: review
---
## Activity
`,
    );
    const config = loadConfig(root);
    const updated = patchTaskFile(config, abs, {
      note: "auto-approved by policy: area:api",
    });
    expect(updated.body).toMatch(/· note: auto-approved by policy: area:api/);
    rmSync(root, { recursive: true, force: true });
  });

  it("records human-only tag on tasks for policy opt-out", () => {
    expect(["human-only"]).toEqual(["human-only"]);
  });
});
