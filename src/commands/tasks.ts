/**
 * Read and mutate commands. All go through the createRepoOS() facade so the
 * file remains the single source of truth.
 */
import { createRepoOS } from "../core/repoos.js";
import { boardRoot } from "../core/config.js";
import { STATUSES, type Status, type Task } from "../core/types.js";
import { c, statusColor, priorityColor } from "../cli/colors.js";

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
  if (t.assignee === "human")
    return c.cyan("◇ " + (t.assignedTo || "human"));
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

  if (idx.taskCount === 0) {
    console.log(
      c.dim("\n  No tasks yet. Create one with ") +
        c.cyan('repoos new "Title"') +
        c.dim(".\n"),
    );
    return;
  }

  // Default view excludes drafts; explicit `repoos list draft` shows them.
  const cols =
    statusArg && (STATUSES as readonly string[]).includes(statusArg)
      ? [statusArg as Status]
      : STATUSES.filter((s) => s !== "draft");

  console.log(
    c.bold("\n  " + idx.root.split("/").pop()) +
      c.dim(`  ·  ${idx.taskCount} tasks\n`),
  );

  for (const status of cols) {
    const tasks = idx.tasks.filter((t) => t.status === status);
    if (tasks.length === 0 && statusArg === undefined) continue;
    const sc = statusColor(status);
    console.log(
      "  " +
        sc("● ") +
        c.bold(status.toUpperCase()) +
        c.dim(`  (${tasks.length})`),
    );
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
  console.log(
    c.dim("  ─────────────────────────────────────────────────────────"),
  );
  const row = (k: string, v: string) =>
    console.log("  " + c.dim(pad(k, 12)) + v);
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
  console.log(
    c.dim("  ─────────────────────────────────────────────────────────\n"),
  );
  // print body, lightly indented
  for (const line of t.body.split("\n")) console.log("  " + line);
  console.log("");
}

/** `repoos mv <id> <status>` — change status (frontmatter edit). */
export function cmdMv(id?: string, status?: string): void {
  if (!id || !status) {
    console.error(
      c.red("  Usage: repoos mv <id> <status>") +
        c.dim(`   (${STATUSES.join(" | ")})`),
    );
    process.exitCode = 1;
    return;
  }
  const repoos = createRepoOS();
  try {
    const t = repoos.updateStatus(id, status as Status);
    console.log(
      "  " +
        c.green("moved ") +
        c.dim("#" + t.id) +
        " → " +
        statusColor(t.status)(t.status),
    );
  } catch (e) {
    console.error(c.red("  " + (e as Error).message));
    process.exitCode = 1;
  }
}

/** `repoos new <title> [--ai] [--type t] [--area a] [--priority p]` */
export function cmdNew(args: string[]): void {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--ai") flags.ai = true;
    else if (a.startsWith("--")) flags[a.slice(2)] = args[++i];
    else positional.push(a);
  }
  const title = positional.join(" ").trim();
  if (!title) {
    console.error(c.red('  Usage: repoos new "Task title" [--ai] [--type bug] [--area web] [--priority p1]'));
    process.exitCode = 1;
    return;
  }
  const repoos = createRepoOS();
  const t = repoos.createTask({
    title,
    type: (flags.type as string) || undefined,
    area: (flags.area as string) || undefined,
    priority: (flags.priority as string) || undefined,
    assignedTo: flags.ai ? "ai" : undefined,
  });
  console.log(
    "  " +
      c.green("created ") +
      c.dim("#" + t.id) +
      "  " +
      t.title +
      c.dim("  → " + t.path),
  );
  const res = repoos.commitNewFile(t.absPath, `docs(${t.id}): add task ${t.title}`);
  if (res.ok) {
    console.log("  " + c.green("committed ") + c.dim(res.hash ?? ""));
  } else {
    console.log(
      "  " +
        c.yellow("warning: ") +
        c.dim("file left uncommitted — ") +
        res.reason,
    );
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
  const parts = STATUSES.map(
    (s) => statusColor(s)(s) + c.dim(" " + idx.counts[s]),
  );
  console.log("  " + parts.join(c.dim("  ·  ")));
}
