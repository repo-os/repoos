import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";
import type { Task } from "../src/types";

// Regression guard: the task drawer's Move to done button once passed the click
// event as the "Land anyway" reason, so every drawer click was refused with
// "Land anyway requires a reason of 1–1000 characters".

const EMPTY_COUNTS = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

class FakeEventSource {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {}
  addEventListener(): void {
    /* noop */
  }
  close(): void {
    /* noop */
  }
}

const task = {
  id: "0001",
  title: "Test task",
  type: "feature",
  status: "review",
  priority: "p2",
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
} as unknown as Task;

let doneCalls: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
  setActivePinia(createPinia());
  doneCalls = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/health"))
        return json({ ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running")) return json({ tasks: [] });
      if (url.includes("/done")) {
        doneCalls.push({ url, init });
        return json({ ok: true, merged: true, conflicts: [], ff: true });
      }
      throw new Error("unexpected fetch: " + url);
    }),
  );
});

describe("Move to done request body", () => {
  it("sends no body when no reason is given", async () => {
    const repo = useRepoStore();
    await repo.init();
    await repo.completeTask(task);
    expect(doneCalls).toHaveLength(1);
    expect(doneCalls[0]?.init?.body).toBeUndefined();
  });

  it("drops a click event or any other non-text reason instead of sending it", async () => {
    const repo = useRepoStore();
    await repo.init();
    const clickEvent = { isTrusted: true, type: "click" } as unknown as string;
    await repo.completeTask(task, { landAnywayReason: clickEvent });
    await repo.completeTask(task, { landAnywayReason: "   " });
    expect(doneCalls).toHaveLength(2);
    for (const call of doneCalls) expect(call.init?.body).toBeUndefined();
  });

  it("still sends a real Land anyway reason as text", async () => {
    const repo = useRepoStore();
    await repo.init();
    await repo.completeTask(task, { landAnywayReason: "accepted the known risk" });
    expect(JSON.parse(String(doneCalls[0]?.init?.body))).toEqual({
      landAnywayReason: "accepted the known risk",
    });
  });
});

describe("task drawer Move to done button", () => {
  it("calls moveToDone() without the click event", () => {
    const source = readFileSync(resolve(__dirname, "../src/components/TaskDrawer.vue"), "utf8");
    expect(source).not.toMatch(/@click="moveToDone"/);
    expect(source).toMatch(/@click="moveToDone\(\)"/);
  });
});
