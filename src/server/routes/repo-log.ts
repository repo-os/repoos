/**
 * Read-only git history for the Context page (`GET /api/repo/log`, commits, branches).
 */
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import { readCheckRun } from "../../core/check-results-store.js";
import {
  getCommitFileContents,
  getRepoCommit,
  listRepoBranches,
  listRepoLog,
  MAX_LOG_LIMIT,
} from "../../core/repo-log.js";
import { runGit } from "../../core/git.js";

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
  const limitRaw = q.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) < 1 || (limit ?? 0) > MAX_LOG_LIMIT)) {
    return json(res, 400, { ok: false, error: "limit must be 1–100" });
  }

  const page = await listRepoLog(ctx.config.root, { branch, path, limit, before });
  if (!page.ok) return json(res, errorStatus(page.code), page);

  const lastRun = readCheckRun(ctx.config.root, ctx.config.cacheDir);
  const head = await runGit(ctx.config.root, ["rev-parse", "HEAD"], 4000);
  const headSha = head.status === 0 && !head.timedOut ? head.stdout.trim().toLowerCase() : "";

  const commits = page.commits.map((c) => {
    const check =
      lastRun && headSha && c.sha.toLowerCase() === headSha
        ? { passed: lastRun.passed }
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
