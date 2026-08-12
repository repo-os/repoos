/**
 * The indexer. Walks the work directory, parses every task file, enriches with
 * best-effort git facts, sorts deterministically, and produces a RepoIndex.
 *
 * The index is DERIVED: it can be thrown away and rebuilt from files at any
 * time. It is written to <cacheDir>/index.json purely as a cache for fast reads
 * (and, later, for the Stage 2 server to serve without re-walking on every
 * request).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import {
  STATUSES,
  PRIORITIES,
  type RepoIndex,
  type RepoOSConfig,
  type Task,
  type Status,
} from "./types.js";
import { parseTask } from "./task.js";
import { parseDocument } from "./frontmatter.js";
import {
  isGitRepo,
  localBranches,
  lastCommitForFile,
  worktreeStatus,
  worktreePaths,
  emptyGitInfo,
} from "./git.js";

const INDEX_VERSION = 1;

function walkFiles(dir: string, exts: string[], acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, exts, acc);
    } else if (exts.includes(extname(entry))) {
      acc.push(full);
    }
  }
  return acc;
}

function priorityRank(p: string): number {
  const i = (PRIORITIES as readonly string[]).indexOf(p);
  return i === -1 ? PRIORITIES.length : i;
}
function statusRank(s: Status): number {
  return STATUSES.indexOf(s);
}

export function buildIndex(config: RepoOSConfig): RepoIndex {
  const workPath = join(config.root, config.workDir);
  const files = walkFiles(workPath, config.taskExtensions);

  const useGit = isGitRepo(config.root);
  const branches = useGit ? localBranches(config.root) : new Set<string>();
  const worktrees = useGit ? worktreePaths(config.root) : new Map<string, string>();

  let skippedTaskFiles = 0;
  const tasks: Task[] = files.flatMap((absPath) => {
    const content = readFileSync(absPath, "utf8");
    // Reject files with no explicit `id` in frontmatter — the API always sets
    // it, so a missing id means a human or AI agent hand-wrote the file. These
    // get an opaque derived id and would silently pollute the task list.
    const { data } = parseDocument(content);
    if (!("id" in data)) {
      skippedTaskFiles++;
      return [];
    }
    const base = parseTask({
      content,
      absPath,
      root: config.root,
      defaultStatus: config.defaultStatus,
      defaultAssignee: config.defaultAssignee,
      git: emptyGitInfo(),
    });
    if (useGit) {
      const { subject, date } = lastCommitForFile(config.root, base.path);
      const wt = base.branch
        ? worktreeStatus(config.root, base.branch)
        : { path: null, dirty: false };
      base.git = {
        branchExists: base.branch ? branches.has(base.branch) : false,
        worktreeExists: base.branch ? worktrees.has(base.branch) : false,
        lastCommit: subject,
        lastCommitAt: date,
        worktreePath: wt.path,
        dirty: wt.dirty,
      };
    }
    return [base];
  });
  if (skippedTaskFiles > 0) {
    console.warn(
      `[repoos] skipped ${skippedTaskFiles} task file(s) with no \`id\` in frontmatter — ` +
        `use the API (POST /api/tasks or PATCH /api/tasks/:id) instead of writing work/*.md directly`,
    );
  }

  tasks.sort((a, b) => {
    const s = statusRank(a.status) - statusRank(b.status);
    if (s !== 0) return s;
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;
    return a.id.localeCompare(b.id);
  });

  const counts = Object.fromEntries(
    STATUSES.map((s) => [s, 0]),
  ) as Record<Status, number>;
  for (const t of tasks) counts[t.status]++;

  return {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    root: config.root,
    taskCount: tasks.length,
    tasks,
    counts,
  };
}

export function indexCachePath(config: RepoOSConfig): string {
  return join(config.root, config.cacheDir, "index.json");
}

export function writeIndexCache(config: RepoOSConfig, index: RepoIndex): void {
  const dir = join(config.root, config.cacheDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  // Strip absPath/body from the cache to keep it small and portable; callers
  // that need them should read the file or rebuild in-memory.
  const slim: RepoIndex = {
    ...index,
    tasks: index.tasks.map((t) => ({ ...t, body: "", absPath: "" })),
  };
  writeFileSync(indexCachePath(config), JSON.stringify(slim, null, 2));
}

export function readIndexCache(config: RepoOSConfig): RepoIndex | null {
  const p = indexCachePath(config);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as RepoIndex;
  } catch {
    return null;
  }
}
