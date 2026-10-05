/**
 * #0686 — activity audit line for policy auto-approval.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateApprovalPolicy } from "../../core/approval-policy.js";
import { loadConfig } from "../../core/config.js";
import { patchTaskFile } from "../../server/write.js";
import type { Task } from "../../core/types.js";

const CLEAN = "## Verdict\ngood to go\n";

function minimalTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "0686",
    title: "Test",
    type: "chore",
    status: "review",
    area: "api",
    areas: ["api"],
    branch: "feat/x",
    path: "work/0686.md",
    absPath: "/tmp/work/0686.md",
    body: "## Activity\n",
    assignee: "ai",
    assignedTo: "",
    createdBy: "",
    priority: "p2",
    needsInput: false,
    needsMerge: false,
    noSourceChange: false,
    isArchived: false,
    created_at: null,
    updated_at: null,
    tags: [],
    extra: {},
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    ...overrides,
  };
}

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

  it("rejects human-only tagged tasks before any audit would be written", () => {
    const r = evaluateApprovalPolicy(
      { approval: { enabled: true, autoApprove: { areas: ["api"] } } },
      { task: minimalTask({ tags: ["human-only"] }), reviewMarkdown: CLEAN },
    );
    expect(r).toMatchObject({ eligible: false, reason: "human-only" });
  });
});
