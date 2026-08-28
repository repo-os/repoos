import { nextTick } from "vue";
import type { Task } from "../src/types";

/**
 * Shared helpers for component tests that use Radix modals and async operations.
 * Centralizes test mocks to reduce duplication across test files.
 */

/** Standard empty task counts for API responses */
export const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };

/** Create a task object for testing with optional overrides */
export const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0001",
  title: "Test task",
  type: "bug",
  status: "ready",
  priority: "p1",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0001-test.md",
  absPath: "/tmp/repo/work/0001-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  automaticReview: { running: false, enabled: false },
  ...over,
});

/** Mock EventSource for testing event-driven updates */
export class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(ev: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(t: string, fn: (ev: { data: string }) => void): void {
    const list = this.listeners.get(t) ?? [];
    list.push(fn);
    this.listeners.set(t, list);
  }

  close(): void {
    /* noop */
  }
}

/** Create a mock fetch response JSON object */
export const json = async (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});

/** Flush Vue's nextTick queue to process async updates */
export async function flush(iterations = 8): Promise<void> {
  for (let i = 0; i < iterations; i++) await nextTick();
}
