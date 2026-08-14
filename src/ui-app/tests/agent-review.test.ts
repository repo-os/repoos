/**
 * 0101 — the review agent runs before human sign-off.
 *
 * A task landing in `review` gets an automatic, read-only agent review whose
 * short report is available to the human reviewer. The review agent supports
 * the sign-off; it never performs it, so the task stays in `review` and only a
 * human moves it to `done`.
 *
 * Drives the real HTTP server against a fixture git repo and a fake `opencode`
 * binary standing in for the review agent, so the assertions are about what
 * RepoOS actually spawns, writes, and serves — not about mocks.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { waitFor } from "./helpers";

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

/**
 * A fixture repo with a fake `opencode` on PATH. `body` is the JS the fake
 * runs after logging its argv — that is how each test scripts what the review
 * agent "does" (print a report, or misbehave).
 */
function makeFixture(body = ""): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-review-"));
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(
    join(bin, "opencode"),
    `#!/usr/bin/env node
const fs = require("fs");
fs.appendFileSync(process.env.REPOOS_FAKEBIN_LOG, JSON.stringify({ args: process.argv.slice(2) }) + "\\n");
${body}
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

/** A report the fake agent prints on stdout, as a real reviewer would. */
const REPORT = [
  "## Verdict",
  "The change is sound; nothing blocks sign-off.",
  "",
  "## Bugs",
  "- src/thing.ts: the empty-list case throws instead of returning [].",
  "",
  "## Edge cases",
  "- Two agents finishing at once.",
  "",
  "## Suggestions",
  "- Name the timeout constant.",
].join("\\n");

const printReport = `process.stdout.write(${JSON.stringify(REPORT)} + "\\n");`;

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

/** Spawn records written by the fake binary. */
function spawns(fx: Fixture): string[][] {
  if (!existsSync(fx.log)) return [];
  return readFileSync(fx.log, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => (JSON.parse(l) as { args: string[] }).args);
}

/** Create a task with a real worktree on its branch, ready to land in review. */
async function taskWithWorktree(
  server: ServerHandle,
  fx: Fixture,
  title: string,
): Promise<{ id: string; absPath: string; branch: string; worktree: string }> {
  const created = await api(server, "POST", "/api/tasks", { title, status: "active" });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  const branch = `feat/${id}-review`;
  const worktree = join(fx.worktrees, branch);
  git(fx.root, ["worktree", "add", "-q", "-b", branch, worktree]);
  const patched = await api(server, "PATCH", `/api/tasks/${id}`, { branch });
  expect(patched.status).toBe(200);
  return { id, absPath: created.body.absPath as string, branch, worktree };
}

interface ReviewResponse {
  ok: boolean;
  running: boolean;
  enabled: boolean;
  review: {
    id: string;
    at: string;
    agent: string;
    cli: string;
    branch: string;
    state: string;
    markdown: string;
  } | null;
  /** The reviewer conversation, isolated from the engineer session. */
  lines: Array<{ type?: string; s?: string; d?: string; text?: string }>;
}

async function getReview(server: ServerHandle, id: string): Promise<ReviewResponse> {
  const res = await fetch(`${server.url}/api/tasks/${id}/review`);
  return (await res.json()) as ReviewResponse;
}

async function waitForReviewRunning(server: ServerHandle, id: string, running: boolean): Promise<void> {
  const deadline = Date.now() + 10_000;
  while ((await getReview(server, id)).running !== running) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for review running=${running}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Async poll for an observable outcome (the reviewer runs are fire-and-forget). */
async function waitForAsync(fn: () => Promise<boolean>, label: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!(await fn())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Run `fn` with the fixture's fake binaries on PATH and the server booted. */
async function withServer(
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
    delete process.env.REPOOS_FAKEBIN_TASKFILE;
    await server.close();
    fx.clean();
  }
}

describe("agent review before human sign-off (#0101)", () => {
  it("reviews the implementation when a task lands in review and stores the report", async () => {
    const fx = makeFixture(printReport);
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Review me");

      const patched = await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      expect(patched.status).toBe(200);

      const reportFile = join(fx.root, ".repoos", "reviews", `${task.id}.md`);
      await waitFor(() => existsSync(reportFile), "the review report is written");

      // The agent was pointed at the task's own worktree, with permission
      // gating resolved — a prompt nobody can answer would hang the review.
      const args = spawns(fx).find((a) => a.includes("--dir"));
      expect(args).toBeDefined();
      // realpath-normalized: on macOS the fixture's /var path is git's
      // /private/var path, and the review still runs in the right worktree.
      expect(realpathSync(args![args!.indexOf("--dir") + 1])).toBe(realpathSync(task.worktree));
      expect(args).toContain("--auto");

      // The mission asks for the things a human needs at sign-off, and draws
      // the line the review agent must not cross.
      const mission = args!.join(" ");
      expect(mission).toContain("Review me");
      expect(mission).toMatch(/bugs/i);
      expect(mission).toMatch(/edge case/i);
      expect(mission).toMatch(/suggestion/i);
      expect(mission).toMatch(/NEVER move it to `done`/);
      expect(mission).toMatch(/Do NOT edit, create, or delete ANY file/);

      // The report is on disk and served to the human reviewer.
      const stored = readFileSync(reportFile, "utf8");
      expect(stored).toContain("## Verdict");
      expect(stored).toContain("the empty-list case throws");
      const served = await getReview(server, task.id);
      expect(served.ok).toBe(true);
      expect(served.enabled).toBe(true);
      expect(served.review?.state).toBe("ok");
      expect(served.review?.branch).toBe(task.branch);
      expect(served.review?.markdown).toContain("## Suggestions");

      // The review leaves the task exactly where the human needs it.
      expect(readFileSync(task.absPath, "utf8")).toMatch(/^status: review$/m);
      const after = await api(server, "GET", `/api/tasks/${task.id}`);
      expect(after.body.status).toBe("review");
    });
  });

  it("runs no review when the review agent is disabled on the Agents page", async () => {
    const fx = makeFixture(printReport);
    writeFileSync(
      join(fx.root, "repoos.toml"),
      [
        "[[agents]]",
        'name = "engineer"',
        'cli = "opencode"',
        'model = "default"',
        "enabled = true",
        "[[agents]]",
        'name = "reviewer"',
        'cli = "opencode"',
        'model = "default"',
        "enabled = false",
      ].join("\n"),
    );
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Do not review me");

      const patched = await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      expect(patched.status).toBe(200);

      // Give the trigger the same window the enabled case needs to spawn.
      await new Promise((r) => setTimeout(r, 750));
      expect(spawns(fx)).toEqual([]);
      expect(existsSync(join(fx.root, ".repoos", "reviews", `${task.id}.md`))).toBe(false);

      const served = await getReview(server, task.id);
      expect(served.enabled).toBe(false);
      expect(served.review).toBeNull();

      // "Review again" surfaces the same disabled gate instead of quietly doing nothing.
      const again = await api(server, "POST", `/api/tasks/${task.id}/review/again`);
      expect(again.status).toBe(400);
      expect(again.body.error).toMatch(/disabled/i);
    });
  });

  it("puts the task back in review if the review agent moves it to done", async () => {
    // A review agent that oversteps: it marks the task done before reporting.
    const fx = makeFixture(
      `const f = process.env.REPOOS_FAKEBIN_TASKFILE;
fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/^status: review$/m, "status: done"));
${printReport}`,
    );
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Overstepping reviewer");
      process.env.REPOOS_FAKEBIN_TASKFILE = task.absPath;

      const patched = await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      expect(patched.status).toBe(200);

      await waitFor(
        () => existsSync(join(fx.root, ".repoos", "reviews", `${task.id}.md`)),
        "the review report is written",
      );
      await waitFor(
        () => /^status: review$/m.test(readFileSync(task.absPath, "utf8")),
        "the task is put back in review",
      );

      // And it stays there: the revert must not trigger another review that
      // would move it to done again.
      await new Promise((r) => setTimeout(r, 750));
      expect(readFileSync(task.absPath, "utf8")).toMatch(/^status: review$/m);
      expect(spawns(fx).filter((a) => a.includes("--dir")).length).toBe(1);
    });
  });

  it("records the failure when the review agent produces nothing", async () => {
    const fx = makeFixture(`process.stderr.write("boom\\n"); process.exit(3);`);
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Failing reviewer");

      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      await waitFor(
        () => existsSync(join(fx.root, ".repoos", "reviews", `${task.id}.md`)),
        "the failure is recorded",
      );

      const served = await getReview(server, task.id);
      expect(served.review?.state).toBe("failed");
      expect(served.review?.markdown).toContain("boom");
      // A failed review never blocks or moves the human's task.
      expect(readFileSync(task.absPath, "utf8")).toMatch(/^status: review$/m);
    });
  });

  it("rejects move-to-done while automatic review is still running without cancelling it", async () => {
    // The fake reviewer must outlive the 409 assertions below, and the index
    // must observe it running, so it may not finish early. This was flaky at
    // 500ms: under full-suite load the review completed between the
    // `/review` poll and the `/api/index` read, so `running` flipped to false
    // and the assertion below failed (0199).
    const fx = makeFixture(`setTimeout(() => { ${printReport} }, 3000);`);
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Wait for reviewer");
      // The review's process itself is the authoritative in-flight signal;
      // wait for it so this assertion cannot race the trigger.
      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      await waitForReviewRunning(server, task.id, true);

      // `/api/index` is rebuilt asynchronously after the review starts, so the
      // running flag may not be visible on the first read. Poll until the
      // index itself reports the review running instead of asserting once —
      // the review stays alive for 3s, so the window cannot close early.
      let indexed: Record<string, unknown> | undefined;
      const deadline = Date.now() + 10_000;
      while (true) {
        const index = await api(server, "GET", "/api/index");
        indexed = (index.body.tasks as Array<Record<string, unknown>>).find((t) => t.id === task.id);
        if ((indexed?.automaticReview as { running?: boolean } | undefined)?.running === true) break;
        if (Date.now() > deadline) throw new Error("timed out waiting for task index to report review running");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(indexed?.automaticReview).toEqual({ running: true, enabled: true });

      const blocked = await api(server, "POST", `/api/tasks/${task.id}/done`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toMatch(/automatic review to finish/i);
      expect(readFileSync(task.absPath, "utf8")).toMatch(/^status: review$/m);

      // Drag/drop uses PATCH today in older clients. The server must give that
      // route the same 409 rather than silently cancelling the reviewer and
      // turning the task into done.
      const dragged = await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "done" });
      expect(dragged.status).toBe(409);
      expect(dragged.body.error).toMatch(/automatic review to finish/i);
      expect(readFileSync(task.absPath, "utf8")).toMatch(/^status: review$/m);

      await waitForReviewRunning(server, task.id, false);
      expect((await getReview(server, task.id)).review?.state).toBe("ok");
    });
  });

  it("has nothing to review for a task with no worktree", async () => {
    const fx = makeFixture(printReport);
    await withServer(fx, async (server) => {
      const created = await api(server, "POST", "/api/tasks", {
        title: "No worktree",
        status: "active",
      });
      const id = created.body.id as string;

      await api(server, "PATCH", `/api/tasks/${id}`, { status: "review" });
      await new Promise((r) => setTimeout(r, 750));

      expect(spawns(fx)).toEqual([]);
      const served = await getReview(server, id);
      expect(served.enabled).toBe(true);
      expect(served.review).toBeNull();
    });
  });

  it("'Review again' starts a fresh review run that replaces the report", async () => {
    const reportA = [
      "## Verdict",
      "good to go — the change is complete.",
      "",
      "## Bugs",
      "- FIRST RUN MARKER",
      "",
      "## Edge cases",
      "- none found",
      "",
      "## Suggestions",
      "- none found",
    ].join("\n");
    const reportB = [
      "## Verdict",
      "needs some work — see Bugs.",
      "",
      "## Bugs",
      "- SECOND RUN MARKER: the retry still fails.",
      "",
      "## Edge cases",
      "- none found",
      "",
      "## Suggestions",
      "- none found",
    ].join("\n");
    const fx = makeFixture(`
let n = 0;
try { n = fs.readFileSync(process.env.REPOOS_FAKEBIN_LOG, "utf8").split("\\n").filter(Boolean).length; } catch (e) {}
if (n <= 1) process.stdout.write(${JSON.stringify(reportA)} + "\\n");
else process.stdout.write(${JSON.stringify(reportB)} + "\\n");
`);
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Re-review me");
      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      await waitFor(
        () => existsSync(join(fx.root, ".repoos", "reviews", `${task.id}.md`)),
        "the first review report is written",
      );
      await waitForReviewRunning(server, task.id, false);

      const again = await api(server, "POST", `/api/tasks/${task.id}/review/again`);
      expect(again.status).toBe(200);
      expect(again.body.ok).toBe(true);

      // The fresh run replaces the report and drops the prior conversation.
      await waitForAsync(
        async () => (await getReview(server, task.id)).review?.markdown.includes("SECOND RUN MARKER") ?? false,
        "the fresh report replaces the old one",
      );
      const served = await getReview(server, task.id);
      expect(served.review?.markdown).toContain("SECOND RUN MARKER");
      expect(served.review?.markdown).not.toContain("FIRST RUN MARKER");
      expect(served.lines.some((l) => l.d?.includes("FIRST RUN MARKER"))).toBe(false);
      expect(spawns(fx).filter((a) => a.includes("--dir")).length).toBe(2);
    });
  });

  it("routes reviewer chat to its own session and serves the conversation", async () => {
    const report = [
      "## Verdict",
      "good to go — looks right.",
      "",
      "## Bugs",
      "- None found",
      "",
      "## Edge cases",
      "- None found",
      "",
      "## Suggestions",
      "- None found",
    ].join("\n");
    const reply = "The empty-list case is handled by the early return in src/thing.ts.";
    const fx = makeFixture(`
let n = 0;
try { n = fs.readFileSync(process.env.REPOOS_FAKEBIN_LOG, "utf8").split("\\n").filter(Boolean).length; } catch (e) {}
if (n <= 1) process.stdout.write(${JSON.stringify(report)} + "\\n");
else process.stdout.write(${JSON.stringify(reply)} + "\\n");
`);
    await withServer(fx, async (server) => {
      const task = await taskWithWorktree(server, fx, "Chat with reviewer");
      await api(server, "PATCH", `/api/tasks/${task.id}`, { status: "review" });
      await waitFor(
        () => existsSync(join(fx.root, ".repoos", "reviews", `${task.id}.md`)),
        "the review report is written",
      );
      await waitForReviewRunning(server, task.id, false);

      // Reject an empty follow-up before any process is spawned.
      const empty = await api(server, "POST", `/api/tasks/${task.id}/review/message`, { text: "  " });
      expect(empty.status).toBe(400);

      const sent = await api(server, "POST", `/api/tasks/${task.id}/review/message`, {
        text: "why did you flag the empty list?",
      });
      expect(sent.status).toBe(200);

      // The conversation is served with the human turn and the reviewer reply.
      await waitForAsync(
        async () =>
          (await getReview(server, task.id)).lines.some((l) => l.d?.includes("early return")),
        "the reviewer's reply arrives",
      );

      // The follow-up reached the reviewer as a continuation mission. Read the
      // log only after the reply landed, so the child has written its argv.
      const reviewSpawns = spawns(fx).filter((a) => a.includes("--dir"));
      const mission = reviewSpawns[reviewSpawns.length - 1]?.join(" ") ?? "";
      expect(mission).toMatch(/continuing an earlier review conversation/i);
      expect(mission).toMatch(/why did you flag the empty list/);

      const served = await getReview(server, task.id);
      expect(
        served.lines.some((l) => l.type === "human" && l.text === "why did you flag the empty list?"),
      ).toBe(true);
      expect(served.lines.some((l) => l.d?.includes("early return"))).toBe(true);

      // A chat turn never overwrites the stored report...
      expect(served.review?.markdown).toContain("good to go");
      // ...and never leaks into the engineer session output.
      const output = await api(server, "GET", `/api/tasks/${task.id}/output`);
      expect(output.body.lines).toEqual([]);
    });
  });
});
