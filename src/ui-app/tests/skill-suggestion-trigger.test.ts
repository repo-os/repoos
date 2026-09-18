/**
 * #0405 — the skill-suggestion pass is wired to the review transition.
 *
 * Drives the real HTTP server against a fixture repo and a fake `opencode`
 * that answers the review prompt with a report and the skill-analysis prompt
 * with a JSON draft. The task's session transcript is seeded on disk so the
 * pass has something to analyse (the fixture never runs a real engineer).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";

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

/** Fake opencode: a review report for review missions, JSON for skill ones. */
const FAKE = `
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
const mission = process.argv.join(" ");
if (mission.includes("worth capturing as a reusable skill")) {
  process.stdout.write(JSON.stringify({
    skill: {
      name: "Audit a failing build",
      description: "Use when the build is red and the cause is unclear.",
      body: "# Audit a failing build\\n\\n## Procedure\\n1. Run the build."
    },
    additional: [{ name: "Rotate credentials", description: "Only if a key leaked." }]
  }) + "\\n");
} else {
  process.stdout.write("## Verdict\\ngood to go — fine.\\n\\n## Bugs\\n- none found\\n");
}
`;

function makeFixture(repoosToml?: string): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-skilltrig-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(bin, "opencode"), `#!/usr/bin/env node\n${FAKE}`, { mode: 0o755 });
  if (repoosToml !== undefined) writeFileSync(join(root, "repoos.toml"), repoosToml);
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

/** Write a minimal persisted transcript so the pass has a session to analyse. */
function seedTranscript(root: string, taskId: string): void {
  const dir = join(root, ".repoos", "sessions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${taskId}.json`),
    JSON.stringify({
      version: 1,
      lines: [
        { type: "text", text: "Inspected the failing build, fixed the config, re-ran it." },
        { type: "tool", tool: "bash", input: "bun run build", output: "ok" },
      ],
      engine: "opencode",
      updatedAt: new Date().toISOString(),
    }),
  );
}

async function taskWithWorktree(
  server: ServerHandle,
  fx: Fixture,
  title: string,
): Promise<{ id: string; absPath: string; branch: string }> {
  const created = await api(server, "POST", "/api/tasks", { title, status: "active" });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const branch = `feat/${id}-skill`;
  const worktree = join(fx.worktrees, branch);
  git(fx.root, ["worktree", "add", "-q", "-b", branch, worktree]);
  writeFileSync(join(worktree, "implementation.txt"), "implemented\n");
  const patched = await api(server, "PATCH", `/api/tasks/${id}`, { branch });
  expect(patched.status).toBe(200);
  return { id, absPath: created.body.absPath as string, branch };
}

/** Poll the task list for the (fire-and-forget) suggestion task. */
async function findSuggestion(server: ServerHandle): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const list = await api(server, "GET", "/api/tasks");
    const suggestion = (list.body as unknown as Array<Record<string, unknown>>).find((t) =>
      String(t.title).startsWith("New Skill Suggestion:"),
    );
    if (suggestion) return suggestion;
    if (Date.now() > deadline) throw new Error("timed out waiting for a skill suggestion task");
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function withServer(fx: Fixture, fn: (server: ServerHandle) => Promise<void>): Promise<void> {
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

describe("skill-suggestion trigger (#0405)", () => {
  it("creates one spec suggestion task when a task lands in review", async () => {
    const fx = makeFixture();
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do a multi-step thing");
      seedTranscript(fx.root, task.id);

      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });

      const suggestion = await findSuggestion(server);
      expect(suggestion.title).toBe("New Skill Suggestion: Audit a failing build");
      expect(suggestion.type).toBe("spec");
      expect(suggestion.status).toBe("inbox");
      expect(suggestion.assignedTo).toBe("human");
      expect(String(suggestion.body)).toContain("Rotate credentials");
      expect(String(suggestion.body)).toContain("skills/audit-a-failing-build/SKILL.md");

      // The originating task carries the link the review drawer renders.
      expect(readFileSync(task.absPath, "utf8")).toMatch(
        new RegExp(`^skill_suggestion: "?${suggestion.id}"?$`, "m"),
      );
    });
  }, 60_000);

  it("creates nothing when skill suggestions are disabled", async () => {
    const fx = makeFixture("skillSuggestions = false\n");
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do not suggest for me");
      seedTranscript(fx.root, task.id);

      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });

      // Give the review trigger the same window as the enabled case.
      await new Promise((r) => setTimeout(r, 2000));
      const list = await api(server, "GET", "/api/tasks");
      const suggestion = (list.body as unknown as Array<Record<string, unknown>>).find((t) =>
        String(t.title).startsWith("New Skill Suggestion:"),
      );
      expect(suggestion).toBeUndefined();
      expect(readFileSync(task.absPath, "utf8")).not.toContain("skill_suggestion");
    });
  }, 60_000);

  it("does not run the pass without a session transcript", async () => {
    const fx = makeFixture();
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "No transcript here");
      // No seedTranscript: the engineer session is empty.

      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      // The review still runs; only the suggestion pass is skipped.
      const reportFile = join(fx.root, ".repoos", "reviews", `${task.id}.md`);
      const deadline = Date.now() + 15_000;
      while (!existsSync(reportFile)) {
        if (Date.now() > deadline) throw new Error("timed out waiting for the review report");
        await new Promise((r) => setTimeout(r, 50));
      }
      await new Promise((r) => setTimeout(r, 1000));

      const list = await api(server, "GET", "/api/tasks");
      const suggestion = (list.body as unknown as Array<Record<string, unknown>>).find((t) =>
        String(t.title).startsWith("New Skill Suggestion:"),
      );
      expect(suggestion).toBeUndefined();
    });
  }, 60_000);
});
