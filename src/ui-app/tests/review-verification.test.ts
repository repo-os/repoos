/**
 * #0714 — mechanical review verification blocks a clean agent verdict when
 * handoff browser evidence records console errors.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../../core/config.js";
import { parseTask } from "../../core/task.js";
import { applyMechanicalReviewVerification } from "../../core/review-verification.js";
import {
  gatherReviewVerification,
  gatherReviewVerificationWithoutWorktree,
} from "../../server/review-verification-gather.js";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

describe("gatherReviewVerification (#0714)", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots) {
      rmSync(`${r}-wt`, { recursive: true, force: true });
      rmSync(r, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("reads console errors from stored handoff evidence on the task branch", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rv-"));
    roots.push(root);
    const worktree = `${root}-wt`;
    const cache = join(root, ".repoos", "ui-verification");
    mkdirSync(cache, { recursive: true });
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(
      join(root, "repoos.toml"),
      [
        'workDir = "work"',
        "[uiVerification]",
        "enabled = true",
        "",
        "[[preview.targets]]",
        'name = "default"',
        'areas = ["web"]',
        'paths = ["work/**"]',
        'command = "true"',
        "",
      ].join("\n"),
    );
    const taskPath = join(root, "work", "0714.md");
    writeFileSync(
      taskPath,
      `---
id: "0714"
title: t
status: review
branch: feat/rv
area: web
---
## Shots
\`\`\`json
[{"route":"/","label":"home"}]
\`\`\`
`,
    );
    writeFileSync(
      join(cache, "0714.json"),
      JSON.stringify({
        at: "2026-01-01T00:00:00Z",
        issues: [{ kind: "console", message: "vue-i18n: intlify message not found" }],
        blankShots: [],
        captures: 1,
      }),
    );
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "init"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["branch", "feat/rv"]);
    git(root, ["worktree", "add", "-q", worktree, "feat/rv"]);

    const config = loadConfig(root);
    const task = parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });

    const verification = gatherReviewVerification(config, task, worktree, "main");
    expect(verification.consoleErrors.status).toBe("failed");
    expect(verification.blocksApproval).toBe(true);

    const agent = "## Verdict\n`good to go` — all clear.\n";
    const applied = applyMechanicalReviewVerification(agent, verification);
    expect(applied.verdictOverride).toBe("needs some work");
  });

  it("records not_run when the branch worktree is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rv-nowt-"));
    roots.push(root);
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "repoos.toml"), 'workDir = "work"\n');
    const taskPath = join(root, "work", "0714b.md");
    writeFileSync(
      taskPath,
      `---
id: "0714"
title: t
status: review
branch: feat/missing-wt
---
`,
    );
    const config = loadConfig(root);
    const task = parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
    const verification = gatherReviewVerificationWithoutWorktree(config, task);
    expect(verification.guardTests[0]?.status).toBe("not_run");
    const applied = applyMechanicalReviewVerification("## Verdict\n`good to go`\n", verification);
    expect(applied.markdown).toContain("no local worktree");
  });
});
