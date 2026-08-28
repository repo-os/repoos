import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createTcpServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { startServer } from "../../server/server";
import { ensureWorktree } from "../../core/git";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createTcpServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = (srv.address() as { port: number }).port;
      srv.close(() => resolve(p));
    });
  });
}

/**
 * #0235 race: `recoverPendingHandoffs` validates each request via
 * `index.getTask()`. It used to run before `refreshAllAsync` had populated the
 * index — a fast boot then saw every task as "not found", cleared the pending
 * request, and left the task stuck `active` with its work uncommitted. The fix
 * defers recovery until `indexReady` resolves.
 */
describe("pending-handoff recovery waits for the index (#0235)", () => {
  it("recovers a valid request at boot instead of silently dropping it", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-handoff-race-"));
    const wtRoot = join(root, "..", `${basename(root)}-worktrees`);
    try {
      mkdirSync(join(root, "work"), { recursive: true });
      mkdirSync(join(root, ".repoos", "sessions"), { recursive: true });
      git(root, ["init", "-q"]);
      git(root, ["config", "user.email", "t@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      git(root, ["commit", "--allow-empty", "-m", "init"]);

      // One active task on its own branch + linked worktree.
      const branch = "feat/pending-note";
      const wt = ensureWorktree(root, branch);
      expect(wt.ok).toBe(true);
      writeFileSync(join(wt.path, "impl.md"), "the agent's work\n");
      git(wt.path, ["add", "-A"]);
      git(wt.path, ["commit", "-q", "-m", "engineer work"]);
      writeFileSync(
        join(root, "work", "0001-note.md"),
        `---\nid: "0001"\ntitle: Note mechanism\ntype: feature\nstatus: active\npriority: p1\narea: server\nassigned_to: ai\ncreated_by: test\nbranch: ${branch}\n---\nbody\n`,
      );

      // A persisted engineer session (so recovery's transcript line lands).
      writeFileSync(
        join(root, ".repoos", "sessions", "0001.json"),
        JSON.stringify({
          version: 1,
          engine: "opencode",
          lines: [{ type: "human", text: "implement it", at: new Date().toISOString() }],
          updatedAt: new Date().toISOString(),
          agent: "engineer",
          model: "default",
        }),
      );

      // The interrupted handoff, exactly as persistHandoff writes it.
      writeFileSync(
        join(root, ".repoos", "pending-handoffs.json"),
        JSON.stringify({
          requests: [
            { taskId: "0001", runId: "race-run", branch, workdir: wt.path, sessionId: "ses_race" },
          ],
        }),
      );

      const port = await reservePort();
      const handle = await startServer({ port, host: "127.0.0.1", root, disableAuth: true });
      try {
        // startServer resolves only after `await indexReady`, and the deferred
        // recovery `.then` is registered first — so it has already run.
        const pending = JSON.parse(
          readFileSync(join(root, ".repoos", "pending-handoffs.json"), "utf8"),
        );
        expect(pending.requests).toEqual([]);

        // The recovery path only reaches the transcript when getTask() FOUND
        // the task — the pre-fix bug cleared the request without this.
        const deadline = Date.now() + 4000;
        let recovered = false;
        while (Date.now() < deadline) {
          const raw = readFileSync(join(root, ".repoos", "sessions", "0001.json"), "utf8");
          if (raw.includes("Recovering pending handoff")) {
            recovered = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        expect(recovered).toBe(true);
      } finally {
        await handle.close("test done");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(wtRoot, { recursive: true, force: true });
    }
  });
});
