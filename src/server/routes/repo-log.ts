/**
 * Read-only git history for the Context page (`GET /api/repo/log`, commits, branches).
 */
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { readCheckRun } from "../../core/check-results-store.js";
import {
  getCommitFileContents,
  getRepoCommit,
  getWorkingTreeDiff,
  getWorkingTreeFileContents,
  listRepoBranches,
  listRepoLog,
  MAX_LOG_LIMIT,
} from "../../core/repo-log.js";
import { GitDirtyCheckError, dirtyFilesDetailed, runGit } from "../../core/git.js";
import { notifyGitMutation } from "../../core/git-activity.js";
import { closeOutPending } from "../integration-job.js";
import { getRepoStatus } from "../repo-status.js";

function query(reqUrl: string | undefined): URLSearchParams {
  try {
    return new URL(reqUrl ?? "/", "http://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function errorStatus(code: "not-git" | "invalid" | "missing"): number {
  if (code === "not-git") return 200;
  if (code === "missing") return 404;
  return 400;
}

export const getRepoLog: RouteHandler = async (ctx, req, res) => {
  const q = query(req.url);
  const branch = q.get("branch") || undefined;
  const path = q.get("path") || undefined;
  const before = q.get("before") || undefined;
  const includeDocs = q.get("includeDocs") === "1";
  const limitRaw = q.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) < 1 || (limit ?? 0) > MAX_LOG_LIMIT)) {
    return json(res, 400, { ok: false, error: "limit must be 1–100" });
  }

  const page = await listRepoLog(ctx.config.root, { branch, path, limit, before, includeDocs });
  if (!page.ok) return json(res, errorStatus(page.code), page);

  const lastRun = readCheckRun(ctx.config.root, ctx.config.cacheDir);
  const head = await runGit(ctx.config.root, ["rev-parse", "HEAD"], 4000);
  const headSha = head.status === 0 && !head.timedOut ? head.stdout.trim().toLowerCase() : "";

  const commits = page.commits.map((c) => {
    const check =
      lastRun && headSha && c.sha.toLowerCase() === headSha
        ? {
            passed: lastRun.passed,
            // #0592: a no-plan skip exits 0 but is not a pass — carry the
            // outcome so the badge renders "no checks configured", never a
            // false red "checks failed".
            outcome: lastRun.outcome ?? (lastRun.passed ? "passed" : "failed"),
          }
        : undefined;
    return check ? { ...c, check } : c;
  });

  return json(res, 200, { ...page, commits });
};

export const getRepoBranches: RouteHandler = async (ctx, _req, res) => {
  const result = await listRepoBranches(ctx.config.root);
  if (!result.ok) return json(res, errorStatus(result.code), result);
  return json(res, 200, result);
};

/**
 * `GET /api/repo/status` (#0584) — the sidebar git-state row's data: branch,
 * detached flag, dirty files with their status column, head, and the three
 * most recent commits for the repo root checkout.
 *
 * Always 200: an unreadable checkout answers `ok: false` ("unknown" in the
 * UI), it is not an HTTP error — the same reasoning as the log route's
 * `not-git` → 200. Computation is debounced and coalesced server-side, so
 * every open tab polling this costs at most one `git status`.
 */
export const getRepoStatusRoute: RouteHandler = async (ctx, _req, res) => {
  const status = await getRepoStatus(ctx.config.root);
  return json(res, 200, status);
};

const MAX_COMMIT_MESSAGE = 10_000;
/** Used when the user commits from the sidebar without typing a message. */
export const DEFAULT_COMMIT_MESSAGE = "chore: commit uncommitted changes";

/**
 * `POST /api/repo/commit` — commit every uncommitted change in the repo root
 * checkout on its current branch (the sidebar popup's Commit button). The human
 * clicking it is the authorization; it never runs for an agent. Refuses rather
 * than guesses: nothing to commit, detached HEAD, unresolved
 * conflicts, or a close-out in flight (which owns the main checkout). Hook
 * output (the main-branch pre-commit format/lint gate) comes back verbatim so
 * a refusal is explained, not silent.
 */
export const commitRepoRoot: RouteHandler = async (ctx, req, res) => {
  const root = ctx.config.root;
  const body = (await readBody(req)) as { message?: unknown };
  // The message is optional: a blank one falls back to a generic checkpoint message.
  const message =
    (typeof body?.message === "string" ? body.message.trim() : "") || DEFAULT_COMMIT_MESSAGE;
  if (message.length > MAX_COMMIT_MESSAGE) {
    return json(res, 400, { ok: false, error: "That commit message is too long." });
  }
  if (closeOutPending(ctx.closeOutLock, ctx.jobCoordinator)) {
    return json(res, 409, {
      ok: false,
      error: "A Move to done is in progress and owns this checkout — try again when it finishes.",
    });
  }

  let dirty;
  try {
    dirty = await dirtyFilesDetailed(root);
  } catch (err) {
    const detail = err instanceof GitDirtyCheckError ? err.message : String(err);
    return json(res, 500, { ok: false, error: `Could not read git status: ${detail}` });
  }
  if (dirty.length === 0) return json(res, 409, { ok: false, error: "Nothing to commit." });
  if (dirty.some((f) => f.status.includes("U") || f.status === "AA" || f.status === "DD")) {
    return json(res, 409, {
      ok: false,
      error: "There are unresolved merge conflicts — resolve them before committing.",
    });
  }
  const branch = (
    await runGit(root, ["symbolic-ref", "--short", "-q", "HEAD"], 4000)
  ).stdout.trim();
  if (!branch) {
    return json(res, 409, { ok: false, error: "HEAD is detached — check out a branch first." });
  }

  const add = await runGit(root, ["add", "-A"], 30_000);
  if (add.status !== 0) {
    return json(res, 500, { ok: false, error: `git add failed: ${add.stderr.trim()}` });
  }
  // Generous budget: on the base branch the pre-commit hook runs format + lint.
  const commit = await runGit(root, ["commit", "-m", message], 180_000);
  if (commit.status !== 0) {
    const output = `${commit.stdout}\n${commit.stderr}`.trim();
    return json(res, 422, {
      ok: false,
      error: commit.timedOut ? "git commit timed out." : "git commit was rejected.",
      output: output.slice(-4000),
    });
  }
  notifyGitMutation(root, "commit");
  const sha = (await runGit(root, ["rev-parse", "--short", "HEAD"], 4000)).stdout.trim();
  return json(res, 200, { ok: true, branch, sha, files: dirty.length });
};

export const getRepoCommitRoute: RouteHandler = async (ctx, _req, res, params) => {
  const sha = params.param1 ?? "";
  const result = await getRepoCommit(ctx.config.root, sha);
  if ("ok" in result && result.ok === false) {
    return json(res, errorStatus(result.code), result);
  }
  return json(res, 200, { ok: true, ...result });
};

export const getRepoCommitFile: RouteHandler = async (ctx, req, res, params) => {
  const sha = params.param1 ?? "";
  const q = query(req.url);
  const rawPath = q.get("path") ?? "";
  const path = rawPath.replace(/^(?:a|b)\//, "");
  const result = await getCommitFileContents(ctx.config.root, sha, path);
  if (!result.ok) return json(res, errorStatus(result.code), result);
  return json(res, 200, result);
};

export const getRepoWorkingDiff: RouteHandler = async (ctx, _req, res) => {
  const result = await getWorkingTreeDiff(ctx.config.root);
  if (!result.ok) return json(res, errorStatus(result.code), result);
  return json(res, 200, result);
};

export const getRepoWorkingDiffFile: RouteHandler = async (ctx, req, res) => {
  const path = (query(req.url).get("path") ?? "").replace(/^(?:a|b)\//, "");
  const result = await getWorkingTreeFileContents(ctx.config.root, path);
  if (!result.ok) return json(res, errorStatus(result.code), result);
  return json(res, 200, result);
};
