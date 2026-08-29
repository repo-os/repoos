/**
 * #0096 integration test — agent previews are server-owned.
 *
 * Runs a REAL main server against a fixture git repo with three linked
 * worktrees (one per task), then drives preview requests the way fixture
 * agents would: `POST /api/tasks/:id/preview`. Asserts that:
 *
 *   - each task receives its own OS-allocated port serving ITS worktree;
 *   - repeated requests are idempotent (same URL);
 *   - a "rebuild" of one worktree is served live and does not disturb it;
 *   - the main `/api/health` stays reachable on its ORIGINAL port continuously
 *     across all preview starts, the rebuild, and the re-requests.
 *
 * MAX_PREVIEWS is 1 (#0271 follow-up: previews are on-demand only, so at most
 * one runs at a time — starting a new one evicts the last), so unlike the
 * original version of this test, only ONE task's preview is live at a time;
 * this drives all three tasks through the SAME preview slot sequentially
 * rather than asserting three concurrent ports.
 *
 * This exercises the real `PreviewManager` spawning real `repoos serve`
 * children (the trusted runner owns process/port lifecycle — ADR-0005), so it
 * needs the repo to be built (repoos check builds before running tests).
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { ensureWorktree } from "../../core/git";
import { PreviewManager } from "../../server/preview";

interface Fixture {
  root: string;
  clean: () => void;
}

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

/** A fixture repo with three active tasks, each with its own linked worktree. */
function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-sop-"));
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  const branches = ["feat/preview-a", "feat/preview-b", "feat/preview-c"];
  const markers: Record<string, string> = {};
  branches.forEach((branch, i) => {
    const wt = ensureWorktree(root, branch);
    if (!wt.ok) throw new Error(`could not create worktree for ${branch}: ${wt.reason}`);
    const marker = `marker-${i + 1}-${branch}`;
    markers[branch] = marker;
    writeFileSync(join(wt.path, "notes.md"), `# ${branch}\n\n${marker}\n`);
  });

  branches.forEach((branch, i) => {
    const id = String(i + 1).padStart(4, "0");
    const task = `---
id: "${id}"
title: Preview ${branch}
type: feature
status: active
priority: p1
area: server
assigned_to: ai
created_by: test
branch: ${branch}
---
`;
    writeFileSync(join(root, "work", `${id}-${branch.replace("/", "-")}.md`), task);
  });

  // Worktrees live in a sibling dir; remove it too so cleanup is complete.
  const wtRoot = join(root, "..", `${basename(root)}-worktrees`);
  return {
    root,
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      try {
        git(root, ["worktree", "prune"]);
      } catch {
        /* ignore */
      }
      rmSync(wtRoot, { recursive: true, force: true });
    },
  };
}

async function api(
  server: ServerHandle,
  method: string,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${server.url}${path}`, { method });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

describe("server-owned previews (#0096 integration)", () => {
  it("does not let a preview child create another preview", async () => {
    const prior = process.env.REPOOS_PREVIEW_CHILD;
    process.env.REPOOS_PREVIEW_CHILD = "1";
    try {
      const previews = new PreviewManager(
        {
          root: "/unused",
          cacheDir: ".repoos",
        } as any,
        () => {},
      );
      const result = await previews.start({} as any);
      expect(result).toEqual({
        ok: false,
        error:
          "Preview servers are read-only; only the main RepoOS control plane can start previews",
      });
    } finally {
      if (prior === undefined) delete process.env.REPOOS_PREVIEW_CHILD;
      else process.env.REPOOS_PREVIEW_CHILD = prior;
    }
  });

  it("serves each task's own worktree on distinct ports and keeps the main server healthy through a rebuild", async () => {
    const fx = makeFixture();
    const mainPort = await reservePort();
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: mainPort });
    const healthUrl = `http://127.0.0.1:${mainPort}/api/health`;
    let healthFailures = 0;
    let stopped = false;

    // Continuous main-server health probe running for the whole test.
    const poller = setInterval(async () => {
      if (stopped) return;
      try {
        const res = await fetch(healthUrl);
        if (!res.ok) healthFailures++;
      } catch {
        healthFailures++;
      }
    }, 25);

    try {
      expect(await (await fetch(healthUrl)).json()).toMatchObject({ ok: true });

      const ids = ["0001", "0002", "0003"];
      const branches = ["feat/preview-a", "feat/preview-b", "feat/preview-c"];

      // Cap of 1: each task gets its own OS-allocated port, but starting
      // the next one evicts the previous — only one is ever live.
      const urlById: Record<string, string> = {};
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const res = await api(server, "POST", `/api/tasks/${id}/preview`);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        const url = res.body.url as string;
        const port = res.body.port as number;
        expect(url).toBe(`http://127.0.0.1:${port}`);
        urlById[id] = url;

        // Serves ITS OWN worktree build (a unique marker file).
        expect(await (await fetch(`${url}/api/health`)).json()).toMatchObject({ ok: true });
        const body = await (await fetch(`${url}/notes.md`)).text();
        expect(body).toContain(`marker-${i + 1}-${branches[i]}`);

        // The previous task's preview (if any) was evicted to hold the cap.
        if (i > 0) {
          const prevTask = await api(server, "GET", `/api/tasks/${ids[i - 1]}`);
          expect(prevTask.body.preview).toBeNull();
        }
      }

      // Idempotency: repeat requests for the CURRENTLY live task return the
      // existing healthy URL rather than evicting-and-restarting itself.
      const currentId = ids[ids.length - 1];
      const again = await api(server, "POST", `/api/tasks/${currentId}/preview`);
      expect(again.status).toBe(200);
      expect(again.body.url).toBe(urlById[currentId]);

      // Rebuild the live worktree (content change) — re-request is still
      // the same URL and the preview serves the updated build live.
      const rebuiltBranch = branches[branches.length - 1];
      const wt = ensureWorktree(fx.root, rebuiltBranch);
      const newMarker = "rebuilt-content-42";
      writeFileSync(join(wt.path, "notes.md"), `# ${rebuiltBranch}\n\n${newMarker}\n`);

      const reRequest = await api(server, "POST", `/api/tasks/${currentId}/preview`);
      expect(reRequest.status).toBe(200);
      expect(reRequest.body.url).toBe(urlById[currentId]);
      const body = await (await fetch(`${urlById[currentId]}/notes.md`)).text();
      expect(body).toContain(newMarker);

      // The task endpoint surfaces the live preview URL.
      const task = await api(server, "GET", `/api/tasks/${currentId}`);
      expect((task.body.preview as { url?: string } | null)?.url).toBe(urlById[currentId]);

      // The main server never flinched: same port, zero failed probes.
      expect(await (await fetch(healthUrl)).json()).toMatchObject({ ok: true });
      expect(healthFailures).toBe(0);
    } finally {
      stopped = true;
      clearInterval(poller);
      await server.close();
      fx.clean();
    }
  }, 120_000);

  it("rejects a preview for a task whose worktree is missing (validation before starting anything)", async () => {
    const fx = makeFixture();
    // A task with a branch that has NO worktree must not start anything.
    const ghost = `---
id: "0009"
title: Ghost
type: feature
status: active
branch: feat/ghost
---
`;
    writeFileSync(join(fx.root, "work", "0009-ghost.md"), ghost);
    const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
    try {
      const res = await api(server, "POST", "/api/tasks/0009/preview");
      expect(res.status).toBe(400);
      expect(String(res.body.error ?? "")).toMatch(/no git worktree exists/i);
    } finally {
      await server.close();
      fx.clean();
    }
  }, 60_000);
});
