/**
 * The on-disk handoff request an AGENT writes for ITS OWN task (#0507).
 *
 * `repoos mv <own id> review` used to be the reflex engineers reached for — the
 * CTO nudge says "hand off to review", AGENTS.md says "set `status: review`",
 * and the engineer prompt permits status changes via the CLI. But a bare
 * frontmatter write is not a handoff: it bypasses the scoped `repoos check`
 * the server-side finalization runs, and because the task leaves `active` the
 * server stops the very agent that asked, which `cleanup()` then escalates as
 * a dev error (#0505, #0499).
 *
 * So `repoos mv <id> review` run *inside the runner session for that same task*
 * no longer flips `status:`. It drops a marker file here instead, and the
 * runner picks it up as exactly the same capability the
 * `::repoos-handoff-ready::` signal mints — finalizing when the turn ends. The
 * agent sandbox has no HTTP access to the control plane but can write files,
 * so a file is the whole transport.
 *
 * Placement and safety:
 *  - Lives under `<board root>/<cacheDir>/handoff-requests/`, beside the
 *    existing `pending-handoffs.json` — gitignored, so `guardReviewTransition`'s
 *    `git add -A` in the worktree can never fold it into a commit, and never
 *    inside a task worktree (so it cannot dirty the branch it is finalizing).
 *  - Keyed by task id, so a stale request from a previous run is
 *    distinguishable by its `runId`: the runner only honours a request whose
 *    `runId` matches the live turn. A leftover file from a crashed turn is
 *    simply never matched and is garbage-collected.
 *  - Write is atomic (temp + rename) so a poller can never read a half-written
 *    file.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** One agent's request that RepoOS finalize a handoff when its turn ends. */
export interface HandoffRequest {
  /** The task the agent is working on — must match `REPOOS_TASK_ID`. */
  taskId: string;
  /** The runner turn that asked. Must match `REPOOS_RUN_ID`; a mismatch is a
   *  stale file from an earlier turn and is ignored. */
  runId: string;
  /** When the request was written (ISO 8601), for diagnostics only. */
  at: string;
  /** How the agent asked — surfaced in the transcript, never trusted. */
  source: "repoos-mv" | "signal";
}

/** Directory of pending handoff-request markers inside the board's cache dir. */
export function handoffRequestDir(root: string, cacheDir: string): string {
  return join(root, cacheDir, "handoff-requests");
}

/** Path of one task's handoff-request marker. */
export function handoffRequestPath(root: string, cacheDir: string, taskId: string): string {
  return join(handoffRequestDir(root, cacheDir), `${encodeURIComponent(taskId)}.json`);
}

/**
 * Record a handoff request. Returns false (and never throws) when the marker
 * could not be written — the caller decides whether that is fatal.
 */
export function writeHandoffRequest(
  root: string,
  cacheDir: string,
  request: HandoffRequest,
): boolean {
  const file = handoffRequestPath(root, cacheDir, request.taskId);
  try {
    mkdirSync(handoffRequestDir(root, cacheDir), { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(request, null, 2), "utf8");
      renameSync(temp, file);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a task's pending handoff request, or null when there is none, it is
 * unreadable, or it is not a well-formed request. A corrupt marker is deleted
 * rather than left to fail every subsequent poll.
 */
export function readHandoffRequest(
  root: string,
  cacheDir: string,
  taskId: string,
): HandoffRequest | null {
  const file = handoffRequestPath(root, cacheDir, taskId);
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HandoffRequest>;
    if (typeof parsed?.taskId === "string" && typeof parsed?.runId === "string") {
      return {
        taskId: parsed.taskId,
        runId: parsed.runId,
        at: typeof parsed.at === "string" ? parsed.at : "",
        source: parsed.source === "signal" ? "signal" : "repoos-mv",
      };
    }
  } catch {
    /* fall through to cleanup */
  }
  clearHandoffRequest(root, cacheDir, taskId);
  return null;
}

/** Remove a task's handoff-request marker. Safe when none exists. */
export function clearHandoffRequest(root: string, cacheDir: string, taskId: string): void {
  try {
    unlinkSync(handoffRequestPath(root, cacheDir, taskId));
  } catch {
    /* already gone */
  }
}
