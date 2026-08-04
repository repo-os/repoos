/**
 * The public library API. The CLI and (later) the Stage 2 server both go
 * through this facade. Reads are served from a freshly-built in-memory index;
 * mutations edit the underlying markdown file directly — the file is always the
 * source of truth, status is a frontmatter field, and files NEVER move folders.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { buildIndex, writeIndexCache } from "./indexer.js";
import { parseTask, serializeTask, recordChange, utcTimestamp, appendActivityEntry } from "./task.js";
import {
  commitNewFile as gitCommitNewFile,
  emptyGitInfo,
  type CommitNewFileResult,
} from "./git.js";
import {
  STATUSES,
  type RepoOSConfig,
  type RepoIndex,
  type Task,
  type Status,
} from "./types.js";

export interface CreateTaskInput {
  title: string;
  type?: string;
  status?: Status;
  priority?: string;
  area?: string;
  assignedTo?: string;
  createdBy?: string;
  branch?: string;
  body?: string;
}

export interface RepoOS {
  config: RepoOSConfig;
  /** Build a fresh index from the files on disk. */
  reindex(): RepoIndex;
  /** All tasks, optionally filtered by status. */
  getTasks(status?: Status): Task[];
  /** A single task by id, or null. */
  getTask(id: string): Task | null;
  /** Counts per status. */
  counts(): Record<Status, number>;
  /** Change a task's status (frontmatter edit; file stays put). */
  updateStatus(id: string, status: Status): Task;
  /** Update arbitrary known fields on a task. */
  updateTask(id: string, patch: Partial<Omit<Task, "git" | "absPath" | "path">>): Task;
  /** Create a new task file under workDir. Returns the created task. */
  createTask(input: CreateTaskInput): Task;
  /** Surgically commit a single new file (fail-soft; never touches other files). */
  commitNewFile(absPath: string, message: string): CommitNewFileResult;
}

const TASK_TEMPLATE = (t: Task) => `${serializeTask(t)}

## Problem

_What's broken or missing? Why does it matter?_

## Desired UX

_What should the end experience be?_

## Acceptance criteria

- [ ] ...

## Notes for AI

_Constraints, files to touch, things NOT to do._
`;

export function createRepoOS(root?: string): RepoOS {
  const config = loadConfig(root);

  function freshIndex(): RepoIndex {
    return buildIndex(config);
  }

  function findFile(id: string): Task | null {
    const idx = freshIndex();
    return idx.tasks.find((t) => t.id === id) ?? null;
  }

  function nextId(idx: RepoIndex): string {
    let max = 0;
    for (const t of idx.tasks) {
      const n = parseInt(t.id, 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return String(max + 1).padStart(4, "0");
  }

  function rewrite(task: Task, entry?: string): Task {
    if (entry) recordChange(task, entry);
    else task.updated_at = utcTimestamp();
    writeFileSync(task.absPath, serializeTask(task));
    // refresh cache opportunistically; ignore failures
    try {
      writeIndexCache(config, freshIndex());
    } catch {
      /* cache is best-effort */
    }
    return task;
  }

  return {
    config,

    reindex() {
      const idx = freshIndex();
      try {
        writeIndexCache(config, idx);
      } catch {
        /* best-effort */
      }
      return idx;
    },

    getTasks(status?: Status) {
      const idx = freshIndex();
      return status ? idx.tasks.filter((t) => t.status === status) : idx.tasks;
    },

    getTask(id: string) {
      return findFile(id);
    },

    counts() {
      return freshIndex().counts;
    },

    updateStatus(id: string, status: Status) {
      if (!(STATUSES as readonly string[]).includes(status)) {
        throw new Error(
          `Invalid status "${status}". Valid: ${STATUSES.join(", ")}`,
        );
      }
      const task = findFile(id);
      if (!task) throw new Error(`Task #${id} not found.`);
      const old = task.status;
      task.status = status;
      return rewrite(task, old === status ? undefined : `status ${old}→${status}`);
    },

    updateTask(id, patch) {
      const task = findFile(id);
      if (!task) throw new Error(`Task #${id} not found.`);
      const changed = Object.keys(patch).filter((k) => {
        const v = (patch as Record<string, unknown>)[k];
        return v !== undefined && v !== (task as unknown as Record<string, unknown>)[k];
      });
      Object.assign(task, patch);
      const summary = changed.length ? `updated ${changed.join(", ")}` : "updated";
      return rewrite(task, summary);
    },

    createTask(input: CreateTaskInput) {
      const idx = freshIndex();
      const id = nextId(idx);
      const slug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      const workDir = join(config.root, config.workDir);
      if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
      const fileName = `${id}-${slug || "task"}.md`;
      const absPath = join(workDir, fileName);

      const ts = utcTimestamp();
      const task: Task = {
        id,
        title: input.title,
        type: input.type ?? "feature",
        status: input.status ?? config.defaultStatus,
        priority: input.priority ?? "p2",
        area: input.area ?? "general",
        assignee:
          (input.assignedTo ?? "").toLowerCase() === "ai" ? "ai" : "unassigned",
        assignedTo: input.assignedTo ?? "",
        createdBy: input.createdBy ?? "",
        branch: input.branch ?? "",
        tags: [],
        created_at: ts,
        updated_at: ts,
        path: join(config.workDir, fileName).split("\\").join("/"),
        absPath,
        body: appendActivityEntry(
          input.body ?? "",
          `- ${ts} · created · ${input.createdBy || "unknown"}`,
        ),
        extra: {},
        git: emptyGitInfo(),
      };

      const content = input.body
        ? serializeTask(task)
        : TASK_TEMPLATE(task);
      writeFileSync(absPath, content);
      try {
        writeIndexCache(config, freshIndex());
      } catch {
        /* best-effort */
      }
      // re-read so derived fields (title from body etc.) are consistent
      return (
        parseTask({
          content: readFileSync(absPath, "utf8"),
          absPath,
          root: config.root,
          defaultStatus: config.defaultStatus,
          defaultAssignee: config.defaultAssignee,
        }) ?? task
      );
    },

    commitNewFile(absPath: string, message: string) {
      return gitCommitNewFile(config.root, absPath, message);
    },
  };
}

export * from "./types.js";
export { loadConfig, findRepoRoot } from "./config.js";
