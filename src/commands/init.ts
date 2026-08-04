/**
 * `ros init` — make any repo RepoOS-ready, idempotently. Safe to re-run: it
 * never overwrites existing files, only creates what's missing.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { findRepoRoot, loadConfig } from "../core/config.js";
import { c } from "../cli/colors.js";

const SAMPLE_TASK = `---
id: "0001"
title: Set up RepoOS
type: chore
status: ready
priority: p2
area: infra
assigned_to: ai
created_by: human
branch: ""
---

## Problem

The repo needs a lightweight, repo-native way to track work that AI agents
and humans share. Tasks should live as markdown files, versioned in git.

## Desired UX

Run \`ros list\` to see the board. Run \`ros show 0001\` to read a task.
Agents read these files directly for full context.

## Acceptance criteria

- [ ] \`ros init\` has scaffolded work/, repoos.toml, AGENTS.md
- [ ] \`ros list\` shows this task
- [ ] Editing the \`status:\` field moves it across the board

## Notes for AI

Status is a frontmatter field — never move files between folders. Keep diffs
small. Read AGENTS.md before starting any task.
`;

const AGENTS_MD = `# AGENTS.md

This repo uses **RepoOS**: tasks are markdown files under \`work/\`, and the
repo itself is the source of truth. This file tells AI agents how to operate.

## Operating loop

1. Read this file and any relevant docs under \`docs/\`.
2. Pick a task from \`work/\` whose \`status: ready\`.
3. Set its \`status: active\` (edit the frontmatter; do not move the file).
4. Create a branch named in the task's \`branch:\` field, or set one.
5. Implement → test → if the repo has a git remote, open an MR/PR against main.
6. Set \`status: review\` when ready for human sign-off. **Leave the branch open; do NOT merge it.**

## Review and sign-off

A \`review\` task stays on its open branch until a human (or another AI) signs
off; the implementer never merges to \`main\` at \`review\` time.

- No git remote: on approval, the reviewer says **"move task <id> to done"**. The
  implementer then sets \`status: done\` (commit \`docs(<id>): set status done\`),
  fast-forward merges the branch to \`main\`, and deletes the branch.
- With a git remote: an MR/PR is opened against \`main\` at \`review\` time. On
  approval it is merged by the reviewer (or by the implementer only on "move task
  <id> to done"), then remote + local branches are deleted and \`status\` is set
  to \`done\`.
- Requested changes are fixed on the same branch, tests re-run, and the task
  re-set to \`review\`.

## Rules

- **Never** move task files between folders. Status lives in frontmatter.
- **Never** deploy to production without human sign-off.
- Keep frontmatter tidy; \`ros\` will normalize key order on write.
- One task = one focused branch.

## Conventions

Document stack-specific conventions here (framework, lint, test commands).
`;

const REPOOS_TOML = `# RepoOS configuration. All fields optional — these are the defaults.

workDir = "work"
docsDir = "docs"
defaultStatus = "inbox"
defaultAssignee = "unassigned"
cacheDir = ".repoos"
`;

export function cmdInit(): void {
  const root = findRepoRoot();
  const config = loadConfig(root);
  const created: string[] = [];
  const skipped: string[] = [];

  const ensureDir = (rel: string) => {
    const p = join(root, rel);
    if (!existsSync(p)) {
      mkdirSync(p, { recursive: true });
      created.push(rel + "/");
    } else {
      skipped.push(rel + "/");
    }
  };
  const ensureFile = (rel: string, content: string) => {
    const p = join(root, rel);
    if (!existsSync(p)) {
      writeFileSync(p, content);
      created.push(rel);
    } else {
      skipped.push(rel);
    }
  };

  ensureDir(config.workDir);
  ensureDir(config.docsDir);
  ensureFile("repoos.toml", REPOOS_TOML);
  ensureFile("AGENTS.md", AGENTS_MD);
  ensureFile(join(config.workDir, "0001-set-up-repoos.md"), SAMPLE_TASK);

  // gitignore the derived cache
  const giPath = join(root, ".gitignore");
  const ignoreLine = `${config.cacheDir}/`;
  if (existsSync(giPath)) {
    const gi = readFileSync(giPath, "utf8");
    if (!gi.split(/\r?\n/).some((l) => l.trim() === ignoreLine)) {
      appendFileSync(giPath, `\n# RepoOS derived index cache\n${ignoreLine}\n`);
      created.push(".gitignore (+entry)");
    } else {
      skipped.push(".gitignore");
    }
  } else {
    writeFileSync(giPath, `# RepoOS derived index cache\n${ignoreLine}\n`);
    created.push(".gitignore");
  }

  console.log(c.bold(c.cyan("\n  RepoOS initialized")) + c.dim(`  ·  ${root}\n`));
  for (const f of created) console.log("  " + c.green("created ") + f);
  for (const f of skipped) console.log("  " + c.dim("exists  " + f));
  console.log(
    "\n  Next: " +
      c.cyan("ros list") +
      c.dim("  ·  ") +
      c.cyan("ros show 0001") +
      c.dim("  ·  ") +
      c.cyan('ros new "My task"') +
      "\n",
  );
}
