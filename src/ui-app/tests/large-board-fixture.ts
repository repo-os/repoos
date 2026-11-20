/**
 * Large generated Work board fixture (#1251). Builds a `/api/board` payload
 * with 1000+ tasks in the same shape the server sends, and installs Playwright
 * routes that serve the built UI from `dist/ui` with that payload. Nothing
 * here touches a real repository or a running RepoOS server.
 */
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { Page, Route } from "@playwright/test";
import type { BoardIndex, BoardTask, Counts, Status } from "../src/types";

export const FIXTURE_ORIGIN = "http://repoos.qa.invalid";

/** Status mix for a 1200-task board: the Done column carries most of it, the
 *  way a long-running project does. */
const STATUS_MIX: ReadonlyArray<readonly [Status, number]> = [
  ["draft", 40],
  ["inbox", 80],
  ["ready", 60],
  ["active", 20],
  ["review", 20],
  ["done", 980],
];

const PRIORITIES = ["p1", "p2", "p3"] as const;
const AREAS = ["web", "core", "server", "cli"] as const;
const TITLE_WORDS = [
  "Board",
  "filter",
  "scroll",
  "render",
  "Done",
  "column",
  "drawer",
  "check",
  "review",
  "handoff",
  "agent",
  "queue",
  "status",
  "story",
  "search",
  "sort",
];

function titleFor(i: number): string {
  // Varied lengths so card heights differ, like real titles do.
  const words = 3 + (i % 9);
  const parts: string[] = [];
  for (let w = 0; w < words; w++) parts.push(TITLE_WORDS[(i * 7 + w * 3) % TITLE_WORDS.length]!);
  return `${parts.join(" ")} (task ${i})`;
}

function taskFor(id: number, status: Status, index: number): BoardTask {
  const padded = String(id).padStart(4, "0");
  const human = index % 25 === 0;
  const held = !human && index % 40 === 0;
  const stamp = new Date(Date.UTC(2026, 10, 1) + index * 60_000).toISOString();
  return {
    id: padded,
    title: titleFor(id),
    type: index % 3 === 0 ? "bug" : "feature",
    status,
    needsInput: false,
    needsMerge: false,
    isArchived: false,
    isHeld: held,
    holdReason: held ? "fixture hold" : undefined,
    priority: PRIORITIES[index % PRIORITIES.length]!,
    area: AREAS[index % AREAS.length]!,
    areas: [AREAS[index % AREAS.length]!],
    story: index % 5 === 0 ? "" : `story-${index % 4}`,
    dependsOn: [],
    mergedCommit: status === "done" ? `abc${padded}` : null,
    blockedBy: [],
    assignee: human ? "human" : "ai",
    assignedTo: human ? "human" : "ai",
    createdBy: "fixture@repoos.qa.invalid",
    branch: `feat/fixture-${padded}`,
    tags: [],
    created_at: stamp,
    updated_at: stamp,
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    pmAgentOverride: null,
    pmCliOverride: null,
    pmModelOverride: null,
    reviewAgentOverride: null,
    reviewCliOverride: null,
    reviewModelOverride: null,
    releasedAt: status === "done" ? stamp : null,
    bodyPreview: `Fixture body for task ${id}. Keeps the card text realistic.`,
    path: `work/${padded}-fixture.md`,
    absPath: `/fixture/work/${padded}-fixture.md`,
    git: {
      branchExists: status !== "done",
      worktreeExists: false,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
    checkRetryCount: 0,
    mergeConflictRetryCount: 0,
    handoffSignalRetryCount: 0,
  } as BoardTask;
}

/** A deterministic board with `count` tasks, distributed by STATUS_MIX. */
export function makeLargeBoard(count = 1200): BoardIndex {
  const counts: Counts = { draft: 0, inbox: 0, ready: 0, active: 0, review: 0, done: 0 };
  const total = STATUS_MIX.reduce((sum, [, n]) => sum + n, 0);
  const tasks: BoardTask[] = [];
  let id = 1;
  let index = 0;
  for (const [status, share] of STATUS_MIX) {
    const n = Math.round((share / total) * count);
    for (let k = 0; k < n; k++, id++, index++) {
      tasks.push(taskFor(id, status, index));
      counts[status]++;
    }
  }
  return {
    version: 1,
    generatedAt: new Date(0).toISOString(),
    root: "/fixture",
    taskCount: tasks.length,
    tasks,
    counts,
    storyDefinitions: [],
  };
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
};

/** Answers one `/api/*` request. Only the calls the board needs get real
 *  payloads; anything else gets an empty object so unrelated panels stay quiet. */
function apiBody(path: string, board: BoardIndex): { status: number; type: string; body: string } {
  const json = (value: unknown) => ({
    status: 200,
    type: "application/json",
    body: JSON.stringify(value),
  });
  if (path === "/api/board") return json(board);
  if (path === "/api/auth/me") return json({ authEnabled: false, authenticated: true });
  if (path === "/api/health")
    return json({
      ok: true,
      root: "/fixture",
      projectName: "fixture",
      branch: null,
      taskCount: board.taskCount,
      workDir: "/fixture",
      version: "0.0.0",
      buildAt: null,
    });
  if (path === "/api/events")
    // An open-but-silent event stream: the board is refreshed by the page
    // itself, not by pushed events, so the fixture has none to send.
    return { status: 200, type: "text/event-stream", body: ": fixture\n\n" };
  if (path === "/api/config") return json({ config: {}, schema: [] });
  if (path === "/api/inputs" || path === "/api/schedules" || path === "/api/integration-jobs")
    return json([]);
  if (path === "/api/local-check-slots" || path === "/api/agents/queued") return json([]);
  if (path === "/api/repo/status") return json({ branch: "main", dirty: [], clean: true });
  return json({});
}

/** Routes every request for the fixture origin: `/api/*` from the fixture
 *  board, everything else from the built UI in `distDir`. */
export async function installLargeBoardRoutes(page: Page, board: BoardIndex, distDir: string) {
  await page.route(`${FIXTURE_ORIGIN}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      const api = apiBody(url.pathname, board);
      await route.fulfill({ status: api.status, contentType: api.type, body: api.body });
      return;
    }
    const requested = resolve(distDir, "." + url.pathname);
    const file =
      requested.startsWith(distDir) && existsSync(requested) && statSync(requested).isFile()
        ? requested
        : resolve(distDir, "index.html");
    const type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
    await route.fulfill({ status: 200, contentType: type, body: await readFile(file) });
  });
}
