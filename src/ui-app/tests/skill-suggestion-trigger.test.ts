/**
 * #0429 — the evidence-gated skill-suggestion pass is wired to the `done`
 * transition only.
 *
 * Drives the real HTTP server against a fixture repo and a fake `opencode` that
 * answers the review prompt with a report and the skill-analysis prompt with a
 * JSON verdict. The task's session transcript is seeded on disk so the pass has
 * something to analyse (the fixture never runs a real engineer).
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
if (mission.includes("reusable SKILL")) {
  if (process.env.REPOOS_FAKEBIN_SKILL === "reject") {
    process.stdout.write(JSON.stringify({
      eligible: false,
      category: "one-off-edit",
      rejectReason: "a one-off edit, not a skill",
      skill: null,
      additional: []
    }) + "\\n");
  } else {
    process.stdout.write(JSON.stringify({
      eligible: true,
      category: "reusable-workflow",
      skill: {
        key: "audit-a-failing-build",
        name: "Audit a failing build",
        description: "Use when the build is red and the cause is unclear.",
        trigger: "The build is red and the cause is unclear.",
        insufficientWhy: "A single test cannot cover every build failure mode.",
        externalWorkflow: false,
        externalWorkflowName: "",
        body: "# Audit a failing build\\n\\n## Procedure\\n1. Run the build."
      },
      additional: [{ name: "Rotate credentials", description: "Only if a key leaked." }]
    }) + "\\n");
  }
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

/** Pre-seed the internal candidate store with a corroborating first session. */
function seedCandidate(root: string, taskId: string): void {
  const dir = join(root, ".repoos");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "skill-candidates.json"),
    JSON.stringify({
      "audit-a-failing-build": {
        key: "audit-a-failing-build",
        canonicalKey: "audit-a-failing-build",
        aliases: ["audit-a-failing-build"],
        name: "Audit a failing build",
        description: "Use when the build is red.",
        body: "# Audit a failing build\n\n1. Run the build.",
        trigger: "The build is red.",
        insufficientRationale: "A single test cannot cover every build failure mode.",
        externalWorkflow: false,
        externalWorkflowName: "",
        sourceTaskIds: [taskId],
        additional: [],
        firstSeenAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    }),
  );
}

function readCandidates(root: string): Record<string, { sourceTaskIds?: string[] }> {
  try {
    return JSON.parse(
      readFileSync(join(root, ".repoos", "skill-candidates.json"), "utf8"),
    ) as Record<string, { sourceTaskIds?: string[] }>;
  } catch {
    return {};
  }
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

/** Flip the task file on disk to `done`, letting the server's watcher see it. */
function driveToDone(absPath: string): void {
  const content = readFileSync(absPath, "utf8").replace(/^status: .*$/m, "status: done");
  writeFileSync(absPath, content);
}

async function waitFor(predicate: () => boolean, timeoutMs: number, label: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function findSuggestion(
  server: ServerHandle,
  timeoutMs = 20_000,
): Promise<Record<string, unknown> | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const list = await api(server, "GET", "/api/tasks");
    const suggestion = (list.body as unknown as Array<Record<string, unknown>>).find((t) =>
      String(t.title).startsWith("New Skill Suggestion:"),
    );
    if (suggestion) return suggestion;
    if (Date.now() > deadline) return undefined;
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function withServer(fx: Fixture, fn: (server: ServerHandle) => Promise<void>): Promise<void> {
  const oldPath = process.env.PATH ?? "";
  const oldMode = process.env.REPOOS_FAKEBIN_SKILL;
  process.env.PATH = `${fx.bin}:${oldPath}`;
  process.env.REPOOS_FAKEBIN_LOG = fx.log;
  const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    process.env.PATH = oldPath;
    delete process.env.REPOOS_FAKEBIN_LOG;
    if (oldMode === undefined) delete process.env.REPOOS_FAKEBIN_SKILL;
    else process.env.REPOOS_FAKEBIN_SKILL = oldMode;
    await server.close();
    fx.clean();
  }
}

describe("skill-suggestion lifecycle (#0429)", () => {
  it("does not run the suggestion pass on the review transition", async () => {
    const fx = makeFixture("skillSuggestions = true\n");
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do a multi-step thing");
      seedTranscript(fx.root, task.id);

      // #0507: a move into `review` is a request that runs the handoff
      // finalization. `skipChecks` keeps this fixture from shelling out to a
      // real `repoos check`; the review-triggered skill pass under test is
      // unaffected by which check path ran.
      const moved = await api(server, "PATCH", `/api/tasks/${task.id}`, {
        status: "review",
        skipChecks: true,
      });
      expect(moved.status).toBe(202);
      // The finalization is what moves the task, so the review (and therefore
      // the transition this test is about) only happens after it lands.
      await waitFor(
        () => /^status: review$/m.test(readFileSync(task.absPath, "utf8")),
        15_000,
        "the handoff finalization to move the task to review",
      );

      // The review itself must still run…
      const reportFile = join(fx.root, ".repoos", "reviews", `${task.id}.md`);
      await waitFor(() => existsSync(reportFile), 15_000, "the review report");
      // …but the skill pass must not: no candidate, no suggestion task.
      await new Promise((r) => setTimeout(r, 1000));
      expect(Object.keys(readCandidates(fx.root))).toHaveLength(0);
      expect(await findSuggestion(server, 500)).toBeUndefined();
    });
  }, 60_000);

  it("persists a first candidate but creates no task on a single completed session", async () => {
    const fx = makeFixture("skillSuggestions = true\n");
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do a multi-step thing");
      seedTranscript(fx.root, task.id);
      driveToDone(task.absPath);

      await waitFor(
        () => Boolean(readCandidates(fx.root)["audit-a-failing-build"]),
        15_000,
        "the persisted candidate",
      );
      expect(readCandidates(fx.root)["audit-a-failing-build"]?.sourceTaskIds).toEqual([task.id]);
      expect(await findSuggestion(server, 1000)).toBeUndefined();
      expect(readFileSync(task.absPath, "utf8")).not.toContain("skill_suggestion");
    });
  }, 60_000);

  it("creates one task once a second independent session corroborates", async () => {
    const fx = makeFixture("skillSuggestions = true\n");
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do a multi-step thing");
      seedTranscript(fx.root, task.id);
      seedCandidate(fx.root, "0410");
      driveToDone(task.absPath);

      const suggestion = await findSuggestion(server);
      expect(suggestion).toBeDefined();
      expect(suggestion?.title).toBe("New Skill Suggestion: Audit a failing build");
      expect(suggestion?.type).toBe("spec");
      expect(suggestion?.status).toBe("inbox");
      expect(suggestion?.assignedTo).toBe("human");
      const body = String(suggestion?.body);
      expect(body).toContain("#0410");
      expect(body).toContain(task.id);
      expect(body).toContain("A single test cannot cover every build failure mode.");

      // The originating task carries the link the review drawer renders.
      expect(readFileSync(task.absPath, "utf8")).toMatch(
        new RegExp(`^skill_suggestion: "?${suggestion?.id}"?$`, "m"),
      );
    });
  }, 60_000);

  it("creates nothing for a rejected candidate", async () => {
    const fx = makeFixture("skillSuggestions = true\n");
    await withServer(fx, async (server) => {
      process.env.REPOOS_FAKEBIN_SKILL = "reject";
      const task = await taskWithWorktree(server, fx, "Do a multi-step thing");
      seedTranscript(fx.root, task.id);
      driveToDone(task.absPath);

      await new Promise((r) => setTimeout(r, 1500));
      expect(Object.keys(readCandidates(fx.root))).toHaveLength(0);
      expect(await findSuggestion(server, 500)).toBeUndefined();
    });
  }, 60_000);

  it("creates nothing when skill suggestions are disabled", async () => {
    const fx = makeFixture("skillSuggestions = false\n");
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do not suggest for me");
      seedTranscript(fx.root, task.id);
      seedCandidate(fx.root, "0410");
      driveToDone(task.absPath);

      await new Promise((r) => setTimeout(r, 1500));
      expect(await findSuggestion(server, 500)).toBeUndefined();
      expect(readFileSync(task.absPath, "utf8")).not.toContain("skill_suggestion");
    });
  }, 60_000);
});
