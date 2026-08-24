/**
 * On-demand preview integration test (#0271 follow-up).
 *
 * Previews used to auto-launch the moment a task entered `review` (#0198) —
 * that made sense when spinning one up was slow enough to be annoying to
 * wait for. Startup is fast now (#0271 follow-up), so auto-launching is no
 * longer worth the CPU contention of N concurrent nested `repoos serve`
 * children; previews are on-demand only (`POST /api/tasks/:id/preview`), and
 * MAX_PREVIEWS is 1 — starting a new one evicts whatever was running.
 *
 * Drives a REAL main server against a fixture repo with linked worktrees and
 * asserts that:
 *
 *   - moving a task into `review` does NOT auto-launch a preview;
 *   - `POST /api/tasks/:id/preview` launches one on demand;
 *   - the preview closes when the task leaves the previewable states
 *     (active/review) — the exact `stopPreviewIfLeft` path `done` relies on;
 *   - starting a second task's preview evicts the first (cap of 1, FIFO).
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

describe("on-demand previews (#0271 follow-up)", () => {
  it(
    "does not auto-launch on transition to review, launches on request, and closes when leaving review",
    async () => {
      const fx = makeFixture(1);
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        expect(await previewUrl(server, "0001")).toBeNull();

        // Transition to review -> NO auto-launch (unlike the old #0198 behavior).
        const moved = await api(server, "PATCH", "/api/tasks/0001", { status: "review" });
        expect(moved.status).toBe(200);
        await sleep(500);
        expect(await previewUrl(server, "0001")).toBeNull();

        // On-demand launch.
        const started = await api(server, "POST", "/api/tasks/0001/preview");
        expect(started.status).toBe(200);
        expect(started.body.ok).toBe(true);
        const url = started.body.url as string;
        expect((await (await fetch(`${url}/api/health`)).json())).toMatchObject({ ok: true });
        expect(await previewUrl(server, "0001")).toBe(url);

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
    "caps concurrent previews at 1 and evicts the previous one when a new one starts",
    async () => {
      const fx = makeFixture(2);
      const server = await startServer({ root: fx.root, host: "127.0.0.1", port: 0 });
      try {
        const first = await api(server, "POST", "/api/tasks/0001/preview");
        expect(first.status).toBe(200);
        const firstUrl = first.body.url as string;
        expect((await (await fetch(`${firstUrl}/api/health`)).json())).toMatchObject({ ok: true });

        // Starting a second task's preview evicts the first (cap of 1, FIFO).
        const second = await api(server, "POST", "/api/tasks/0002/preview");
        expect(second.status).toBe(200);
        const secondUrl = second.body.url as string;
        expect((await (await fetch(`${secondUrl}/api/health`)).json())).toMatchObject({ ok: true });

        for (let i = 0; i < 40; i++) {
          if (!(await previewUrl(server, "0001"))) break;
          await sleep(250);
        }
        expect(await previewUrl(server, "0001")).toBeNull();
        expect(await previewUrl(server, "0002")).toBe(secondUrl);
      } finally {
        await server.close();
        fx.clean();
      }
    },
    120_000,
  );
});
