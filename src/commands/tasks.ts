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
import { STATUSES, PRIORITIES, TASK_TYPES, type Status, type Task } from "../core/types.js";
import { c, statusColor, priorityColor } from "../cli/colors.js";
import { patchTaskFile, type TaskPatch } from "../server/write.js";
import { flagUnderspecifiedIfNeeded } from "../server/task-underspecified-flag.js";
import { writeHandoffRequest, type HandoffRequest } from "../server/handoff-request.js";
import { isAncestor } from "../core/git.js";
import { declaredShotsSectionContent, parseShotPlan } from "../core/shot-plan.js";
import { normalizeSectionHeading, replaceSection } from "../core/task.js";

/**
 * The full valid value sets for `--priority` / `--type`, rendered into both
 * commands' usage text so the accepted values are obvious at the point of
 * use (#0656) instead of a single example. Exported for tests.
 */
export const PRIORITY_USAGE = PRIORITIES.join("|");
export const TYPE_USAGE = TASK_TYPES.join("|");

export const UPDATE_USAGE =
  '  Usage: repoos update <id> [--title "..."] [--area a,b] [--story "Delivery slice"] [--depends-on 0542,0538] ' +
  `[--priority ${PRIORITY_USAGE}] [--type ${TYPE_USAGE}] [--body "..."|-] [--branch b] ` +
  '[--assigned-to ai|human] [--needs-input true|false] [--needs-merge true|false] [--questions "Question one\\nQuestion two"] [--clear-questions] [--shots "<JSON list>"|- | --section "<heading>" --section-body ...] [--force]';

export const NEW_USAGE =
  '  Usage: repoos new "Task title" [--ai] ' +
  `[--type ${TYPE_USAGE}] [--area web,core] [--story "Delivery slice"] [--depends-on 0542,0538] [--priority ${PRIORITY_USAGE}] ` +
  '[--body "..."|-] [--shots "<JSON list>"|-] [--needs-input true|false] [--questions "Question one\\nQuestion two"]';

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

  // `repoos list archived` shows only shelved tasks (#0657); every other view
  // hides them, because archived work is parked, not in any column. The count
  // footer keeps them discoverable instead of silently missing.
  const archived = idx.tasks.filter((t) => t.isArchived);
  if (statusArg === "archived") {
    console.log(
      c.bold("\n  " + idx.root.split("/").pop()) + c.dim(`  ·  ${archived.length} archived\n`),
    );
    if (archived.length === 0) {
      console.log(c.dim("  No archived tasks.\n"));
      return;
    }
    for (const t of archived) {
      console.log(
        "    " +
          c.dim("#" + pad(t.id, 5)) +
          priorityColor(t.priority)(pad(t.priority, 4)) +
          pad(t.title, 44) +
          c.dim(`${t.status} · `) +
          (t.archiveDetail ? c.dim(t.archiveDetail) : ""),
      );
    }
    console.log("");
    return;
  }

  // Default view excludes drafts; explicit `repoos list draft` shows them.
  const cols =
    statusArg && (STATUSES as readonly string[]).includes(statusArg)
      ? [statusArg as Status]
      : STATUSES.filter((s) => s !== "draft");
  const activeCount = idx.tasks.length - archived.length;

  console.log(c.bold("\n  " + idx.root.split("/").pop()) + c.dim(`  ·  ${activeCount} tasks\n`));

  for (const status of cols) {
    const tasks = idx.tasks.filter((t) => t.status === status && !t.isArchived);
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
  if (archived.length > 0) {
    console.log(
      c.dim(`  ${archived.length} archived`) + c.dim("  ·  `repoos list archived` to show\n"),
    );
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
  if (t.isArchived) {
    row("archived", c.yellow("yes") + (t.archiveDetail ? c.dim(`  ${t.archiveDetail}`) : ""));
  }
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
 * True when this process is a managed agent working on `id` — the runner
 * injects `REPOOS_AGENT=1` into every managed agent process, and
 * `REPOOS_TASK_ID` / `REPOOS_RUN_ID` into a task turn (agents.ts). Both must
 * match: without the run id the recorded request could not be tied to a live
 * turn, and without the task id this would hijack `repoos mv` calls an agent
 * makes about some OTHER task. A human in their own shell has neither, so they
 * keep the plain status edit (which the server still runs through the same
 * finalization via the file-watch route).
 */
export function isRunnerSessionForTask(id: string): boolean {
  return (
    process.env.REPOOS_AGENT === "1" &&
    Boolean(process.env.REPOOS_RUN_ID) &&
    process.env.REPOOS_TASK_ID === id
  );
}

/**
 * #0507: record a handoff request instead of flipping `status: review`, when
 * the task's own agent is the one asking. Returns true when the request was
 * recorded and `cmdMv` must stop there. On failure it returns false so the
 * caller falls through to the ordinary status edit — worse, but never a dead
 * end for the agent mid-turn.
 */
function handoffRequestFromRunner(id: string): boolean {
  if (!isRunnerSessionForTask(id)) return false;
  const { root } = boardRoot();
  const request: HandoffRequest = {
    taskId: id,
    runId: process.env.REPOOS_RUN_ID as string,
    at: new Date().toISOString(),
    source: "repoos-mv",
  };
  if (!writeHandoffRequest(root, loadConfig(root).cacheDir, request)) {
    console.error(
      c.red(`  Could not record a handoff request for #${id} — `) +
        c.dim("RepoOS could not write its handoff-request file."),
    );
    console.error(
      c.dim(
        "  Falling back to a plain status edit, which SKIPS the checks and stops this " +
          "agent mid-turn. Prefer ending your turn and letting the reviewer pick it up.",
      ),
    );
    return false;
  }
  console.log(
    "  " +
      c.green("handoff requested ") +
      c.dim("#" + id) +
      c.dim(" —") +
      "\n" +
      c.dim("  RepoOS will run `repoos check`, pass the commit gate, and move this to review."),
  );
  console.log(c.dim("  `status:` was left alone — end your turn now; finalization runs on exit."));
  return true;
}

/**
 * `repoos mv <id> <status>` — change status (frontmatter edit).
 *
 * Two transitions are special-cased, because both are ones this command
 * cannot perform on its own.
 *
 * **`review` from inside the runner session for that same task (#0507)** does
 * NOT flip `status:`. It records a handoff request in the board's cache dir
 * (`.repoos/handoff-requests/<id>.json`) and exits 0; the runner picks that up
 * exactly like the `::repoos-handoff-ready::` signal and finalizes when the
 * turn ends — scoped `repoos check`, then the commit/vacuity gate, then
 * `review`. This is the single most-used route in practice: engineers reach for
 * it because the CTO nudge says "hand off to review" and the operating loop
 * says "set `status: review`". A bare frontmatter write is not a handoff — it
 * skips the check, and because the task leaves `active` the server stops the
 * very agent that asked, which `cleanup()` then books as a dev error (#0505,
 * #0499: "needs input" next to "waiting for human" on a task that passed
 * review). Detection is the runner's own marker — `REPOOS_AGENT=1` plus a
 * `REPOOS_TASK_ID` equal to the id being moved — so a human running the same
 * command in their own shell still gets a plain status edit, picked up by the
 * server and run through the same finalization via the file-watch route.
 *
 * `done` gets a narrow guard for the mirror-image reason (confirmed live,
 * 2026-09-17 — see #0399 and the #0185/#0389 incidents in this session):
 * unlike every other status, `done` claims the task's code is actually on
 * `main`. The server's own HTTP PATCH route already refuses a bare
 * `status: "done"` for exactly this reason (routes/tasks.ts) and forces callers
 * through `POST /api/tasks/:id/done`, the real close-out pipeline — but this CLI
 * command never went through that route to begin with, so it silently flips the
 * flag with zero merge awareness. If the task has a `branch` that still exists
 * locally and is NOT an ancestor of main, that branch's code has not landed;
 * refuse rather than mark it done from under the user. This intentionally fails
 * OPEN (allows the move) whenever it can't tell for sure — no branch recorded,
 * the branch was already deleted (the normal post-merge cleanup), or git can't
 * answer the ancestry question — so it never blocks the many legitimate `mv`
 * calls that have nothing to do with code at all.
 *
 * Every other status is a plain frontmatter edit. `updateStatus` (via
 * `rewrite()` in core/repoos.ts) always commits the task file in the main
 * checkout, so the write itself is never left as an untrusted dirty file. Note
 * that a move into `review` from OUTSIDE a runner session still goes through
 * the full server-side finalization — the server intercepts the file write and
 * runs the same check the handoff signal does, keeping the task `active` until
 * it passes.
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
    // #0657: archived tasks are parked. Status moves on a shelved task are
    // almost always a mistake, and the dedicated unarchive route is the only
    // way back — refuse rather than silently change a hidden task's column.
    const existingBeforeMv = repoos.getTask(id);
    if (existingBeforeMv?.isArchived) {
      console.error(c.red(`  Refusing to move #${id} — `) + c.dim("the task is archived."));
      console.error(
        c.dim(
          "  Unarchive it first (from the app's Archived list, or POST /api/tasks/:id/unarchive).",
        ),
      );
      process.exitCode = 1;
      return;
    }
    if (status === "review" && handoffRequestFromRunner(id)) return;
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
  story: "story",
  "depends-on": "dependsOn",
  priority: "priority",
  type: "type",
  body: "body",
  branch: "branch",
  "assigned-to": "assignedTo",
  "needs-input": "needsInput",
  "needs-merge": "needsMerge",
  questions: "questions",
  section: "section",
};

/** Section headings a full `--body` replace must not silently drop (#0613). */
const SPEC_SECTION_NAMES = new Set([
  "Problem",
  "Desired UX",
  "Acceptance criteria",
  "Notes for AI",
]);

/** Validate declarations before a CLI write can turn them into a blind `/` shot. */
function shotsError(body: string): string | null {
  const { errors } = parseShotPlan(body);
  return errors.length
    ? `Invalid ## Shots: ${errors.join("; ")}. Use --shots '<JSON list>' to format it automatically.`
    : null;
}

/** Accept raw JSON and write the exact fenced format the capture parser reads. */
function shotsSectionContent(raw: string): string {
  const body = `## Shots\n\n\`\`\`json\n${raw}\n\`\`\``;
  const parsed = parseShotPlan(body);
  if (parsed.errors.length || parsed.shots.length === 0) {
    throw new Error(
      `Invalid --shots JSON: ${parsed.errors.join("; ") || "expected at least one shot"}`,
    );
  }
  return declaredShotsSectionContent(parsed.shots);
}

/**
 * `repoos update <id> [--title ...] [--area ...] [--story ...] [--priority ...]
 *   [--type ...] [--body ... | --body -] [--branch ...] [--assigned-to ai|human]
 *   [--needs-input true|false] [--questions "Question one\nQuestion two"] [--depends-on ids]
 *   [--shots '<JSON list>' | --section "<heading>" --section-body ... | --force]`
 *
 * Writes directly via patchTaskFile (same path the server's PATCH route uses),
 * so it works with no HTTP round-trip and no session auth — this is the path
 * agents/scripts should use to edit task metadata instead of hitting the API.
 * `--body -` reads the new body from stdin, for large/multiline bodies.
 * `--shots '<JSON list>'` validates and formats `## Shots` without clobbering
 * the rest of the body. A full `--body` that drops spec headings (Problem /
 * Desired UX / Acceptance criteria / Notes for AI) is refused unless `--force`
 * is passed.
 */
export function cmdUpdate(args: string[]): void {
  const [id, ...rest] = args;
  const usage = UPDATE_USAGE;
  if (!id) {
    console.error(c.red(usage));
    process.exitCode = 1;
    return;
  }

  const patch: TaskPatch = {};
  let pendingSectionHeading: string | null = null;
  let pendingSectionContent: string | undefined;
  let pendingShots: string | undefined;
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
    if (key === "force") {
      patch.force = true;
      continue;
    }
    if (key === "section") {
      if (pendingSectionHeading !== null) {
        console.error(c.red("  --section takes a heading; repeat --section for a different one"));
        process.exitCode = 1;
        return;
      }
      const raw = rest[++i];
      if (raw === undefined) {
        console.error(c.red("  Missing value for --section"));
        process.exitCode = 1;
        return;
      }
      pendingSectionHeading = raw;
      continue;
    }
    if (key === "section-body") {
      const raw = rest[i + 1];
      if (raw !== undefined && !raw.startsWith("--")) {
        pendingSectionContent = raw === "-" ? readFileSync(0, "utf8") : raw;
        i++;
      } else {
        pendingSectionContent = readFileSync(0, "utf8");
      }
      continue;
    }
    if (key === "shots") {
      const raw = rest[++i];
      if (raw === undefined || pendingShots !== undefined) {
        console.error(c.red(`  Missing or repeated --shots value\n${usage}`));
        process.exitCode = 1;
        return;
      }
      pendingShots = raw === "-" ? readFileSync(0, "utf8") : raw;
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
    if (field === "needsInput" || field === "needsMerge") {
      if (raw !== "true" && raw !== "false") {
        console.error(
          c.red(
            `  --${field === "needsInput" ? "needs-input" : "needs-merge"} must be true or false`,
          ),
        );
        process.exitCode = 1;
        return;
      }
      if (field === "needsInput") patch.needsInput = raw === "true";
      else patch.needsMerge = raw === "true";
    } else if (field === "questions") {
      patch.questions = parseQuestions(raw);
    } else if (field === "dependsOn") {
      patch.dependsOn = raw
        .split(",")
        .map((dependency) => dependency.trim())
        .filter(Boolean);
    } else {
      const value = field === "body" && raw === "-" ? readFileSync(0, "utf8") : raw;
      (patch[field] as string) = value;
    }
  }

  if (pendingSectionHeading === null && pendingSectionContent !== undefined) {
    console.error(c.red('  --section-body requires --section "<heading>"'));
    process.exitCode = 1;
    return;
  }

  if (pendingShots !== undefined && (pendingSectionHeading !== null || patch.body !== undefined)) {
    console.error(c.red("  --shots cannot be combined with --section or --body"));
    process.exitCode = 1;
    return;
  }

  try {
    if (pendingShots !== undefined) {
      patch.section = { heading: "Shots", content: shotsSectionContent(pendingShots) };
    }
  } catch (error) {
    console.error(c.red(`  ${(error as Error).message}`));
    process.exitCode = 1;
    return;
  }

  if (pendingSectionHeading !== null) {
    if (patch.body !== undefined) {
      console.error(
        c.red(
          '  --section and --body are mutually exclusive; use --section "<heading>" --section-body "..."',
        ),
      );
      process.exitCode = 1;
      return;
    }
    patch.section = { heading: pendingSectionHeading, content: pendingSectionContent ?? "" };
  }

  if (
    patch.section &&
    normalizeSectionHeading(patch.section.heading).toLowerCase() === "## shots"
  ) {
    const error = shotsError(`## Shots\n\n${patch.section.content}`);
    if (error) {
      console.error(c.red(`  ${error}`));
      process.exitCode = 1;
      return;
    }
  }
  if (patch.body !== undefined) {
    const error = shotsError(patch.body);
    if (error) {
      console.error(c.red(`  ${error}`));
      process.exitCode = 1;
      return;
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

const NEW_FLAGS = new Set([
  "ai",
  "type",
  "area",
  "story",
  "depends-on",
  "priority",
  "body",
  "shots",
  "needs-input",
  "questions",
]);

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

/** `repoos new <title> [--ai] [--needs-input true] [--questions "..."] [--depends-on ids]` */
export function cmdNew(args: string[]): void {
  const usage = NEW_USAGE;
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
    flags[key] = (key === "body" || key === "shots") && raw === "-" ? readFileSync(0, "utf8") : raw;
  }
  const title = positional.join(" ").trim();
  if (!title) {
    console.error(c.red(usage));
    process.exitCode = 1;
    return;
  }
  let body = (flags.body as string) || "";
  try {
    const error = shotsError(body);
    if (error) throw new Error(error);
    if (typeof flags.shots === "string") {
      if (/(?:^|\n)##\s*Shots\b/i.test(body)) {
        throw new Error("--shots cannot be combined with an existing ## Shots section in --body");
      }
      body = replaceSection(body, "Shots", shotsSectionContent(flags.shots));
    }
  } catch (error) {
    console.error(c.red(`  ${(error as Error).message}`));
    process.exitCode = 1;
    return;
  }
  // Board-rooted, not cwd-rooted (#0202) — see cmdMv for why. Otherwise a
  // task created from inside a worktree lands in that worktree's own work/
  // dir and is invisible to the real board entirely.
  const repoos = boardRepoOS();
  let t: Task;
  try {
    t = repoos.createTask({
      title,
      type: (flags.type as string) || undefined,
      area: (flags.area as string) || undefined,
      story: (flags.story as string) || undefined,
      dependsOn:
        typeof flags["depends-on"] === "string"
          ? flags["depends-on"]
              .split(",")
              .map((dependency) => dependency.trim())
              .filter(Boolean)
          : undefined,
      priority: (flags.priority as string) || undefined,
      assignedTo: flags.ai ? "ai" : undefined,
      body: body || undefined,
      needsInput: flags["needs-input"] === "true",
      questions: flags.questions ? parseQuestions(flags.questions as string) : undefined,
    });
  } catch (error) {
    console.error(c.red(`  ${(error as Error).message}`));
    process.exitCode = 1;
    return;
  }
  console.log(
    "  " + c.green("created ") + c.dim("#" + t.id) + "  " + t.title + c.dim("  → " + t.path),
  );
  // #0668: `repoos new` writes the task directly (no server in the loop), so it
  // assesses the stub itself. The boot sweep is the backstop for tasks created
  // while the server was down or by another client.
  const flagged = flagUnderspecifiedIfNeeded(repoos.config, t);
  if (flagged) {
    console.log(
      "  " +
        c.yellow("needs input ") +
        c.dim("task body is underspecified — ") +
        flagged.needsInputDetail,
    );
  }
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
