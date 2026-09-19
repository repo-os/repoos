/**
 * Read and mutate commands. Every command that touches the board — reads and
 * writes alike — goes through boardRepoOS(), which resolves to the MAIN
 * checkout even when run from inside a task's linked worktree. Task files
 * are the single source of truth, and there is only one copy of that source
 * of truth: the main checkout's. Never call createRepoOS() directly from a
 * board command (see boardRepoOS()'s own comment for why).
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRepoOS } from "../core/repoos.js";
import { boardRoot, loadConfig, resolveColumnLabels } from "../core/config.js";
import { STATUSES, type Status, type Task } from "../core/types.js";
import { c, statusColor, priorityColor } from "../cli/colors.js";
import { patchTaskFile, type TaskPatch } from "../server/write.js";
import { isAncestor } from "../core/git.js";

/**
 * RepoOS facade rooted at the LIVE BOARD's checkout (the main checkout), even
 * when the CLI runs from inside a task worktree. Board-state reads must never
 * silently resolve to the worktree's own copy of the task files — that
 * false-positive stranded #0068 in `active`. A note is printed (to stderr, so
 * `--json` stdout stays clean) whenever resolution jumped to the main checkout,
 * so the behavior is never silent.
 */
function boardRepoOS() {
  const { root, fromWorktree } = boardRoot();
  if (fromWorktree) {
    console.error(
      c.yellow("  ⚠ ") +
        c.dim("running from inside a linked worktree — reading the MAIN checkout's board (") +
        c.cyan(root) +
        c.dim(")"),
    );
  }
  return createRepoOS(root);
}

function assigneeLabel(t: Task): string {
  if (t.assignee === "ai") return c.magenta("◆ AI");
  if (t.assignee === "human") return c.cyan("◇ " + (t.assignedTo || "human"));
  return c.dim("· unassigned");
}

function pad(s: string, n: number): string {
  // pad based on visible length (ignore ANSI)
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, n - visible.length));
}

/** `repoos list [status]` — board overview or a single column. */
export function cmdList(statusArg?: string): void {
  const repoos = boardRepoOS();
  const idx = repoos.reindex();
  const cfg = loadConfig(idx.root);
  const hasCustomLabels = !!cfg.boardColumns && Object.keys(cfg.boardColumns).length > 0;
  const labels = hasCustomLabels ? resolveColumnLabels(cfg.boardColumns) : null;

  if (idx.taskCount === 0) {
    console.log(
      c.dim("\n  No tasks yet. Create one with ") + c.cyan('repoos new "Title"') + c.dim(".\n"),
    );
    return;
  }

  // Default view excludes drafts; explicit `repoos list draft` shows them.
  const cols =
    statusArg && (STATUSES as readonly string[]).includes(statusArg)
      ? [statusArg as Status]
      : STATUSES.filter((s) => s !== "draft");

  console.log(c.bold("\n  " + idx.root.split("/").pop()) + c.dim(`  ·  ${idx.taskCount} tasks\n`));

  for (const status of cols) {
    const tasks = idx.tasks.filter((t) => t.status === status);
    if (tasks.length === 0 && statusArg === undefined) continue;
    const sc = statusColor(status);
    const label = labels ? labels[status] : status.toUpperCase();
    console.log("  " + sc("● ") + c.bold(label) + c.dim(`  (${tasks.length})`));
    for (const t of tasks) {
      const line =
        "    " +
        c.dim("#" + pad(t.id, 5)) +
        priorityColor(t.priority)(pad(t.priority, 4)) +
        pad(t.title, 44) +
        pad(c.dim(t.area), 12) +
        assigneeLabel(t);
      console.log(line);
    }
    console.log("");
  }
}

/** `repoos show <id>` — full task detail. */
export function cmdShow(id?: string): void {
  if (!id) {
    console.error(c.red("  Usage: repoos show <id>"));
    process.exitCode = 1;
    return;
  }
  const repoos = boardRepoOS();
  const t = repoos.getTask(id);
  if (!t) {
    console.error(c.red(`  Task #${id} not found.`));
    process.exitCode = 1;
    return;
  }
  const sc = statusColor(t.status);
  console.log("\n  " + c.bold(t.title));
  console.log(
    "  " +
      c.dim(t.path) +
      "  " +
      sc("● " + t.status) +
      "  " +
      priorityColor(t.priority)(t.priority),
  );
  console.log(c.dim("  ─────────────────────────────────────────────────────────"));
  const row = (k: string, v: string) => console.log("  " + c.dim(pad(k, 12)) + v);
  row("id", t.id);
  row("type", t.type);
  row("area", t.area);
  row("assigned", assigneeLabel(t));
  row("branch", t.branch ? c.cyan(t.branch) : c.dim("—"));
  if (t.git.branchExists) row("git", c.green("branch exists locally"));
  if (t.git.lastCommit)
    row("last commit", c.dim(t.git.lastCommit + "  " + (t.git.lastCommitAt ?? "")));
  if (t.created_at) row("created", t.created_at);
  if (t.updated_at) row("updated", t.updated_at);
  console.log(c.dim("  ─────────────────────────────────────────────────────────\n"));
  // print body, lightly indented
  for (const line of t.body.split("\n")) console.log("  " + line);
  console.log("");
}

/** "main" if it exists, else "master" if it exists, else null (fail open — the
 * caller skips the merge check rather than guessing wrong and blocking a
 * legitimate move). */
function detectMainBranch(root: string): string | null {
  for (const name of ["main", "master"]) {
    const run = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${name}`], {
      cwd: root,
      timeout: 4000,
    });
    if (run.status === 0) return name;
  }
  return null;
}

/**
 * `repoos mv <id> <status>` — change status (frontmatter edit).
 *
 * Deliberately does NOT run this transition through `guardReviewTransition`
 * (#0263), even for a move into `review`. That gate lives in the HTTP PATCH
 * path because it operates on the task's OWN branch worktree — staging and
 * committing pending implementation changes there and rejecting a vacuous
 * (zero-source-change) transition — which is an agent-handoff guarantee, not
 * a board-write guarantee. `repoos mv` is the low-level, generic "edit this
 * frontmatter field" tool (a human or script can move ANY task to ANY status,
 * with or without a branch or worktree at all); forcing every review move
 * through worktree resolution would turn a one-line status edit into a hard
 * dependency on handoff plumbing that plenty of legitimate `mv` calls don't
 * have. The bug this task fixes is narrower and applies to every status
 * change here regardless of target: `updateStatus` (via `rewrite()` in
 * core/repoos.ts) now always commits the task file in the main checkout, so
 * the write itself is never left as an untrusted dirty file. Agents that want
 * the full handoff guarantee (implementation committed + non-vacuous) should
 * go through the trusted handoff/PATCH path, not this CLI shortcut.
 *
 * `done` gets one narrow exception to the "generic, no side checks" rule
 * above (confirmed live, 2026-09-17 — see #0399 and the #0185/#0389 incidents
 * in this session): unlike every other status, `done` claims the task's code
 * is actually on `main`. The server's own HTTP PATCH route already refuses a
 * bare `status: "done"` for exactly this reason (routes/tasks.ts) and forces
 * callers through `POST /api/tasks/:id/done`, the real close-out pipeline —
 * but this CLI command never went through that route to begin with, so it
 * silently flips the flag with zero merge awareness. If the task has a
 * `branch` that still exists locally and is NOT an ancestor of main, that
 * branch's code has not landed; refuse rather than mark it done from under
 * the user. This intentionally fails OPEN (allows the move) whenever it
 * can't tell for sure — no branch recorded, the branch was already deleted
 * (the normal post-merge cleanup), or git can't answer the ancestry question
 * — so it never blocks the many legitimate `mv` calls that have nothing to
 * do with code at all.
 */
export function cmdMv(
  id?: string,
  status?: string,
  note?: string,
  opts: { force?: boolean } = {},
): void {
  if (!id || !status) {
    console.error(
      c.red('  Usage: repoos mv <id> <status> [--note "..."] [--force-not-merged]') +
        c.dim(`   (${STATUSES.join(" | ")})`),
    );
    process.exitCode = 1;
    return;
  }
  // Board-rooted, not cwd-rooted (#0202): an agent running this from inside
  // its own task worktree must still land the status change on the MAIN
  // checkout's task file — the only copy the live board ever reads. Writing
  // to the worktree's own copy (findRepoRoot() stops at the worktree's own
  // .git) is a silent no-op from the board's perspective.
  const repoos = boardRepoOS();
  try {
    if (status === "done" && !opts.force) {
      const existing = repoos.getTask(id);
      if (existing && existing.status !== "done" && existing.branch) {
        const { root } = boardRoot();
        const branchExists =
          spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${existing.branch}`], {
            cwd: root,
            timeout: 4000,
          }).status === 0;
        const mainBranch = branchExists ? detectMainBranch(root) : null;
        const merged = mainBranch ? isAncestor(root, existing.branch, mainBranch) : null;
        if (merged === false) {
          console.error(
            c.red(`  Refusing to mark #${id} done — `) +
              c.dim(`branch "${existing.branch}" is not merged into ${mainBranch}.`),
          );
          console.error(
            c.dim(
              `  "repoos mv done" only flips the status flag; it never merges code. ` +
                `Merge the branch into ${mainBranch} yourself first (see docs/close-out-pipeline.md), ` +
                `or pass --force-not-merged if you have already landed the code some other way.`,
            ),
          );
          process.exitCode = 1;
          return;
        }
      }
    }
    const t = repoos.updateStatus(id, status as Status, note);
    console.log(
      "  " + c.green("moved ") + c.dim("#" + t.id) + " → " + statusColor(t.status)(t.status),
    );
    if (note && note.trim()) {
      console.log("  " + c.dim("note: ") + note.trim());
    }
  } catch (e) {
    console.error(c.red("  " + (e as Error).message));
    process.exitCode = 1;
  }
}

/**
 * `repoos note <id> "<text>"` — append a short, free-form note to a task's
 * activity log, so a PM/reviewer can send guidance back to the developer (or
 * record any free-form note) without rewriting the task body. The note is
 * recorded as its own activity entry and surfaces wherever the task's
 * history is shown. Board-rooted, not cwd-rooted (#0202) — see cmdMv.
 */
export function cmdNote(args: string[]): void {
  const [id, ...text] = args;
  const usage = '  Usage: repoos note <id> "<text>"';
  const note = text.join(" ").trim();
  if (!id || !note) {
    console.error(c.red(usage));
    process.exitCode = 1;
    return;
  }
  const repoos = boardRepoOS();
  try {
    const t = repoos.addNote(id, note);
    console.log("  " + c.green("note added ") + c.dim("#" + t.id));
    console.log("  " + c.dim("note: ") + note);
  } catch (e) {
    console.error(c.red("  " + (e as Error).message));
    process.exitCode = 1;
  }
}

const UPDATE_FLAGS: Record<string, keyof TaskPatch> = {
  title: "title",
  area: "area",
  priority: "priority",
  type: "type",
  body: "body",
  branch: "branch",
  "assigned-to": "assignedTo",
  "needs-input": "needsInput",
  questions: "questions",
};

/**
 * `repoos update <id> [--title ...] [--area ...] [--priority ...] [--type ...]
 *   [--body ... | --body -] [--branch ...] [--assigned-to ai|human]
 *   [--needs-input true|false] [--questions "Question one\nQuestion two"]`
 *
 * Writes directly via patchTaskFile (same path the server's PATCH route uses),
 * so it works with no HTTP round-trip and no session auth — this is the path
 * agents/scripts should use to edit task metadata instead of hitting the API.
 * `--body -` reads the new body from stdin, for large/multiline bodies.
 */
export function cmdUpdate(args: string[]): void {
  const [id, ...rest] = args;
  const usage =
    '  Usage: repoos update <id> [--title "..."] [--area a] [--priority p] [--type t] [--body "..."|-] [--branch b] [--assigned-to ai|human] [--needs-input true|false] [--questions "Question one\\nQuestion two"] [--clear-questions]';
  if (!id) {
    console.error(c.red(usage));
    process.exitCode = 1;
    return;
  }

  const patch: TaskPatch = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) {
      console.error(c.red(`  Unexpected argument: ${a}\n${usage}`));
      process.exitCode = 1;
      return;
    }
    const key = a.slice(2);
    if (key === "clear-questions") {
      patch.questions = null;
      continue;
    }
    const field = UPDATE_FLAGS[key];
    if (!field) {
      console.error(c.red(`  Unknown flag --${key}\n${usage}`));
      process.exitCode = 1;
      return;
    }
    const raw = rest[++i];
    if (raw === undefined) {
      console.error(c.red(`  Missing value for --${key}`));
      process.exitCode = 1;
      return;
    }
    if (field === "needsInput") {
      if (raw !== "true" && raw !== "false") {
        console.error(c.red(`  --needs-input must be true or false`));
        process.exitCode = 1;
        return;
      }
      patch.needsInput = raw === "true";
    } else if (field === "questions") {
      patch.questions = parseQuestions(raw);
    } else {
      const value = field === "body" && raw === "-" ? readFileSync(0, "utf8") : raw;
      (patch[field] as string) = value;
    }
  }

  if (Object.keys(patch).length === 0) {
    console.error(c.red("  No fields given.\n" + usage));
    process.exitCode = 1;
    return;
  }

  // Board-rooted, not cwd-rooted (#0202) — see cmdMv for why.
  const repoos = boardRepoOS();
  const task = repoos.getTask(id);
  if (!task) {
    console.error(c.red(`  Task #${id} not found.`));
    process.exitCode = 1;
    return;
  }
  try {
    const updated = patchTaskFile(repoos.config, task.absPath, patch);
    console.log("  " + c.green("updated ") + c.dim("#" + updated.id) + "  " + updated.title);
  } catch (e) {
    console.error(c.red("  " + (e as Error).message));
    process.exitCode = 1;
  }
}

const NEW_FLAGS = new Set(["ai", "type", "area", "priority", "body", "needs-input", "questions"]);

function parseQuestions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((q): q is string => typeof q === "string")) {
      return parsed.map((q) => q.trim()).filter(Boolean);
    }
  } catch {
    // Newline-delimited questions are the convenient CLI form.
  }
  return raw
    .split(/\r?\n/)
    .map((q) => q.trim())
    .filter(Boolean);
}

/** `repoos new <title> [--ai] [--needs-input true] [--questions "..."]` */
export function cmdNew(args: string[]): void {
  const usage =
    '  Usage: repoos new "Task title" [--ai] [--type bug] [--area web] [--priority p1] [--body "..."|-] [--needs-input true|false] [--questions "Question one\\nQuestion two"]';
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const key = a.slice(2);
    if (!NEW_FLAGS.has(key)) {
      console.error(c.red(`  Unknown flag --${key}\n${usage}`));
      process.exitCode = 1;
      return;
    }
    if (key === "ai") {
      flags.ai = true;
      continue;
    }
    const raw = args[++i];
    if (raw === undefined) {
      console.error(c.red(`  Missing value for --${key}\n${usage}`));
      process.exitCode = 1;
      return;
    }
    flags[key] = key === "body" && raw === "-" ? readFileSync(0, "utf8") : raw;
  }
  const title = positional.join(" ").trim();
  if (!title) {
    console.error(c.red(usage));
    process.exitCode = 1;
    return;
  }
  // Board-rooted, not cwd-rooted (#0202) — see cmdMv for why. Otherwise a
  // task created from inside a worktree lands in that worktree's own work/
  // dir and is invisible to the real board entirely.
  const repoos = boardRepoOS();
  const t = repoos.createTask({
    title,
    type: (flags.type as string) || undefined,
    area: (flags.area as string) || undefined,
    priority: (flags.priority as string) || undefined,
    assignedTo: flags.ai ? "ai" : undefined,
    body: (flags.body as string) || undefined,
    needsInput: flags["needs-input"] === "true",
    questions: flags.questions ? parseQuestions(flags.questions as string) : undefined,
  });
  console.log(
    "  " + c.green("created ") + c.dim("#" + t.id) + "  " + t.title + c.dim("  → " + t.path),
  );
  const res = repoos.commitNewFile(t.absPath, `docs(${t.id}): add task ${t.title}`);
  if (res.ok) {
    console.log("  " + c.green("committed ") + c.dim(res.hash ?? ""));
  } else {
    console.log("  " + c.yellow("warning: ") + c.dim("file left uncommitted — ") + res.reason);
  }
}

/** `repoos index [--json]` — rebuild cache; optionally print machine-readable JSON. */
export function cmdIndex(args: string[]): void {
  const repoos = boardRepoOS();
  const idx = repoos.reindex();
  if (args.includes("--json")) {
    console.log(JSON.stringify(idx, null, 2));
    return;
  }
  console.log(
    "  " +
      c.green("indexed ") +
      idx.taskCount +
      c.dim(" tasks  ·  cache → " + repoos.config.cacheDir + "/index.json"),
  );
  const parts = STATUSES.map((s) => statusColor(s)(s) + c.dim(" " + idx.counts[s]));
  console.log("  " + parts.join(c.dim("  ·  ")));
}
