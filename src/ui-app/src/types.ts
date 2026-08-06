/** API-facing types for the RepoOS web UI. Mirrors src/core/types.ts. */

export type Status = "draft" | "inbox" | "ready" | "active" | "review" | "done";

export interface Task {
  id: string;
  title: string;
  type: string;
  status: Status;
  priority: string;
  area: string;
  assignee: "ai" | "human" | "unassigned";
  assignedTo: string;
  createdBy: string;
  branch: string;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  path: string;
  absPath: string;
  body: string;
  extra: Record<string, unknown>;
  git: { branchExists: boolean; lastCommit: string | null; lastCommitAt: string | null };
}

export interface Health {
  ok: boolean;
  root: string;
  taskCount: number;
  workDir: string;
}

export interface Counts {
  draft: number;
  inbox: number;
  ready: number;
  active: number;
  review: number;
  done: number;
}

export interface RepoIndex {
  version: number;
  generatedAt: string;
  root: string;
  taskCount: number;
  tasks: Task[];
  counts: Counts;
}

export type RepoEvent =
  | { type: "hello"; taskCount: number; at: string }
  | { type: "index.rebuilt"; taskCount: number; at: string }
  | { type: "task.created"; task: Task }
  | { type: "task.updated"; task: Task; prev?: Partial<Task> }
  | { type: "task.deleted"; id: string };

export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "boolean" | "select" | "array";
  tier: "live" | "restart" | "guarded";
  restartRequired: boolean;
  default: unknown;
  options?: { value: string; label: string }[];
  description: string;
}

/** An AI coding agent configured on the Agents page. */
export interface Agent {
  name: string;
  cli: string;
  model: string;
  enabled: boolean;
  instructions?: string;
}

/** Agent options served alongside /api/config. */
export interface AgentsMeta {
  clis: string[];
  models: string[];
  defaults: Agent[];
}

export interface DocMeta {
  path: string;
  title: string;
}
