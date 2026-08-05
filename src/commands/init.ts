/**
 * `repoos init` — make any repo RepoOS-ready, idempotently. Safe to re-run: it
 * never overwrites existing files, only creates what's missing.
 *
 * In a directory that is NOT inside a git repo, `repoos init` switches to a
 * guided, interactive flow that creates a brand-new RepoOS project from
 * scratch: optionally in a subdirectory, with an optional one-line project
 * description (seeded into the sample task) and an optional initial commit.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { findRepoRoot, loadConfig } from "../core/config.js";
import {
  gitAvailable,
  gitCommitAll,
  gitConfig,
  gitInit,
  isGitRepo,
} from "../core/git.js";
import { c } from "../cli/colors.js";

const SAMPLE_TASK = (description: string) => `---
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
${description ? `\n## Overview\n\n${description}\n` : ""}
## Problem

The repo needs a lightweight, repo-native way to track work that AI agents
and humans share. Tasks should live as markdown files, versioned in git.

## Desired UX

Run \`repoos list\` to see the board. Run \`repoos show 0001\` to read a task.
Agents read these files directly for full context.

## Acceptance criteria

- [ ] \`repoos init\` has scaffolded work/, repoos.toml, AGENTS.md
- [ ] \`repoos list\` shows this task
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
- Keep frontmatter tidy; \`repoos\` will normalize key order on write.
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

const INITIAL_COMMIT_MSG = "chore: initialize RepoOS project";

function scaffoldInto(root: string, description: string) {
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
  ensureFile(join(config.workDir, "0001-set-up-repoos.md"), SAMPLE_TASK(description));

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

  return { created, skipped };
}

function reportInit(root: string, created: string[], skipped: string[]): void {
  console.log(c.bold(c.cyan("\n  RepoOS initialized")) + c.dim(`  ·  ${root}\n`));
  for (const f of created) console.log("  " + c.green("created ") + f);
  for (const f of skipped) console.log("  " + c.dim("exists  " + f));
}

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function confirm(question: string, dflt: boolean): Promise<boolean> {
  const hint = dflt ? " [Y/n]" : " [y/N]";
  const answer = (await ask(question + c.dim(hint) + " ")).toLowerCase();
  if (answer === "") return dflt;
  return answer === "y" || answer === "yes";
}

async function guidedNewRepo(args: string[]): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      c.red("\n  This directory isn't a git repo, so repoos init needs interactive prompts."),
    );
    console.error(
      c.dim("  Run it in a terminal, or run `git init` first and then `repoos init` again."),
    );
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  let projectName = (args[0] ?? "").trim();
  if (projectName && !/^[A-Za-z0-9._-]+$/.test(projectName)) {
    console.error(
      c.red(`  Invalid project name "${projectName}" — use letters, digits, . _ -`),
    );
    process.exitCode = 1;
    return;
  }

  console.log(c.dim("\n  Not inside a git repository."));
  console.log(
    c.cyan("  repoos init will create a new RepoOS project here."),
  );
  console.log(
    c.dim("  Default: the CURRENT directory. Enter a project name to use a subdirectory instead."),
  );

  if (!projectName) {
    projectName = await ask(
      "  Project name" + c.dim(" (Enter = current directory)") + ": ",
    );
  }

  let target = cwd;
  if (projectName) {
    target = join(cwd, projectName);
    console.log();
    const ok = await confirm(
      "  Create the project in a new subdirectory " + c.cyan(`./${projectName}`) + c.dim(`  →  ${target}`),
      true,
    );
    if (!ok) {
      console.log(c.yellow("\n  Cancelled — nothing was created."));
      return;
    }
  } else {
    console.log(c.dim(`  →  Using the current directory: ${cwd}`));
  }

  console.log();
  const proceed = await confirm(
    "  Ready to " +
      c.cyan("git init") +
      c.dim(" and scaffold work/, docs/, AGENTS.md, repoos.toml, .gitignore") +
      " in " +
      c.cyan(target),
    true,
  );
  if (!proceed) {
    console.log(c.yellow("\n  Cancelled — nothing was created."));
    return;
  }

  const description = await ask(
    "  Project description" +
      c.dim(" — one line, gives the AI context to suggest next steps (optional, Enter to skip)") +
      ": ",
  );

  if (!existsSync(target)) mkdirSync(target, { recursive: true });

  // git health warnings — fail-soft, scaffold regardless
  const gitOk = gitAvailable(target);
  if (!gitOk) {
    console.log(
      c.yellow("\n  Warning: git doesn't appear to be installed — scaffolding without git."),
    );
  } else if (!gitConfig(target, "user.name") && !gitConfig(target, "user.email")) {
    console.log(
      c.yellow("\n  Warning: no git identity is configured."),
    );
    console.log(
      c.dim("    git may auto-detect it, or the initial commit may fail. Set it with:"),
    );
    console.log(c.dim('    git config --global user.name "You" && git config --global user.email you@example.com'));
  }

  const { created, skipped } = scaffoldInto(target, description);
  reportInit(target, created, skipped);

  if (!gitOk) {
    console.log(
      c.dim("  To add git later: git init && git add -A && git commit"),
    );
  } else if (gitInit(target)) {
    console.log("  " + c.green("git init") + c.dim("  ok"));
  } else {
    console.log(c.yellow("  Warning: git init failed — files left uncommitted."));
  }

  if (gitOk && (await confirm("\n  Make an initial commit of the scaffold?", true))) {
    const hash = gitCommitAll(target, INITIAL_COMMIT_MSG);
    if (hash) {
      console.log("  " + c.green("committed ") + c.dim(hash));
    } else {
      console.log(
        c.yellow("  Warning: initial commit failed (unconfigured identity or a hook) — files left uncommitted."),
      );
    }
  }

  const dirHint = target === cwd ? "" : `cd ${target}  ·  `;
  console.log(
    "\n  Next: " +
      c.cyan(dirHint + "repoos list") +
      c.dim("  ·  ") +
      c.cyan("repoos show 0001") +
      c.dim("  ·  ") +
      c.cyan('repoos new "My task"') +
      "\n",
  );
}

export async function cmdInit(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (isGitRepo(cwd)) {
    // existing-repo path — unchanged, idempotent, no prompts
    const root = findRepoRoot(cwd);
    const { created, skipped } = scaffoldInto(root, "");
    reportInit(root, created, skipped);
    return;
  }

  try {
    await guidedNewRepo(args);
  } catch {
    console.log(c.yellow("\n  Cancelled."));
  }
}
