/**
 * `repoos init` — make any repo RepoOS-ready, idempotently. Safe to re-run: it
 * never overwrites existing files, only creates what's missing.
 *
 * In a directory that is NOT inside a git repo, `repoos init` switches to a
 * guided, interactive flow that creates a brand-new RepoOS project from
 * scratch: optionally in a subdirectory, with a choice of layout (repo root
 * vs. a `repoos/` subfolder, config file at root either way), an optional
 * one-line project description (seeded into the sample task) and an optional
 * initial commit.
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
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
import { cmdServe, resolveServeHost } from "./serve.js";

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
4. Create a worktree on the branch named in the task's \`branch:\` field, or set one.
5. Implement → test → if the repo has a git remote, open an MR/PR against main.
6. Set \`status: review\` when ready for human sign-off. **Leave the worktree open; do NOT merge its branch.**

## Review and sign-off

A \`review\` task stays in its open worktree until a human (or another AI) signs
off; the implementer never merges to \`main\` at \`review\` time.

- No git remote: on approval, the reviewer says **"move task <id> to done"**. The
  implementer then sets \`status: done\` (commit \`docs(<id>): set status done\`),
  fast-forward merges the branch to \`main\`, removes the worktree, and deletes
  the branch.
- With a git remote: an MR/PR is opened against \`main\` at \`review\` time. On
  approval it is merged by the reviewer (or by the implementer only on "move task
  <id> to done"), then remote + local branches are deleted and \`status\` is set
  to \`done\`.
- Requested changes are fixed on the same worktree, tests re-run, and the task
  re-set to \`review\`.
- If the \`reviewer\` agent is enabled on the Agents page, RepoOS reviews the
  task automatically when it lands in \`review\` and shows a short report (bugs,
  edge cases, suggestions) in the task drawer. It is advisory: the human still
  reviews and is the only one who moves a task to \`done\`.

## Rules

- **Never** move task files between folders. Status lives in frontmatter.
- **Never write directly to \`work/*.md\` files.** All task creation and
  manipulation goes through \`repoos\` commands or HTTP API endpoints
  (\`POST /api/tasks\`, \`PATCH /api/tasks/:id\`, etc.). If the RepoOS server
  is unreachable, stop and report the issue — do not hand-write task files.
- **The Product Manager agent is authorized to create and update tasks.** It
  must use those same RepoOS CLI commands or HTTP API endpoints for task body,
  metadata, and status changes; it must never edit task Markdown directly.
- **Never** deploy to production without human sign-off.
- Keep frontmatter tidy; \`repoos\` will normalize key order on write.
- One task = one focused worktree.

## Conventions

Document stack-specific conventions here (framework, lint, test commands).

## UI previews are server-owned

Never run \`repoos serve\` yourself and never pick a port — RepoOS owns the
control-plane port and every preview port, and direct serve attempts from agent
processes are rejected. To verify a UI change, request this task's managed
preview by emitting the exact signal line (idempotent, and no localhost or
curl is required — your sandbox may have no network access to the control
plane):

    ::repoos-preview-request::

RepoOS validates the request against your live run, starts the preview from
your worktree, probes it server-side, and records the preview URL and probe
result in your task transcript. The preview is reaped when the task leaves
active/review.
`;

function repoosToml(layout: "root" | "repoos"): string {
  const ns = layout === "repoos" ? `workDir = "repoos/work"\ndocsDir = "repoos/docs"\ncacheDir = "repoos/.repoos"\n` : "";
  return `# RepoOS configuration. All fields optional — these are the defaults.

${ns}defaultStatus = "inbox"
defaultAssignee = "unassigned"

# Optional features, off by default — uncomment to turn them on. Real
# secrets (API keys, client secrets) go in .env, never here (this file is
# git-tracked); see .env.example for the matching variables.

# [auth]                                # require login (email OTP / Google) — docs/native-auth.md
# enabled = true
# bootstrapAdmin = "you@example.com"    # only this email can claim the first admin account
#
# [auth.emailProvider]
# type = "resend"
# fromAddress = "noreply@yourdomain.com"
#
# [auth.google]                         # optional — adds a "Sign in with Google" button
# clientId = "..."                      # clientSecret goes in .env, not here

# [whisper]                             # voice-to-text in text areas
# provider = "groq"                     # or "openai"

# ntfyEnabled = true                    # push notifications on task lifecycle events
# ntfyTopic = "repoos_myproject"
# ntfyBaseUrl = "https://ntfy.sh"       # or your self-hosted ntfy server
`;
}

const ENV_EXAMPLE = `# Copy to .env and fill in what you need — .env is gitignored, this file is
# tracked so the repo documents which secrets a full setup expects.
# repoos serve auto-loads .env at startup; real shell/process-supervisor env
# vars still take precedence over it.

# --- Auth (docs/native-auth.md) — only used when [auth].enabled = true ---
# REPOOS_RESEND_API_KEY=re_...
# REPOOS_GOOGLE_CLIENT_SECRET=...
# REPOOS_AUTH_SESSION_SECRET=...          # auto-generated on first boot if omitted

# --- Voice-to-text transcription (only used when [whisper] is configured) ---
# REPOOS_WHISPER_KEY=...                  # or GROQ_API_KEY / OPENAI_API_KEY directly

# --- repoos tunnel (Cloudflare Tunnel + Access) ---
# CLOUDFLARE_API_TOKEN=...

# --- ntfy.sh push notifications ---
# NTFY_BASE_URL=https://ntfy.sh          # or your self-hosted ntfy server
`;

const INITIAL_COMMIT_MSG = "chore: initialize RepoOS project";

type ScaffoldLayout = "root" | "repoos";

function scaffoldInto(
  root: string,
  description: string,
  layout: ScaffoldLayout = "root",
) {
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

  // Write config first so workDir/docsDir/cacheDir overrides are in effect
  // before the dirs are created (namespace layout) — or so an existing
  // config is respected untouched (existing-repo path).
  ensureFile("repoos.toml", repoosToml(layout));
  const config = loadConfig(root);

  ensureDir(config.workDir);
  ensureDir(config.docsDir);
  ensureFile("AGENTS.md", AGENTS_MD);
  ensureFile(join(config.workDir, "0001-set-up-repoos.md"), SAMPLE_TASK(description));
  ensureFile(".env.example", ENV_EXAMPLE);

  // gitignore the derived cache and local secrets
  const giPath = join(root, ".gitignore");
  const ignoreLines = [
    { comment: "# RepoOS derived index cache", line: `${config.cacheDir}/` },
    { comment: "# Local secrets — see .env.example", line: ".env" },
  ];
  const existingLines = existsSync(giPath) ? readFileSync(giPath, "utf8").split(/\r?\n/) : [];
  const toAdd = ignoreLines.filter((l) => !existingLines.some((e) => e.trim() === l.line));
  if (toAdd.length === 0) {
    skipped.push(".gitignore");
  } else if (existsSync(giPath)) {
    appendFileSync(giPath, "\n" + toAdd.map((l) => `${l.comment}\n${l.line}`).join("\n\n") + "\n");
    created.push(".gitignore (+entry)");
  } else {
    writeFileSync(giPath, toAdd.map((l) => `${l.comment}\n${l.line}`).join("\n\n") + "\n");
    created.push(".gitignore");
  }

  return { created, skipped };
}

function reportInit(root: string, created: string[], skipped: string[]): void {
  console.log(c.bold(c.cyan("\n  RepoOS initialized")) + c.dim(`  ·  ${root}\n`));
  for (const f of created) console.log("  " + c.green("created ") + f);
  for (const f of skipped) console.log("  " + c.dim("exists  " + f));
}

/**
 * The marker that identifies a RepoOS project root: repoos.toml. It lives at
 * the root in BOTH layouts (root and repoos/ namespace), so this alone is a
 * reliable, unambiguous signal. We deliberately do NOT scan for work/ dirs —
 * a `repoos/work/` folder could just be the actual repoos repo clone (or any
 * unrelated `work/`), which would make sibling directories false-positive as
 * "already a RepoOS project".
 */
function repoOSMarker(dir: string): string | null {
  const p = join(dir, "repoos.toml");
  return existsSync(p) ? p : null;
}

/** Nearest ancestor (or the dir itself) that already has a RepoOS layout. */
function findRepoOSDir(start: string): string | null {
  let dir = resolve(start);
  while (true) {
    if (repoOSMarker(dir)) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

function warnAlreadySetUp(dir: string, hint: string): void {
  console.log(
    c.yellow("\n  RepoOS is already set up in ") + c.cyan(dir) + c.yellow("."),
  );
  if (hint) console.log(c.dim(`  ${hint}`));
  const marker = repoOSMarker(dir);
  if (marker) {
    console.log(
      c.dim("  Detected because ") + c.cyan(marker) + c.dim(" exists."),
    );
  }
  console.log(
    c.dim("  To initialize a brand-new project, run repoos init in a different (empty) directory."),
  );
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

/** Ask where the scaffold should live: repo root (default) or a repoos/ subfolder. */
async function askLayout(): Promise<ScaffoldLayout> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (
      await ask(
        "  Where should RepoOS live?" +
          c.dim("  r = repo root (default), n = repoos/ subfolder — avoids clashing with existing dirs") +
          ": ",
      )
    ).toLowerCase();
    if (answer === "" || answer === "r" || answer === "root") return "root";
    if (answer === "n" || answer === "namespace" || answer === "repoos") return "repoos";
    console.log(c.yellow(`  "${answer}" — type r (root) or n (repoos/ subfolder).`));
  }
  return "root";
}

/** Open a URL in the default browser. Fail-soft (best effort, never blocks). */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    const child = spawn(cmd[0], cmd.slice(1), {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* fail-soft */
  }
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(true)));
  });
}

/** First free port at or above `start` (bounded). Falls back to `start`. */
async function nextFreePort(start: number): Promise<number> {
  for (let p = start; p < start + 50; p++) {
    if (await probePort(p)) return p;
  }
  return start;
}

async function askPort(): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await ask(
      "  Preferred port" +
        c.dim(" [7171] — Enter for default, 0 = let the OS pick a free port") +
        ": ",
    );
    if (raw === "") return 7171;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 65535) return n;
    console.log(c.yellow(`  "${raw}" isn't a valid port.`));
  }
  return 7171;
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
    if (repoOSMarker(target)) {
      warnAlreadySetUp(
        target,
        "Nothing to create — that project already exists.",
      );
      process.exitCode = 1;
      return;
    }
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

  const layout = await askLayout();

  console.log();
  const scaffoldFiles =
    layout === "repoos"
      ? "repoos/work/, repoos/docs/, AGENTS.md, repoos.toml, .gitignore"
      : "work/, docs/, AGENTS.md, repoos.toml, .gitignore";
  const proceed = await confirm(
    "  Ready to " +
      c.cyan("git init") +
      c.dim(" and scaffold " + scaffoldFiles) +
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

  const { created, skipped } = scaffoldInto(target, description, layout);
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

  if (await confirm("\n  Launch the RepoOS web console now to start building?", true)) {
    const preferred = await askPort();
    let port = preferred;
    if (preferred > 0) {
      const free = await nextFreePort(preferred);
      if (free !== preferred) {
        console.log(
          c.yellow(`  Port ${preferred} is in use — using ${free} instead.`),
        );
        port = free;
      }
    }
    const { host } = resolveServeHost();
    const dirHint = target === cwd ? null : `cd ${target}`;
    if (target !== cwd) process.chdir(target);
    // "0.0.0.0" (the Tailscale-detected bind) isn't openable in a browser —
    // localhost is always reachable regardless of what's actually bound.
    if (port > 0) openBrowser(`http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
    if (dirHint) {
      console.log(
        c.dim("\n  Your shell is still in ") + c.cyan(cwd) +
          c.dim(" — this new project lives in ") + c.cyan(target) +
          c.dim("."),
      );
    }
    console.log(c.dim("  Starting the RepoOS web console…"));
    await cmdServe(["--port", String(port)], {
      onShutdown: dirHint
        ? () => console.log(c.dim("  cd into the project: ") + c.cyan(dirHint))
        : undefined,
    });
    return;
  }

  const dirHint = target === cwd ? "" : `cd ${target}  ·  `;
  console.log(
    "\n  Next: " +
      c.cyan(dirHint + "repoos list") +
      c.dim("  ·  ") +
      c.cyan("repoos show 0001") +
      c.dim("  ·  ") +
      c.cyan('repoos new "My task"') +
      c.dim("  ·  ") +
      c.cyan("repoos serve") +
      c.dim(" to open the web console") +
      "\n",
  );
}

export async function cmdInit(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (isGitRepo(cwd)) {
    // existing-repo path — unchanged, idempotent, no prompts
    const root = findRepoRoot(cwd);
    const { created, skipped } = scaffoldInto(root, "");
    if (created.length === 0) {
      warnAlreadySetUp(root, "Nothing to initialize here.");
      for (const f of skipped) console.log("  " + c.dim("exists  " + f));
      return;
    }
    reportInit(root, created, skipped);
    return;
  }

  const alreadyHere = findRepoOSDir(cwd);
  if (alreadyHere) {
    warnAlreadySetUp(
      alreadyHere,
      "This directory isn't a git repo, but it sits inside an existing RepoOS setup.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await guidedNewRepo(args);
  } catch {
    console.log(c.yellow("\n  Cancelled."));
  }
}
