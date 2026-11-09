/**
 * Preview-only board fixtures driven by `?shotState=` on the capture URL (#0743).
 */
import { ref } from "vue";
import {
  SHOT_PREVIEW_FIXTURE_QUERY,
  SHOT_PREVIEW_FIXTURE_TASK_ID,
  SHOT_PREVIEW_APPLIED_ATTR,
  type ShotPreviewFixtureId,
  isShotPreviewFixtureId,
} from "../../../core/shot-fixtures.js";
import type { ActivityAnimationStyle } from "../../../core/activity-animation.js";
import type { TaskSchedule } from "../../../core/schedule.js";
import type { useConfigStore } from "../stores/config";
import type { useRepoStore } from "../stores/repo";
import { useNoticesStore } from "../stores/notices";
import { useRemindersStore } from "../stores/reminders";
import { useUiStore } from "../stores/ui";
import type {
  CheckRunRow,
  CloseOutOutcomeEvent,
  DevTargetView,
  IntegrationPipelineSnapshot,
  RemoteTaskActivity,
  RemoteValidationEvent,
  RemoteValidationStatusView,
  RepoStatus,
  ShotMeta,
  SystemStats,
  Task,
  TaskCheckRun,
  TaskLogEntry,
  UiHandoffVerificationEvidence,
} from "../types";

const DEBUG_LOGS_FIXTURE_MESSAGE =
  "main advanced with bookkeeping-only commits — publishing without a merge conflict check on the candidate tree";

/**
 * The fixture task exists only in the preview board. Engineering-report
 * history is a real API read and 404s for that id, which fails the handoff
 * console check (#1011).
 */
export function shotPreviewSkipsEngineeringReportsFetch(
  location: Pick<Location, "search">,
  taskId: string,
): boolean {
  if (!isShotPreviewCaptureActive(location)) return false;
  return taskId === SHOT_PREVIEW_FIXTURE_TASK_ID;
}

/** Summary reports are also server-backed; the synthetic drawer task has none. */
export function shotPreviewSkipsTaskSummaryFetch(
  location: Pick<Location, "search">,
  taskId: string,
): boolean {
  return isShotPreviewCaptureActive(location) && taskId === SHOT_PREVIEW_FIXTURE_TASK_ID;
}

/** A preview drawer seeds its integration state locally; no job record exists for its task. */
export function shotPreviewSkipsIntegrationJobFetch(
  location: Pick<Location, "search">,
  taskId: string,
): boolean {
  return (
    isShotPreviewCaptureActive(location) && taskId === shotPreviewDrawerTaskIdFromLocation(location)
  );
}

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

/** True when preview capture should keep fixture remote-validation events. */
export function shotPreviewSkipsRemoteEventsFetch(
  location: Pick<Location, "search">,
  taskId: string,
): boolean {
  return shotPreviewSkipsTaskLogsFetch(location, taskId);
}

export type ShotPreviewDebugLogsSeed = {
  tasks: Task[];
  taskLogs: Record<string, TaskLogEntry[]>;
  taskRemoteEvents: Record<string, RemoteValidationEvent[]>;
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
  repo.taskRemoteEvents[drawerId] = [
    {
      at: "2026-10-18T03:22:00Z",
      level: "warn",
      phase: "run",
      host: "thinkpad",
      message: "Run stopped after its output stream went silent",
      hangEvidence: {
        condition: "host-idle",
        containerLogs:
          "[remote] installing dependencies\n[remote] building application\n[remote] running tests",
        containerState: '{"Status":"running","Running":true,"ExitCode":0}',
      },
    },
  ];
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

/** Run history pinned for the step timing report capture (#0970). */
let pinnedCheckRuns: CheckRunRow[] | null = null;
let pinnedTestCasesByRun: Map<number, import("../types").CheckRunTestCaseRow[]> | null = null;

export function shotFixturePinnedCheckRuns(): CheckRunRow[] | null {
  return pinnedCheckRuns;
}

export function shotFixturePinnedTestCases(
  runId: number,
): import("../types").CheckRunTestCaseRow[] | null {
  return pinnedTestCasesByRun?.get(runId) ?? null;
}

/** System resource stats pinned for the Control dashboard GC capture (#0923). */
let pinnedSystemStats: SystemStats | null = null;

export function shotFixturePinnedSystemStats(): SystemStats | null {
  return pinnedSystemStats;
}

/** The fixture-pinned pipeline snapshot, or null when nothing is pinned (#0782). */
export function shotFixturePinnedIntegration(): IntegrationPipelineSnapshot | null {
  return pinnedIntegration;
}

/**
 * The runner-pool status a fixture pinned (#0897), or null when none.
 *
 * The Remote runners panel polls `/api/remote-validation/status` and REPLACES
 * its rows every 3s; a preview has no runner, so without this a `runners:queued`
 * shot would race back to an idle panel. Only `applyShotPreviewFixture` writes
 * it, and that runs solely on preview builds with `?shotState=` (plus tests).
 */
let pinnedRemoteStatus: RemoteValidationStatusView | null = null;

/** The fixture-pinned runner status, or null when nothing is pinned (#0897). */
export function shotFixturePinnedRemoteStatus(): RemoteValidationStatusView | null {
  return pinnedRemoteStatus;
}

/** Fixture-pinned remote run/queue detail per task, for drawer shots (#0897). */
const pinnedTaskRemoteActivity: Record<string, RemoteTaskActivity> = {};

/** Fixture-pinned repo-root git status for the dirty-main button shot (#1030). */
let pinnedGitStatus: RepoStatus | null = null;

/** Fixture-pinned working-tree diff for the uncommitted-changes panel shot (#1030). */
let pinnedWorkingDiff: { patch: string; truncated: boolean } | null = null;

/** The fixture-pinned repo status, or null when nothing is pinned (#1030). */
export function shotFixturePinnedGitStatus(): RepoStatus | null {
  return pinnedGitStatus;
}

/** The fixture-pinned working-tree diff, or null when nothing is pinned (#1030). */
export function shotFixturePinnedWorkingDiff(): { patch: string; truncated: boolean } | null {
  return pinnedWorkingDiff;
}

/** The fixture-pinned remote activity for one task, or null (#0897). */
export function shotFixturePinnedTaskRemoteActivity(taskId: string): RemoteTaskActivity | null {
  return pinnedTaskRemoteActivity[taskId] ?? null;
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

/**
 * Synthetic runner pool for the `runners:queued` shot (#0897): one host busy
 * with a close-out and a handoff check queued behind it, so the panel shows the
 * job kind, per-phase timings, queue position and the blocker without needing
 * a real runner. The integration snapshot stays consistent with it.
 */
function runnersQueuedFixture(): {
  status: RemoteValidationStatusView;
  integration: IntegrationPipelineSnapshot;
} {
  const now = Date.now();
  const iso = (msAgo: number): string => new Date(now - msAgo).toISOString();
  const closeOutStartedAt = iso(6 * 60_000);
  const queuedForSlot = 12 * 60_000;
  return {
    status: {
      enabled: true,
      running: true,
      provider: "tailscale",
      tailscaleHosts: ["bee", "thinkpad", "mini"],
      hosts: [
        {
          host: "bee",
          user: "nick",
          labels: [],
          maxConcurrent: 1,
          inFlight: 1,
          queued: 1,
          probed: true,
          healthy: true,
          engineerClis: {
            host: "bee",
            user: "nick",
            ok: false,
            checkedAt: iso(60_000),
            cells: [
              {
                cli: "opencode",
                declared: true,
                installed: true,
                version: "1.2.3",
                auth: "signed-in",
                detail: "opencode-go",
                fix: null,
                ok: true,
              },
              {
                cli: "codex",
                declared: true,
                installed: true,
                version: "0.9.0",
                auth: "not-signed-in",
                detail: "login status: not signed in",
                fix: "codex login",
                ok: false,
              },
            ],
          },
          activeRuns: [
            {
              taskId: "0892",
              startedAt: closeOutStartedAt,
              kind: "close-out",
              stage: "run",
              elapsedMs: 18 * 60_000,
              phases: [
                {
                  phase: "queued",
                  startedAt: iso(18 * 60_000),
                  endedAt: iso(6 * 60_000),
                  durationMs: queuedForSlot,
                },
                {
                  phase: "bundle",
                  startedAt: iso(6 * 60_000),
                  endedAt: iso(6 * 60_000 - 8_000),
                  durationMs: 8_000,
                },
                {
                  phase: "upload",
                  startedAt: iso(6 * 60_000 - 8_000),
                  endedAt: iso(6 * 60_000 - 29_000),
                  durationMs: 21_000,
                },
                { phase: "run", startedAt: iso(6 * 60_000 - 29_000) },
              ],
            },
          ],
          queuedTasks: ["0897"],
          queuedRuns: [
            {
              taskId: "0897",
              kind: "handoff",
              host: "bee",
              position: 2,
              ahead: 1,
              since: iso(4 * 60_000),
              waitedMs: 4 * 60_000,
              blockers: [
                {
                  taskId: "0892",
                  kind: "close-out",
                  host: "bee",
                  startedAt: closeOutStartedAt,
                  elapsedMs: 6 * 60_000,
                },
              ],
            },
          ],
          serverStats: {
            available: true,
            sampledAt: iso(5_000),
            loadAverage: [0.4, 0.6, 0.7],
            cpuCount: 8,
            memoryUsedBytes: 6.2 * 1024 ** 3,
            memoryTotalBytes: 16 * 1024 ** 3,
            diskFreeBytes: 240 * 1024 ** 3,
          },
        },
        {
          host: "thinkpad",
          user: "nick",
          labels: [],
          maxConcurrent: 2,
          inFlight: 0,
          queued: 0,
          probed: true,
          healthy: true,
          activeRuns: [],
          queuedTasks: [],
          serverStats: {
            available: true,
            sampledAt: iso(5_000),
            loadAverage: [0.1, 0.2, 0.3],
            cpuCount: 8,
            memoryUsedBytes: 4.4 * 1024 ** 3,
            memoryTotalBytes: 16 * 1024 ** 3,
            diskFreeBytes: 310 * 1024 ** 3,
          },
        },
      ],
      tailscaleHost: "bee",
      tailscaleHostPinsTop: true,
      hostPoolEditable: false,
      activeServer: null,
      maxConcurrent: 1,
    },
    integration: {
      empty: false,
      active: {
        taskId: "0892",
        stage: "check",
        failed: false,
        startedAt: iso(18 * 60_000),
        lastProgressAt: iso(0),
        detail: "remote tests",
        phase: "validating",
        phaseStartedAt: closeOutStartedAt,
        phaseElapsedMs: 6 * 60_000,
        phaseTimings: [
          {
            phase: "queued",
            startedAt: iso(18 * 60_000),
            endedAt: iso(12 * 60_000),
            durationMs: 6 * 60_000,
          },
          {
            phase: "syncing",
            startedAt: iso(12 * 60_000),
            endedAt: closeOutStartedAt,
            durationMs: 6 * 60_000,
          },
          { phase: "validating", startedAt: closeOutStartedAt },
        ],
      },
      queue: ["0897"],
      queueEnqueuedAt: { "0897": iso(4 * 60_000) },
      queueDetail: [
        {
          taskId: "0897",
          position: 1,
          enqueuedAt: iso(4 * 60_000),
          waitedMs: 4 * 60_000,
          blockerTaskId: "0892",
          blockerPhase: "validating",
          blockerElapsedMs: 18 * 60_000,
        },
      ],
      at: iso(0),
    },
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

const TASK_CHECK_PROGRESS_FIXTURES: ReadonlySet<ShotPreviewFixtureId> = new Set([
  "checks:progress",
  "card:checksProgress",
  "drawer:checksProgress",
  "pipeline:checksProgress",
]);

/** Preview fixtures that pin a live `taskChecks` row on #9999 (#1054 pipeline shot). */
export function shotFixtureSeedsLiveTaskChecks(fixture: ShotPreviewFixtureId | null): boolean {
  return fixture !== null && TASK_CHECK_PROGRESS_FIXTURES.has(fixture);
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
 * A deterministic "newer release available" payload for the
 * `release:updateAvailable` capture fixture (#1073). The dialog only renders
 * its upgrade command block when `available` is true, which the live preview
 * board usually is not (the preview build tracks the version it was built
 * from). Returns null for any other fixture, so the component keeps its real
 * `/api/release/available` data. Also reports `standalone`, so the capture
 * shows the plain `repoos upgrade` command the majority of users run.
 */
export interface ShotPreviewAvailableRelease {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  releaseNotes: string;
  releaseUrl: string;
  installKind: "standalone" | "source" | "package-manager";
  upgradeCommand: string;
}

export function shotFixtureAvailableRelease(
  fixture: ShotPreviewFixtureId | null,
): ShotPreviewAvailableRelease | null {
  if (fixture !== "release:updateAvailable") return null;
  return {
    currentVersion: "0.5.79",
    latestVersion: "0.6.0",
    available: true,
    releaseNotes:
      "## Highlights\n\n- Release update dialog now shows the upgrade command\n- The Copy button puts the exact command on your clipboard",
    releaseUrl: "https://github.com/repo-os/repoos/releases/tag/v0.6.0",
    installKind: "standalone",
    upgradeCommand: "repoos upgrade",
  };
}

/**
 * The release payload a `release:updateAvailable` fixture pinned (#1073), or
 * null when none.
 *
 * `applyShotPreviewFixture` seeds this when the App applies the capture fixture,
 * and the component reads it synchronously on mount. Without the pin the
 * component had to out-race its own `/api/release/available` fetch (which
 * reports no update on the preview build): the capture mounted before
 * `/api/health` reported `isPreviewBuild`, the real payload landed first, and
 * the fixture never rendered — the shot then showed the applied marker with no
 * open dialog. A pin the component can read unconditionally removes the race.
 * Only `applyShotPreviewFixture` writes it, and that runs solely on preview
 * builds with `?shotState=` (plus tests).
 */
const pinnedAvailableRelease = ref<ShotPreviewAvailableRelease | null>(null);

/** The fixture-pinned release payload, or null when nothing is pinned (#1073). */
export function shotFixturePinnedAvailableRelease(): ShotPreviewAvailableRelease | null {
  return pinnedAvailableRelease.value;
}

/**
 * The reactive pin, so the update notification can open its dialog the moment
 * the App applies the fixture — even though the component mounts before the
 * App's own fixture pass runs (#1073).
 */
export const shotFixturePinnedAvailableReleaseRef = pinnedAvailableRelease;

/**
 * Two deterministic schedules for the `agents:scheduledSeeded` capture fixture
 * (#1005). Returns null for any other fixture, so the panel keeps its real
 * server data. One weekly row (with a last result, so the outcome detail and
 * the action column render) beside one daily row. Neither points at a real
 * task id: `lastTaskId` stays empty so a capture can never navigate to a
 * fixture task that the server 404s.
 */
export function shotFixtureSchedules(fixture: ShotPreviewFixtureId | null): TaskSchedule[] | null {
  if (fixture !== "agents:scheduledSeeded") return null;
  const now = new Date().toISOString();
  return [
    {
      id: "0001",
      title: "Weekly doc audit",
      enabled: true,
      cadence: "weekly",
      timezone: "Asia/Singapore",
      timeOfDay: "09:00",
      runAt: "",
      dayOfWeek: 1,
      taskTitle: "Audit docs",
      taskType: "chore",
      taskArea: "docs",
      taskPriority: "p2",
      taskAssignedTo: "ai",
      taskStatus: "ready",
      autoStartAgent: false,
      body: "## Problem\nDrift\n",
      nextRunPreview: "Mon, 9:00 AM",
      nextRunAt: null,
      lastRunAt: "",
      lastResult: "success",
      lastTaskId: "",
      lastError: "",
      lastOccurrenceKey: "",
      createdAt: now,
      updatedAt: now,
      path: "schedules/0001-weekly-doc-audit.md",
      templateUnderspecified: true,
      templateUnderspecifiedDetail:
        "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI",
    },
    {
      id: "0002",
      title: "Daily health check",
      enabled: true,
      cadence: "daily",
      timezone: "UTC",
      timeOfDay: "06:30",
      runAt: "",
      dayOfWeek: null,
      taskTitle: "Check health",
      taskType: "chore",
      taskArea: "ops",
      taskPriority: "p3",
      taskAssignedTo: "ai",
      taskStatus: "ready",
      autoStartAgent: false,
      body: "## Problem\nHealth\n",
      nextRunPreview: "Daily, 6:30 AM",
      nextRunAt: null,
      lastRunAt: "",
      lastResult: "",
      lastTaskId: "",
      lastError: "",
      lastOccurrenceKey: "",
      createdAt: now,
      updatedAt: now,
      path: "schedules/0002-daily-health-check.md",
      templateUnderspecified: false,
      templateUnderspecifiedDetail: "",
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

/** Handoff verification for `drawer:shotEvidence`: bookkeeping-only HEAD movement stays current. */
const SHOT_EVIDENCE_VERIFICATION: UiHandoffVerificationEvidence = {
  at: "2026-01-01T00:00:00.000Z",
  issues: [],
  blankShots: [],
  captures: 2,
  // The capture predates the reviewed tree; only bookkeeping paths changed.
  sourceIdentity: "fixture-old",
  stale: false,
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

/** Record that a fixture was applied, fail-soft for non-DOM tests. */
function setShotPreviewAppliedAttr(fixture: string): void {
  try {
    document.documentElement.setAttribute(SHOT_PREVIEW_APPLIED_ATTR, fixture);
  } catch {
    /* non-DOM test environments */
  }
}

/** Shrink the task drawer so narrow-width shots verify header wrapping. */
function setNarrowDrawerWidth(): void {
  try {
    useUiStore().drawerWidth = 360;
  } catch {
    /* store may not exist in some test setups */
  }
}

/**
 * Drop every fixture pin. Called at the start of `applyShotPreviewFixture` (a
 * fixture that seeds nothing must not inherit a previous fixture's pinned
 * state) and by tests between mounts, since the pins are module-level.
 */
export function resetShotFixturePins(): void {
  pinnedIntegration = null;
  pinnedSystemStats = null;
  pinnedCheckRuns = null;
  pinnedTestCasesByRun = null;
  pinnedRemoteStatus = null;
  pinnedGitStatus = null;
  pinnedWorkingDiff = null;
  pinnedAvailableRelease.value = null;
  for (const key of Object.keys(pinnedTaskRemoteActivity)) delete pinnedTaskRemoteActivity[key];
}

/** Apply a named fixture to the live board (preview builds only). */
export function applyShotPreviewFixture(repo: RepoStore, fixture: ShotPreviewFixtureId): void {
  // #0866: record that the app actually applied the fixture, so a capture can
  // tell "the drawer/board rendered" from a screenshot of the wrong target.
  try {
    document.documentElement.setAttribute(SHOT_PREVIEW_APPLIED_ATTR, fixture);
  } catch {
    /* non-DOM test environments */
  }
  // Reset first: a fixture that seeds no pipeline must not leave a previous
  // pin freezing the live snapshot (#0782).
  resetShotFixturePins();
  switch (fixture) {
    case "secrets:populated":
    case "secrets:removeDialog":
      // SecretsView reads this registered fixture and seeds fake metadata
      // locally, without fetching a project's actual environment data.
      break;
    case "release:updateAvailable":
      // #1073 — pin a newer-release payload so the update dialog opens with its
      // upgrade command block. The preview build reports no update of its own,
      // so the component reads this pin instead of racing its live fetch.
      pinnedAvailableRelease.value = shotFixtureAvailableRelease(fixture);
      break;
    case "system:worktreeGc":
      repo.systemStats = {
        machine: {
          cpuCount: 8,
          totalMem: 16 * 1024 ** 3,
          freeMem: 1024 ** 3,
          availableMem: 6 * 1024 ** 3,
          loadavg: [1.1, 1.3, 1.2],
          platform: "darwin",
        },
        totals: { cpuPercent: 12, memBytes: 4 * 1024 ** 3, memPercent: 25 },
        processes: [],
        serve: null,
        repo: {
          worktrees: 27,
          trackedFiles: 1840,
          linesOfCode: 263_400,
          worktreeWarnThreshold: 20,
        },
        serverPid: 1000,
        at: nowIso(),
      };
      pinnedSystemStats = repo.systemStats;
      break;
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
    case "runners:queued": {
      const seeded = runnersQueuedFixture();
      pinnedRemoteStatus = seeded.status;
      pinnedIntegration = seeded.integration;
      repo.integration = seeded.integration;
      // The drawer shot deep-links the fixture task; seed its remote activity
      // too so the same state explains itself in the task drawer (#0897).
      ensureFixtureTask(repo, "review");
      const drawerActivity: RemoteTaskActivity = {
        run: {
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          host: "bee",
          kind: "close-out",
          startedAt: seeded.status.hosts[0]!.activeRuns![0]!.startedAt,
          elapsedMs: 18 * 60_000,
          lastProgressAt: new Date().toISOString(),
          stage: "run",
          phases: seeded.status.hosts[0]!.activeRuns![0]!.phases ?? [],
        },
        queue: null,
      };
      pinnedTaskRemoteActivity[SHOT_PREVIEW_FIXTURE_TASK_ID] = drawerActivity;
      repo.taskRemoteActivity[SHOT_PREVIEW_FIXTURE_TASK_ID] = drawerActivity;
      break;
    }
    case "closeOut:active":
      repo.integration = activePipeline(SHOT_PREVIEW_FIXTURE_TASK_ID);
      pinnedIntegration = repo.integration;
      break;
    case "closeOut:checkProgress":
    case "closeOut:checkProgressUnknown": {
      const drawerTaskId = shotPreviewDrawerTaskIdFromLocation(window.location);
      const drawerTask = repo.tasks.find((task) => task.id === drawerTaskId);
      const taskId = drawerTask ? drawerTaskId : SHOT_PREVIEW_FIXTURE_TASK_ID;
      if (drawerTask) {
        // Keep real task details and identity in the drawer shot while making
        // sure the UI uses the current active-check presentation.
        drawerTask.status = "active";
      } else {
        ensureFixtureTask(repo, "active", {}, taskId);
      }
      repo.integration = activePipeline(taskId);
      pinnedIntegration = repo.integration;
      const unknown = fixture === "closeOut:checkProgressUnknown";
      const run: TaskCheckRun = {
        id: "shot-check-progress",
        taskId,
        kind: "merge-gate",
        startedAt: new Date(Date.now() - 4 * 60_000 - 10_000).toISOString(),
        finishedAt: null,
        durationMs: null,
        running: true,
        passed: null,
        code: null,
        output: "",
        scope: "full",
        machine: "bee",
        stepsDone: unknown ? 3 : 5,
        stepsTotal: unknown ? 10 : 12,
        currentStep: unknown ? 4 : 6,
        stepName: "tests",
        testsDone: unknown ? null : 140,
        testsTotal: unknown ? null : 289,
        testsPass: unknown ? null : 1,
        attempt: 2,
        attemptReason: "previous attempt timed out after 420s",
      };
      repo.taskChecks[taskId] = [run];
      break;
    }
    case "checks:timings":
    case "checks:reuse": {
      // Illustrative fixture data, never used in the measured audit report.
      pinnedCheckRuns = [
        {
          id: 970,
          taskId: "0970",
          phase: "pre-review",
          machine: "local",
          remote: false,
          scope: "changed:main",
          startedAt: nowIso(),
          durationMs: 29000,
          outcome: "pass",
          failedStep: null,
          skippedSteps:
            fixture === "checks:reuse" ? ["tests", "rendered-contrast"] : ["rendered-contrast"],
          failedTests: [],
          testsDone: fixture === "checks:reuse" ? null : 412,
          testsTotal: fixture === "checks:reuse" ? null : 412,
          testFileTimings:
            fixture === "checks:timings"
              ? [
                  { file: "src/ui-app/tests/check-store.test.ts", durationMs: 4200 },
                  { file: "src/ui-app/tests/agent-drivers.test.ts", durationMs: 3100 },
                ]
              : undefined,
          detail:
            fixture === "checks:reuse"
              ? "reused check 9822 — same clean commit and main base"
              : null,
          steps: [
            { name: "build", status: "passed", durationMs: 12000 },
            {
              name: "tests",
              status: fixture === "checks:reuse" ? "skipped" : "passed",
              durationMs: fixture === "checks:reuse" ? 0 : 17000,
            },
            { name: "rendered-contrast", status: "skipped", durationMs: 0 },
          ],
        },
      ];
      if (fixture === "checks:timings") {
        pinnedTestCasesByRun = new Map([
          [
            970,
            [
              {
                file: "src/ui-app/tests/check-store.test.ts",
                name: "check-run store > stores per-test cases",
                caseId: "shot-case-slow",
                retry: 0,
                durationMs: 8900,
                result: "passed",
                runId: 970,
                startedAt: nowIso(),
                taskId: "0970",
                phase: "pre-review",
                machine: "local",
                remote: false,
                scope: "changed:main",
              },
              {
                file: "src/ui-app/tests/agent-drivers.test.ts",
                name: "agent drivers > survives concurrent turns",
                caseId: "shot-case-mid",
                retry: 1,
                durationMs: 5200,
                result: "passed",
                runId: 970,
                startedAt: nowIso(),
                taskId: "0970",
                phase: "pre-review",
                machine: "local",
                remote: false,
                scope: "changed:main",
              },
            ],
          ],
        ]);
      }
      break;
    }
    case "checks:progress": {
      // Active engineer + heartbeating handoff check (#1000 shot): agent output
      // can be quiet while the card shows `checking · …`, not `stuck · silent`.
      ensureFixtureTask(repo, "active", {
        title: "Handoff check in progress while agent waits",
      });
      if (!repo.runningIds.includes(SHOT_PREVIEW_FIXTURE_TASK_ID)) {
        repo.runningIds = [...repo.runningIds, SHOT_PREVIEW_FIXTURE_TASK_ID];
      }
      repo.agentActivityAt = {
        ...repo.agentActivityAt,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: new Date(Date.now() - 9 * 60_000).toISOString(),
      };
      const checkStarted = new Date(Date.now() - 10 * 60_000).toISOString();
      const checkHeartbeat = new Date(Date.now() - 15_000).toISOString();
      repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID] = [
        {
          id: "shot-check-progress-page",
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "handoff-finalize",
          startedAt: checkStarted,
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "changed:main",
          machine: "air",
          stepsDone: 5,
          stepsTotal: 12,
          currentStep: 6,
          stepName: "tests",
          testsDone: 109,
          testsTotal: 645,
          testsPass: 1,
          lastProgressAt: checkHeartbeat,
          attempt: 1,
        },
      ];
      break;
    }
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
        "uploading bundle to thinkpad · 45 MB / 201 MB (22%) · 1.2 MB/s · ~2m left · attempt 1 · 95s in stage · full bundle (mirror empty)",
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
    // #1030 — a dirty repo-root checkout, so a capture can show the full-width
    // amber button under the sidebar git-state row and the panel it opens.
    case "repo:dirtyMain":
      pinnedGitStatus = {
        ok: true,
        branch: "main",
        detached: false,
        baseBranch: "main",
        dirty: [
          { path: "src/ui-app/src/components/SidebarGitState.vue", status: " M" },
          { path: "src/ui-app/src/style.css", status: " M" },
          { path: "notes/scratch.md", status: "??" },
        ],
        head: "9f3c2a1",
        recentCommits: [
          {
            sha: "9f3c2a1d4e5f60718293a4b5c6d7e8f901234567",
            shortSha: "9f3c2a1",
            subject: "feat: full-width dirty-main button",
            body: "",
            authorName: "Ada Lovelace",
            authorEmail: "ada@example.com",
            date: nowIso(),
            refs: ["main"],
            parents: [],
            taskId: null,
          },
        ],
        path: "/Users/you/repoos",
        computedAt: nowIso(),
      };
      // Seed the row now; the pin above keeps a late initial fetch/SSE push
      // from replacing it during the capture.
      repo.gitStatus = pinnedGitStatus;
      pinnedWorkingDiff = {
        truncated: false,
        patch: [
          "diff --git a/src/ui-app/src/components/SidebarGitState.vue b/src/ui-app/src/components/SidebarGitState.vue",
          "index 1111111..2222222 100644",
          "--- a/src/ui-app/src/components/SidebarGitState.vue",
          "+++ b/src/ui-app/src/components/SidebarGitState.vue",
          "@@ -330,3 +330,12 @@",
          '   <div class="row side-git">',
          '+  <button class="side-git-dirty">',
          "+    3 uncommitted changes",
          "+  </button>",
          "   </div>",
          "",
          "diff --git a/src/ui-app/src/style.css b/src/ui-app/src/style.css",
          "index 3333333..4444444 100644",
          "--- a/src/ui-app/src/style.css",
          "+++ b/src/ui-app/src/style.css",
          "@@ -930,2 +930,9 @@",
          "+.side-git-dirty {",
          "+  width: 100%;",
          "+}",
          "",
        ].join("\n"),
      };
      break;
    case "pages:scroll":
      for (let i = 0; i < 30; i++) {
        ensureFixtureTask(
          repo,
          i % 2 ? "ready" : "review",
          {
            title: `Delivery item ${i + 1}: verify the complete page remains reachable`,
            story: `Delivery slice ${Math.floor(i / 2) + 1}`,
          },
          `scroll-${i}`,
        );
      }
      break;
    case "board:withReviewTask":
      ensureFixtureTask(repo, "review");
      break;
    case "card:reviewChecksRunning":
      ensureFixtureTask(repo, "review", { title: "Review passed · merge checks still running" });
      repo.reviews = {
        ...repo.reviews,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: {
          running: false,
          enabled: true,
          lines: [],
          report: {
            id: SHOT_PREVIEW_FIXTURE_TASK_ID,
            at: new Date().toISOString(),
            agent: "reviewer",
            cli: "opencode",
            model: "default",
            branch: "feat/shot-fixture",
            state: "ok",
            markdown: "## Verdict\ngood to go — nothing blocks sign-off.",
          },
        },
      };
      repo.seedLandable(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
        branch: "feat/shot-fixture",
        headSha: "a".repeat(40),
        lockSha: "a".repeat(40),
        landable: false,
        checks: [
          {
            id: "merge-conflicts",
            label: "Checks running",
            status: "fail",
            detail: "Post-review checks are running",
          },
        ],
        summary: { pass: 5, warn: 0, fail: 1 },
      });
      break;
    case "board:pipeline": {
      // #1035 — one lane per stage plus the special states, so the Pipeline
      // capture shows the whole track. Empty branches keep every card clear
      // of diff-stats fetches that would 404 on fixture ids (#0768).
      const agoMin = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
      const runCheck = (
        taskId: string,
        kind: "handoff-finalize" | "merge-gate",
        startedMinAgo: number,
        stepsDone: number,
        stepsTotal: number,
      ): void => {
        repo.taskChecks[taskId] = [
          {
            id: `shot-pipe-check-${taskId}`,
            taskId,
            kind,
            startedAt: agoMin(startedMinAgo),
            finishedAt: null,
            durationMs: null,
            running: true,
            passed: null,
            code: null,
            output: "",
            scope: "changed:main",
            machine: "air",
            stepsDone,
            stepsTotal,
            currentStep: stepsDone + 1,
            lastProgressAt: new Date().toISOString(),
          },
        ];
      };
      const runAgent = (taskId: string, activeMinAgo: number): void => {
        const at = agoMin(activeMinAgo);
        repo.pausedIds = repo.pausedIds.filter((id) => id !== taskId);
        if (!repo.runningIds.includes(taskId)) {
          repo.runningIds = [...repo.runningIds, taskId];
        }
        repo.runningSince = { ...repo.runningSince, [taskId]: at };
        repo.agentActivityAt = { ...repo.agentActivityAt, [taskId]: at };
      };
      ensureFixtureTask(
        repo,
        "active",
        { title: "Coding lane: engineer writing code", priority: "p1" },
        "pipe-coding",
      );
      runAgent("pipe-coding", 0);
      ensureFixtureTask(
        repo,
        "active",
        { title: "Checks lane: self-check running", priority: "p2" },
        "pipe-checks",
      );
      runAgent("pipe-checks", 9);
      runCheck("pipe-checks", "merge-gate", 6, 3, 8);
      ensureFixtureTask(
        repo,
        "active",
        { title: "Handoff lane: confirming handoff", priority: "p0" },
        "pipe-handoff",
      );
      runAgent("pipe-handoff", 12);
      runCheck("pipe-handoff", "handoff-finalize", 4, 2, 8);
      pinnedTaskRemoteActivity["pipe-handoff"] = {
        run: {
          taskId: "pipe-handoff",
          host: "bee",
          kind: "handoff",
          startedAt: agoMin(4),
          elapsedMs: 4 * 60_000,
          lastProgressAt: new Date().toISOString(),
          stage: "run",
          phases: [],
        },
        queue: null,
      };
      repo.taskRemoteActivity["pipe-handoff"] = pinnedTaskRemoteActivity["pipe-handoff"]!;
      ensureFixtureTask(
        repo,
        "review",
        { title: "Review lane: reviewer inspecting", priority: "p1" },
        "pipe-review",
      );
      repo.reviews = {
        ...repo.reviews,
        ["pipe-review"]: { running: true, enabled: true, lines: [], report: null },
      };
      ensureFixtureTask(
        repo,
        "review",
        { title: "Close-out lane: merging to main", priority: "p1" },
        "pipe-closeout",
      );
      repo.integration = activePipeline("pipe-closeout");
      pinnedIntegration = repo.integration;
      ensureFixtureTask(
        repo,
        "done",
        { title: "Merged lane: just landed", priority: "p2", releasedAt: new Date().toISOString() },
        "pipe-done",
      );
      ensureFixtureTask(
        repo,
        "active",
        {
          title: "Stuck lane: agent went silent",
          priority: "p2",
          needsInput: true,
          needsInputReason: "dev-error",
          needsInputDetail: "The agent exited with an error.",
        },
        "pipe-stuck",
      );
      runAgent("pipe-stuck", 30);
      ensureFixtureTask(
        repo,
        "active",
        {
          title: "Held lane: parked out of automation",
          priority: "p3",
          isHeld: true,
          holdReason: "Waiting for machine capacity before resuming automation",
          holdBy: "driver",
          holdAt: agoMin(60),
          holdUntil: new Date(Date.now() + 86_400_000).toISOString(),
        },
        "pipe-held",
      );
      ensureFixtureTask(
        repo,
        "active",
        {
          title: "Review changes: engineer updating code",
          priority: "p1",
          extra: { review_passes: 1, review_rounds: 1 },
        },
        "pipe-sentback",
      );
      runAgent("pipe-sentback", 1);
      repo.reviews = {
        ...repo.reviews,
        ["pipe-sentback"]: {
          running: false,
          enabled: true,
          lines: [],
          report: {
            id: "pipe-sentback",
            at: agoMin(20),
            agent: "reviewer",
            cli: "opencode",
            model: "default",
            branch: "",
            state: "ok",
            markdown: "## Verdict\nback to the drawing board\n\nTwo findings to fix.\n",
          },
        },
      };
      ensureFixtureTask(repo, "ready", { title: "Queued behind the track" }, "pipe-queued");
      break;
    }
    case "card:held":
    case "drawer:held":
      ensureFixtureTask(repo, "active", {
        title: "Parked while machine capacity recovers",
        isHeld: true,
        holdReason: "Waiting for machine capacity before resuming automation",
        holdBy: "driver",
        holdAt: nowIso(),
        holdUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });
      break;
    case "card:agentFailed":
      // #0997 — an engineer that stopped with a concrete cause. The card must
      // hover and act on that reason, and its dirty worktree makes "Restart
      // work" open the restart confirmation.
      ensureFixtureTask(repo, "active", {
        title: "Failed after crash recovery",
        needsInput: true,
        needsInputReason: "dev-error",
        needsInputDetail:
          "crash recovery could not start the engineer: Could not create the task worktree: not a git repository",
        git: {
          branchExists: true,
          worktreeExists: true,
          lastCommit: null,
          lastCommitAt: null,
          worktreePath: "/tmp/repo-worktrees/feat/agent-failed-fixture",
          dirty: true,
        },
      });
      break;
    case "card:humanStep":
      // #0804 / #0909 — needs-human-step: card and drawer show the quoted
      // criterion plus the model's bounded explanation.
      ensureFixtureTask(repo, "ready", {
        assignee: "human",
        assignedTo: "Nick",
        needsInput: true,
        needsInputReason: "needs-human-step",
        needsInputDetail:
          'Criterion "Rotate the API keys in the dev config" — Decision model (91%): split this into an AI task and a human task — it needs a real account, credential, or API key.',
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
    case "card:checkWaitDetail":
    case "drawer:checkWaitDetail": {
      const longWait =
        "waiting: waiting for a local check slot (3 ahead, position 4); waiting behind #1030 check (pid 50649, alive), #1024 check (pid 70210, alive), #1024 check (pid 57029, alive), #1025 check (pid 55123, alive), #1026 check (pid 60042, alive), #1027 check (pid 61001, alive), #1028 check (pid 62002, alive), #1029 check (pid 63003, alive), #1031 check (pid 64004, alive), #1032 check (pid 65005, alive), #1033 check (pid 66006, alive); slot holder has made no progress for 30 minutes (no heartbeat); pool local-check is at max concurrency; the run will start automatically once a slot frees up; no action is needed while the queue drains, and the watchdog will escalate again if this wait keeps growing for 11s";
      ensureFixtureTask(repo, "active", {
        title: "Check wait escalation fixture",
        needsInput: true,
        needsInputReason: "check-wait",
        needsInputDetail: longWait,
      });
      break;
    }
    case "checks:waiting":
      ensureFixtureTask(repo, "active", { title: "Check waiting behind a live slot holder" });
      repo.resourceQueueMarkers = [
        {
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "local-check",
          position: 1,
          ahead: 0,
          since: new Date(Date.now() - 15 * 60_000).toISOString(),
          message: "waiting for a check slot behind a live holder",
        },
      ];
      repo.runningIds = [...repo.runningIds, SHOT_PREVIEW_FIXTURE_TASK_ID];
      break;
    case "board:activeCoding":
      ensureFixtureTask(repo, "active");
      repo.pausedIds = repo.pausedIds.filter((id) => id !== SHOT_PREVIEW_FIXTURE_TASK_ID);
      if (!repo.runningIds.includes(SHOT_PREVIEW_FIXTURE_TASK_ID)) {
        repo.runningIds = [...repo.runningIds, SHOT_PREVIEW_FIXTURE_TASK_ID];
      }
      repo.runningSince = {
        ...repo.runningSince,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: nowIso(),
      };
      repo.agentActivityAt = {
        ...repo.agentActivityAt,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: nowIso(),
      };
      break;
    case "board:severalWorkingCards":
      for (let i = 0; i < 6; i++) {
        const taskId = `0980-${i + 1}`;
        ensureFixtureTask(
          repo,
          "active",
          { title: `Working task ${i + 1}: activity preview fixture` },
          taskId,
        );
        if (!repo.runningIds.includes(taskId)) repo.runningIds.push(taskId);
        repo.agentActivityAt = { ...repo.agentActivityAt, [taskId]: nowIso() };
      }
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
    case "agents:scheduledSeeded":
      // #1005 — seed the schedule list itself, not just a panel flag. Going
      // through the shared fixture entry point also stamps the applied marker
      // that a capture probes (`shotStateProblem`), so a declared
      // `state: agents:scheduledSeeded` verifies instead of reporting a wrong screen.
      repo.schedules = shotFixtureSchedules(fixture) ?? [];
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
      const queuedAt = nowIso();
      repo.queuedMessages = {
        ...repo.queuedMessages,
        [drawerId]: {
          count: 1,
          queuedAt,
          overdue: false,
          items: [
            {
              text: "Please review the updated acceptance criteria when this turn ends.",
              queuedAt,
              source: "board-update",
            },
          ],
        },
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
    case "drawer:reviewPasses": {
      ensureFixtureTask(repo, "review", { branch: "feat/shot-fixture" });
      const latestAt = "2026-11-02T10:00:00.000Z";
      const olderAt = "2026-11-01T10:00:00.000Z";
      repo.reviews[SHOT_PREVIEW_FIXTURE_TASK_ID] = {
        running: false,
        enabled: true,
        lines: [],
        report: {
          id: SHOT_PREVIEW_FIXTURE_TASK_ID,
          at: latestAt,
          agent: "reviewer",
          cli: "codex",
          model: "gpt-5",
          branch: "feat/shot-fixture",
          state: "ok",
          markdown: "## Verdict\ngood to go.\n\nThe latest pass is ready to merge.\n",
        },
        history: [
          {
            pass: 1,
            at: olderAt,
            state: "ok",
            verdict: "good to go",
            agent: "reviewer",
            cli: "cursor",
            model: "composer",
          },
          {
            pass: 2,
            at: latestAt,
            state: "ok",
            verdict: "good to go",
            agent: "reviewer",
            cli: "codex",
            model: "gpt-5",
          },
        ],
      };
      break;
    }
    case "drawer:engineeringReports":
      ensureFixtureTask(repo, "active", { branch: "feat/shot-fixture" });
      break;
    case "drawer:postMergeSummary": {
      ensureFixtureTask(repo, "done", { branch: "" });
      break;
    }
    case "drawer:statusReviewFailed":
      ensureFixtureTask(repo, "review", { branch: "feat/shot-fixture" });
      repo.reviews[SHOT_PREVIEW_FIXTURE_TASK_ID] = {
        running: false,
        enabled: true,
        lines: [],
        report: {
          id: "shot-review-failed",
          at: new Date().toISOString(),
          agent: "Fixture reviewer",
          cli: "fixture",
          model: "fixture",
          branch: "feat/shot-fixture",
          state: "incomplete",
          markdown: "",
        },
      };
      repo.seedDiffStats(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        filesChanged: 2,
        additions: 18,
        deletions: 4,
      });
      break;
    case "drawer:statusChecksRunning": {
      ensureFixtureTask(repo, "active", { branch: "feat/shot-fixture" });
      // Handoff in flight: the card and the panel both read "running checks"
      // while this gate runs (#1023).
      repo.handoffSteps[SHOT_PREVIEW_FIXTURE_TASK_ID] = "check";
      repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID] = [
        {
          id: "shot-drawer-check-running",
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "merge-gate",
          startedAt: new Date(Date.now() - 70_000).toISOString(),
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "changed:main",
          machine: "fixture host",
          stepsDone: 3,
          stepsTotal: 8,
          currentStep: 4,
          stepName: "tests",
          testsDone: 24,
          testsTotal: 72,
        },
      ];
      break;
    }
    case "drawer:statusConfirmingHandoff":
      ensureFixtureTask(repo, "active", { branch: "feat/shot-fixture" });
      repo.handoffSteps[SHOT_PREVIEW_FIXTURE_TASK_ID] = "check";
      break;
    case "drawer:statusHandoffFailed":
      ensureFixtureTask(repo, "active", { branch: "feat/shot-fixture" });
      repo.setHandoffError(SHOT_PREVIEW_FIXTURE_TASK_ID, "The fixture handoff check failed.");
      break;
    case "drawer:statusChecksFailed":
      ensureFixtureTask(repo, "active", {
        branch: "feat/shot-fixture",
        path: "work/9999-task-side-panel-status-chip-two-line-header-width-verification.md",
        extra: { check_retry_count: 2 },
      });
      repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID] = [
        {
          id: "shot-drawer-check-failed",
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "merge-gate",
          startedAt: new Date(Date.now() - 240_000).toISOString(),
          finishedAt: new Date(Date.now() - 10_000).toISOString(),
          durationMs: 230_000,
          running: false,
          passed: false,
          code: 1,
          output: "The test step failed after retries.",
          scope: "changed:main",
          machine: "fixture host",
        },
      ];
      break;
    case "drawer:statusReviewFailedNarrow":
      applyShotPreviewFixture(repo, "drawer:statusReviewFailed");
      setShotPreviewAppliedAttr("drawer:statusReviewFailedNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:statusChecksRunningNarrow":
      applyShotPreviewFixture(repo, "drawer:statusChecksRunning");
      setShotPreviewAppliedAttr("drawer:statusChecksRunningNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:closeOutBuilding":
    case "drawer:closeOutRemoteTests": {
      ensureFixtureTask(repo, "review", { branch: "feat/shot-fixture" });
      const startedAt = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const building = fixture === "drawer:closeOutBuilding";
      repo.integration = activePipeline(
        SHOT_PREVIEW_FIXTURE_TASK_ID,
        building ? "building candidate" : "remote tests",
        startedAt,
        nowIso(),
      );
      if (building && repo.integration.active) repo.integration.active.stage = "build";
      pinnedIntegration = repo.integration;
      break;
    }
    case "drawer:closeOutBuildingNarrow":
      applyShotPreviewFixture(repo, "drawer:closeOutBuilding");
      setShotPreviewAppliedAttr("drawer:closeOutBuildingNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:closeOutRemoteTestsNarrow":
      applyShotPreviewFixture(repo, "drawer:closeOutRemoteTests");
      setShotPreviewAppliedAttr("drawer:closeOutRemoteTestsNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:statusConfirmingHandoffNarrow":
      applyShotPreviewFixture(repo, "drawer:statusConfirmingHandoff");
      setShotPreviewAppliedAttr("drawer:statusConfirmingHandoffNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:statusChecksFailedNarrow":
      applyShotPreviewFixture(repo, "drawer:statusChecksFailed");
      setShotPreviewAppliedAttr("drawer:statusChecksFailedNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:statusDetails":
      applyShotPreviewFixture(repo, "drawer:statusReviewFailed");
      setShotPreviewAppliedAttr("drawer:statusDetails");
      {
        // Opening the drawer resets to the review tab. Put Status details
        // back so the capture's highlight is mounted (#0972).
        const ui = useUiStore();
        const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
        if (task) ui.open(task);
        ui.activeTab = "debug";
        ui.debugView = "status";
      }
      break;
    case "drawer:landableNarrow":
      applyShotPreviewFixture(repo, "drawer:landable");
      setShotPreviewAppliedAttr("drawer:landableNarrow");
      setNarrowDrawerWidth();
      break;
    case "drawer:landable":
      // #0867 — a review task whose landing checklist has one real failing
      // merge, so a capture shows the same result the command prints.
      ensureFixtureTask(repo, "review", { branch: "feat/shot-fixture" });
      repo.seedDiffStats(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        filesChanged: 2,
        additions: 18,
        deletions: 4,
      });
      repo.seedLandable(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
        branch: "feat/shot-fixture",
        headSha: "a".repeat(40),
        lockSha: "a".repeat(40),
        landable: false,
        checks: [
          {
            id: "review-verdict",
            label: "Review verdict",
            status: "pass",
            detail: 'latest review pass is "good to go"',
          },
          {
            id: "review-lock",
            label: "Review lock",
            status: "pass",
            detail: "lock sha aaaaaaa matches worktree HEAD aaaaaaa",
          },
          {
            id: "worktree-clean",
            label: "Worktree clean",
            status: "pass",
            detail: "worktree is clean",
          },
          {
            id: "merge-conflicts",
            label: "Merge with main",
            status: "fail",
            detail:
              "src/core/types.ts conflicts with main: merge main into the branch, keep both sides",
            nextStep:
              "Merge main into the branch (repoos sync <id>), keep both sides, then re-request review",
          },
          {
            id: "task-scope",
            label: "Task scope",
            status: "pass",
            detail: "diff changes 2 files, all within this task",
          },
          {
            id: "main-clean",
            label: "Main clean",
            status: "pass",
            detail: "main has no uncommitted files",
          },
        ],
        summary: { pass: 5, warn: 0, fail: 1 },
      });
      break;
    case "drawer:tabExpandWarnings":
      // #0922 — compose the real landing checklist with the other two warning
      // states that used to crowd it out of the tab viewport.
      applyShotPreviewFixture(repo, "drawer:landable");
      ensureFixtureTask(repo, "review", {
        branch: "feat/shot-fixture",
        needsInput: true,
        needsInputReason: "review-failed",
        needsInputDetail: "The reviewer found issues that need attention.",
      });
      repo.setHandoffError(SHOT_PREVIEW_FIXTURE_TASK_ID, "Fixture handoff check failed");
      document.documentElement.setAttribute(SHOT_PREVIEW_APPLIED_ATTR, fixture);
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
    case "drawer:nativePreviewBuilding": {
      const drawerId = shotPreviewDrawerTaskIdFromLocation(window.location);
      ensureFixtureTask(
        repo,
        "active",
        {
          area: "mac",
          previewTargets: [{ name: "macOS Hub", areas: ["mac"], platform: "macos" }],
          preview: {
            port: 0,
            url: "",
            startedAt: nowIso(),
            label: "macOS Hub",
            native: { platform: "macos", device: "Mac mini" },
            starting: true,
          },
        },
        drawerId,
      );
      break;
    }
    case "drawer:nativePreviewRunning": {
      const drawerId = shotPreviewDrawerTaskIdFromLocation(window.location);
      ensureFixtureTask(
        repo,
        "active",
        {
          area: "ios",
          previewTargets: [{ name: "iOS Simulator", areas: ["ios"], platform: "ios" }],
          preview: {
            port: 0,
            url: "",
            startedAt: nowIso(),
            label: "iOS Simulator",
            native: { platform: "ios", device: "iPhone 17" },
          },
        },
        drawerId,
      );
      break;
    }
    case "drawer:nativePreviewFailed": {
      const drawerId = shotPreviewDrawerTaskIdFromLocation(window.location);
      // A branch is required for the drawer to show the preview start control
      // ("No preview running." + Start) instead of the branchless hint, and
      // seeded diff stats keep the branch's diff-stats fetch from logging a
      // console error during capture (#0778 pattern).
      ensureFixtureTask(
        repo,
        "active",
        {
          area: "ios",
          branch: "feat/shot-fixture",
          previewTargets: [{ name: "iOS Simulator", areas: ["ios"], platform: "ios" }],
        },
        drawerId,
      );
      repo.seedDiffStats(SHOT_PREVIEW_FIXTURE_TASK_ID, {
        filesChanged: 2,
        additions: 12,
        deletions: 3,
      });
      repo.pushToast(
        "Native preview failed: xcodebuild exited with code 65 — see task preview log for details.",
        "error",
      );
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
    case "panel:defaultScreenshotPicker":
      useUiStore().openNewTask();
      break;
    case "drawer:checksProgress":
    case "card:checksProgress": {
      applyShotPreviewFixture(repo, "drawer:statusChecksRunning");
      // #1057: engineer already exited; server-side handoff still running.
      repo.runningIds = repo.runningIds.filter((id) => id !== SHOT_PREVIEW_FIXTURE_TASK_ID);
      const startedAt = new Date(Date.now() - 133_000).toISOString();
      repo.handoffStatuses[SHOT_PREVIEW_FIXTURE_TASK_ID] = {
        state: "running",
        step: "verify",
        startedAt,
        updatedAt: new Date().toISOString(),
        attempt: 1,
        progress: null,
        machine: "remote host",
      };
      repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID] = [
        {
          id: "shot-checks-progress-1054",
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "handoff-finalize",
          startedAt,
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "changed:main",
          machine: "remote host",
          stepsDone: null,
          stepsTotal: null,
          currentStep: null,
          stepName: "tests",
          testsDone: 3,
          testsTotal: 680,
          testsPass: 1,
        },
      ];
      if (fixture === "drawer:checksProgress") {
        const ui = useUiStore();
        const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
        if (task) ui.open(task);
      }
      setShotPreviewAppliedAttr(fixture);
      break;
    }
    case "pipeline:checksProgress": {
      ensureFixtureTask(repo, "active", {
        title: "Pipeline checks lane: counted tests",
        priority: "p2",
        branch: "feat/shot-fixture",
      });
      delete repo.handoffSteps[SHOT_PREVIEW_FIXTURE_TASK_ID];
      if (!repo.runningIds.includes(SHOT_PREVIEW_FIXTURE_TASK_ID)) {
        repo.runningIds = [...repo.runningIds, SHOT_PREVIEW_FIXTURE_TASK_ID];
      }
      repo.agentActivityAt = {
        ...repo.agentActivityAt,
        [SHOT_PREVIEW_FIXTURE_TASK_ID]: new Date(Date.now() - 6 * 60_000).toISOString(),
      };
      const startedAt = new Date(Date.now() - 133_000).toISOString();
      repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID] = [
        {
          id: "shot-pipeline-checks-progress-1054",
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "merge-gate",
          startedAt,
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "",
          scope: "changed:main",
          machine: "remote host",
          stepsDone: 3,
          stepsTotal: 9,
          currentStep: 4,
          stepName: "tests",
          testsDone: 3,
          testsTotal: 680,
          testsPass: 1,
          lastProgressAt: new Date().toISOString(),
        },
      ];
      setShotPreviewAppliedAttr(fixture);
      break;
    }
    case "drawer:checksReuse":
      applyShotPreviewFixture(repo, "card:checksReuse");
      {
        const ui = useUiStore();
        const task = repo.tasks.find((t) => t.id === SHOT_PREVIEW_FIXTURE_TASK_ID);
        if (task) ui.open(task);
      }
      setShotPreviewAppliedAttr("drawer:checksReuse");
      break;
    case "card:checksReuse": {
      ensureFixtureTask(repo, "active", { branch: "feat/shot-fixture" });
      const startedAt = new Date(Date.now() - 41_000).toISOString();
      repo.handoffSteps[SHOT_PREVIEW_FIXTURE_TASK_ID] = "check";
      repo.handoffStatuses[SHOT_PREVIEW_FIXTURE_TASK_ID] = {
        state: "running",
        step: "check",
        startedAt,
        updatedAt: new Date().toISOString(),
        attempt: 2,
        progress: null,
        machine: "fixture host",
      };
      repo.taskChecks[SHOT_PREVIEW_FIXTURE_TASK_ID] = [
        {
          id: "shot-card-check-reuse",
          taskId: SHOT_PREVIEW_FIXTURE_TASK_ID,
          kind: "handoff-finalize",
          startedAt,
          finishedAt: null,
          durationMs: null,
          running: true,
          passed: null,
          code: null,
          output: "reused check 9822 — same clean commit and main base",
          scope: "changed:main",
          machine: "fixture host",
          attempt: 2,
        },
      ];
      setShotPreviewAppliedAttr("card:checksReuse");
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
    fixture === "pages:scroll" ||
    fixture === "editor:unconfigured" ||
    fixture === "budget:paused" ||
    fixture in SETTINGS_FIXTURE_STYLE
  );
}

export function applyShotPreviewConfigFixture(
  config: ConfigStore,
  fixture: ShotPreviewFixtureId,
): void {
  if (fixture === "pages:scroll") {
    if (config.data) config.data.stories = { enabled: true };
    return;
  }
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
