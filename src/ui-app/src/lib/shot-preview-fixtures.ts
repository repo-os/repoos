/**
 * Preview-only board fixtures driven by `?shotState=` on the capture URL (#0743).
 */
import {
  SHOT_PREVIEW_FIXTURE_QUERY,
  SHOT_PREVIEW_FIXTURE_TASK_ID,
  type ShotPreviewFixtureId,
  isShotPreviewFixtureId,
} from "../../../core/shot-fixtures.js";
import type { useRepoStore } from "../stores/repo";
import type { DevTargetView, IntegrationPipelineSnapshot, Task } from "../types";

type RepoStore = ReturnType<typeof useRepoStore>;

const nowIso = (): string => new Date().toISOString();

/**
 * The integration snapshot a fixture pinned (#0782), or null when none.
 *
 * The live pipeline arrives over SSE (`integration` events) and via
 * `/api/integration/pipeline` hydration, and REPLACES the whole snapshot —
 * during a capture that raced the fixture and the card showed the board's
 * real (idle) pipeline instead of the seeded upload state. The store consults
 * this pin on every live assignment so a preview fixture keeps its seeded
 * pipeline for the page's lifetime. Only `applyShotPreviewFixture` writes it,
 * and that runs solely on preview builds with `?shotState=` (plus tests).
 */
let pinnedIntegration: IntegrationPipelineSnapshot | null = null;

/** The fixture-pinned pipeline snapshot, or null when nothing is pinned (#0782). */
export function shotFixturePinnedIntegration(): IntegrationPipelineSnapshot | null {
  return pinnedIntegration;
}

function fixtureTask(over: Partial<Task> = {}): Task {
  return {
    id: SHOT_PREVIEW_FIXTURE_TASK_ID,
    title: "Shot preview fixture task",
    type: "feature",
    status: "review",
    priority: "p2",
    area: "web",
    assignee: "ai",
    assignedTo: "ai",
    createdBy: "",
    // No branch: a mounted task card fetches diff stats for its id, and the
    // server has no such task — the 404 fails the handoff UI gate (#0768). An
    // empty branch makes the card skip that request (it would only answer
    // "noBranch"), so the fixture stays a pure client-side state seed.
    branch: "",
    tags: [],
    needsInput: false,
    needsMerge: false,
    created_at: nowIso(),
    updated_at: nowIso(),
    path: `work/${SHOT_PREVIEW_FIXTURE_TASK_ID}-shot-preview-fixture.md`,
    absPath: `/tmp/repo/work/${SHOT_PREVIEW_FIXTURE_TASK_ID}-shot-preview-fixture.md`,
    body: "",
    extra: {},
    agentOverride: null,
    cliOverride: null,
    modelOverride: null,
    git: {
      branchExists: true,
      worktreeExists: true,
      lastCommit: null,
      lastCommitAt: null,
      worktreePath: null,
      dirty: false,
    },
    preview: null,
    ...over,
  };
}

function activePipeline(
  taskId: string,
  detail: string | null = null,
  at: string = nowIso(),
): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: {
      taskId,
      stage: "check",
      failed: false,
      startedAt: at,
      lastProgressAt: at,
      detail,
    },
    queue: [],
    at,
  };
}

function ensureFixtureTask(
  repo: RepoStore,
  status: Task["status"] = "review",
  overrides: Partial<Task> = {},
): void {
  const existing = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
  const task = fixtureTask({ status, ...overrides });
  if (existing) {
    Object.assign(existing, task);
  } else {
    repo.tasks.push(task);
  }
}

export function readShotPreviewFixtureFromLocation(
  location: Pick<Location, "search">,
): ShotPreviewFixtureId | null {
  const raw = new URLSearchParams(location.search).get(SHOT_PREVIEW_FIXTURE_QUERY);
  if (!raw || !isShotPreviewFixtureId(raw)) return null;
  return raw;
}

/**
 * A synthetic failed dev target for the `dev:failed` capture fixture (#0775).
 * Returns null for any other fixture, so DevView keeps its real server data.
 * The summary/port-holder here mirror what the server would produce for a
 * `--strictPort` Vite clash, so a capture shows the real feature without
 * needing a genuinely stuck port.
 */
export function shotFixtureDevTargets(
  fixture: ShotPreviewFixtureId | null,
): DevTargetView[] | null {
  if (fixture !== "dev:failed") return null;
  return [
    {
      name: "web",
      kind: "server",
      command: "bun run dev",
      label: "Landing page (HMR)",
      status: "failed",
      error: "process exited with code 1",
      pid: 48213,
      url: "http://localhost:5173",
      log: [
        "VITE v5.4.10  ready in 210 ms",
        "",
        "  ➜  Local:   http://localhost:5173/",
        "Error: Port 5173 is already in use",
        "    at Server.setupListenHandle [as _listen2] (node:net:1904:16)",
        "    at listenInCluster (node:net:1961:12)",
        "    at Server.listen (node:net:2063:24)",
        "    at httpServerStart (/opt/vite/bin/vite.js:104:3)",
        "[repoos] process exited with code 1",
      ],
      failure: {
        kind: "port-in-use",
        what: "Landing page (HMR) could not start: its port is already taken.",
        cause: "Port 5173 is already in use by another process.",
        fix: "Stop the process using port 5173, then start the target again.",
        port: 5173,
        holder: {
          pid: 41337,
          command: "node /opt/vite --strictPort",
          repoosOwned: true,
          target: "web",
          stale: true,
        },
        canStopHolder: true,
      },
    },
  ];
}

/** Apply a named fixture to the live board (preview builds only). */
export function applyShotPreviewFixture(repo: RepoStore, fixture: ShotPreviewFixtureId): void {
  // Reset first: a fixture that seeds no pipeline must not leave a previous
  // pin freezing the live snapshot (#0782).
  pinnedIntegration = null;
  switch (fixture) {
    case "closeOut:active":
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID);
      pinnedIntegration = repo.integration;
      break;
    case "closeOut:uploading":
      ensureFixtureTask(repo, "review");
      repo.integration = activePipeline(
        SHOT_PREVIEW_FIXTURE_TASK_ID,
        "uploading bundle 27 MB · 45s",
      );
      pinnedIntegration = repo.integration;
      break;
    case "closeOut:stalled":
      // A fixed far-past attempt: idle past the stall threshold at any capture
      // time, so the fixture task's card renders the stalled Cancel/Retry
      // actions (#0778). The fixture task itself must exist for its card to
      // render at all.
      ensureFixtureTask(repo, "review");
      repo.integration = activePipeline(
        SHOT_PREVIEW_FIXTURE_TASK_ID,
        null,
        "2026-01-01T00:00:00.000Z",
      );
      pinnedIntegration = repo.integration;
      break;
    case "card:doneError":
      ensureFixtureTask(repo, "review");
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID);
      pinnedIntegration = repo.integration;
      repo.doneErrors = {
        ...repo.doneErrors,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: {
          message: "Check gate failed — fixture for shot capture",
          conflicts: [],
          step: "check",
          failedAt: nowIso(),
          tldr: "Fixture done-error for handoff shots",
        },
      };
      break;
    case "board:withReviewTask":
      ensureFixtureTask(repo, "review");
      break;
    case "board:activeCoding":
      ensureFixtureTask(repo, "active");
      if (!repo.runningIds.includes(SHOT_PREVIEW_FIXTURE_TASK_ID)) {
        repo.runningIds = [...repo.runningIds, SHOT_PREVIEW_FIXTURE_TASK_ID];
      }
      break;
    case "board:cardChips":
      // A multi-area task with seeded diff stats, so the combined area chip
      // and the file-count chip both render on the board (#0776). No branch
      // (from the base fixture), so the card skips the diff-stats request.
      ensureFixtureTask(repo, "review", { area: "web, server", areas: ["web", "server"] });
      repo.seedDiffStats(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        filesChanged: 10,
        additions: 377,
        deletions: 5,
      });
      break;
    case "drawer:reviewWithBranch":
      // A review-status task with a non-empty branch, for TaskDrawer shots.
      // TaskCard and TaskDrawer only show actions and UI-changes pane when the
      // task has a branch and status is active/review. Seeded diff stats prevent
      // a network request that would fail and put console errors on the page (#0778).
      ensureFixtureTask(repo, "review", { branch: "feat/shot-fixture" });
      repo.seedDiffStats(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        filesChanged: 3,
        additions: 42,
        deletions: 8,
      });
      break;
    default:
      break;
  }
}
