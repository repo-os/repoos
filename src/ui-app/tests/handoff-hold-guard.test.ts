/**
 * Round 2 of #0960: the engineer handoff lifecycle must honor a hold.
 *
 * `onHandoff` (server.ts) finalizes an engineer's handoff and moves the task
 * to review. Crash recovery re-fires it for any persisted pending handoff whose
 * task is still `active`. A held task is inert for ALL automation — including
 * this path — so a held task must NOT reach review via an automatic or
 * recovered handoff.
 *
 * This drives the REAL server against a fixture repo with a seeded pending
 * handoff, proving the guard actually stops the held task while a non-held
 * control task (same setup minus the hold) does reach review. The check plan
 * is satisfied by a fake `repoos` binary on PATH that exits 0, mirroring
 * handoff.test.ts, so the only difference between the two cases is the hold.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { parseTask } from "../../core/task";
import { waitFor } from "./helpers";

const WELL_SPECIFIED_BODY = `## Problem

${"Substantive problem description that is long enough to avoid the short-body heuristic. ".repeat(8)}

## Desired UX

${"Substantive UX description that is long enough to avoid the short-body heuristic. ".repeat(8)}

## Acceptance criteria

- [ ] Users can complete the flow end to end

## Notes for AI

${"Substantive notes that are long enough to avoid the short-body heuristic. ".repeat(6)}
`;

const ID = "0960";
const BRANCH = "feat/0960-handoff-hold";

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

function writeTask(held: boolean): Fx {
  const root = mkdtempSync(join(tmpdir(), "repoos-hold-ho-"));
  const worktree = `${root}-wt`;
  const work = join(root, "work");
  const bin = join(root, "fake-bin");
  mkdirSync(work, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(root, ".repoos"), { recursive: true });
  const taskPath = join(work, `${ID}-handoff-hold.md`);
  const lines = [
    "---",
    `id: "${ID}"`,
    "title: Held handoff guard fixture",
    "type: feature",
    "status: active",
    "priority: p2",
    "area: server",
    "assigned_to: ai",
    `branch: ${BRANCH}`,
    held ? "hold: true" : "hold: false",
    held ? "hold_reason: waiting on design" : "",
    held ? "hold_until: 2099-01-01T00:00:00Z" : "",
    "---",
    WELL_SPECIFIED_BODY,
  ]
    .filter(Boolean)
    .join("\n");
  writeFileSync(taskPath, lines);
  // A committed diff in the worktree is what handoffTask commits + checks.
  writeFileSync(join(root, "source.txt"), "base\n");
  // Fake `repoos` on PATH that exits 0 so the check plan passes for the control.
  writeFileSync(join(bin, "repoos"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  execFileSync("git", ["branch", BRANCH], { cwd: root });
  execFileSync("git", ["worktree", "add", "-q", worktree, BRANCH], { cwd: root });
  // Change the worktree so handoffTask has something to commit.
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
  const p = join(root, "work", `${ID}-handoff-hold.md`);
  return parseTask({
    content: readFileSync(p, "utf8"),
    absPath: p,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

describe("onHandoff honors a hold (#0960 round 2)", () => {
  it("refuses to move a held task to review during crash-recovery handoff", async () => {
    const fx = writeTask(true);
    try {
      seedPendingHandoff(fx.root);
      process.env.PATH = `${join(fx.root, "fake-bin")}:${savedPath}`;
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      servers.push(server);
      // Recovery runs once the index is ready and re-fires onHandoff. For a held
      // task the guard rejects before finalization, so the task stays active and
      // recovery records the failed attempt in Activity.
      // Recovery re-fires onHandoff; the guard rejects before finalization, so
      // the task stays active and recovery records the failed attempt in
      // Activity. The control test below uses the identical setup minus the
      // hold and DOES reach review — so the held task staying active (with the
      // recovery-attempted marker) proves the guard, not a check failure, blocks it.
      await waitFor(
        () => readTask(fx.root).body.includes("handoff recovery attempted"),
        "crash recovery ran for the held task and the guard kept it active",
        15_000,
      );
      expect(readTask(fx.root).status).toBe("active");
    } finally {
      fx.clean();
    }
  });

  it("control: a non-held task with a pending handoff DOES move to review", async () => {
    const fx = writeTask(false);
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
  });
});
