/**
 * `repoos init` — make any repo RepoOS-ready, idempotently. Safe to re-run: it
 * never overwrites existing files, only creates what's missing.
 *
 * In a directory that is NOT inside a git repo, `repoos init` switches to a
 * guided, interactive flow that creates a brand-new RepoOS project from
 * scratch: optionally in a subdirectory, with a choice of layout (repo root
 * vs. a `repoos/` subfolder, config file at root either way), an optional
 * project description, one or many lines (seeded into the sample task) and an optional
 * initial commit.
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { canaryGitignoreIgnore, canaryGitignoreNegation, canaryRelPath } from "../core/canary.js";
import { scaffoldCanaryFile } from "../core/canary-repo.js";
import { deriveServePort, findRepoRoot, loadConfig } from "../core/config.js";
import { CHECK_PLAN_PROPOSAL_FILE, proposeCheckPlan } from "../core/check-plan-proposal.js";
import { formatPlanToml } from "../core/check-plan.js";
import { gitAvailable, gitCommitAll, gitConfig, gitInit, isGitRepo } from "../core/git.js";
import { c } from "../cli/colors.js";
import { cmdServe } from "./serve.js";

const SAMPLE_TASK = (description: string, workDir: string) => `---
id: "0001"
title: Set up RepoOS
type: chore
status: done
priority: p2
area: infra
assigned_to: unassigned
created_by: human
branch: ""
---
${description ? `\n## Overview\n\n${description}\n` : ""}
## Problem

The repo needed a lightweight, repo-native way to track work that AI agents
and humans share. Tasks live as markdown files, versioned in git.

## Desired UX

Run \`repoos list\` to see the board. Run \`repoos show 0001\` to read a task
(this one). Agents read these files directly for full context.

## Acceptance criteria

- [x] \`repoos init\` scaffolded ${workDir}/, repoos.toml, AGENTS.md
- [x] \`repoos list\` shows this task
- [x] Editing the \`status:\` field moves it across the board

This task exists to show you the shape of a task file — it's done because
running \`repoos init\` already satisfies everything above. There's nothing to
"work" here; move on to your next task.

## Notes for AI

Status is a frontmatter field — never move files between folders. Keep diffs
small. Read AGENTS.md before starting any task.
`;

/** Blockquote every line, so a multi-line (pasted markdown) description stays one quote. */
export function quoteBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");
}

/**
 * The first *workable* task a guided new-project init leaves on the board.
 * 0001 is deliberately `done` (scaffolding is the whole of it), so this is what
 * a new user — or their first agent — actually picks up. `repoos init` runs
 * before any server or agent exists, so the body itself is the prompt: it
 * embeds the description collected at init and carries the questions
 * that turn that description into docs and real tasks later.
 */
const NEW_PROJECT_STARTER_TASK = (
  id: string,
  description: string,
  workDir = "work",
  docsDir = "docs",
) => `---
id: "${id}"
title: Flesh out the product vision and initial architecture
type: spec
status: inbox
priority: p2
area: product
assigned_to: unassigned
created_by: repoos-init
branch: ""
---
## Overview

This project started from a short description. This task turns it into
something a team can actually build from — a shared vision, an initial
architecture, and a first batch of concrete work.

## Project description

${
  description
    ? quoteBlock(description)
    : "_No description was given at init time. Start by writing a short description that says what this project is and who it's for._"
}

## What to do

1. Read the description above and the rest of this repo.
2. Work through the questions that block design — on your own, or with the
   project's owner:
   - Who is this for, and what is the smallest useful first release?
   - What stack and hosting, and why those over the alternatives?
   - What is explicitly **out of scope** for now?
3. Write the answers into \`${docsDir}/\` — at minimum a short vision note and an
   architecture note. Keep them specific to this project.
4. Break the result into a handful of concrete tasks with
   \`repoos new "<title>"\`, and move the ones that are ready into \`ready\`.
5. Record the docs you wrote here, then hand this task off with
   \`repoos mv <id> review\` and stop — RepoOS runs the checks and moves the
   status (or \`done\` if there is genuinely nothing left to capture).

## Notes for AI

This task is self-contained: the description above and the questions in step 2
are the prompt. Ask the human before inventing answers about stack, scope or
priorities — a short back-and-forth here saves a lot of rework later.
`;

/**
 * The first workable task for `repoos init` inside an existing codebase. There
 * is already a repo to read, so unlike the new-project starter this one is
 * about documenting what exists and turning the gaps into a real backlog.
 */
const EXISTING_REPO_STARTER_TASK = (
  id: string,
  _description = "",
  workDir = "work",
  docsDir = "docs",
) => `---
id: "${id}"
title: Read this codebase and propose ${docsDir}/ + an initial task backlog
type: spec
status: inbox
priority: p2
area: docs
assigned_to: unassigned
created_by: repoos-init
branch: ""
---
## Overview

If this repository is actually empty, close this task and use the
product-vision task instead (\`repoos init --starter vision\` seeds one).

RepoOS was just added to an existing codebase. The first useful move is to read
what's already here, write down what a newcomer — human or agent — would need,
then turn what's missing into work.

## What to do

1. Scan the repo: top-level structure, languages and frameworks, build and
   test commands, and any existing conventions or docs.
2. Write the durable findings into \`${docsDir}/\` — architecture notes and the
   conventions anyone working here must follow.
3. Draft a small starter backlog of real tasks with \`repoos new "<title>"\`,
   each concrete enough to work on its own.
4. Record what you wrote here, then hand this task off with
   \`repoos mv <id> review\` and stop — RepoOS runs the checks and moves the
   status (or \`done\` if there is nothing left to capture).

## Notes for AI

Read \`AGENTS.md\` first — it's the operating loop for this repo. Base the docs
on what the code actually does rather than what you'd expect it to; where the
repo is silent, write down the open question instead of guessing.
`;

const AGENTS_MD = (workDir: string, docsDir: string) => `# AGENTS.md

This repo uses **RepoOS**: tasks are markdown files under \`${workDir}/\`, and the
repo itself is the source of truth. This file tells AI agents how to operate.

## For AI agents, day one

New to this repo? The board is \`${workDir}/\` — one markdown file per task.
Create work with \`repoos new "<title>"\`, move it with \`repoos mv <id> <status>\`,
and **never** edit \`${workDir}/*.md\` by hand (use the CLI or the HTTP API).
Project context lives under \`${docsDir}/\`; start there. Run \`repoos serve\` in a
terminal you keep open (or \`repoos service\`) — a server started from a
short-lived shell dies with it. When a task is done, run \`repoos check\` and
hand off with \`repoos mv <id> review\`; see the operating loop below.

## Operating loop

For a RepoOS-managed task runner:

1. Read this file, your assigned task under \`${workDir}/\`, and relevant
   project docs under \`${docsDir}/\`. Before reading a large file, run
   \`repoos outline <path>\` to get its symbols with line numbers, then read
   only the range you need instead of the whole file.
2. Work in the task branch and dedicated worktree RepoOS assigned. The server
   owns activation and worktree setup; do not claim another task or edit its
   frontmatter directly.
3. Implement the task, update directly affected docs, and run
   \`repoos check --changed main\`. It must pass before handoff.
4. Request handoff with \`repoos mv <id> review\` or finish your reply with
   \`::repoos-handoff-ready::\`, then end your turn. In your own runner session,
   both record a request without changing status. RepoOS commits the branch,
   runs checks, verifies the tested tree stayed unchanged, and then moves the
   task to \`review\`. Failure leaves it \`active\` with the reason shown.
5. Leave the worktree open and stop. Do not merge the branch or mark it done.
   Requested fixes continue on the same worktree with another checked handoff.

Interactive agents helping on a task use its same branch/worktree and the
same review/close-out workflow. Coordinate with any live engineer/reviewer
before editing. Do not edit a task's worktree while it is in \`review\` or
close-out — check \`.repoos/locks/<id>.json\` if unsure. Outside a managed
runner, \`repoos mv <id> review\` writes metadata that the server intercepts
asynchronously; wait for finalization, not just the CLI command's return.
Runner-only signals do not apply there.

## Review and sign-off

RepoOS owns review and close-out whether or not this repo has a Git remote.
Do not open a PR, push a task branch, or substitute GitHub approval/merge
unless the human explicitly requests that separate workflow.

The reviewer agent, when enabled, writes an advisory report in the task drawer.
It does not edit code or replace human approval. After the human approves,
use **Move to done** in RepoOS or \`POST /api/tasks/:id/done\`. The server
merges the task into a separate candidate worktree, validates the combined
result, rechecks the primary branch under a publication lock, publishes,
cleans up, and records completion. \`repoos mv <id> done\` only changes metadata;
it does not run close-out or merge code.

A direct commit on the primary branch is an exception requiring explicit
human authorization. If that already-landed work has a branchless task record,
the \`/done\` endpoint can check the primary checkout and record release without
a candidate merge. Do not erase a task's branch metadata to force this path.

## Rules

- **\`repoos.toml\` owns the layout.** \`workDir\` (\`${workDir}\`) and \`docsDir\`
  (\`${docsDir}\`) are authoritative: tasks live under \`${workDir}/\` and project
  docs under \`${docsDir}/\` because the config says so. Never move, rename or
  relocate those directories, and never "fix" a layout you think is wrong by
  moving files. If project docs or a person's own notes disagree with the
  config, report the mismatch — the fix is to update \`repoos.toml\` with human
  approval (or correct the docs), never to move directories on your own. Do not
  invent ownership rules for RepoOS directories; the config is the only source
  of truth for layout.
- **Never** move task files between folders. Status lives in frontmatter.
- **Never write directly to \`${workDir}/*.md\` files.** All task creation and
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
processes are rejected. Preview requests are the human's to make — do NOT
automatically request a preview before handoff or as a routine part of finishing
a task. If the human explicitly asks you to verify a change the way a browser
would see it, request this task's managed preview by emitting the exact signal
line (idempotent, and no localhost or curl is required — your sandbox may have
no network access to the control plane):

    ::repoos-preview-request::

RepoOS validates the request against your live run, starts the preview from
your worktree, probes it server-side, and records the preview URL and probe
result in your task transcript. The preview is reaped when the task leaves
active/review.

## Declaring evidence shots (## Shots)

A task body may carry a \`## Shots\` section with a fenced JSON list of capture
entries (see \`src/core/shot-plan.ts\`). Each entry has \`target\`, \`route\`, an
optional \`selector\` (element crop — the exception), an optional \`highlight\`
CSS selector (outlines changed elements), a \`label\`, and optional ordered
\`steps\` (click/fill/wait, plain CSS selectors). Use \`repoos update <id>
--shots '<JSON list>'\` to declare it (the CLI validates the JSON and writes the
fenced section) without touching the rest of the body — a full \`--body\` replace that drops
Problem / Desired UX / Acceptance criteria / Notes for AI is refused unless
\`--force\` is passed.

For tabbed views (e.g. Agents), prefer \`?tab=<id>\` routes
(\`/agents?tab=detected\`) over click steps to reach the right tab, and always
set \`highlight\` to the changed elements. A declared \`highlight\` or \`selector\`
that matches nothing at capture time records a visible warning — capture still
succeeds. Declared shots default to the whole visible window (\`fullPage:
false\`) with changed elements outlined via \`highlight\`; \`selector\` (element
crop) is the exception and \`fullPage\` stays off.

## Section body edits

To replace a single \`## Section\` without touching the rest of the body (the
Activity log is always preserved), use:

    repoos update <id> --section "Section Name" --section-body "new content"

A full \`--body\` replace that would drop Problem / Desired UX / Acceptance
criteria / Notes for AI is refused unless \`--force\` is passed; the error
message points at this section form.
`;

/** Marker makes the optional existing-repo addition safe to offer repeatedly. */
export const REPOOS_AGENTS_SECTION_MARKER = "<!-- repoos:managed-instructions -->";

/**
 * A deliberately small appendix for a repository that already owns its agent
 * instructions. RepoOS supplies its managed-runner instructions itself; this
 * only documents the project-level contract that a human or external agent
 * should see in the repo.
 */
export const REPOOS_AGENTS_SECTION = (workDir: string) => `${REPOOS_AGENTS_SECTION_MARKER}

## RepoOS

RepoOS keeps tasks as Markdown under \`${workDir}/\` and runs task work in dedicated
Git worktrees. The layout is set by \`repoos.toml\` (\`workDir\`/\`docsDir\`/\`cacheDir\`):
those paths are authoritative, so never move or rename them — if project docs
disagree with the config, ask the human instead of relocating directories.
Use the RepoOS UI or \`repoos\` commands to create and update
tasks; do not hand-edit task files. Read the relevant project docs before
starting work, run \`repoos check\` before handoff, and await human approval
through RepoOS's **Move to done**. The reviewer is advisory. A Git remote does
not require a PR; close-out validates and merges through RepoOS.
`;

/**
 * Return the exact addition that `repoos init` may offer for an existing
 * AGENTS.md, or null when this repository already documents RepoOS.
 */
export function repoOSAgentsSectionAddition(existing: string, workDir = "work"): string | null {
  if (
    existing.includes(REPOOS_AGENTS_SECTION_MARKER) ||
    /this repo uses \*\*repoos\*\*/i.test(existing) ||
    /this repository uses repoos/i.test(existing)
  ) {
    return null;
  }
  return (existing.endsWith("\n") ? "\n" : "\n\n") + REPOOS_AGENTS_SECTION(workDir);
}

function repoosToml(namespace: string, areas: string[] = [], previewStub = false): string {
  const ns = namespace
    ? `workDir = "${namespace}/work"\ndocsDir = "${namespace}/docs"\ncacheDir = "${namespace}/.repoos"\n`
    : "";
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

# [board.columns]                       # rename display labels (display only)
# draft  = "Ideas"                      # status IDs are fixed; this only changes what you see
# inbox  = "Backlog"
# ready  = "Selected for development"
# active = "In progress"
# review = "Code review"
# done   = "Shipped"
${areaRows(areas)}
${previewStub ? previewTargetRows(areas) : ""}
`;
}

/**
 * The `[areas]` block: the vocabulary collected at init time as real
 * `[[areas]]` rows, or the commented-out stub when skipped (#0583).
 */
function areaRows(areas: string[]): string {
  if (!areas.length) {
    return [
      "# [[areas]]                             # the task-area vocabulary (#0583)",
      '# name = "web"                           # offered in the area picker + the PM prompt',
      '# description = "The main web app"',
      "# Every [[preview.targets]] area is offered automatically, even when not",
      "# declared here. With none declared the area field is free text only.",
    ].join("\n");
  }
  return areas.map((a) => `[[areas]]\nname = "${a}"`).join("\n\n");
}

/**
 * The TOML appended to an EXISTING repo's config when it adopts an area
 * vocabulary (#0587): real `[[areas]]` rows, plus the commented
 * `[[preview.targets]]` skeleton when asked — the same "define areas and
 * previews together" shape the guided new-repo flow scaffolds into a fresh
 * repoos.toml. Empty `areas` yields "" (nothing to append).
 */
export function areaVocabularyTomlAddition(areas: string[], previewStub: boolean): string {
  if (areas.length === 0) return "";
  const chunks = [
    "# Task-area vocabulary (#0583). Offered in the area picker and the PM prompt.",
    areaRows(areas),
  ];
  if (previewStub) chunks.push(previewTargetRows(areas));
  return chunks.join("\n\n") + "\n";
}

/**
 * The commented `[[preview.targets]]` skeleton offered when an area vocabulary
 * was seeded at init (#0583) — the wiring for when the project has something
 * previewable, referencing the areas the picker now offers.
 */
function previewTargetRows(areas: string[]): string {
  const areaList = areas.length ? JSON.stringify(areas) : '["web"]';
  return [
    "# [preview]                               # read-only task previews",
    `# command = "bun run dev --port {port} --host {host}"`,
    `#                                         # default when no target matches`,
    "",
    `# [[preview.targets]]`,
    `# name = "Main app"`,
    `# areas = ${areaList}`,
    `# command = "bun run dev --port {port} --host {host}"`,
    `# readyTimeoutMs = 240000                 # raise for a command that also builds`,
  ].join("\n");
}

const ENV_EXAMPLE = `# Copy to .env and fill in what you need — .env is gitignored, this file is
# tracked so the repo documents which secrets a full setup expects.
# repoos serve auto-loads .env at startup; real shell/process-supervisor env
# vars still take precedence over it. No secret belongs in repoos.toml.
# Full reference: https://docs.repoos.org/environment-and-secrets

# --- Auth — only used when [auth].enabled = true ---
# REPOOS_RESEND_API_KEY=re_...
# REPOOS_GOOGLE_CLIENT_SECRET=...
# REPOOS_AUTH_SESSION_SECRET=...          # auto-generated on first boot if omitted
# REPOOS_AUTH_DEV_BACKDOOR_CODE=...       # local-only login helper; ignored in production

# --- Model providers / voice-to-text transcription ---
# REPOOS_OPENROUTER_API_KEY=...
# REPOOS_OPENCODE_GO_API_KEY=...
# REPOOS_DEEPINFRA_API_KEY=...
# REPOOS_WHISPER_KEY=...                  # or GROQ_API_KEY / OPENAI_API_KEY directly

# --- Infrastructure ---
# CLOUDFLARE_API_TOKEN=...                # Cloudflare Tunnel + Access
# HETZNER_API_TOKEN=...                   # remote validation runner
# REPOOS_REMOTE_SSH_KEY=/absolute/path/to/private_key

# --- Self-hosted notifications ---
# NTFY_BASE_URL=https://ntfy.sh          # or your self-hosted ntfy server

# --- Runtime / build overrides (leave commented unless needed) ---
# REPOOS_RUNTIME=auto                    # auto | bun | node
# REPOOS_BUN_PATH=/path/to/bun           # only if Bun is not on PATH
# REPOOS_STRICT_BUILD=1                  # same as strictBuild = true in repoos.toml
`;

const INITIAL_COMMIT_MSG = "chore: initialize RepoOS project";

/**
 * A namespace string: empty string or "/" means repo root; anything else is a
 * repo-relative subdirectory (e.g. "repoos", ".meta/repoos").
 */
type ScaffoldLayout = string;

/** Which starter task to seed beyond 0001 — a blank project or an existing repo. */
type ScaffoldKind = "new" | "existing";

/**
 * Which starter body to seed. `vision` is the new-project starter (flesh out
 * the product vision); `codebase` is the existing-repo one (read the code and
 * propose docs + a backlog). Selected by the repo's content for the
 * non-guided path, overridable via `--starter vision|codebase`.
 */
export type StarterChoice = "vision" | "codebase";

const STARTER_CHOICE: Record<
  StarterChoice,
  {
    slug: string;
    build: (id: string, description: string, workDir: string, docsDir: string) => string;
  }
> = {
  vision: { slug: "flesh-out-the-vision", build: NEW_PROJECT_STARTER_TASK },
  codebase: {
    slug: "read-the-codebase",
    build: (id, _desc, workDir, docsDir) => EXISTING_REPO_STARTER_TASK(id, _desc, workDir, docsDir),
  },
};

/**
 * Top-level (and scaffold) files that say nothing about whether a repo has
 * real source to read: RepoOS's own scaffold, plus the ordinary project
 * metadata/boilerplate any folder might carry. A repo holding only these is
 * still "empty" for the purpose of picking a starter task. All entries must be
 * lowercase — the lookup lowercases the basename.
 */
const NON_CONTENT_ROOTS = new Set([
  "repoos.toml",
  "agents.md",
  ".env.example",
  ".gitignore",
  ".gitattributes",
  ".git",
  ".ds_store",
  "readme",
  "readme.md",
  "readme.txt",
  "readme.markdown",
  "license",
  "license.md",
  "license.txt",
  "licence",
  "licence.md",
  "licence.txt",
  "copying",
  "copyright",
  "contributing.md",
  "code_of_conduct.md",
  "changelog.md",
  "changes.md",
]);

/**
 * Directories that are RepoOS's own scaffolding rather than project content.
 * `work/` and `docs/` are the root layout; `repoos/` is the namespaced layout
 * (which itself contains `work/`, `docs/` and `.repoos/`); `.repoos/` is the
 * runtime cache. None of these are source a starter task should read.
 */
const NON_CONTENT_DIRS = new Set(["work", "docs", ".repoos", "repoos"]);

/** Directories never worth descending into when looking for source files. */
const WALK_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  ".next",
  ".nuxt",
  ".cache",
  "dist",
  "build",
  "target",
  "vendor",
  "coverage",
]);

/**
 * True when a single repo-relative path represents real project content, as
 * opposed to RepoOS's scaffold or generic boilerplate. Pure, so the starter
 * decision is unit-testable without a filesystem.
 */
export function isMeaningfulRepoPath(relPath: string): boolean {
  const parts = relPath.split("/").filter(Boolean);
  if (parts.length === 0) return false;
  // Anything under a RepoOS scaffold dir (work/, docs/, .repoos/, repoos/) is
  // RepoOS's own metadata, not project source.
  if (NON_CONTENT_DIRS.has(parts[0].toLowerCase())) return false;
  const base = parts[parts.length - 1].toLowerCase();
  if (NON_CONTENT_ROOTS.has(base)) return false;
  return true;
}

/**
 * Decide which starter to seed from the repo's content: a repo with no
 * meaningful source files is effectively empty (a fresh `git init`, a README,
 * or only RepoOS's own scaffold), so it gets the product-vision starter; once
 * there is code to read, it gets the read-the-codebase starter.
 *
 * Uses only the path list, so callers can stop walking as soon as they find
 * something meaningful.
 */
export function repoHasMeaningfulContent(relPaths: string[]): boolean {
  return relPaths.some(isMeaningfulRepoPath);
}

/**
 * Walk a repo's tree and report whether it holds any meaningful content.
 * Prunes heavy/generated directories and stops at the first real file.
 */
export function detectMeaningfulRepoContent(root: string): boolean {
  const stack: string[] = [""];
  while (stack.length) {
    const rel = stack.pop() as string;
    const abs = rel ? join(root, rel) : root;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const lower = entry.name.toLowerCase();
        if (WALK_SKIP_DIRS.has(lower)) continue;
        if (NON_CONTENT_DIRS.has(lower) && !rel) continue;
        stack.push(childRel);
      } else if (isMeaningfulRepoPath(childRel)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Next free 4-digit task id for a scaffolded file, derived from the ids that
 * already exist under `workDir` (matching the numbering scheme used by
 * `createTask`). 0001 is written just before this runs, so a fresh scaffold
 * gets 0002; a repo that already has tasks gets the next id past the highest.
 */
function nextScaffoldId(root: string, workDir: string): string {
  let max = 0;
  try {
    for (const name of readdirSync(join(root, workDir))) {
      const m = name.match(/^(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  } catch {
    /* workDir doesn't exist yet — start from zero */
  }
  return String(max + 1).padStart(4, "0");
}

/**
 * Locate an already-seeded starter task by its slug suffix. Init is
 * idempotent, so once the starter exists a re-run must not write another one —
 * and crucially, must not compute a *new* id every time (which would append a
 * fresh 0002, 0003, … starter on each run).
 */
function findStarter(root: string, workDir: string, slug: string): string | null {
  try {
    const match = readdirSync(join(root, workDir)).find((n) => n.endsWith(`-${slug}.md`));
    return match ? join(workDir, match).split("\\").join("/") : null;
  } catch {
    return null;
  }
}

/**
 * True when the canary counter lives directly inside the root-level `.repoos/`
 * runtime directory (cacheDir of ".repoos", or a cacheDir nested under it).
 */
export function canaryUnderRootRuntimeDir(cacheDir: string): boolean {
  const base = cacheDir.replace(/\/+$/, "");
  return base === ".repoos" || base.startsWith(".repoos/");
}

export function scaffoldInto(
  root: string,
  description: string,
  layout: ScaffoldLayout = "",
  kind: ScaffoldKind = "new",
  /** Areas collected at init time (#0583) — real `[[areas]]` rows when given. */
  areas: string[] = [],
  /** When true, scaffold commented `[[preview.targets]]` stubs for those areas. */
  previewStub = false,
  /**
   * Force which starter body to seed. Omitted, a fresh install inside an
   * existing repo picks by content: an effectively empty repo gets the
   * product-vision starter, a repo with real source gets read-the-codebase.
   */
  starter?: StarterChoice,
) {
  const created: string[] = [];
  const skipped: string[] = [];
  let aborted = false;
  // Resolve the starter once, up front — the ENOTDIR abort path below returns
  // early, and callers want to know what would have been seeded anyway.
  let starterChoice: StarterChoice = starter ?? "vision";
  if (starter === undefined && kind === "existing") {
    starterChoice = detectMeaningfulRepoContent(root) ? "codebase" : "vision";
  }

  const ensureDir = (rel: string) => {
    if (aborted) return;
    const p = join(root, rel);
    if (!existsSync(p)) {
      try {
        mkdirSync(p, { recursive: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("ENOTDIR")) {
          console.error(
            c.red(
              `\n  Cannot create ${rel}/ — a file at that path is in the way. Remove it and try again.`,
            ),
          );
          process.exitCode = 1;
          // A file blocking one directory almost certainly blocks its siblings
          // too (same namespace prefix) — stop the whole scaffold rather than
          // letting later ensureFile() calls throw an uncaught ENOENT trying
          // to write into a directory that was never created.
          aborted = true;
          return;
        }
        throw err;
      }
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
  ensureFile("repoos.toml", repoosToml(layout, areas, previewStub));
  const config = loadConfig(root);

  ensureDir(config.workDir);
  ensureDir(config.docsDir);
  // A blocked workDir/docsDir means every ensureFile() below (which writes
  // INTO those directories) would throw an uncaught ENOENT — bail with
  // whatever succeeded so far instead of crashing mid-scaffold.
  if (aborted) return { created, skipped, starter: starterChoice };
  ensureFile("AGENTS.md", AGENTS_MD(config.workDir, config.docsDir));
  ensureFile(
    join(config.workDir, "0001-set-up-repoos.md"),
    SAMPLE_TASK(description, config.workDir),
  );
  // 0001 is `done` (scaffolding is all of it), so without this the board is
  // empty right after init. Seed one genuinely workable task — as `inbox`, so
  // nothing auto-starts it; it's a suggestion for the human, not work to run.
  // Its id follows whatever is already on the board.
  const starterSpec = STARTER_CHOICE[starterChoice];
  const existingStarter = findStarter(root, config.workDir, starterSpec.slug);
  if (existingStarter) {
    skipped.push(existingStarter);
  } else {
    const starterId = nextScaffoldId(root, config.workDir);
    ensureFile(
      join(config.workDir, `${starterId}-${starterSpec.slug}.md`),
      starterSpec.build(starterId, description, config.workDir, config.docsDir),
    );
  }
  ensureFile(".env.example", ENV_EXAMPLE);
  if (scaffoldCanaryFile(root, config.cacheDir)) {
    created.push(canaryRelPath(config.cacheDir));
  }

  // gitignore the derived cache, runtime state, and local secrets
  const giPath = join(root, ".gitignore");
  const ignoreLines = [
    { comment: "# RepoOS derived index cache", line: canaryGitignoreIgnore(config.cacheDir) },
    {
      comment: "# RepoOS canary flow-test counter (tracked)",
      line: canaryGitignoreNegation(config.cacheDir),
    },
    { comment: "# Local secrets — see .env.example", line: ".env" },
    // Runtime state (repoos.db, logs/, serve locks, integration jobs) is
    // hardcoded to a ROOT-level .repoos/ (src/core/db.ts, logger.ts,
    // serve-reaper.ts) — which differs from config.cacheDir in the namespaced
    // layout, so it shows up as untracked noise without its own rule. Skip it
    // when the canary itself lives under that root directory (cacheDir of
    // ".repoos" is already the rule above; a cacheDir inside ".repoos/" gets
    // left alone because a blanket ignore would swallow the canary's parent
    // directory and defeat the negation above).
    ...(canaryUnderRootRuntimeDir(config.cacheDir)
      ? []
      : [{ comment: "# RepoOS runtime state", line: ".repoos/*" }]),
    // No leading slash: a bare ".DS_Store" matches at any depth, unlike
    // anchored patterns such as ".repoos/*" above.
    { comment: "# macOS Finder metadata", line: ".DS_Store" },
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

  return { created, skipped, starter: starterChoice };
}

function reportInit(
  root: string,
  created: string[],
  skipped: string[],
  starter?: StarterChoice,
  /** Whether the choice was made automatically from repo content. */
  starterAuto = false,
): void {
  console.log(c.bold(c.cyan("\n  RepoOS initialized")) + c.dim(`  ·  ${root}\n`));
  for (const f of created) console.log("  " + c.green("created ") + f);
  for (const f of skipped) console.log("  " + c.dim("exists  " + f));
  if (starter) {
    const label = starter === "vision" ? "product-vision" : "read-the-codebase";
    const why = starterAuto
      ? starter === "vision"
        ? "the repo has no source files to read yet"
        : "the repo already has source files to read"
      : "chosen with --starter";
    console.log(
      "\n  " +
        c.dim(`Seeded the ${label} starter as an `) +
        c.yellow("inbox") +
        c.dim(` task (${why}).`),
    );
    console.log(
      c.dim("  It is a suggestion, not work to auto-run — promote it to ") +
        c.yellow("ready") +
        c.dim(" when you want it picked up."),
    );
    console.log(
      c.dim("  Switch with ") + c.cyan("repoos init --starter vision|codebase") + c.dim("."),
    );
  }
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
  console.log(c.yellow("\n  RepoOS is already set up in ") + c.cyan(dir) + c.yellow("."));
  if (hint) console.log(c.dim(`  ${hint}`));
  const marker = repoOSMarker(dir);
  if (marker) {
    console.log(c.dim("  Detected because ") + c.cyan(marker) + c.dim(" exists."));
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

/**
 * Like `ask`, but accepts multi-line input. On a TTY, a pasted block arrives as
 * a burst of lines, so after each line we wait briefly for more; a typed line
 * ending in `\\` also continues onto the next line. Non-TTY input (pipes, CI)
 * stays strictly one line so later prompts' answers aren't swallowed.
 */
async function askMultiline(question: string): Promise<string> {
  if (!input.isTTY) return ask(question);
  const rl = createInterface({ input, output });
  return new Promise((resolvePromise) => {
    const lines: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      rl.close();
      resolvePromise(lines.join("\n").trim());
    };
    rl.on("close", finish);
    rl.on("line", (line) => {
      if (timer) clearTimeout(timer);
      if (line.endsWith("\\")) {
        lines.push(line.slice(0, -1));
        rl.setPrompt("  … ");
        rl.prompt();
        return;
      }
      lines.push(line);
      timer = setTimeout(finish, 75);
    });
    rl.setPrompt(question);
    rl.prompt();
  });
}

async function confirm(question: string, dflt: boolean): Promise<boolean> {
  const hint = dflt ? " [Y/n]" : " [y/N]";
  const answer = (await ask(question + c.dim(hint) + " ")).toLowerCase();
  if (answer === "") return dflt;
  return answer === "y" || answer === "yes";
}

/**
 * Existing projects own AGENTS.md, so RepoOS never edits it silently. In an
 * interactive terminal, show the exact small appendix and add it only after an
 * explicit opt-in. Non-interactive init stays fully non-blocking.
 */
async function offerRepoOSAgentsSection(root: string, workDir = "work"): Promise<void> {
  if (!input.isTTY || !output.isTTY) return;

  const path = join(root, "AGENTS.md");
  if (!existsSync(path)) return;

  let original: string;
  try {
    original = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const addition = repoOSAgentsSectionAddition(original, workDir);
  if (!addition) return;

  console.log(c.dim("\n  Existing AGENTS.md detected — it will not be replaced."));
  console.log(c.dim("  Proposed RepoOS addition:"));
  console.log(
    c.dim(
      addition
        .trimEnd()
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    ),
  );

  if (!(await confirm("\n  Add this section to AGENTS.md?", false))) return;

  // Do not append to a file a person or another process changed while the
  // preview was on screen. Re-running init produces a fresh preview.
  try {
    if (readFileSync(path, "utf8") !== original) {
      console.log(
        c.yellow(
          "  AGENTS.md changed while this prompt was open; nothing was added. Run repoos init again to review the latest file.",
        ),
      );
      return;
    }
    writeFileSync(path, original + addition);
    console.log(c.green("  added") + c.dim(" RepoOS guidance to AGENTS.md"));
  } catch {
    console.log(
      c.yellow("  Could not update AGENTS.md; existing instructions were left unchanged."),
    );
  }
}

/**
 * Offer a starter check plan (#0447). Init inspects the repo's durable signals
 * and, when nothing is configured and a stack is recognisable, writes the
 * inferred plan to an uncommitted proposal file for review. In a terminal it
 * also offers to move it into `repoos.toml` — never automatically, and never
 * over an edit made while the prompt was open. Non-interactive init leaves the
 * proposal file in place and exits without touching the effective config.
 */
async function offerCheckPlanProposal(root: string): Promise<void> {
  const proposal = proposeCheckPlan(root);
  if (!proposal) return;

  console.log(c.dim("\n  No check plan is configured for this repo."));
  console.log(c.dim(`  Proposed starter plan (${proposal.stacks.join(" + ")}):`));
  console.log(
    c.dim(
      proposal.toml
        .trimEnd()
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    ),
  );

  const proposalPath = join(root, CHECK_PLAN_PROPOSAL_FILE);
  try {
    if (existsSync(proposalPath)) {
      console.log(c.dim(`  · kept the existing proposal at ${CHECK_PLAN_PROPOSAL_FILE}`));
    } else {
      writeFileSync(proposalPath, proposal.toml);
      console.log("  " + c.green("proposed ") + c.dim(CHECK_PLAN_PROPOSAL_FILE));
    }
  } catch {
    console.log(
      c.yellow(`  Could not write ${CHECK_PLAN_PROPOSAL_FILE}; the plan is printed above.`),
    );
  }

  if (!input.isTTY || !output.isTTY) {
    console.log(
      c.dim(
        `  Review and edit it, then move its [[check.steps]] into repoos.toml before repoos check will pass.`,
      ),
    );
    return;
  }

  if (!(await confirm("\n  Add this plan to repoos.toml now?", false))) {
    console.log(
      c.dim(`  Left as a proposal — edit ${CHECK_PLAN_PROPOSAL_FILE} and merge it when ready.`),
    );
    return;
  }

  const tomlPath = join(root, "repoos.toml");
  const original = existsSync(tomlPath) ? readFileSync(tomlPath, "utf8") : null;
  if (original === null) {
    console.log(c.yellow("  repoos.toml is missing; nothing was added."));
    return;
  }
  // Do not clobber a config changed while the preview was on screen.
  try {
    if (readFileSync(tomlPath, "utf8") !== original) {
      console.log(
        c.yellow(
          "  repoos.toml changed while this prompt was open; nothing was added. Run repoos init again.",
        ),
      );
      return;
    }
    // Reformat the plan without the proposal's header comments so the committed
    // config reads as configuration, not as a note-to-self.
    const addition =
      (original.endsWith("\n") ? "\n" : "\n\n") + formatPlanToml(proposal.plan) + "\n";
    writeFileSync(tomlPath, original + addition);
    rmSync(proposalPath, { force: true });
    console.log("  " + c.green("added") + c.dim(" the check plan to repoos.toml"));
  } catch {
    console.log(c.yellow("  Could not update repoos.toml; the proposal file was left in place."));
  }
}

/**
 * Offer an EXISTING repo the same skippable "define areas (and previews)
 * together" prompt the guided new-repo flow runs (#0587). Without it, an
 * already-set-up repo only ever gets the commented `[[areas]]` stub and has to
 * discover the vocabulary in Settings.
 *
 * Idempotent and never blocking: returns when `[areas]` is already declared or
 * repoos.toml is absent; non-interactively it prints a one-line hint instead
 * of prompting. A config change during the prompt abandons the write.
 */
async function offerAreaVocabulary(root: string): Promise<void> {
  const tomlPath = join(root, "repoos.toml");
  if (!existsSync(tomlPath)) return;
  if ((loadConfig(root).areas ?? []).length > 0) return; // already declared

  if (!input.isTTY || !output.isTTY) {
    console.log(
      c.dim(
        "\n  No task-area vocabulary is declared. Add [[areas]] in repoos.toml (or Settings → " +
          "General → Areas) to offer areas in the picker and the PM prompt.",
      ),
    );
    return;
  }

  const original = readFileSync(tomlPath, "utf8");
  const areasInput = await ask(
    "  Task areas to seed the area picker" +
      c.dim(" — comma-separated (e.g. web, cli, api; Enter to skip)") +
      ": ",
  );
  const areas = areasInput
    ? areasInput
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
    : [];
  if (areas.length === 0) return;

  console.log(c.dim("  Preview targets route a task preview by its area — the picker and"));
  console.log(
    c.dim(
      "  the PM prompt offer target areas automatically; see user-docs/configuration.md's Previews section.",
    ),
  );
  const previewStub = await confirm(
    "  Scaffold commented preview-target stubs for these areas?",
    false,
  );

  // Do not clobber a config changed while the prompt was open.
  if (readFileSync(tomlPath, "utf8") !== original) {
    console.log(
      c.yellow(
        "  repoos.toml changed while this prompt was open; nothing was added. Run repoos init again.",
      ),
    );
    return;
  }
  try {
    const addition =
      (original.endsWith("\n") ? "\n" : "\n\n") + areaVocabularyTomlAddition(areas, previewStub);
    writeFileSync(tomlPath, original + addition);
    console.log(
      "  " +
        c.green("added") +
        c.dim(
          ` ${areas.length} area${areas.length === 1 ? "" : "s"} to repoos.toml` +
            (previewStub ? " (with preview-target stubs)" : ""),
        ),
    );
  } catch {
    console.log(c.yellow("  Could not update repoos.toml; your areas were not saved."));
  }
}

/**
 * Validate a user-supplied namespace string. Returns null when the input means
 * "repo root" (the special `/` or empty), a normalized repo-relative path when
 * valid, or an error message prefixed with `!` when invalid. The caller
 * distinguishes valid from error by checking `result.startsWith("!")`.
 */
export function validateNamespace(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (trimmed === "/" || trimmed === "") return ""; // root is always valid
  // reject absolute paths (other than the special /)
  if (trimmed.startsWith("/"))
    return "!Absolute paths are not allowed. Use / for the repo root layout.";
  // reject parent traversal
  if (trimmed.includes("..")) return "!Parent traversal (..) is not allowed.";
  // reject relative-path prefix that adds no semantic value
  if (trimmed.startsWith("./"))
    return "!Leading ./ is not needed — type the path directly (e.g. repoos).";
  // reject bare dot (cwd) — meaningless as a namespace
  if (trimmed === ".")
    return "!. is not a valid namespace — use / for root or type a directory name.";
  // reject unsafe characters
  if (!/^[A-Za-z0-9._\-/]+$/.test(trimmed)) return "!Only letters, digits, . _ - / are allowed.";
  // reject a namespace that collides with a root marker file — mkdir would
  // hit ENOTDIR trying to create a directory where repoos.toml/AGENTS.md
  // already exists as a file, both of which must stay at the repo root
  const firstSegment = trimmed.split("/")[0];
  if (firstSegment === "repoos.toml" || firstSegment === "AGENTS.md")
    return `!${firstSegment} must stay at the repo root — choose a different directory name.`;
  return trimmed;
}

/**
 * Check whether a namespace path collides with existing filesystem entries.
 * Returns null when the path is safe to scaffold into, or an error message.
 */
function checkNamespaceCollision(root: string, namespace: string): string | null {
  if (!namespace) return null; // root layout — no subdirectory to check
  const nsPath = join(root, namespace);
  if (!existsSync(nsPath)) return null; // nothing there — safe
  let stat;
  try {
    stat = statSync(nsPath);
  } catch {
    return null; // race or permission issue — let scaffoldInto handle it
  }
  if (!stat.isDirectory()) {
    return `A file already exists at ${namespace}/ — cannot create a directory there. Remove it or choose a different location.`;
  }
  // Directory exists — check if it already looks like a RepoOS namespace
  const entries = readdirSync(nsPath);
  const isRepoOSish = entries.some((e) => e === "work" || e === "docs" || e === ".repoos");
  if (isRepoOSish) {
    // Existing namespace — idempotent, safe to proceed
    return null;
  }
  // Directory exists with unrelated content
  return `The directory ${namespace}/ already exists and does not look like a RepoOS layout. Remove it or choose a different location to avoid mixing files.`;
}

/** Ask where the scaffold should live: repoos/ subfolder (default) or repo root (/). */
async function askLayout(): Promise<ScaffoldLayout> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = (
      await ask(
        "  Where should RepoOS files live?" +
          c.dim("  Enter for repoos/ (default), or / for the repo root layout") +
          ": ",
      )
    ).trim();
    // empty → namespaced default
    if (answer === "") return "repoos";
    // "/" → root layout
    if (answer === "/") return "";
    const result = validateNamespace(answer);
    if (result.startsWith("!")) {
      console.log(c.yellow(`  ${result.slice(1)}`));
      continue;
    }
    return result; // normalized path, or "" for root
  }
  console.log(c.yellow("  Too many invalid attempts — using the default (repoos/)."));
  return "repoos";
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

/**
 * Ask for a serve port, defaulting to this repo's stable derived port (the same
 * one `repoos serve` would pick). `explicit` is true only when the user typed a
 * concrete port — the caller then pins it in repoos.toml so future `serve`s
 * reuse it.
 */
async function askPort(derived: number): Promise<{ port: number; explicit: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await ask(
      "  Preferred port" +
        c.dim(` [${derived}] — Enter for this repo's default, 0 = let the OS pick a free port`) +
        ": ",
    );
    if (raw === "") return { port: derived, explicit: false };
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 65535) {
      return { port: n, explicit: n > 0 };
    }
    console.log(c.yellow(`  "${raw}" isn't a valid port.`));
  }
  return { port: derived, explicit: false };
}

/** Pin `servePort` in repoos.toml so future `repoos serve` runs reuse it. */
function persistServePort(root: string, port: number): void {
  const tomlPath = join(root, "repoos.toml");
  try {
    const text = readFileSync(tomlPath, "utf8");
    if (/^\s*servePort\s*=/m.test(text)) return;
    const line = `servePort = ${port}\n`;
    const anchor = /^defaultAssignee\s*=.*$/m;
    const next = anchor.test(text)
      ? text.replace(anchor, (m) => `${m}\nservePort = ${port}`)
      : text + (text.endsWith("\n") ? "" : "\n") + line;
    writeFileSync(tomlPath, next);
    console.log("  " + c.green("saved") + c.dim(` servePort = ${port} to repoos.toml`));
  } catch {
    /* fail-soft — the server still starts on the chosen port this run */
  }
}

/**
 * Answers to the guided new-project flow, whether they came from interactive
 * prompts or from CLI flags. Keeping one record means the interactive and
 * non-interactive paths run the exact same scaffolding code — only where the
 * answers come from differs.
 */
interface NewProjectOptions {
  /** Parsed from `--new`/`--yes`; required to run non-interactively. */
  nonInteractive: boolean;
  /** Positional name or `--dir`; empty = the current directory. */
  projectDir: string;
  description: string;
  areas: string[];
  /** `--layout` (`repoos` default, `/` for root, or a namespace path). */
  layout: ScaffoldLayout;
  /** `--preview-stub` / `--no-preview-stub`; only meaningful with areas. */
  previewStub: boolean;
  commit: boolean;
  launch: boolean;
  force: boolean;
  json: boolean;
}

/** Default `--new` answers when a flag isn't given. */
const NEW_PROJECT_DEFAULTS = {
  description: "",
  areas: [] as string[],
  layout: "repoos" as ScaffoldLayout,
  previewStub: false,
  commit: true,
  /** Never launch the server non-interactively unless `--launch` says so. */
  launch: false,
  force: false,
  json: false,
} as const;

/**
 * Parse the `repoos init` argument vector. Returns the shared options record
 * plus an error string (prefixed `!`) when a flag is malformed. `--dir` is an
 * alias for the positional name; both name a subdirectory under the cwd.
 */
export function parseInitFlags(
  args: string[],
  tty: boolean,
): { options: NewProjectOptions; error: string | null } {
  const options: NewProjectOptions = {
    nonInteractive: false,
    projectDir: "",
    ...NEW_PROJECT_DEFAULTS,
    // Interactive sessions default to launching the console; a script must ask.
    launch: tty,
  };
  let positional = "";
  let descriptionFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = (): string | undefined => args[++i];
    switch (arg) {
      case "--new":
      case "--yes":
      case "-y":
        options.nonInteractive = true;
        break;
      case "--description":
      case "--desc": {
        const value = next();
        if (value === undefined) return { options, error: "!`--description` needs a value." };
        options.description = value;
        break;
      }
      case "--description-file": {
        const value = next();
        if (value === undefined) return { options, error: "!`--description-file` needs a value." };
        descriptionFile = value;
        break;
      }
      case "--areas": {
        const value = next();
        if (value === undefined) return { options, error: "!`--areas` needs a value." };
        options.areas = value
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean);
        break;
      }
      case "--dir": {
        const value = next();
        if (value === undefined) return { options, error: "!`--dir` needs a value." };
        options.projectDir = value;
        break;
      }
      case "--layout": {
        const value = next();
        if (value === undefined) return { options, error: "!`--layout` needs a value." };
        const validated = validateNamespace(value);
        if (validated.startsWith("!")) return { options, error: validated };
        options.layout = validated;
        break;
      }
      case "--commit":
        options.commit = true;
        break;
      case "--no-commit":
        options.commit = false;
        break;
      case "--launch":
        options.launch = true;
        break;
      case "--no-launch":
        options.launch = false;
        break;
      case "--preview-stub":
        options.previewStub = true;
        break;
      case "--no-preview-stub":
        options.previewStub = false;
        break;
      case "--force":
        options.force = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        if (arg.startsWith("-")) return { options, error: `!Unknown flag \`${arg}\`.` };
        positional = arg;
        break;
    }
  }

  if (descriptionFile !== undefined) {
    try {
      options.description =
        descriptionFile === "-" ? readFileSync(0, "utf8") : readFileSync(descriptionFile, "utf8");
      options.description = options.description.trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { options, error: `!Cannot read --description-file ${descriptionFile}: ${msg}` };
    }
  }

  if (positional && options.projectDir) {
    return { options, error: "!Give either a project name or `--dir`, not both." };
  }
  options.projectDir = (options.projectDir || positional).trim();
  return { options, error: null };
}

/** True when `dir` exists and has at least one entry. */
function dirIsNonEmpty(dir: string): boolean {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/** Human-readable id(s) of seeded ready tasks under `root`/`workDir`. */
function seededTaskIds(root: string, workDir: string): string[] {
  const ids: string[] = [];
  try {
    for (const name of readdirSync(join(root, workDir))) {
      const m = name.match(/^(\d+)-/);
      if (m && !name.includes("-set-up-repoos")) ids.push(m[1]);
    }
  } catch {
    /* workDir missing */
  }
  return ids;
}

/** The non-TTY refusal: say exactly which command succeeds, and warn off the trap. */
function printNonTtyRefusal(): void {
  console.error(
    c.red("\n  This directory isn't a git repo, so repoos init needs interactive prompts."),
  );
  console.error(
    c.dim(
      "  Not a TTY. To create a new project non-interactively run:\n\n" +
        '    repoos init <name> --new --description "..." --areas web,api --no-launch\n',
    ),
  );
  console.error(
    c.yellow("  Do NOT run `git init` first") +
      c.dim(
        ": inside a git repo, `repoos init` seeds the existing-codebase starter\n" +
          '  ("Read this codebase…") instead of the new-project one — the wrong route for a\n' +
          "  brand-new project.",
      ),
  );
  console.error(
    c.dim(
      '  See user-docs/getting-started.md → "Starting a new project as an agent" for the full recipe.',
    ),
  );
}

async function guidedNewRepo(opts: NewProjectOptions): Promise<void> {
  const interactive = !opts.nonInteractive && process.stdin.isTTY && process.stdout.isTTY;

  if (!interactive && !opts.nonInteractive) {
    printNonTtyRefusal();
    process.exitCode = 1;
    return;
  }

  const cwd = process.cwd();
  let projectName = opts.projectDir;
  if (projectName && !/^[A-Za-z0-9._\-/]+$/.test(projectName)) {
    console.error(
      c.red(`  Invalid project name "${projectName}" — use letters, digits, . _ - and /`),
    );
    process.exitCode = 1;
    return;
  }

  if (interactive) {
    console.log(c.dim("\n  Not inside a git repository."));
    console.log(c.cyan("  repoos init will create a new RepoOS project here."));
    console.log(
      c.dim(
        "  Default: the CURRENT directory. Enter a project name to use a subdirectory instead.",
      ),
    );

    if (!projectName) {
      projectName = await ask("  Project name" + c.dim(" (Enter = current directory)") + ": ");
    }
  } else {
    console.log(c.dim("\n  Not inside a git repository — creating a new RepoOS project."));
  }

  let target = cwd;
  if (projectName) {
    target = join(cwd, projectName);
    if (repoOSMarker(target)) {
      warnAlreadySetUp(target, "Nothing to create — that project already exists.");
      process.exitCode = 1;
      return;
    }
    if (!interactive) {
      // Non-interactive: never overwrite a non-empty directory silently.
      if (dirIsNonEmpty(target) && !opts.force) {
        console.error(
          c.red(`\n  ${projectName}/ already exists and is not empty.`) +
            c.dim("  Pass `--force` to scaffold into it anyway."),
        );
        process.exitCode = 1;
        return;
      }
      console.log(c.dim(`  →  Creating the project in ./${projectName}`));
    } else {
      console.log();
      const ok = await confirm(
        "  Create the project in a new subdirectory " +
          c.cyan(`./${projectName}`) +
          c.dim(`  →  ${target}`),
        true,
      );
      if (!ok) {
        console.log(c.yellow("\n  Cancelled — nothing was created."));
        return;
      }
    }
  } else {
    console.log(c.dim(`  →  Using the current directory: ${cwd}`));
  }

  let layout: ScaffoldLayout;
  if (interactive) {
    layout = await askLayout();
  } else {
    layout = opts.layout;
    // Never scaffold into a non-empty target that isn't already a RepoOS layout.
    if (!repoOSMarker(target) && dirIsNonEmpty(target) && !opts.force) {
      console.error(
        c.red(`\n  ${target} is not empty and is not a RepoOS project.`) +
          c.dim("  Pass `--force` to scaffold into it anyway."),
      );
      process.exitCode = 1;
      return;
    }
  }

  // Pre-scaffold collision check for the chosen namespace
  const collision = checkNamespaceCollision(target, layout);
  if (collision) {
    console.log(c.red(`\n  ${collision}`));
    process.exitCode = 1;
    return;
  }

  let proceed = true;
  if (interactive) {
    console.log();
    const scaffoldFiles = layout
      ? `${layout}/work/, ${layout}/docs/, AGENTS.md, repoos.toml, .gitignore`
      : "work/, docs/, AGENTS.md, repoos.toml, .gitignore";
    proceed = await confirm(
      "  Ready to " +
        c.cyan("git init") +
        c.dim(" and scaffold " + scaffoldFiles) +
        " in " +
        c.cyan(target),
      true,
    );
  }
  if (!proceed) {
    console.log(c.yellow("\n  Cancelled — nothing was created."));
    return;
  }

  let description = opts.description;
  if (interactive) {
    description = await askMultiline(
      "  Project description" +
        c.dim(
          " — gives the AI context to suggest next steps; paste multi-line markdown or end a line with \\ to continue (optional, Enter to skip)",
        ) +
        ": ",
    );
  }

  // The task-area vocabulary (#0583) — reinforced with preview targets, since
  // a `[[preview.targets]]` area is offered in the picker automatically even
  // when not declared here. Skipped means free text only; never blocking.
  let areas = opts.areas;
  if (interactive) {
    const areasInput = await ask(
      "  Task areas to seed the area picker" +
        c.dim(" — comma-separated (e.g. web, cli, api; Enter to skip)") +
        ": ",
    );
    areas = areasInput
      ? areasInput
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];
  }
  if (areas.length) {
    console.log(c.dim("  Preview targets route a task preview by its area — the picker and"));
    console.log(
      c.dim(
        "  the PM prompt offer target areas automatically; see user-docs/configuration.md's Previews section.",
      ),
    );
  }

  // Preview targets reinforce areas ("define them together"): when an area
  // vocabulary was given, offer to scaffold the commented `[[preview.targets]]`
  // skeleton those areas feed, so the wiring sits where preview setup happens
  // later. A brand-new project has nothing runnable yet — never a live
  // preview command, just the commented shape to fill in.
  let previewStub = opts.previewStub;
  if (areas.length && interactive) {
    previewStub = await confirm(
      "  Scaffold commented preview-target stubs for these areas?",
      false,
    );
  }

  if (!existsSync(target)) mkdirSync(target, { recursive: true });

  // git health warnings — fail-soft, scaffold regardless
  const gitOk = gitAvailable(target);
  if (!gitOk) {
    console.log(
      c.yellow("\n  Warning: git doesn't appear to be installed — scaffolding without git."),
    );
  } else if (!gitConfig(target, "user.name") && !gitConfig(target, "user.email")) {
    console.log(c.yellow("\n  Warning: no git identity is configured."));
    console.log(c.dim("    git may auto-detect it, or the initial commit may fail. Set it with:"));
    console.log(
      c.dim(
        '    git config --global user.name "You" && git config --global user.email you@example.com',
      ),
    );
  }

  const { created, skipped, starter } = scaffoldInto(
    target,
    description,
    layout,
    "new",
    areas,
    previewStub,
  );
  reportInit(target, created, skipped, starter, true);
  await offerCheckPlanProposal(target);

  if (!gitOk) {
    console.log(c.dim("  To add git later: git init && git add -A && git commit"));
  } else if (gitInit(target)) {
    console.log("  " + c.green("git init") + c.dim("  ok"));
  } else {
    console.log(c.yellow("  Warning: git init failed — files left uncommitted."));
  }

  const doCommit = interactive
    ? await confirm("\n  Make an initial commit of the scaffold?", true)
    : opts.commit;
  if (gitOk && doCommit) {
    const hash = gitCommitAll(target, INITIAL_COMMIT_MSG);
    if (hash) {
      console.log("  " + c.green("committed ") + c.dim(hash));
    } else {
      console.log(
        c.yellow(
          "  Warning: initial commit failed (unconfigured identity or a hook) — files left uncommitted.",
        ),
      );
    }
  }

  const doLaunch = interactive
    ? await confirm("\n  Launch the RepoOS web console now to start building?", true)
    : opts.launch;
  if (doLaunch) {
    const { port: preferred, explicit } = await askPort(deriveServePort(target));
    let port = preferred;
    if (preferred > 0) {
      const free = await nextFreePort(preferred);
      if (free !== preferred) {
        console.log(c.yellow(`  Port ${preferred} is in use — using ${free} instead.`));
        port = free;
      }
    }
    // Only pin an explicitly chosen port. The derived default is already stable
    // per checkout, so writing it would just add noise to repoos.toml.
    if (explicit) persistServePort(target, preferred);
    const dirHint = target === cwd ? null : `cd ${target}`;
    if (target !== cwd) process.chdir(target);
    // A child process can change ITS OWN cwd (above) but never the parent
    // shell's — the user's terminal is still sitting in `cwd`. Print the
    // exact commands to run rather than just noting the mismatch, so there's
    // nothing to figure out once this server is stopped.
    if (dirHint) {
      console.log(
        c.dim("\n  Your shell is still in ") +
          c.cyan(cwd) +
          c.dim(". When you come back to this project, run:\n\n") +
          "    " +
          c.cyan(dirHint) +
          "\n    " +
          c.cyan("repoos serve") +
          "\n",
      );
    }
    console.log(c.dim("  Starting the RepoOS web console…"));
    // Opening the browser is deferred to onReady — the server isn't actually
    // listening until cmdServe's startServer() resolves, and opening a tab
    // any earlier races that startup, showing connection errors until a
    // manual reload.
    await cmdServe(["--port", String(port)], {
      onReady: (url) => openBrowser(url),
      onShutdown: dirHint
        ? () =>
            console.log(
              c.dim("  Start it again with:\n\n    ") +
                c.cyan(dirHint) +
                "\n    " +
                c.cyan("repoos serve") +
                "\n",
            )
        : undefined,
    });
    return;
  }

  if (opts.json && !interactive) {
    const ids = seededTaskIds(target, loadConfig(target).workDir);
    console.log(
      JSON.stringify(
        {
          root: target,
          tasks: ids.map((id) => ({ id })),
          created,
        },
        null,
        2,
      ),
    );
    return;
  }

  const starterIds = seededTaskIds(target, loadConfig(target).workDir);
  const dirHint = target === cwd ? "" : `cd ${target}  ·  `;
  if (interactive) {
    // Interactive flow keeps its original closing hint unchanged.
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
    return;
  }

  // Non-interactive: end with the created path, the server hint, and the
  // seeded starter id — enough for an agent to continue without re-deriving them.
  if (starterIds.length) {
    console.log(
      "\n  Seeded starter task " +
        c.cyan(starterIds.map((id) => `#${id}`).join(", ")) +
        c.dim("  ·  ") +
        c.cyan(dirHint + "repoos list"),
    );
  }
  console.log(
    "\n  Project: " +
      c.cyan(target) +
      "\n  Next: " +
      c.cyan("repoos serve") +
      c.dim("  (or ") +
      c.cyan(dirHint + "repoos list") +
      c.dim(")") +
      "\n",
  );
}

/**
 * Parse `--starter vision|codebase` (also `--starter=vision`) out of `args`,
 * returning the choice (or `undefined` when absent) and the remaining args with
 * the flag removed, so downstream parsing never mistakes it for a project name.
 * An unknown value is rejected loudly rather than silently falling back.
 */
export function parseStarterOption(args: string[]): { starter?: StarterChoice; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--starter") {
      value = args[++i];
    } else if (a.startsWith("--starter=")) {
      value = a.slice("--starter=".length);
    } else {
      rest.push(a);
    }
  }
  if (value === undefined) return { rest };
  if (value === "vision" || value === "codebase") return { starter: value, rest };
  console.error(
    c.red(`\n  Invalid --starter "${value}" — use `) +
      c.cyan("vision") +
      c.red(" or ") +
      c.cyan("codebase") +
      c.red("."),
  );
  process.exitCode = 1;
  return { rest };
}

export async function cmdInit(args: string[]): Promise<void> {
  const { starter: starterOpt, rest } = parseStarterOption(args);
  if (process.exitCode) return;
  const cwd = process.cwd();
  const tty = Boolean(input.isTTY && output.isTTY);

  const { options, error } = parseInitFlags(rest, tty);
  if (error) {
    console.error(c.red(`\n  ${error.slice(1)}`));
    process.exitCode = 1;
    return;
  }

  if (isGitRepo(cwd)) {
    if (options.nonInteractive) {
      // Inside a git repo, `--new` is the wrong tool: that route seeds the
      // existing-codebase starter, not a new-project one.
      console.error(
        c.yellow(
          "\n  --new is for a brand-new project outside a git repo. Inside a git repo, " +
            "`repoos init` seeds the existing-codebase starter.",
        ),
      );
      process.exitCode = 1;
      return;
    }
    // Existing-repo scaffolding remains idempotent. The only optional edit is
    // a separately previewed, explicitly accepted AGENTS.md appendix.
    const root = findRepoRoot(cwd);
    const tomlPath = join(root, "repoos.toml");
    const hasExisting = existsSync(tomlPath);

    // Determine the initial namespace from an existing config, or a sensible
    // default for fresh installs.  Interactive prompts may override this.
    let namespace: ScaffoldLayout = "";
    if (hasExisting) {
      const config = loadConfig(root);
      if (config.workDir !== "work") {
        const parts = config.workDir.split("/");
        if (parts.length >= 2 && parts[parts.length - 1] === "work") {
          namespace = parts.slice(0, -1).join("/");
        }
      }
    } else {
      namespace = "repoos";
    }

    // Interactive prompt: let the user choose a layout and confirm.
    if (input.isTTY && output.isTTY) {
      if (hasExisting) {
        // Never re-layout an existing installation — the layout is already
        // fixed by its config. Only the AGENTS.md appendix below is optional.
        console.log(
          c.dim("\n  RepoOS is already set up in ") +
            c.cyan(root) +
            c.dim(` (using the ${namespace ? `${namespace}/` : "repo root"} layout).`),
        );
      } else {
        console.log(c.dim("\n  RepoOS is not yet set up in ") + c.cyan(root) + c.dim("."));
        namespace = await askLayout();
      }

      // Show the resolved layout preview. For an existing install, read the
      // actual configured paths rather than re-deriving them from `namespace`
      // — a non-standard workDir (e.g. "tasks", not ending in "/work") can't
      // round-trip through the namespace derivation above, and previewing
      // "work/"/"docs/" in that case would lie about what scaffoldInto (which
      // does use the real config) actually does.
      const config = loadConfig(root);
      const workDir = hasExisting ? config.workDir : namespace ? `${namespace}/work` : "work";
      const docsDir = hasExisting ? config.docsDir : namespace ? `${namespace}/docs` : "docs";
      const cacheDir = hasExisting
        ? config.cacheDir
        : namespace
          ? `${namespace}/.repoos`
          : ".repoos";
      console.log(c.dim("\n  Resolved layout:"));
      console.log(c.dim("    repoos.toml   (root)"));
      console.log(c.dim("    AGENTS.md     (root)"));
      console.log(`    ${workDir}/`);
      console.log(`    ${docsDir}/`);
      console.log(`    ${cacheDir}/   (gitignored)`);
      console.log();

      if (!(await confirm(`  Scaffold these files in ${c.cyan(root)}?`, true))) {
        console.log(c.yellow("\n  Cancelled — nothing was created."));
        return;
      }
    }
    // Non-interactive: `namespace` is already the deterministic default.

    // Pre-scaffold collision check
    const collision = checkNamespaceCollision(root, namespace);
    if (collision) {
      console.log(c.red(`\n  ${collision}`));
      process.exitCode = 1;
      return;
    }

    const result = scaffoldInto(root, "", namespace, "existing", [], false, starterOpt);
    const { created, skipped } = result;
    const config = loadConfig(root);
    await offerRepoOSAgentsSection(root, config.workDir);
    await offerAreaVocabulary(root);
    await offerCheckPlanProposal(root);
    if (created.length === 0) {
      warnAlreadySetUp(root, "Nothing to initialize here.");
      for (const f of skipped) console.log("  " + c.dim("exists  " + f));
      return;
    }
    reportInit(root, created, skipped, result.starter, starterOpt === undefined);
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
    await guidedNewRepo(options);
  } catch {
    console.log(c.yellow("\n  Cancelled."));
  }
}
