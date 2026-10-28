/**
 * #0714 — mechanical review verification blocks a clean agent verdict when
 * handoff browser evidence records console errors.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
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

  it("reads console errors from stored handoff evidence on the task branch", async () => {
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

    const verification = await gatherReviewVerification(config, task, worktree, "main");
    expect(verification.consoleErrors.status).toBe("failed");
    expect(verification.blocksApproval).toBe(true);

    const agent = "## Verdict\n`good to go` — all clear.\n";
    const applied = applyMechanicalReviewVerification(agent, verification);
    expect(applied.verdictOverride).toBe("needs some work");
  });

  it("skips the browser console check for a command-only task (#0765)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-rv-cmd-"));
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
        "[[shot.targets]]",
        'name = "mac"',
        'areas = ["mac"]',
        'command = "true"',
        "",
      ].join("\n"),
    );
    const taskPath = join(root, "work", "0765.md");
    writeFileSync(
      taskPath,
      `---
id: "0765"
title: t
status: review
branch: feat/rv-cmd
area: mac
---
## Shots
\`\`\`json
[{"target":"mac","label":"Menu bar"}]
\`\`\`
`,
    );
    // Command-target evidence: no browser console, no web capture details.
    writeFileSync(
      join(cache, "0765.json"),
      JSON.stringify({
        at: "2026-01-01T00:00:00Z",
        issues: [],
        blankShots: [],
        captures: 1,
        sourceIdentity: "abc1234",
        commandCaptures: [
          {
            target: "mac",
            label: "Menu bar",
            command: "true",
            cwd: root,
            status: "captured",
            exitStatus: 0,
            shots: [
              {
                name: "mac-1.png",
                size: 10,
                mime: "image/png",
                path: "work/.attachments/0765/shots/mac-1.png",
                url: "/api/tasks/0765/shots/mac-1.png",
              },
            ],
          },
        ],
      }),
    );
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "init"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["branch", "feat/rv-cmd"]);
    git(root, ["worktree", "add", "-q", worktree, "feat/rv-cmd"]);

    const config = loadConfig(root);
    const task = parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });

    const verification = await gatherReviewVerification(config, task, worktree, "main");
    // #0765: browser verification does not apply, so the console check is
    // `skipped` — never `not_run`, which would falsely block approval.
    expect(verification.consoleErrors.status).toBe("skipped");
    expect(verification.blocksApproval).toBe(false);

    const applied = applyMechanicalReviewVerification(
      "## Verdict\n`good to go` — all clear.\n",
      verification,
    );
    expect(applied.verdictOverride).toBeUndefined();
    expect(applied.markdown).toContain("good to go");
    expect(applied.markdown).toContain("did not apply to this task");

    // #0765: even with NO evidence file at all, a command-only task is not
    // blocked on the "ui-verification JSON absent" gap — that file is a browser
    // artifact this task type cannot produce.
    rmSync(join(cache, "0765.json"), { force: true });
    const noEvidence = await gatherReviewVerification(config, task, worktree, "main");
    expect(noEvidence.consoleErrors.status).toBe("skipped");
    expect(noEvidence.blocksApproval).toBe(false);
    expect(
      applyMechanicalReviewVerification("## Verdict\n`good to go`\n", noEvidence).verdictOverride,
    ).toBeUndefined();
  });

  it("records not_run when the branch worktree is missing", async () => {
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
    const verification = await gatherReviewVerificationWithoutWorktree(config, task);
    expect(verification.guardTests[0]?.status).toBe("not_run");
    const applied = applyMechanicalReviewVerification("## Verdict\n`good to go`\n", verification);
    expect(applied.markdown).toContain("no local worktree");
  });

  function setupBranchRepo(opts: {
    rootToml: string;
    branchToml: string;
    branchFiles?: Record<string, string>;
  }): { worktree: string; taskPath: string; root: string } {
    const root = mkdtempSync(join(tmpdir(), "repoos-rv-globs-"));
    roots.push(root);
    const worktree = `${root}-wt`;
    mkdirSync(join(root, "work"), { recursive: true });
    writeFileSync(join(root, "repoos.toml"), opts.rootToml);
    const taskPath = join(root, "work", "0762.md");
    writeFileSync(
      taskPath,
      `---
id: "0762"
title: t
status: review
branch: feat/rv-globs
---
`,
    );
    git(root, ["init", "-q"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "Test"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-qm", "init"]);
    git(root, ["branch", "-M", "main"]);
    git(root, ["branch", "feat/rv-globs"]);
    git(root, ["worktree", "add", "-q", worktree, "feat/rv-globs"]);
    writeFileSync(join(worktree, "repoos.toml"), opts.branchToml);
    for (const [rel, content] of Object.entries(opts.branchFiles ?? {})) {
      const abs = join(worktree, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
    git(worktree, ["add", "-A"]);
    git(worktree, ["commit", "-qm", "branch changes"]);
    return { worktree, taskPath, root };
  }

  function loadTask(root: string, taskPath: string) {
    const config = loadConfig(root);
    const task = parseTask({
      content: readFileSync(taskPath, "utf8"),
      absPath: taskPath,
      root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
    });
    return { config, task };
  }

  it("ignores an unrelated repoos.toml addition (#0762)", async () => {
    const base =
      'workDir = "work"\n\n[check]\nversion = 1\n\n[[check.steps]]\nname = "build"\nkind = "build"\n';
    const { worktree, taskPath, root } = setupBranchRepo({
      rootToml: base,
      branchToml: `${base}\n[release]\nversion = "1.0.0"\n\n[[distribution]]\nname = "dist"\nkind = "npm"\ncommand = "npm publish"\n`,
    });
    const { config, task } = loadTask(root, taskPath);
    const verification = await gatherReviewVerification(config, task, worktree, "main");
    expect(verification.guardTests).toEqual([]);
    expect(verification.blocksApproval).toBe(false);
  });

  it("accepts a Swift test path as negative evidence when configured (#0762)", async () => {
    const base = [
      'workDir = "work"',
      "",
      "[reviewVerification]",
      'testGlobs = ["**/*Tests.swift"]',
      "",
      "[check]",
      "version = 1",
      "",
      "[[check.steps]]",
      'name = "build"',
      'kind = "build"',
      "",
    ].join("\n");
    const branchToml = `${base}[[check.steps]]\nname = "contrast"\nkind = "theme-contrast"\n`;
    const { worktree, taskPath, root } = setupBranchRepo({
      rootToml: base,
      branchToml,
      branchFiles: {
        "Tests/ThemeContrastTests.swift": [
          "import XCTest",
          "@testable import RepoOS",
          "final class ThemeContrastTests: XCTestCase {",
          "  func testFlagsProhibitedContrastPair() {",
          "    // theme-contrast guard must reject this bad input",
          '    XCTAssertThrowsError(try themeContrastOffenders([ContrastPair(fg: "#fff", bg: "#fff")]))',
          "  }",
          "}",
        ].join("\n"),
      },
    });
    const { config, task } = loadTask(root, taskPath);
    const verification = await gatherReviewVerification(config, task, worktree, "main");
    expect(verification.guardTests).toHaveLength(1);
    expect(verification.guardTests[0]?.guardId).toBe("theme-contrast");
    expect(verification.guardTests[0]?.status).toBe("passed");
    expect(verification.blocksApproval).toBe(false);
  });
}, 15_000);
