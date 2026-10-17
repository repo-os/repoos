/**
 * Preview-only board fixtures driven by `?shotState=` on the capture URL (#0743).
 */
import {
  SHOT_PREVIEW_FIXTURE_QUERY,
  SHOT_PREVIEW_FIXTURE_TASK_ID,
  type ShotPreviewFixtureId,
  isShotPreviewFixtureId,
} from "../../../core/shot-fixtures.js";
import type { useConfigStore } from "../stores/config";
import type { useRepoStore } from "../stores/repo";
import type { DevTargetView, IntegrationPipelineSnapshot, Task } from "../types";

type RepoStore = ReturnType<typeof useRepoStore>;
type ConfigStore = ReturnType<typeof useConfigStore>;

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
  lastProgressAt: string = at,
): IntegrationPipelineSnapshot {
  return {
    empty: false,
    active: {
      taskId,
      stage: "check",
      failed: false,
      startedAt: at,
      lastProgressAt,
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

/** True while a preview handoff shot URL is loaded (`?shotState=`). */
export function isShotPreviewCaptureActive(location: Pick<Location, "search">): boolean {
  return readShotPreviewFixtureFromLocation(location) !== null;
}

/** Task id from `?task=` when a drawer shot deep-links a real board task (#0817). */
export function shotPreviewDrawerTaskIdFromLocation(location: Pick<Location, "search">): string {
  const raw = new URLSearchParams(location.search).get("task");
  const id = raw?.replace(/^#/, "") ?? "";
  return id || SHOT_PREVIEW_FIXTURE_TASK_ID;
}

const REQUIREMENTS_FIXTURE_BODY = [
  "## Problem",
  "",
  "Requirements change while the engineer works from a worktree copy.",
  "",
  "## Desired UX",
  "",
  "- Update requirements action on active tasks",
  "",
  "## Acceptance criteria",
  "",
  "- Activity records which sections changed",
  "",
  "## Notes for AI",
  "",
  "Fixture body for shot capture.",
].join("\n");

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
  if (fixture === "dev:running") {
    // #0801 — one started target (which should glow) beside one stopped target
    // (which should not), so a capture shows the highlight contrast.
    return [
      {
        name: "landing",
        kind: "server",
        command: "cd landing && bun run dev -- --port 5173 --host 127.0.0.1 --strictPort",
        label: "Landing page (HMR)",
        status: "running",
        pid: 51234,
        url: "http://127.0.0.1:5173",
        port: 5173,
        startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        log: ["VITE v5.4.10  ready in 210 ms", "", "  ➜  Local:   http://127.0.0.1:5173/"],
      },
      {
        name: "docs",
        kind: "server",
        command: "cd user-docs && bun run dev -- --port 5174 --host 127.0.0.1 --strictPort",
        label: "Docs site (HMR)",
        status: "stopped",
        url: "http://127.0.0.1:5174",
        port: 5174,
        log: ["[repoos] stopped"],
      },
    ];
  }
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
    case "closeOut:remoteTests": {
      // Started a few minutes ago (a non-zero elapsed on the card) but
      // heartbeating now, so it shows the current step + elapsed and is NOT
      // stalled (#0799).
      ensureFixtureTask(repo, "review");
      const startedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      repo.integration = activePipeline(
        SHOT_PREVIEW_FIXTURE_TASK_ID,
        "remote tests",
        startedAt,
        nowIso(),
      );
      pinnedIntegration = repo.integration;
      break;
    }
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
    case "card:humanStep":
      // #0804 — the decision model blocked a start: a ready card must show the
      // flag and its bounded explanation.
      ensureFixtureTask(repo, "ready", {
        needsInput: true,
        needsInputReason: "needs-human-step",
        needsInputDetail:
          "Decision model (91%): split this into an AI task and a human task — it needs a real account, credential, or API key.",
      });
      break;
    case "board:activeCoding":
      ensureFixtureTask(repo, "active");
      if (!repo.runningIds.includes(SHOT_PREVIEW_FIXTURE_TASK_ID)) {
        repo.runningIds = [...repo.runningIds, SHOT_PREVIEW_FIXTURE_TASK_ID];
      }
      repo.agentActivityAt = {
        ...repo.agentActivityAt,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: nowIso(),
      };
      break;
    case "board:cardChips":
      // A multi-area task assigned to a human with seeded diff stats, so the
      // combined area chip, the human chip and the file-count chip all render
      // on the board (#0776, #0795). No branch (from the base fixture), so the
      // card skips the diff-stats request.
      ensureFixtureTask(repo, "review", {
        area: "web, server",
        areas: ["web", "server"],
        assignee: "human",
        assignedTo: "Nick",
      });
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
    case "drawer:activeRequirements": {
      // #0817 — show Update requirements on an active task without mutating
      // board status on main. Prefer the real task from `?task=` so capture
      // does not hit /api/tasks/9999 (404 fails the handoff UI gate).
      const params = new URLSearchParams(window.location.search);
      const drawerId = shotPreviewDrawerTaskIdFromLocation(window.location);
      const existing = repo.tasks.find((t) => t.id === drawerId);
      if (existing) {
        Object.assign(existing, { status: "active", body: REQUIREMENTS_FIXTURE_BODY });
      } else if (
        !params.get("task") ||
        drawerId === SHOT_PREVIEW_FIXTURE_TASK_ID
      ) {
        // Seed #9999 when the shot deep-links it but the board has no such task
        // (avoids /api/tasks/9999 during handoff capture). Real ?task= ids that
        // are off-board are left alone — WorkView may fetch them once.
        ensureFixtureTask(repo, "active", { body: REQUIREMENTS_FIXTURE_BODY });
      }
      break;
    }
    case "card:handoffConflict":
      // #0810 — the "Worktree changed after handoff" modal only opens from a
      // failed Move to done. Seed the pending conflict on a board card so a
      // capture can show the changed-file list with its +/- counts. No branch
      // (like the other card fixtures): a card for the fake id must not fire a
      // diff-stats request, and the modal is reached without opening a drawer.
      ensureFixtureTask(repo, "review");
      repo.seedWorktreeHandoffConflict(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        message: "worktree changed after handoff: HEAD is 4f2a9c1e but handoff recorded 1b7d0a33.",
        files: [
          {
            path: "src/ui-app/src/components/WorktreeHandoffConflictDialog.vue",
            added: 41,
            removed: 6,
            taskFile: false,
          },
          { path: "src/ui-app/src/style.css", added: 32, removed: 0, taskFile: false },
          { path: "repoos.toml", added: 2, removed: 1, taskFile: false },
          {
            path: "work/0807-close-out-blocked-by-a-repoos-tom.md",
            added: 5,
            removed: 2,
            taskFile: true,
          },
        ],
      });
      break;
    default:
      break;
  }
}

/**
 * Apply a config-touching shot fixture (#0805). Deliberately separate from
 * `applyShotPreviewFixture`: the editor setting only exists after
 * `config.load()` resolves, so clearing it there would have to run AFTER the
 * load — otherwise the real `/api/config` response restores the editor command
 * and the "Set editor" hint this fixture exists to capture stays hidden.
 *
 * `editor:unconfigured` blanks both the general `editor.command` and the
 * dev-inspector override, so `editorConfigured` is false on every surface that
 * shows the hint (TaskDrawer Spec row, Context doc viewer, failed-tests list).
 */
export function applyShotPreviewConfigFixture(
  config: ConfigStore,
  fixture: ShotPreviewFixtureId,
): void {
  if (fixture !== "editor:unconfigured") return;
  const data = config.data;
  if (!data) return;
  const editor = data.editor as { command?: string } | undefined;
  if (editor) editor.command = "";
  const dev = data.dev as { inspector?: { editorCommand?: string } } | undefined;
  if (dev?.inspector) dev.inspector.editorCommand = "";
}
