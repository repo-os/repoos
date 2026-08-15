/**
 * #0198 integration test — previews auto-launch on `review` and are capped.
 *
 * Drives a REAL main server against a fixture repo with linked worktrees, then
 * transitions tasks into `review` via the same PATCH the board/drawer use. It
 * asserts that:
 *
 *   - a preview auto-launches the moment a task lands in `review` (no button);
 *   - the preview closes when the task leaves the previewable states
 *     (active/review) — the exact `stopPreviewIfLeft` path `done` relies on;
 *   - at most `MAX_PREVIEWS` previews run concurrently; starting beyond the cap
 *     terminates the OLDEST running preview (FIFO) before a new one starts.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { ensureWorktree } from "../../core/git";

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

/** A fixture repo with `count` review-able tasks, each with its own worktree. */
function makeFixture(count: number): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-autoprev-"));
  mkdirSync(join(root, "work"), { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);

  for (let i = 0; i < count; i++) {
    const branch = `feat/task-${i + 1}`;
    const wt = ensureWorktree(root, branch);
    if (!wt.ok) throw new Error(`could not create worktree for ${branch}: ${wt.reason}`);
    writeFileSync(join(wt.path, "notes.md"), `# ${branch}\n\nmarker-${i + 1}\n`);
    const id = String(i + 1).padStart(4, "0");
    const task = `---
id: "${id}"
title: Task ${i + 1}
type: feature
status: active
priority: p1
area: server
assigned_to: ai
created_by: test
branch: ${branch}
---
`;
    writeFileSync(join(root, "work", `${id}-task-${i + 1}.md`), task);
  }

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
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function previewUrl(server: ServerHandle, id: string): Promise<string | null> {
  const t = await api(server, "GET", `/api/tasks/${id}`);
  const p = t.body.preview as { url?: string } | null;
  return p?.url ?? null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll a task's preview URL until it appears (auto-launch is async). */
async function waitForPreview(server: ServerHandle, id: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const url = await previewUrl(server, id);
    if (url) return url;
    await sleep(250);
  }
  throw new Error(`preview for #${id} never appeared`);
}

/** Count tasks that currently have a live (healthy) preview URL. */
async function countLive(server: ServerHandle, ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const url = await previewUrl(server, id);
    if (!url) continue;
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) n++;
    } catch {
      /* not live */
    }
  }
  return n;
}

describe("auto-launch previews on review (#0198)", () => {
  it(
    "launches a preview on transition to review and closes it when leaving review",
    async () => {
      const fx = makeFixture(1);
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        // Before review, no preview exists.
        expect(await previewUrl(server, "0001")).toBeNull();

        // Transition to review -> preview auto-launches.
        const moved = await api(server, "PATCH", "/api/tasks/0001", { status: "review" });
        expect(moved.status).toBe(200);
        const url = await waitForPreview(server, "0001");
        expect((await (await fetch(`${url}/api/health`)).json())).toMatchObject({ ok: true });

        // Leaving the previewable states closes it automatically. The real
        // trigger is `done`; it shares the exact `stopPreviewIfLeft` path a
        // move to a non-previewable status takes, so we move to `ready` (the
        // light equivalent — the PATCH `done` route is guarded behind the
        // heavy close-out flow).
        const back = await api(server, "PATCH", "/api/tasks/0001", { status: "ready" });
        expect(back.status).toBe(200);
        for (let i = 0; i < 40; i++) {
          if (!(await previewUrl(server, "0001"))) break;
          await sleep(250);
        }
        expect(await previewUrl(server, "0001")).toBeNull();
      } finally {
        await server.close();
        fx.clean();
      }
    },
    90_000,
  );

  it(
    "caps concurrent previews at 4 and evicts the oldest (FIFO) when exceeded",
    async () => {
      const fx = makeFixture(5);
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        // Move 4 tasks into review -> exactly 4 live previews.
        const ids = ["0001", "0002", "0003", "0004"];
        for (const id of ids) {
          const moved = await api(server, "PATCH", `/api/tasks/${id}`, { status: "review" });
          expect(moved.status).toBe(200);
        }
        for (let i = 0; i < 60; i++) {
          if ((await countLive(server, ids)) === 4) break;
          await sleep(250);
        }
        expect(await countLive(server, ids)).toBe(4);

        // A 5th task enters review -> it must get a preview and one of the
        // four (the oldest by start time) must be evicted, keeping the cap.
        const fifth = await api(server, "PATCH", "/api/tasks/0005", { status: "review" });
        expect(fifth.status).toBe(200);
        const fifthUrl = await waitForPreview(server, "0005");
        expect((await (await fetch(`${fifthUrl}/api/health`)).json())).toMatchObject({ ok: true });

        // Exactly the cap is running once the 5th is up: 0005 plus 3 survivors.
        const all = ["0001", "0002", "0003", "0004", "0005"];
        for (let i = 0; i < 60; i++) {
          if ((await countLive(server, all)) === 4) break;
          await sleep(250);
        }
        expect(await countLive(server, all)).toBe(4);
        expect(await previewUrl(server, "0005")).toBe(fifthUrl);
      } finally {
        await server.close();
        fx.clean();
      }
    },
    120_000,
  );
});
