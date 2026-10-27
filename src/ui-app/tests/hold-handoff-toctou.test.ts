/**
 * #0960 round 3 — handoff-lifecycle TOCTOU.
 *
 * `onHandoff` (server.ts) pre-checks the hold before `consumeHandoff`. A hold
 * that lands DURING the long handoff finalization (the `repoos check` step) must
 * not let the task reach review: `runHandoffFinalization` re-reads the live task
 * file at the commit point — right before writing `status: review` — and refuses
 * a held task.
 *
 * This drives the REAL server against a fixture repo whose `repoos` check script
 * sleeps, so the test can write a hold to the task file mid-check. The control
 * (no hold) reaches review; with a mid-check hold the task stays `active`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { parseTask } from "../../core/task";

const WELL_SPECIFIED_BODY = `## Problem

${"Substantive problem description that is long enough to avoid the short-body heuristic. ".repeat(8)}

## Desired UX

${"Substantive UX description that is long enough to avoid the short-body heuristic. ".repeat(8)}

## Acceptance criteria

- [ ] Users can complete the flow end to end

## Notes for AI

${"Substantive notes that are long enough to avoid the short-body heuristic. ".repeat(6)}
`;

const ID = "0961";
const BRANCH = "feat/0961-handoff-toctou";
const CHECK_SLEEP_MS = 2500;

const servers: ServerHandle[] = [];
let savedPath = process.env.PATH ?? "";
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close().catch(() => {})));
  servers.length = 0;
  process.env.PATH = savedPath;
});

interface Fx {
  root: string;
  clean: () => void;
}

/** `delay` > 0 makes the fake `repoos` check sleep, so the test can inject a hold
 *  mid-finalization. */
function writeTask(delay: number): Fx {
  const root = mkdtempSync(join(tmpdir(), "repoos-hold-ho-"));
  const worktree = `${root}-wt`;
  const work = join(root, "work");
  const bin = join(root, "fake-bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, ".repoos"), { recursive: true });
  const taskPath = join(work, `${ID}-handoff-toctou.md`);
  const lines = [
    "---",
    `id: "${ID}"`,
    "title: Held handoff TOCTOU fixture",
    "type: feature",
    "status: active",
    "priority: p2",
    "area: server",
    "assigned_to: ai",
    `branch: ${BRANCH}`,
    "---",
    WELL_SPECIFIED_BODY,
  ].join("\n");
  writeFileSync(taskPath, lines);
  writeFileSync(join(root, "source.txt"), "base\n");
  // Fake `repoos` on PATH that sleeps (to widen the finalization window) then
  // exits 0 so the check plan passes.
  writeFileSync(join(bin, "repoos"), `#!/bin/sh\nsleep ${delay / 1000}\nexit 0\n`, {
    mode: 0o755,
  });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  execFileSync("git", ["branch", BRANCH], { cwd: root });
  execFileSync("git", ["worktree", "add", "-q", worktree, BRANCH], { cwd: root });
  writeFileSync(join(worktree, "source.txt"), "implemented\n");
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

function seedPendingHandoff(root: string): void {
  writeFileSync(
    join(root, ".repoos", "pending-handoffs.json"),
    JSON.stringify({
      requests: [
        { taskId: ID, runId: "run-1", branch: BRANCH, workdir: `${root}-wt`, sessionId: "sess-1" },
      ],
    }),
  );
}

function readTask(root: string) {
  const p = join(root, "work", `${ID}-handoff-toctou.md`);
  return parseTask({
    content: readFileSync(p, "utf8"),
    absPath: p,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

function setHold(root: string): void {
  const p = join(root, "work", `${ID}-handoff-toctou.md`);
  const body = readFileSync(p, "utf8");
  const held = body.replace(/^---$/m, `---\nhold: true\nhold_reason: mid-finalization hold\n`);
  writeFileSync(p, held);
}

async function waitFor(fn: () => boolean, msg: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for: ${msg}`);
}

describe("onHandoff honors a hold that lands during finalization (#0960 round 3)", () => {
  it(
    "keeps a task active when a hold is applied mid-check, rather than moving it to review",
    { timeout: 40_000 },
    async () => {
      const fx = writeTask(CHECK_SLEEP_MS);
      try {
        seedPendingHandoff(fx.root);
        process.env.PATH = `${join(fx.root, "fake-bin")}:${savedPath}`;
        const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
        servers.push(server);

        // Let the server pick up the pending handoff and begin finalization (which
        // is now sitting in the sleeping `repoos check` step).
        await new Promise((r) => setTimeout(r, 1000));

        // A concurrent `repoos hold` lands mid-finalization.
        setHold(fx.root);

        // The commit-point guard must refuse the held task. Wait for the recovery
        // machinery to record the failed attempt, then assert the task is still
        // active (never reached review).
        await waitFor(
          () => readTask(fx.root).body.includes("handoff recovery attempted"),
          "hold guard refused the mid-finalization handoff",
          20_000,
        );
        expect(readTask(fx.root).status).toBe("active");
        expect(readTask(fx.root).isHeld).toBe(true);
      } finally {
        fx.clean();
      }
    },
  );

  it(
    "control: a non-held task with a pending handoff DOES reach review",
    { timeout: 40_000 },
    async () => {
      const fx = writeTask(0);
      try {
        seedPendingHandoff(fx.root);
        process.env.PATH = `${join(fx.root, "fake-bin")}:${savedPath}`;
        const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
        servers.push(server);
        await waitFor(
          () => readTask(fx.root).status === "review",
          "non-held task reaches review",
          20_000,
        );
        expect(readTask(fx.root).status).toBe("review");
      } finally {
        fx.clean();
      }
    },
  );
});
