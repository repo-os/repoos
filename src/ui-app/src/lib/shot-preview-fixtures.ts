/**
 * Preview-only board fixtures driven by `?shotState=` on the capture URL (#0743).
 */
import {
  SHOT_PREVIEW_FIXTURE_QUERY,
  SHOT_PREVIEW_FIXTURE_TASK_ID,
  type ShotPreviewFixtureId,
  isShotPreviewFixtureId,
} from "../../../core/shot-fixtures.js";
import type { ActivityAnimationStyle } from "../../../core/activity-animation.js";
import type { useConfigStore } from "../stores/config";
import type { useRepoStore } from "../stores/repo";
import { useNoticesStore } from "../stores/notices";
import { useRemindersStore } from "../stores/reminders";
import { useUiStore } from "../stores/ui";
import type {
  CloseOutOutcomeEvent,
  DevTargetView,
  IntegrationPipelineSnapshot,
  ShotMeta,
  Task,
  TaskLogEntry,
  UiHandoffVerificationEvidence,
} from "../types";

const DEBUG_LOGS_FIXTURE_MESSAGE =
  "main advanced with bookkeeping-only commits — publishing without a merge conflict check on the candidate tree";

/** True when preview capture should keep fixture debug logs instead of fetching. */
export function shotPreviewSkipsTaskLogsFetch(
  location: Pick<Location, "search">,
  taskId: string,
): boolean {
  if (!isShotPreviewCaptureActive(location)) return false;
  const fixture = readShotPreviewFixtureFromLocation(location);
  if (fixture !== "drawer:debugLogs") return false;
  return taskId === shotPreviewDrawerTaskIdFromLocation(location);
}

export type ShotPreviewDebugLogsSeed = {
  tasks: Task[];
  taskLogs: Record<string, TaskLogEntry[]>;
};

/** Seed Debug-tab log rows for `drawer:debugLogs` shots (#0829). */
export function seedShotPreviewDebugLogs(repo: ShotPreviewDebugLogsSeed, drawerId: string): void {
  const existing = repo.tasks.find((t) => t.id === drawerId);
  if (existing) {
    Object.assign(existing, { status: "done" });
  } else {
    repo.tasks.push(
      fixtureTask({
        id: drawerId,
        status: "done",
        path: `work/${drawerId}-debug-shot-fixture.md`,
        absPath: `/tmp/repo/work/${drawerId}-debug-shot-fixture.md`,
      }),
    );
  }
  const longLog: TaskLogEntry = {
    timestamp: "2026-10-18T03:21:00Z",
    level: "info",
    component: "task",
    message: DEBUG_LOGS_FIXTURE_MESSAGE,
    context: { from: "main", to: "feat/branch" },
  };
  const shortLog: TaskLogEntry = {
    timestamp: "2026-10-18T03:20:00Z",
    level: "info",
    component: "task",
    message: "close-out complete — published to main",
  };
  repo.taskLogs[drawerId] = [longLog, shortLog];
}

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

function fixtureTask(over: Partial<Task> = {}, taskId = SHOT_PREVIEW_FIXTURE_TASK_ID): Task {
  return {
    id: taskId,
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
    path: `work/${taskId}-shot-preview-fixture.md`,
    absPath: `/tmp/repo/work/${taskId}-shot-preview-fixture.md`,
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
  taskId = SHOT_PREVIEW_FIXTURE_TASK_ID,
): void {
  const existing = repo.tasks.find((t) => t.id === taskId);
  const task = fixtureTask({ status, ...overrides }, taskId);
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
    // (which should not), so a capture shows the highlight contrast. #0843 —
    // the started target carries an auto-ported companion service, so a
    // capture shows the service sub-row (status, real port, PID) beside it.
    return [
      {
        name: "landing",
        kind: "server",
        command:
          "cd landing && bun run dev -- --port {port} --host 127.0.0.1 --api-port {api.port}",
        label: "Landing page (HMR)",
        status: "running",
        pid: 51234,
        url: "http://127.0.0.1:5173",
        port: 5173,
        startedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
        services: [
          {
            name: "api",
            token: "api",
            status: "running",
            pid: 51233,
            port: 41257,
            url: "http://127.0.0.1:41257/api/health",
            command: "bun --watch src/server/index.ts",
            log: ["listening on 127.0.0.1:41257", "GET /api/health 200"],
          },
        ],
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

/**
 * Fixture body for `drawer:shotEvidence` (#0819): the `## Activity` docs-skip
 * note the Changes tab parses into the "Docs site skipped: no docs shot
 * declared" warning + its "How to declare a docs route" link.
 */
const SHOT_EVIDENCE_FIXTURE_BODY = [
  "## Problem",
  "",
  "A docs change was captured but no declared shot named a docs route.",
  "",
  "## Activity",
  "",
  "- 2026-06-01T00:00:00Z · note: shots: skipped — Docs site skipped: no docs shot declared",
].join("\n");

// Tiny inline images so the shot rows and viewer render without a server fetch
// for a fixture task (a real PNG URL would 404 and log a console error).
const SHOT_EVIDENCE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const SHOT_EVIDENCE_GIF =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * Captured shots for `drawer:shotEvidence` (#0819): one whose handoff verdict
 * is "check" with a plain-words warning, one clean "matches". `capturedAt` is
 * older than the docs-skip activity note so `shotProblems` does not supersede
 * that warning.
 */
const SHOT_EVIDENCE_SHOTS: ShotMeta[] = [
  {
    name: "default-1.png",
    target: "default",
    route: "/work",
    label: "Docs route (check)",
    provenance: "declared: Docs route (check)",
    path: "shots/default-1.png",
    url: SHOT_EVIDENCE_PNG,
    size: 68,
    mime: "image/png",
    capturedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    name: "default-2.png",
    target: "default",
    route: "/",
    label: "Board (matches)",
    provenance: "declared: Board (matches)",
    path: "shots/default-2.png",
    url: SHOT_EVIDENCE_GIF,
    size: 43,
    mime: "image/gif",
    capturedAt: "2026-01-01T00:00:00.000Z",
  },
];

/** Handoff verification for `drawer:shotEvidence`: a check with a warning + a clean match. */
const SHOT_EVIDENCE_VERIFICATION: UiHandoffVerificationEvidence = {
  at: "2026-01-01T00:00:00.000Z",
  issues: [],
  blankShots: [],
  captures: 2,
  sourceIdentity: "fixture000",
  captureDetails: [
    {
      target: "default",
      route: "/work",
      label: "Docs route (check)",
      url: SHOT_EVIDENCE_PNG,
      finalRoute: "/work",
      routeMatched: true,
      assertions: [],
      assertionsPassed: 0,
      assertionsChecked: 0,
      shot: { name: "default-1.png", path: "shots/default-1.png", url: SHOT_EVIDENCE_PNG },
      targetWarnings: ["click .fullscreen-toggle: Timeout 30000ms exceeded"],
    },
    {
      target: "default",
      route: "/",
      label: "Board (matches)",
      url: SHOT_EVIDENCE_GIF,
      finalRoute: "/",
      routeMatched: true,
      assertions: [],
      assertionsPassed: 0,
      assertionsChecked: 0,
      shot: { name: "default-2.png", path: "shots/default-2.png", url: SHOT_EVIDENCE_GIF },
    },
  ],
  warnings: [],
};

/** Apply a named fixture to the live board (preview builds only). */
export function applyShotPreviewFixture(repo: RepoStore, fixture: ShotPreviewFixtureId): void {
  // Reset first: a fixture that seeds no pipeline must not leave a previous
  // pin freezing the live snapshot (#0782).
  pinnedIntegration = null;
  switch (fixture) {
    case "reminders:due": {
      const reminders = useRemindersStore();
      reminders.fixturePinned = true;
      const now = Date.now();
      reminders.now = now;
      reminders.links = [
        { value: "agent:cursor", label: "Agent · cursor" },
        { value: "provider:openrouter", label: "Provider · OpenRouter" },
      ];
      reminders.reminders = [
        {
          id: "00000000-0000-4000-8000-000000000001",
          text: "Check Cursor credit — the reset should be ready",
          fireAt: new Date(now - 3_600_000).toISOString(),
          link: "agent:cursor",
          doneAt: "",
          snoozedAt: "",
          notifiedFireAt: "",
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          state: "due",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          text: "Check OpenRouter after the maintenance window",
          fireAt: new Date(now + 52 * 3_600_000).toISOString(),
          link: "provider:openrouter",
          doneAt: "",
          snoozedAt: "",
          notifiedFireAt: "",
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
          state: "upcoming",
        },
      ];
      break;
    }
    case "closeOut:active":
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID);
      pinnedIntegration = repo.integration;
      break;
    case "integration:median15": {
      ensureFixtureTask(repo, "review");
      const startedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID, null, startedAt, nowIso());
      pinnedIntegration = repo.integration;
      // Minimised pill is the default for an active job; shots target the median tooltip there (#0829).
      useUiStore().setIntegrationBarCollapsed(true);
      const outcomes: CloseOutOutcomeEvent[] = Array.from({ length: 15 }, (_, i) => ({
        taskId: `0${i}`,
        outcome: "succeeded",
        finishedAt: new Date(Date.now() - i * 60_000).toISOString(),
        reason: "",
        durationMs: (i + 1) * 60_000,
      }));
      useNoticesStore().closeOutOutcomes = outcomes;
      break;
    }
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
    case "card:reviewRoundsExhausted": {
      // #0832 — exhausted review rounds: card shows stripped/clamped summary only.
      const fixtureTaskId = "0832";
      const longWhy =
        "Three UI regressions remain in the task drawer and the contrast audit still fails on the settings page; also re-check the handoff shots before the next review round.";
      const verdictLine = `\`needs some work\` — ${longWhy}`;
      ensureFixtureTask(
        repo,
        "review",
        {
          title: "Review rounds exhausted fixture",
          needsInput: true,
          needsInputReason: "review-rounds-exhausted",
          needsInputDetail: verdictLine,
          extra: { review_rounds: 2 },
        },
        fixtureTaskId,
      );
      repo.reviews = {
        ...repo.reviews,
        [fixtureTaskId]: {
          running: false,
          enabled: true,
          lines: [],
          report: {
            id: fixtureTaskId,
            at: new Date().toISOString(),
            agent: "reviewer",
            cli: "opencode",
            model: "default",
            branch: "feat/shot-preview-fixture",
            state: "ok",
            markdown: `## Verdict\n${verdictLine}\n\n## Bugs\n- Contrast failure on settings.\n`,
          },
        },
      };
      break;
    }
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
    case "board:startWorkPending":
      ensureFixtureTask(repo, "ready");
      repo.seedStartWorkPending(SHOT_PREVIEW_FIXTURE_TASK_ID);
      break;
    case "drawer:startWorkPending":
      ensureFixtureTask(repo, "ready");
      repo.seedStartWorkPending(SHOT_PREVIEW_FIXTURE_TASK_ID);
      break;
    case "schedule:newPanel":
      useUiStore().scheduleEditorShotOpen = true;
      break;
    case "drawer:queuedMessage": {
      // #0821 — the drawer task (the shot's `?task=`) with a running agent and
      // one message queued for when the turn ends, so the Dev composer shows its
      // "Queued" notice while send stays usable. No fake task is seeded: the
      // route deep-links a REAL task id, so the drawer's `/shots`,
      // `/ui-verification` and `/diff-stats` fetches all resolve — a #9999
      // fixture would 404 and fail the handoff UI gate.
      const drawerId = shotPreviewDrawerTaskIdFromLocation(window.location);
      if (!repo.runningIds.includes(drawerId)) {
        repo.runningIds = [...repo.runningIds, drawerId];
      }
      repo.agentActivityAt = { ...repo.agentActivityAt, [drawerId]: nowIso() };
      repo.queuedMessages = {
        ...repo.queuedMessages,
        [drawerId]: { count: 1, queuedAt: nowIso(), overdue: false },
      };
      break;
    }
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
    case "card:noChanges":
      ensureFixtureTask(repo, "ready", {
        branch: "feat/no-changes",
        assignee: "human",
        assignedTo: "Nick",
      });
      repo.seedDiffStats(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        filesChanged: 0,
        additions: 0,
        deletions: 0,
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
      } else if (!params.get("task") || drawerId === SHOT_PREVIEW_FIXTURE_TASK_ID) {
        // Seed #9999 when the shot deep-links it but the board has no such task
        // (avoids /api/tasks/9999 during handoff capture). Real ?task= ids that
        // are off-board are left alone — WorkView may fetch them once.
        ensureFixtureTask(repo, "active", { body: REQUIREMENTS_FIXTURE_BODY });
      }
      break;
    }
    case "drawer:shotEvidence":
      // #0819 — a review task (no branch, so no diff-stats request for the
      // fake id) whose Changes tab carries a captured shot with a handoff
      // verdict + warning and a docs-skip activity note, so a capture can show
      // the screenshot viewer header and the docs warning + link.
      ensureFixtureTask(repo, "review", { body: SHOT_EVIDENCE_FIXTURE_BODY });
      repo.seedShotEvidence(
        SHOT_PREVIEW_FIXTURE_TASK_ID,
        SHOT_EVIDENCE_SHOTS,
        SHOT_EVIDENCE_VERIFICATION,
      );
      break;
    case "drawer:debugLogs":
      seedShotPreviewDebugLogs(repo, shotPreviewDrawerTaskIdFromLocation(window.location));
      break;
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
    case "panel:newInputOutstandingUpload": {
      const ui = useUiStore();
      ui.openNewInput();
      repo.inputAttachmentUploads.push({
        batchId: "fixture-batch",
        inputId: "0664",
        attachment: {
          name: "sketch.png",
          mime: "image/png",
          dataUrl: "data:image/png;base64,QUJD",
          size: 3,
          uploadPhase: "failed",
          uploadError: "Network error while uploading",
        },
      });
      break;
    }
    case "panel:freeformFailedScreenshot": {
      const ui = useUiStore();
      ui.openNewTask();
      ui.pendingScreenshots.push({
        name: "bug.png",
        mime: "image/png",
        dataUrl: "data:image/png;base64,QUJD",
        size: 3,
        uploadPhase: "failed",
        uploadError: "Upload failed — try again",
        uploadTaskId: "0664",
      });
      break;
    }
    case "card:checkpointRecovery":
      // #0834 — a review task whose branch moved after handoff only by WIP self-
      // check checkpoints, so the card renders "re-reviewing checkpoint…"
      // instead of going silent. Like the other card fixtures: no branch, so
      // the fake id fires no diff-stats request, and no drawer fetch either.
      ensureFixtureTask(repo, "review");
      repo.setCheckpointRecovery(SHOT_PREVIEW_FIXTURE_TASK_ID, true);
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
/**
 * Settings activity-animation preview fixtures → the style they seed. One entry
 * per style worth capturing; the Settings select and its live preview then show
 * that artwork on the shot.
 */
const SETTINGS_FIXTURE_STYLE: Partial<Record<ShotPreviewFixtureId, ActivityAnimationStyle>> = {
  "settings:birdQuickTrail": "bird-quick-trail",
  "settings:rgbKeystorm": "rgb-keystorm",
  "settings:wheelieCourier": "wheelie-courier",
  "settings:booSwoop": "boo-swoop",
  "settings:pumpkinSpell": "pumpkin-spell",
};

/** Config-only shot fixtures (applied after `/api/config` loads, #0805). */
export function isShotPreviewConfigFixture(fixture: ShotPreviewFixtureId): boolean {
  return (
    fixture === "editor:unconfigured" ||
    fixture === "budget:paused" ||
    fixture in SETTINGS_FIXTURE_STYLE
  );
}

export function applyShotPreviewConfigFixture(
  config: ConfigStore,
  fixture: ShotPreviewFixtureId,
): void {
  if (fixture === "editor:unconfigured") {
    const data = config.data;
    if (!data) return;
    const editor = data.editor as { command?: string } | undefined;
    if (editor) editor.command = "";
    const dev = data.dev as { inspector?: { editorCommand?: string } } | undefined;
    if (dev?.inspector) dev.inspector.editorCommand = "";
    return;
  }
  if (fixture === "budget:paused") {
    // #0850 — one whole-agent pause and one per-model pause, with a reason and
    // a future resume date so the chip renders exactly as a real paused row.
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    if (config.data) {
      config.data["budget.allowlist"] = [
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedUntil: until,
          pausedReason: "Cursor credits exhausted",
        },
        {
          cli: "opencode",
          models: ["deepseek v4", "big pickle"],
          pausedModels: [
            {
              model: "big pickle",
              pausedReason: "Rate limited",
              pausedUntil: until,
            },
          ],
        },
        { cli: "claude code", models: ["sonnet"] },
      ];
    }
    return;
  }
  const style = SETTINGS_FIXTURE_STYLE[fixture];
  if (style) {
    config.form.activityAnimationStyle = style;
    if (config.data) config.data.activityAnimationStyle = style;
    config.notifyExternalFormUpdate();
  }
}
