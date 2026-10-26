import type { RepoOSConfig, Task } from "../core/types.js";
import {
  invalidateGitReadCaches,
  lastCommitsForDirAsync,
  repoGitOverviewAsync,
  resolveWorktreeStatuses,
  type RepoGitOverview,
  type WorktreeDirtyEntry,
  type WorktreeStatus,
} from "../core/git.js";
import { buildIndexDetailedAsync } from "../core/indexer.js";
import { taskDependencyBlockersForAll } from "../core/task-dependencies.js";
import { countWorktrees, sweepStaleWorktrees, type GcMode } from "../core/worktree-gc.js";

interface RequestMessage {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
}

function overviewToWire(overview: RepoGitOverview): Record<string, unknown> {
  return {
    useGit: overview.useGit,
    baseBranch: overview.baseBranch,
    branches: [...overview.branches],
    heads: [...overview.heads],
    aheadCounts: [...overview.aheadCounts],
    worktrees: [...overview.worktrees],
    fingerprint: overview.fingerprint,
  };
}

async function respond(message: RequestMessage): Promise<unknown> {
  const payload = message.payload;
  switch (message.kind) {
    case "build-index": {
      const result = await buildIndexDetailedAsync(payload.config as RepoOSConfig, {
        fastWorktreeStatus: payload.fastWorktreeStatus === true,
      });
      return { index: result.index, git: overviewToWire(result.git) };
    }
    case "reconcile": {
      const config = payload.config as RepoOSConfig;
      const overview = await repoGitOverviewAsync(config.root);
      const result = await resolveWorktreeStatuses(config.root, payload.branches as string[], {
        baseBranch: overview.baseBranch,
        cache: new Map(payload.cache as Array<[string, WorktreeDirtyEntry]>),
        skipStatus: payload.skipStatus === true,
        worktrees: overview.worktrees,
        aheadCounts: overview.aheadCounts,
      });
      return {
        git: overviewToWire(overview),
        statuses: [...result.statuses],
        cache: [...result.cache],
        changed: result.changed,
      };
    }
    case "task-facts": {
      const config = payload.config as RepoOSConfig;
      const relPath = payload.relPath as string;
      const branch = typeof payload.branch === "string" ? payload.branch : null;
      const [commits, overview] = await Promise.all([
        lastCommitsForDirAsync(config.root, config.workDir),
        repoGitOverviewAsync(config.root),
      ]);
      let status: WorktreeStatus = { path: null, dirty: false };
      if (branch) {
        const resolved = await resolveWorktreeStatuses(config.root, [branch], {
          baseBranch: overview.baseBranch,
          worktrees: overview.worktrees,
          aheadCounts: overview.aheadCounts,
        });
        status = resolved.statuses.get(branch) ?? status;
      }
      const last = commits.get(relPath);
      return {
        lastCommit: last?.subject ?? null,
        lastCommitAt: last?.date ?? null,
        branchExists: branch ? overview.branches.has(branch) : false,
        worktreeExists: branch ? overview.worktrees.has(branch) : false,
        status,
      };
    }
    case "dependency-blockers": {
      const root = payload.root as string;
      const tasks = payload.tasks as Task[];
      return [...taskDependencyBlockersForAll(root, tasks)];
    }
    case "sweep": {
      const config = payload.config as RepoOSConfig;
      const report = sweepStaleWorktrees(config, {
        mode: payload.mode as GcMode,
        dryRun: payload.dryRun === true,
        activeJobIds: Array.isArray(payload.activeJobIds)
          ? new Set(payload.activeJobIds as string[])
          : undefined,
        tasks: payload.tasks as Task[] | undefined,
      });
      return {
        report,
        worktreeCount: payload.includeCount === true ? countWorktrees(config.root) : null,
      };
    }
    case "invalidate":
      invalidateGitReadCaches(payload.root as string);
      return null;
    default:
      throw new Error(`unknown git worker request: ${message.kind}`);
  }
}

let buffer = "";
let chain = Promise.resolve();
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  for (;;) {
    const newline = buffer.indexOf("\n");
    if (newline === -1) break;
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line) as RequestMessage;
    chain = chain.then(async () => {
      try {
        const value = await respond(message);
        process.stdout.write(`${JSON.stringify({ id: message.id, ok: true, value })}\n`);
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({ id: message.id, ok: false, error: (error as Error).message })}\n`,
        );
      }
    });
  }
});
process.stdin.on("end", () => {
  void chain.then(() => {
    process.exitCode = 0;
  });
});
