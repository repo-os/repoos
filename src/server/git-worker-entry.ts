import type { RepoOSConfig, Task } from "../core/types.js";
import {
  invalidateGitReadCaches,
  lastCommitsForDirAsync,
  repoGitOverviewAsync,
  resolveWorktreeStatuses,
  branchChangesSinceBase,
  changedPathsVsBase,
  type RepoGitOverview,
  type WorktreeDirtyEntry,
  type WorktreeStatus,
  runGit,
  preflightMerge,
  removeWorktree,
  commitTaskFile,
  worktreePathForBranchAsync,
} from "../core/git.js";
import { buildIndexDetailedAsync } from "../core/indexer.js";
import { taskDependencyBlockersForAll } from "../core/task-dependencies.js";
import { countWorktrees, sweepStaleWorktrees, type GcMode } from "../core/worktree-gc.js";
import { setGitCallSink } from "../core/git-inflight.js";
import { availableMemBytes } from "../core/sysmem.js";
import { pressureSnapshotForDisplay } from "../core/pressure-guard.js";
import { heavyJobCounts } from "../core/cross-process-slots.js";
import { ensureCanaryReadyForTask } from "../core/canary-repo.js";
import { writeProjectEnvironmentValue } from "../core/project-environments.js";

setGitCallSink((event) => {
  process.stdout.write(`${JSON.stringify({ type: "git-call", ...event })}\n`);
});

interface RequestMessage {
  id: number;
  generation: number;
  kind: string;
  payload: Record<string, unknown>;
}

const overviewCache = new Map<string, RepoGitOverview>();

async function gitOverview(root: string): Promise<RepoGitOverview> {
  const cached = overviewCache.get(root);
  if (cached) return cached;
  const overview = await repoGitOverviewAsync(root);
  overviewCache.set(root, overview);
  return overview;
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
    case "preflight-merge":
      return preflightMerge(
        payload.root as string,
        payload.branch as string,
        payload.opts as { autoResolve?: string[] },
      );
    case "remove-worktree":
      return removeWorktree(payload.root as string, payload.branch as string);
    case "commit-task-file":
      return commitTaskFile(
        payload.root as string,
        payload.path as string,
        payload.message as string,
      );
    case "branch-changes":
      return branchChangesSinceBase(payload.cwd as string, payload.baseBranch as string);
    case "changed-paths":
      return changedPathsVsBase(payload.cwd as string, payload.baseBranch as string);
    case "worktree-path":
      return worktreePathForBranchAsync(payload.root as string, payload.branch as string);
    case "git-overview":
      return overviewToWire(await gitOverview(payload.root as string));
    case "run-git":
    case "git-command":
      return runGit(payload.cwd as string, payload.args as string[], payload.timeoutMs as number);
    case "directory-commits":
      return [
        ...(await lastCommitsForDirAsync(payload.root as string, payload.directory as string)),
      ];
    case "build-index": {
      const result = await buildIndexDetailedAsync(payload.config as RepoOSConfig, {
        fastWorktreeStatus: payload.fastWorktreeStatus === true,
      });
      overviewCache.set((payload.config as RepoOSConfig).root, result.git);
      return { index: result.index, git: overviewToWire(result.git) };
    }
    case "reconcile": {
      const config = payload.config as RepoOSConfig;
      const overview = await gitOverview(config.root);
      const result = await resolveWorktreeStatuses(config.root, payload.branches as string[], {
        baseBranch: overview.baseBranch,
        cache: new Map(payload.cache as Array<[string, WorktreeDirtyEntry]>),
        skipStatus: payload.skipStatus === true,
        forceStatus: payload.forceStatus === true,
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
        gitOverview(config.root),
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
    case "context-pack-facts": {
      const root = payload.root as string;
      const cwd = payload.cwd as string;
      const [head, status] = await Promise.all([
        runGit(root, ["rev-parse", "HEAD"], 4000),
        runGit(cwd, ["status", "--porcelain"], 4000),
      ]);
      const statusText = status.status === 0 ? status.stdout.trim() : "";
      const lines = statusText ? statusText.split("\n") : [];
      const dirty = lines.length > 0;
      let diffSummary = "";
      if (dirty) {
        const diff = await runGit(cwd, ["diff", "--stat"], 4000);
        if (diff.status === 0 && diff.stdout.trim()) {
          const diffLines = diff.stdout.trim().split("\n");
          const fileLines = diffLines.slice(0, -1).slice(0, 25);
          diffSummary = fileLines.join("\n");
          const summaryLine = diffLines[diffLines.length - 1] ?? "";
          if (diffSummary) diffSummary += `\n${summaryLine}`;
          else diffSummary = summaryLine;
        }
      }
      return {
        headHash: head.status === 0 ? head.stdout.trim() : "unknown",
        worktreeState: {
          dirty,
          untracked: lines
            .filter((line) => line.startsWith("??"))
            .slice(0, 20)
            .map((line) => line.slice(3).trim()),
          diffSummary,
        },
      };
    }
    case "ensure-canary-ready": {
      let detail: string | null = null;
      const ok = ensureCanaryReadyForTask(payload.config as RepoOSConfig, (message) => {
        detail = message;
      });
      return { ok, detail };
    }
    case "write-project-environment-value":
      return writeProjectEnvironmentValue(
        payload.root as string,
        payload.sourcePath as string,
        payload.key as string,
        payload.value as string | null,
        payload.expectedSha256 as string,
      );
    case "resource-snapshot":
      return {
        availableMemBytes: availableMemBytes(),
        pressure: pressureSnapshotForDisplay(payload.config as RepoOSConfig | undefined),
        heavyJobs: heavyJobCounts(payload.lockRoot as string),
      };
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
    case "invalidate": {
      const root = payload.root as string;
      invalidateGitReadCaches(root);
      overviewCache.delete(root);
      return null;
    }
    default:
      throw new Error(`unknown git worker request: ${message.kind}`);
  }
}

let buffer = "";
let chain = Promise.resolve();
let generation = -1;
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
        if (generation !== message.generation) {
          generation = message.generation;
          // Invalidation travels with the next queued request: it cannot expire
          // behind a slow history walk and leave the child serving stale facts.
          overviewCache.clear();
          invalidateGitReadCaches(process.cwd());
        }
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
