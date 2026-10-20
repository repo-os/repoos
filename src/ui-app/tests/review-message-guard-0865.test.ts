/**
 * #0865 — engineer messages vs in-flight review, and handoff deferral when a
 * queue survives the end of an engineer turn.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { AgentRunner } from "../../server/agents";
import { parseTask } from "../../core/task";
import type { Agent, RepoOSConfig } from "../../core/types";
import { waitFor } from "./helpers";

const printReport = [
  "## Verdict",
  "good to go — fine.",
  "",
  "## Relevance",
  "still relevant — ok.",
  "",
  "## Bugs",
  "- none",
  "",
  "## Edge cases",
  "- none",
  "",
  "## Suggestions",
  "- none",
].join("\n");

interface Fixture {
  root: string;
  bin: string;
  log: string;
  worktrees: string;
  clean: () => void;
}

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

function makeReviewFixture(reviewBody = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-0865-review-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(bin, "opencode"),
    `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
${reviewBody}
`,
    { mode: 0o755 },
  );
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  const worktrees = join(dirname(root), `${basename(root)}-worktrees`);
  return {
    root,
    bin,
    log: join(root, "spawns.log"),
    worktrees,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktrees, { recursive: true, force: true });
    },
  };
}

async function api(
  server: ServerHandle,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function taskWithWorktree(
  server: ServerHandle,
  fx: Fixture,
  title: string,
): Promise<{ id: string; absPath: string }> {
  const created = await api(server, "POST", "/api/tasks", { title, status: "active" });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const branch = `feat/${id}-0865`;
  const worktree = join(fx.worktrees, branch);
  git(fx.root, ["worktree", "add", "-q", "-b", branch, worktree]);
  writeFileSync(join(worktree, "implementation.txt"), "ok\n");
  const patched = await api(server, "PATCH", `/api/tasks/${id}`, { branch });
  expect(patched.status).toBe(200);
  return { id, absPath: created.body.absPath as string };
}

async function requestReview(server: ServerHandle, id: string): Promise<void> {
  const res = await api(server, "PATCH", `/api/tasks/${id}`, {
    status: "review",
    skipChecks: true,
  });
  expect(res.status).toBe(202);
  const deadline = Date.now() + 30_000;
  while ((await api(server, "GET", `/api/tasks/${id}`)).body.status !== "review") {
    if (Date.now() > deadline) throw new Error("timed out waiting for review");
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function waitForReviewRunning(
  server: ServerHandle,
  id: string,
  running: boolean,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (true) {
    const res = await fetch(`${server.url}/api/tasks/${id}/review`);
    const body = (await res.json()) as { running?: boolean };
    if (body.running === running) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for review running=${running}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function withReviewServer(
  fx: Fixture,
  fn: (server: ServerHandle) => Promise<void>,
): Promise<void> {
  const oldPath = process.env.PATH ?? "";
  process.env.PATH = `${fx.bin}:${oldPath}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
  const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    process.env.PATH = oldPath;
    delete process.env.REPOOS_FAKEBIN_LOG;
    await server.close();
    fx.clean();
  }
}

function engineerConfig(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    maxConcurrentAgents: 1,
  };
}

const engineerAgent: Agent = {
  name: "engineer",
  cli: "qwen code",
  model: "default",
  enabled: true,
};

function setupTaskFile(root: string, id: string, status = "active"): string {
  const workDir = join(root, "work");
  mkdirSync(workDir, { recursive: true });
  const absPath = join(workDir, `${id}-test.md`);
  writeFileSync(
    absPath,
    `---
id: "${id}"
title: Test
type: feature
status: ${status}
priority: p2
area: web
assigned_to: ai
created_by: test
---
## Problem

Body.

## Activity

- 2026-01-01T00:00:00Z · created · test
`,
  );
  return absPath;
}

describe("review message and handoff guards (#0865)", () => {
  it("accepts POST /message during an in-flight review, cancels the review, and records the interrupt", async () => {
    const slowReview = `setTimeout(() => { process.stdout.write(${JSON.stringify(printReport)} + "\\n"); }, 3000);`;
    const fx = makeReviewFixture(slowReview);
    await withReviewServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Message during review");
      const started = await api(server, "POST", `/api/tasks/${task.id}/start`);
      expect(started.status, JSON.stringify(started.body)).toBe(200);
      await requestReview(server, task.id);
      await waitForReviewRunning(server, task.id, true);

      const sent = await api(server, "POST", `/api/tasks/${task.id}/message`, {
        text: "Fix the finding before the next review",
      });
      expect(sent.status, JSON.stringify(sent.body)).toBe(200);
      expect(sent.body.ok).toBe(true);

      const file = readFileSync(task.absPath, "utf8");
      expect(file).toMatch(/^status: active$/m);
      expect(file).toContain("message interrupts in-flight review — delivering to engineer first");
      expect(file).toContain("follow-up message — moved from review to active");

      await waitForReviewRunning(server, task.id, false);
    });
  }, 90_000);

  it("delivers a queued message after a crashed engineer turn (no handoff signal)", async () => {
    const fx = mkdtempSync(join(tmpdir(), "repoos-0865-crash-"));
    const bin = join(fx, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "qwen"),
      `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, (process.env.REPOOS_TASK_ID || "crash") + "\\n");
process.stderr.write("boom\\n");
process.exit(1);
`,
      { mode: 0o755 },
    );
    const log = join(fx, "spawns.log");
    const absPath = setupTaskFile(fx, "crash", "active");
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${bin}:${oldPath}`;
    process.env.REPOOS_FAKEBIN_LOG = log;
    const runner = new AgentRunner(engineerConfig(fx), () => {}, {
      getTask: () =>
        parseTask({
          content: readFileSync(absPath, "utf8"),
          absPath,
          root: fx,
          defaultStatus: "inbox",
          defaultAssignee: "unassigned",
        }),
    });
    const t = {
      id: "crash",
      title: "Test",
      type: "feature",
      status: "active",
      priority: "p2",
      area: "web",
      assignee: "ai",
      assignedTo: "ai",
      createdBy: "",
      branch: "feat/crash",
      tags: [],
      needsInput: false,
      needsMerge: false,
      noSourceChange: false,
      created_at: null,
      updated_at: null,
      path: "work/crash-test.md",
      absPath,
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
    } as import("../../core/types").Task;

    try {
      expect(runner.start(t, "feat/crash", engineerAgent, { cwd: bin }).ok).toBe(true);
      expect(runner.send(t.id, "survives the crash", engineerAgent).queued).toBe(true);
      await waitFor(() => !runner.isRunning(t.id), "engineer turn to end", 10_000);
      expect(readFileSync(absPath, "utf8")).not.toContain("handoff_deferred");
      await waitFor(
        () => existsSync(log) && readFileSync(log, "utf8").trim().split("\n").length >= 2,
        "queued message delivered on a fresh turn",
        10_000,
      );
      expect(runner.hasQueuedMessages(t.id)).toBe(false);
      expect(readFileSync(absPath, "utf8")).toContain("message_delivered");
    } finally {
      runner.dispose();
      process.env.PATH = oldPath;
      delete process.env.REPOOS_FAKEBIN_LOG;
      rmSync(fx, { recursive: true, force: true });
    }
  }, 60_000);
});
