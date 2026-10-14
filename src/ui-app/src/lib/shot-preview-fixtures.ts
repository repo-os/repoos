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
import type { IntegrationPipelineSnapshot, Task } from "../types";

type RepoStore = ReturnType<typeof useRepoStore>;

const nowIso = (): string => new Date().toISOString();

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

function activePipeline(taskId: string): IntegrationPipelineSnapshot {
  const at = nowIso();
  return {
    empty: false,
    active: {
      taskId,
      stage: "check",
      failed: false,
      startedAt: at,
      lastProgressAt: at,
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

/** Apply a named fixture to the live board (preview builds only). */
export function applyShotPreviewFixture(repo: RepoStore, fixture: ShotPreviewFixtureId): void {
  switch (fixture) {
    case "closeOut:active":
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID);
      break;
    case "card:doneError":
      ensureFixtureTask(repo, "review");
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID);
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
    default:
      break;
  }
}
