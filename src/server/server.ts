/**
 * The RepoOS local server. Dependency-free: built on the Node/Bun `http`
 * module (Bun implements the same API, so this runs unchanged on both).
 *
 * It is a thin TRANSPORT over the LiveIndex + safe writers. No business logic
 * lives here that isn't already in core. Endpoints:
 *
 *   GET  /api/health           -> { ok, root, taskCount, workDir, version, buildAt }
 *                                (?reload=<secret> replies with reloadHandshake for a
 *                                 reload replacement's readiness probe)
 *   POST /api/server/restart   -> trigger the auto-reload path (see server/reload.ts);
 *                                returns { state: "reloading" | "deferred" | "not-stale" }
 *   GET  /api/tasks            -> Task[]            (?status=active to filter)
 *   GET  /api/tasks/:id        -> Task | 404  (includes `preview` when running)
 *   GET  /api/tasks/:id/stats  -> { ok, stats } task's historical session stats
 *   GET  /api/counts           -> { inbox, ready, ... }
 *   GET  /api/index            -> full RepoIndex snapshot
 *   GET  /api/stats/board      -> { ok, stats } board-level summary stats
 *   GET  /api/stats/by-type    -> { ok, stats } session stats grouped by type
 *   GET  /api/docs             -> [{ path, title, mtimeMs }]  (context docs listing)
 *   GET  /api/repo/log         -> git log page { commits, nextCursor, branch } (?branch=&path=&limit=&before=&includeDocs=1)
 *   GET  /api/repo/branches    -> { defaultBranch, branches } local heads, default first
 *   POST /api/repo/commit      -> commit all changes in the repo root checkout on its current branch { message }
 *   GET  /api/repo/status      -> repo root checkout git state { branch, detached, dirty, head, recentCommits } (#0584)
 *   GET  /api/repo/working-diff[/file] -> uncommitted edits in the root checkout
 *   GET  /api/repo/commits/:sha -> one commit + changed files + patch
 *   GET  /api/repo/commits/:sha/file -> { before, after } contents at parent vs commit
 *   POST /api/docs/create      -> create a document { path, content }; returns { ok, path }
 *   POST /api/docs/freeform    -> create a document from description via the PM agent; returns { ok, path }
 *   GET  /api/skills           -> [{ path, name, description }]  (skills listing)
 *   POST /api/skills/create    -> create a skill { name, description, body } | { name, content }; returns { ok, path }
 *   POST /api/skills/freeform  -> create a skill from description via the PM agent; returns { ok, path }
 *   GET  /api/chat             -> RepoOS Guide identity, transcript, and running state
 *   POST /api/chat/message     -> start or continue the persistent repository chat
 *   POST /api/tasks            -> create  { title, type?, area?, priority?, assignedTo? }
 *   POST /api/tasks/freeform   -> create from a freeform explanation via the PM agent
 *   PATCH/api/tasks/:id        -> patch   { status?, title?, ... }
 *   POST /api/tasks/:id/start  -> launch the engineer agent on the task (ready -> active);
 *                                also relaunches a paused active task (stays active)
 *   POST /api/tasks/:id/pause  -> stop the running agent; task stays active
 *   POST /api/tasks/:id/message -> send a follow-up to the task's agent session (active, review)
 *   POST /api/tasks/:id/pm/message -> send a message to the PM agent about this task
 *   GET  /api/tasks/:id/output -> { lines, stats } the retained transcript + live run stats (0080)
 *   GET  /api/tasks/:id/review -> { ok, running, enabled, review, lines } the agent's
 *                                 review report + reviewer conversation for a task in `review`
 *   POST /api/tasks/:id/review/again   -> start a fresh review run against the current worktree
 *   POST /api/tasks/:id/clear-worktree -> force-remove a worktree close-out kept, delete its merged branch, clear the flag
 *   POST /api/tasks/:id/needs-input/dismiss -> clear needs_input (flag, reason, detail, questions) and log who dismissed it
 *   POST /api/tasks/:id/review/message -> send a follow-up to the reviewer (its own session)
 *   DELETE /api/tasks/:id      -> remove  the task file (emits task.deleted)
 *   POST /api/tasks/:id/archive   -> shelve the task: is_archived=true, optional { detail };
 *                                    status/branch/worktree untouched; refused while a run/review/preview/close-out is live
 *   POST /api/tasks/:id/unarchive -> clear is_archived + archive_detail, restoring the original status
 *   POST /api/tasks/:id/preview       -> start a read-only preview of the task's worktree
 *   POST /api/tasks/:id/preview/stop  -> stop it (also DELETE /preview)
 *   POST /api/tasks/:id/attachments   -> attach a screenshot { name, mime, data(base64) };
 *                                        records a `## Screenshots` section in the task body
 *   GET  /api/tasks/:id/attachments/:file -> serve a stored screenshot image
 *   GET  /api/stories          -> the registered story definitions under `stories/`
 *   POST /api/stories/freeform -> create a story from a freeform description (PM fleshes it out)
 *   DELETE /api/stories/:key   -> remove a registered story's definition file (tasks keep their tag) #0634
 *   POST /api/stories/:key/pm/message   -> send a message to the PM agent about this story (0515)
 *   POST /api/stories/:key/pm/interrupt -> stop the in-flight PM turn about this story
 *   GET  /api/stories/:key/pm/output    -> { lines, stats } the story PM transcript + live run stats
 *   GET  /api/agents/running   -> [{ id, pid, startedAt, lastOutputAt? }] running agents
 *   GET  /api/agents/queued    -> [{ id, queuedAt }] agents waiting for a free maxConcurrentAgents slot
 *   GET  /api/agents/detect        -> { agents, cachedAt } — cached results, instant
 *   GET  /api/agents/detect/stream -> SSE: event:agent per agent, event:done at end
 *   POST /api/agents/updates   -> { updates: { [id]: { status, source, checkedAt, ... } } }
 *   GET  /api/supervisor/status -> { ok, enabled, mode, latestHeartbeat } supervisor status
 *   GET  /api/supervisor/heartbeats -> { ok, heartbeats } recent supervisor heartbeats
 *   POST /api/supervisor/check-now -> { ok } run a supervisor check immediately
 *   GET  /api/events           -> SSE stream of RepoEvent
 *
 * The SSE stream is the live heartbeat the Stage 3 UI subscribes to.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync, accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { extname, join, dirname, resolve, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Agent, RepoOSConfig, SkillMeta, Status, Task } from "../core/types.js";
import { STATUSES } from "../core/types.js";
import { readBuildMeta } from "../core/build.js";
import { injectBuildHashIntoUiIndex } from "../core/ui-index.js";
import { createRepoOS } from "../core/repoos.js";
import { ensureInputNumbers } from "../core/input.js";
import { ensureStoryNumbers } from "../core/story-definition-files.js";
import { detectAgents, type DetectedAgent } from "../core/detect.js";
import { listModelSources, type ModelSourceResult } from "../core/models.js";
import { createLogger, type Logger } from "../core/logger.js";
import {
  AGENT_CLIS,
  AGENT_MODELS,
  DEFAULT_AGENTS,
  agentsForConfig,
  getConfigSchema,
  patchTomlConfig,
  parseFlatToml,
  loadConfig,
  resolveServePort,
  sanitizeBuiltInAgents,
  saveBuiltInAgentsConfig,
  projectDisplayName,
} from "../core/config.js";
import {
  ensureWorktree,
  commitTaskFile,
  commitFiles,
  resetWorktree,
  syncBranchWithMain,
  worktreePathForBranch,
  tuneRepoForScale,
  runGit,
} from "../core/git.js";
import { sweepAndWarn } from "../core/worktree-gc.js";
import { onGitMutation } from "../core/git-activity.js";
import { createRepoStatusNotifier, isSameCheckout } from "./repo-status.js";
import { remoteJobCapabilities, summarizeRemoteFallbackDetail } from "./pre-review-remote-gate.js";
import {
  hostRunner,
  remoteHostLimit,
  remoteHostUser,
  resolveRemoteHosts,
} from "../core/remote-hosts.js";
import { runBuiltInAgent, isDueForScheduledRun, builtInAgentLabel } from "./built-in-agents.js";
import { LiveIndex, type RepoEvent } from "./live-index.js";
import { AutoEngineeringOrchestrator } from "./auto-engineering.js";
import { WorkWatcher } from "./watcher.js";
import {
  patchTaskFile,
  deleteTaskFile,
  WriteError,
  PathGuardError,
  type TaskPatch,
} from "./write.js";
import { renderPwaIcon } from "./icons.js";
import {
  AgentRunner,
  deriveBranch,
  resolveEngineer,
  resolvePmAgent,
  resolveAgentForTask,
  resolveRepoGuide,
  runPrompt,
} from "./agents.js";
import { parseGeneratedTask, pmPrompt, explanationTitle } from "./freeform.js";
import { runAreaMigrationPass } from "./area-migration.js";
import { sweepUnderspecifiedTasks } from "./task-underspecified-flag.js";
import { FreeformRunManager } from "./freeform-runs.js";
import { pmChatSessionTaskId, clearPmChatSession, isPmWorking } from "./pm-runs.js";
import { attachPendingPmImages } from "./pm-attachments.js";
import { clearStoryPmChat, isStoryPmWorking } from "../core/story-definition-files.js";
import { completeTask, type DoneStep, type CloseOutLock } from "./done.js";
import { closeOutPending, createJobCoordinator, type JobCoordinator } from "./integration-job.js";
import { createCloseOutOutcomeStore } from "./close-out-outcome.js";
import { createAttentionEventStore } from "./attention-events.js";
import { createCtoActionRateStore } from "./cto-action-rates.js";
import { runCtoMonitorSafeActions } from "./cto-actions.js";
import { wireAttentionNotifications } from "./attention-notify.js";
import { CloseOutOrchestrator } from "./integration-orchestrator.js";
import { createRemoteValidator, type RemoteValidator } from "./remote-validation.js";
import { computeSlowRunFlags } from "./attention-feed.js";
import { buildIntegrationSnapshot } from "./integration-status.js";
import { resolvePipelineCheckPlan } from "./check-plan-info.js";
import { createRepositoryLock, createRootLock } from "./repo-lock.js";
import { clearWorktreeHandoffProtection } from "./worktree-handoff-guard.js";
import {
  handoffTask,
  finalizeReviewHandoff,
  scheduleCheckFailureRetry,
  scheduleMergeConflictRetry,
  type HandoffOrigin,
} from "./handoff.js";
import { scheduleCloseOutRepairHandback } from "./close-out-repair.js";
import {
  lastHandoffFailureFromBody,
  parkTaskForIdenticalHandoffFailures,
  parseHandoffFailureReason,
  persistHandoffFailureLoopMetadata,
  readTaskBranchHead,
  shouldParkForIdenticalHandoffFailures,
  shouldSkipHandoffValidationForUnchangedTree,
} from "./handoff-failure-loop.js";
import { PreviewManager, probePreview } from "./preview.js";
import { ConfigWatcher } from "./config-watch.js";
import { runAutoShotCapture } from "./shot-capture.js";
import { ReviewManager } from "./review.js";
import { tryAutoApproveAfterCleanReview } from "./approval-policy.js";
import { SkillSuggestionManager, markOriginTask } from "./skill-suggestions.js";
import { DebugTldrManager } from "./debug-tldr.js";
import { TestRunManager } from "./test-run.js";
import { TaskCheckManager, type TaskCheckListener } from "./task-check.js";
import { CTOManager } from "./cto.js";
import { CTOMonitor } from "./cto-monitor.js";
import { CtoHeartbeatTracker } from "./cto-heartbeat.js";
import { ReloadManager, readBuildHash, isDevBuild } from "./reload.js";
import { ServeReaper, isPortListening } from "./serve-reaper.js";
import { isLoopbackAddress, localTokenMatches, writeLocalCliToken } from "./local-token.js";
import { recordApiRouteCatalog } from "./api-route-catalog.js";
import { testModelCombination } from "./model-test.js";
import {
  generateReleaseNotes,
  getAvailableRelease,
  getRelease,
  getReleaseDistribution,
  getReleaseNotesRun,
  getReleaseRun,
  getUnpushedReleaseNotes,
  runRelease,
} from "./routes/release.js";
import { getDeployments, postDeploy } from "./routes/deployments.js";
import { bootstrap } from "../core/bootstrap.js";
import { generateContextPack, resumePreamble } from "../core/context-pack.js";
import {
  sampleSystem,
  psAvailable,
  reapStrayServeProcesses,
  killTrackedProcess,
  type SystemStats,
} from "./system.js";
import { readTunnelConfig, writeTunnelConfig } from "../core/tunnel.js";
import { readRegistry, unionApps } from "../core/tunnel-registry.js";
import { portListening } from "../core/net-probe.js";
import {
  attachTaskNotificationHandlers,
  notificationContextFromConfig,
} from "./notifications/index.js";
import { AgentSupervisor } from "./supervisor.js";
import { TaskWatchdog } from "./task-watchdog.js";
import {
  bootstrapTelegramAtBoot,
  getTelegramProvider,
  resetTelegramProviders,
} from "./telegram/index.js";
import { createTelegramGuideTurn } from "./telegram/guide-chat.js";
import { parseCookies, SESSION_COOKIE_NAME, randomHex } from "../core/auth.js";
import { getAuthStore } from "../core/auth-store.js";
import {
  Router,
  type RouteContext,
  // Info routes
  health,
  restart,
  getCounts,
  getIndex,
  getBoard,
  getDocs,
  getRepoLog,
  getRepoBranches,
  getRepoStatusRoute,
  commitRepoRoot,
  getRepoCommitRoute,
  getRepoCommitFile,
  getRepoWorkingDiff,
  getRepoWorkingDiffFile,
  getSkills,
  getRegistryCurated,
  searchRegistry,
  getRegistryDetail,
  installRegistry,
  getSystem,
  getSystemLogs,
  getTunnelStatus,
  getChat,
  sendChatMessage,
  interruptChatMessage,
  initInfoHandlers,
  getDebugger,
  sendDebuggerMessage,
  interruptDebugger,
  repairWithDebugger,
  getTaskDebugger,
  sendTaskDebuggerMessage,
  interruptTaskDebugger,
  sendTaskDebuggerToEngineer,
  sendTaskDebuggerToPm,
  // Docs routes
  createDoc,
  createFreeformDoc,
  createSkillRoute,
  createFreeformSkillRoute,
  getInputs,
  postInput,
  patchInput,
  postResolveInput,
  deleteInput,
  uploadInputAttachment,
  getInputAttachment,
  getStoryDefinitions,
  createFreeformStory,
  deleteStory,
  getStoryPmOutput,
  pmStoryMessage,
  pmStoryInterrupt,
  // Tasks routes
  getTasks,
  createTask,
  createFreeformTask,
  finalizeFreeformRun,
  getFreeformRun,
  getTask,
  patchTask,
  deleteTask,
  getTaskOutput,
  getTaskLogs,
  getTaskStats,
  getSessionTypeStats,
  getBoardStats,
  getDailyTotals,
  getDiffStatsForTask,
  getDiffForTask,
  getMergeConflictForTask,
  getWorktreeDirtyForTask,
  getTaskFile,
  taskAction,
  getIntegrationJob,
  getIntegrationJobs,
  getCloseOutOutcomes,
  getAttention,
  getDecisions,
  getIntegrationPipeline,
  retryIntegration,
  refreshInstallAndRetryIntegration,
  cancelDone,
  discardWorktreeHandoff,
  startPreview,
  stopPreview,
  getTaskReview,
  dismissNeedsInput,
  clearKeptWorktree,
  reviewAgain,
  reviewMessage,
  getCTO,
  ctoMessage,
  ctoInterrupt,
  postCtoHeartbeat,
  runCtoSafeActionRoute,
  pmMessage,
  pmInterrupt,
  getScreenshot,
  uploadScreenshot,
  listTaskShots,
  getTaskUiVerification,
  getTaskShot,
  uploadTaskShot,
  deleteTaskShot,
  // Config routes
  readConfig,
  patchConfig,
  readRawConfig,
  writeRawConfig,
  // Models routes
  listModels,
  testModel,
  // Model playground routes
  getPlaygroundModels,
  sendPlaygroundMessage,
  // Model providers tab routes (0327)
  getModelProviders,
  getModelProviderUsage,
  setModelProviderKey,
  // Agents routes
  runningAgents,
  queuedAgents,
  detectInstalledAgents,
  streamDetectAgents,
  checkInstalledAgentUpdates,
  getAgentLogs,
  // Notifications
  testNotification,
  // Telegram adapter (#0531)
  telegramStatus,
  telegramConnect,
  telegramDisconnect,
  telegramProfile,
  telegramTransport,
  telegramTestMessage,
  telegramProvisionBegin,
  telegramProvisionStatus,
  telegramProvisionRedeem,
  telegramWebhook,
  // Transcription
  transcribe,
  // UI routes
  serveManifest,
  serveIcon,
  setIconRenderer,
  // Auth routes
  authStatus,
  bootstrapAdmin,
  requestOtp,
  verifyOtp,
  googleLogin,
  googleCallback,
  authMe,
  authLogout,
  listUsers,
  addUser,
  sendInvite,
  deleteUser,
  updateUserRole,
  getAuditLog,
  bindTelegramChatRoute,
  createTelegramChatBindCodeRoute,
  createTelegramInviteRoute,
  listTelegramChatsRoute,
  listTelegramLinksRoute,
  patchTelegramChatNotificationsRoute,
  unbindTelegramChatRoute,
  unbindTelegramLinkRoute,
  telegramDisconnectFromAuthRoute,
  reassignTelegramLinkRoute,
  createHubCapability,
  listHubCapabilities,
  revokeHubCapability,
  rotateHubCapability,
  hubSummary,
  hubTaskSearch,
  // Service routes
  getServiceStatusRoute,
  listServicesRoute,
  installServiceRoute,
  startServiceRoute,
  stopServiceRoute,
  restartServiceRoute,
  enableAutoStartRoute,
  disableAutoStartRoute,
  removeServiceRoute,
  healthCheckRoute,
  getCheckPlan,
  getCheckRuns,
  getSupportBundlePreview,
  createSupportBundle,
  revealSupportBundle,
  generateBugReport,
  postCopyInspectorOpen,
  postOpenInEditor,
  postOpenTestInEditor,
} from "./routes/index.js";

function findCloudflared(): string | null {
  for (const dir of (process.env.PATH ?? "").split(":").filter(Boolean)) {
    const candidate = join(dir, "cloudflared");
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* next PATH entry */
    }
  }
  return null;
}

function storedCloudflareToken(): boolean {
  if (process.env.CLOUDFLARE_API_TOKEN?.trim()) return true;
  try {
    if (process.platform === "darwin") {
      return (
        execFileSync(
          "security",
          ["find-generic-password", "-a", "repoos", "-s", "repoos:cloudflare-token", "-w"],
          { encoding: "utf8", timeout: 2000 },
        ).trim().length > 0
      );
    }
    if (process.platform === "linux") {
      return (
        execFileSync(
          "secret-tool",
          ["lookup", "service", "repoos:cloudflare-token", "user", "repoos"],
          { encoding: "utf8", timeout: 2000 },
        ).trim().length > 0
      );
    }
  } catch {
    /* unavailable or not stored */
  }
  return false;
}

/** Compact live context for the guide; detailed answers can read the listed files. */
function repoGuideContext(config: RepoOSConfig, tasks: Task[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  const statusSummary = STATUSES.map((status) => `${status}: ${counts.get(status) ?? 0}`).join(
    ", ",
  );
  const taskSummary = tasks
    .map(
      (task) =>
        `- #${task.id} [${task.status}] ${task.title} (type: ${task.type}, priority: ${task.priority}, area: ${task.area || "unspecified"}, file: ${task.path})`,
    )
    .join("\n");
  const docs = listDocs(config)
    .map((doc) => `- ${doc.title} (${doc.path})`)
    .join("\n");
  return `Repository: ${projectDisplayName(config.root)}\nRoot: ${config.root}\nTask counts: ${statusSummary}\n\nTasks:\n${taskSummary || "- none"}\n\nContext documents:\n${docs || "- none"}`;
}

function tunnelProcessRunning(): boolean {
  try {
    return (
      execFileSync("pgrep", ["-f", "cloudflared.*tunnel.*run"], {
        encoding: "utf8",
        timeout: 2000,
      }).trim() !== ""
    );
  } catch {
    return false;
  }
}

function usableOriginCertificate(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const pem = readFileSync(path, "utf8");
    return /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(pem);
  } catch {
    return false;
  }
}

function serviceRunning(): boolean {
  try {
    if (process.platform === "darwin") {
      const out = execFileSync("launchctl", ["list"], {
        encoding: "utf8",
        timeout: 2000,
      });
      return out
        .split("\n")
        .some((line) => line.includes("com.cloudflare.cloudflared") && /^\s*\d+\s+/.test(line));
    }
    if (process.platform === "linux")
      return (
        execFileSync("systemctl", ["is-active", "cloudflared"], {
          encoding: "utf8",
          timeout: 2000,
        }).trim() === "active"
      );
  } catch {
    /* service manager unavailable */
  }
  return false;
}

async function tunnelReadiness(root: string, port?: number) {
  const tunnel = readTunnelConfig(root);
  // Machine-wide view: apps published by ANY repo on this box (from the
  // registry), plus this repo's own apps in case the registry hasn't been
  // seeded yet (first run before any `repoos tunnel install`/`create`). This
  // repo's own `tunnel.apps` wins over its same-named registry copy — the
  // registry is only re-synced from repoos.toml when a `repoos tunnel`
  // command runs, so a hand-edit (or an `allow`/`deny` not yet re-installed)
  // could otherwise show this repo a stale port/hostname for its own app.
  const registryApps = unionApps(readRegistry());
  const allApps = { ...registryApps, ...tunnel.apps };
  const bin = findCloudflared();
  let version: string | null = null;
  if (bin) {
    try {
      version =
        execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 3000 })
          .trim()
          .split("\n")[0] || null;
    } catch {
      /* installed but unavailable */
    }
  }
  const certPath = join(homedir(), ".cloudflared", "cert.pem");
  const originCertificate = {
    present: existsSync(certPath),
    usable: usableOriginCertificate(certPath),
  };
  const originListening =
    typeof port === "number" && Number.isInteger(port) ? await portListening(port) : null;
  return {
    cloudflared: { installed: !!bin, version },
    originCertificate,
    apiTokenStored: storedCloudflareToken(),
    configured: {
      tunnelName: tunnel.tunnelId ? tunnel.name : null,
      tunnelId: tunnel.tunnelId || null,
      baseDomain: tunnel.domain || null,
    },
    localOrigin: { port: port ?? null, listening: originListening },
    serveDefaultPort: resolveServePort(root, loadConfig(root)),
    running: tunnelProcessRunning() || serviceRunning(),
    publishedHostnames: Object.values(allApps)
      .map((app) => app.hostname)
      .sort(),
    checkedAt: new Date().toISOString(),
  };
}

export interface ServeOptions {
  root?: string;
  port?: number;
  host?: string;
  /**
   * True when this process is a reload replacement (REPOOS_RELOAD=1): retry
   * EADDRINUSE until the old process releases the port, instead of failing.
   */
  reloadReplacement?: boolean;
  /**
   * Force auth off for this instance regardless of [auth] in repoos.toml.
   * For ephemeral in-process servers (the UI smoke gate) that test generic
   * rendering, not auth flows — a project with real auth enabled must not
   * make `repoos check` itself unable to reach the dashboard.
   */
  disableAuth?: boolean;
  /**
   * Apply the repo's `[preview.*]` configuration overlay for this instance
   * (#0464). The preview/UI-test runtime sets this (a managed preview child
   * carries REPOOS_PREVIEW_CHILD=1); `repoos serve --preview-overrides` sets it
   * explicitly. Every normal `repoos serve` leaves it unset, so the base
   * configuration is untouched. `--no-preview-overrides` clears it.
   */
  previewOverrides?: boolean;
  /**
   * True when the caller passed an explicit `--host`. Only used to decide
   * whether the preview-override loopback guard may coerce a wildcard bind back
   * to `127.0.0.1`: an explicit host always wins (#0464).
   */
  hostExplicit?: boolean;
  /**
   * Fired synchronously the instant the HTTP listener actually binds
   * (`server.listen()`'s own callback), with the live index instance at that
   * exact moment. Combined with `indexBuildGate` (which holds the background
   * index build at a "built but not published" point), this gives a test a
   * clock-independent way to assert the #0271 boot-ordering guarantee: a
   * listener that fired while the gate was shut provably did not wait for the
   * build. Note this establishes ORDERING, not index state — the `index`
   * argument is not a reliable emptiness check at this instant, because
   * `WorkWatcher` populates the same map concurrently. See boot-timing.test.ts.
   */
  onListening?: (index: LiveIndex) => void;
  /**
   * Test-only seam (#0330), forwarded verbatim to
   * `LiveIndex.refreshAllAsync({ indexBuildGate })`, which awaits it after the
   * boot index build finishes and immediately before swapping it into the
   * index. Holding it makes "listener bound before this build published" a
   * deterministic fact instead of a race between the build and the ~23 awaits
   * `startServer` performs on its way to `listen()` — a race whose winner
   * changes with runtime speed (Bun's much faster subprocess spawning reliably
   * wins it) and machine load. No production caller sets it;
   * `boot-timing.test.ts` is the only user.
   */
  indexBuildGate?: () => void | Promise<void>;
}

/**
 * Only a long-lived control-plane server may sweep machine-wide serve
 * processes. Preview children deliberately run the same CLI on an ephemeral
 * port, but must never classify their parent control plane (often detached
 * with PPID 1 after a nohup/reload handoff) as an orphan and terminate it.
 * Likewise, in-process test servers use port 0 and are never supervisors.
 */
export function shouldReapStrayServeProcesses(
  opts: Pick<ServeOptions, "port">,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.REPOOS_PREVIEW_CHILD !== "1" && opts.port !== 0;
}

export interface ServerHandle {
  url: string;
  port: number;
  close: (reason?: string) => Promise<void>;
  index: LiveIndex;
  /**
   * The preview-only `[preview.*]` config overrides this instance applied
   * (#0464), as sorted dotted base-key paths — undefined when none applied
   * (every normal command). Surfaced so `repoos serve` can report them.
   */
  previewOverrides?: string[];
}

/** A bind address that listens on every interface (vs an explicit loopback). */
function isWildcardHost(host: string | undefined): boolean {
  return host === undefined || host === "" || host === "0.0.0.0" || host === "::";
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * Attach the slow-run flag (#0720) to each in-flight host run in the Remote
 * runners status payload, so the panel can badge a slow run without opening the
 * attention feed. Mutates the `activeRuns` entries in place.
 */
function annotateHostSlowRuns(
  hosts: Array<{ activeRuns?: Array<{ taskId: string; startedAt: string }> }>,
  config: RepoOSConfig,
  remoteValidator: RemoteValidator | undefined,
  opts?: {
    taskChecks?: TaskCheckManager;
    awakeClock?: () => { lastTickMs: number; intervalMs: number };
  },
): void {
  const active = remoteValidator?.activeRemoteRuns?.();
  if (!active || active.length === 0) return;
  const flags = computeSlowRunFlags({
    config,
    remoteRuns: active,
    taskChecks: opts?.taskChecks,
    awakeClock: opts?.awakeClock?.(),
  }).filter((f) => f.runId.startsWith("remote:"));
  if (flags.length === 0) return;
  // The validator's active-run registry and the host pool both key a run by
  // task id + start time; match on both, falling back to task id alone when a
  // host-lock row has no matching start.
  const byKey = new Map(flags.map((f) => [`${f.taskId}:${f.startedAt}`, f]));
  const byTask = new Map(flags.map((f) => [f.taskId ?? "", f]));
  for (const h of hosts) {
    for (const r of h.activeRuns ?? []) {
      const flag = byKey.get(`${r.taskId}:${r.startedAt}`) ?? byTask.get(r.taskId);
      if (!flag) continue;
      Object.assign(r, {
        slow: true,
        slowDetail: flag.likelyCause ?? null,
        slowRatio: flag.ratio,
      });
    }
  }
}

/** List context docs (markdown under docsDir + root-level AGENTS/CLAUDE). */
function listDocs(config: RepoOSConfig): { path: string; title: string; mtimeMs: number }[] {
  const out: { path: string; title: string; mtimeMs: number }[] = [];
  const seen = new Set<string>();
  const add = (abs: string, rel: string) => {
    if (seen.has(rel) || !existsSync(abs)) return;
    seen.add(rel);
    let title = rel;
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(abs).mtimeMs;
      const m = readFileSync(abs, "utf8").match(/^\s*#\s+(.+)$/m);
      if (m) title = m[1].trim();
    } catch {
      /* ignore */
    }
    out.push({ path: rel, title, mtimeMs });
  };
  for (const name of ["AGENTS.md", "CLAUDE.md", "README.md"]) {
    add(join(config.root, name), name);
  }
  const docsPath = join(config.root, config.docsDir);
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir)) {
      if (e.startsWith(".")) continue;
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (extname(e) === ".md") {
        const rel = full
          .slice(config.root.length + 1)
          .split("\\")
          .join("/");
        add(full, rel);
      }
    }
  };
  walk(docsPath);
  return out;
}

/** Read a field from a skill file's `---` frontmatter block, or null. */
function skillField(text: string, field: string): string | null {
  const fm = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * List repo skills: each is `skills/<name>/SKILL.md` with optional frontmatter
 * (`name`, `description`). Malformed or unreadable skills are skipped, never
 * fatal — a repo with no skills dir yields an empty list.
 */
function listSkills(config: RepoOSConfig): SkillMeta[] {
  const out: SkillMeta[] = [];
  const skillsPath = join(config.root, config.skillsDir);
  if (!existsSync(skillsPath)) return out;
  for (const e of readdirSync(skillsPath)) {
    if (e.startsWith(".")) continue;
    const dir = join(skillsPath, e);
    if (!statSync(dir).isDirectory()) continue;
    const file = join(dir, "SKILL.md");
    if (!existsSync(file)) continue;
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    out.push({
      path: `${config.skillsDir.split("\\").join("/")}/${e}/SKILL.md`,
      name: skillField(text, "name") ?? e,
      description: skillField(text, "description") ?? "",
    });
  }
  return out;
}

/**
 * Absolute path of the compiled CLI entrypoint, so the reload manager can spawn
 * a replacement `repoos serve` process. Same resolution as preview.ts.
 */
function cliEntryPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server or src/server
  const candidates = [
    join(here, "..", "cli", "index.js"), // compiled: dist/cli/index.js
    join(here, "..", "..", "dist", "cli", "index.js"), // dev: repo-root dist
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** How long a reload replacement retries EADDRINUSE before giving up. */
const RELOAD_BIND_TIMEOUT_MS = 40_000;
const RELOAD_BIND_RETRY_MS = 300;

/**
 * Bun's node:http compatibility layer can report EADDRINUSE for a sandboxed
 * bind that the kernel actually rejected with EPERM.  A successful loopback
 * connection is the useful discriminator: without a listener there is no
 * process to kill, so report the real class of problem instead of sending the
 * user on a false port-conflict investigation.
 */
export function explainBindFailure(
  error: Error,
  port: number,
  host: string,
  listenerReachable: boolean,
): Error {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "EADDRINUSE" || listenerReachable) return error;
  return new Error(
    `Unable to bind ${host}:${port}, although no listener is reachable there. ` +
      "The OS or a sandbox denied this local-network bind; it is not a port collision. " +
      "Run RepoOS from a terminal with local-network permission or allow the sandbox to bind local ports.",
  );
}

/**
 * Build metadata served to the UI: the package version and the timestamp of
 * the last build (dist/.build-stamp.json, written by scripts/copy-assets.mjs).
 * Both are best-effort — null when unavailable so the UI can fall back.
 */
function loadBuildInfo(): {
  version: string | null;
  buildAt: string | null;
  hash: string | null;
} {
  // Module-relative read of `.build-info.json` / `.build-stamp.json` — the
  // files that actually ship in a standalone install (see readBuildMeta).
  return readBuildMeta();
}

/**
 * Locate the bundled UI directory (Vite build output). Prefers the resolved
 * repo root's `dist/ui` so a `bun link` install run from a worktree serves
 * that worktree's own build, not the linked package's stale dist. Falls back
 * to the import.meta.url candidates (compiled dist/ui and dev-mode src/../..)
 * when no root-relative build exists.
 */
function findUiDir(root: string): string | null {
  const candidates = [join(root, "dist", "ui")];
  const here = dirname(fileURLToPath(import.meta.url)); // dist/server or src/server
  candidates.push(
    join(here, "..", "ui"), // dist/ui (compiled, shipped)
    join(here, "..", "..", "dist", "ui"), // repo-root dist/ui (dev mode)
  );
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

/** Content type for a static UI asset by extension. */
const UI_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

/** Serve a static file from the UI build directory. Returns false on miss. */
function serveStaticUi(res: ServerResponse, uiDir: string, urlPath: string): boolean {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (rel.includes("..")) return false;
  // Never serve index.html through the static path — `__REPOOS_BUILD_HASH_VALUE__`
  // must be substituted at read time (not the window property name — replaceAll would
  // corrupt `window.__REPOOS_BUILD_HASH__`).
  // The SPA fallback below handles it via readUiIndex().
  if (!rel || rel === "index.html") return false;
  const abs = resolve(uiDir, rel);
  if (!abs.startsWith(resolve(uiDir))) return false;
  if (!existsSync(abs) || !statSync(abs).isFile()) return false;
  const ext = extname(abs).toLowerCase();
  // Service workers and the manifest must never be cached long-term, or
  // installs/app updates would serve stale assets.
  const noCache = rel === "sw.js" || rel === "manifest.webmanifest";
  res.writeHead(200, {
    "Content-Type": UI_MIME[ext] ?? "application/octet-stream",
    "Cache-Control": noCache ? "no-cache" : ext === ".html" ? "no-cache" : "max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(readFileSync(abs));
  return true;
}

/** Guard against path traversal when serving repo doc files. */
function safeRepoFile(root: string, urlPath: string): string | null {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  if (rel.includes("..")) return null;
  const abs = resolve(root, rel);
  if (!abs.startsWith(resolve(root))) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  if (extname(abs) !== ".md") return null; // only markdown docs are servable
  return abs;
}

/**
 * Fatal/crash-level capture (0187): by default Node terminates the process on
 * both of these events with nothing recorded anywhere. Registered once per
 * process (not once per `startServer` call — the test suite starts many
 * short-lived servers in the same process, and stacking a listener per call
 * would both spam MaxListenersExceededWarning and risk one test's error
 * exiting the whole worker) and always logs to whichever server is currently
 * active. Only exits the process outside the test runner: many independent
 * test servers share this process, so exiting here on an unrelated test's
 * error would take the whole suite down with it.
 */
let activeLogger: Logger | null = null;
let fatalHandlersRegistered = false;

/** Structured record written for a process-level uncaught error (#0646). */
export interface FatalErrorRecord {
  /** Index signature so the record is accepted as a logger context. */
  [key: string]: unknown;
  /** Which event fired: `uncaughtException` or `unhandledRejection`. */
  origin: string;
  error: string;
  name?: string;
  code?: string;
  syscall?: string;
  string: string;
  stack?: string;
}

/**
 * A `write` failing with EPIPE is a child that closed its stdin before the
 * write landed — normal churn (an `ssh` dropping, an app-server exiting), not
 * a reason to kill the control plane (#0646). Every other uncaught error keeps
 * the historical log-and-exit behaviour.
 */
export function isBenignEpipe(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException | null | undefined;
  return !!e && e.code === "EPIPE" && e.syscall === "write";
}

/**
 * Every legible field of a thrown value, including a non-`Error` object. Bun
 * throws plain objects for stream failures, which is why the old handler only
 * recorded `String(err)` and lost the origin (#0646).
 */
export function describeFatalError(err: unknown, origin: string): FatalErrorRecord {
  const e = err as Partial<NodeJS.ErrnoException> | null | undefined;
  return {
    origin,
    error: err instanceof Error ? err.message : String(err),
    name: err instanceof Error ? err.name : typeof e?.name === "string" ? e.name : undefined,
    code: typeof e?.code === "string" ? e.code : undefined,
    syscall: typeof e?.syscall === "string" ? e.syscall : undefined,
    string: String(err),
    // A non-Error throw has no `.stack`; capture the handler's own stack so the
    // log at least pins the crash to here instead of saying `stack: undefined`.
    stack: err instanceof Error ? err.stack : new Error(String(err)).stack,
  };
}

function registerFatalHandlersOnce(): void {
  if (fatalHandlersRegistered) return;
  fatalHandlersRegistered = true;
  const logFatal = (message: string, err: unknown, origin: string) => {
    const record = describeFatalError(err, origin);
    if (isBenignEpipe(err)) {
      // Do not exit: a child closing its stdin early must not take the server
      // down. Log at error so it stays visible, then keep serving (#0646).
      activeLogger?.system("error", message, record);
      return;
    }
    activeLogger?.system("fatal", message, record);
    if (process.env.VITEST !== "true") process.exit(1);
  };
  process.on("uncaughtException", (err, origin) => logFatal("Uncaught exception", err, origin));
  process.on("unhandledRejection", (reason) =>
    logFatal("Unhandled promise rejection", reason, "unhandledRejection"),
  );
}

export function startServer(opts: ServeOptions = {}): Promise<ServerHandle> {
  const repoos = createRepoOS(opts.root, { previewOverrides: opts.previewOverrides });
  const config = repoos.config;
  if (opts.disableAuth && config.auth) {
    config.auth = { ...config.auth, enabled: false };
  }
  // Preview-override loopback guard (#0464): the repo's `[preview.*]` overlay
  // may turn auth off. An auth-less preview must stay on loopback unless the
  // caller explicitly overrode the host — otherwise the Tailscale default of
  // binding 0.0.0.0 would publish an unauthenticated server to the tailnet.
  const previewDisabledAuth =
    config.auth?.enabled === false && (config.previewOverrides ?? []).includes("auth.enabled");
  let bindHost = opts.host ?? "127.0.0.1";
  if (previewDisabledAuth && !opts.hostExplicit && isWildcardHost(bindHost)) {
    bindHost = "127.0.0.1";
  }
  const logger = createLogger(config.root);
  // Best-effort: enable git's fsmonitor + untracked-cache so the per-worktree
  // `git status` calls in every index build stop doing full tree scans.
  tuneRepoForScale(config.root);
  const index = new LiveIndex(config);
  // Non-blocking: with 200+ tasks, the git-heavy full index build can take
  // several seconds even after parallelizing it (buildIndexAsync). Kicking it
  // off here without awaiting lets `server.listen()` bind immediately instead
  // of waiting behind it — the previous synchronous `refreshAll()` was most of
  // RepoOS's 20-30s boot time and, worse, ate into the ~30-40s window a reload
  // replacement has to answer its health handshake (#0271 follow-up). Anything
  // that needs the populated index (the boot-time preview relaunch below, the
  // resolved ServerHandle) awaits `indexReady` explicitly instead.
  // `opts.indexBuildGate` is the #0330 test-only park point inside that build
  // — unset in production, see ServeOptions.
  const indexReady = index.refreshAllAsync({ indexBuildGate: opts.indexBuildGate });

  // `opts.port === 0` is the explicit "ephemeral, OS-assigned" marker used by
  // harnesses — keep it. Only fall through to the resolver when no port was
  // passed at all (the `repoos serve` path passes `--port` or nothing).
  const requestedPort = opts.port ?? resolveServePort(config.root, config);
  const isPreviewChild = process.env.REPOOS_PREVIEW_CHILD === "1";
  const isControlPlane = requestedPort !== 0 && !isPreviewChild;
  const mode = isPreviewChild
    ? "preview"
    : requestedPort === 0
      ? "ephemeral"
      : opts.reloadReplacement
        ? "reload-replacement"
        : "control-plane";
  logger.system("info", "RepoOS server starting", {
    root: config.root,
    pid: process.pid,
    requestedPort,
    host: bindHost,
    mode,
    buildHash: readBuildHash(config.root),
  });
  // Report that preview-only overrides are active, naming the effective keys
  // (#0464) — silence here means the base configuration is in use.
  if (config.previewOverrides?.length) {
    logger.system(
      "warn",
      `preview configuration overrides active: ${config.previewOverrides.join(", ")}`,
      { overrides: config.previewOverrides, host: bindHost },
    );
  }
  activeLogger = logger;
  registerFatalHandlersOnce();

  // One-time, idempotent backfill (#0376): give every existing input a stable
  // number (its counterpart to a task's `id`) before anything serves reads.
  // Subsequent boots find every input already numbered and do nothing, so this
  // never renumbers. On the control plane, commit the changed `inputs/*.md` so
  // the migration doesn't leave the tree dirty; fail-soft for a non-git root.
  try {
    const migrated = ensureInputNumbers(config);
    if (migrated.length) {
      logger.system("info", `input numbering migration: assigned ${migrated.length} number(s)`);
      if (isControlPlane) {
        for (const input of migrated) {
          commitTaskFile(
            config.root,
            join(config.root, input.path),
            `inputs(#${input.number}): assign number`,
          );
        }
      }
    }
  } catch (e) {
    logger.system("warn", `input numbering migration failed: ${(e as Error).message}`);
  }

  // One-time, idempotent backfill (#0515): give every existing story
  // definition a stable number (its counterpart to a task's `id` and an input's
  // `number`) before anything serves reads, so the stories board can show and
  // deep-link `#0001` from the first paint. Existing unique numbers stay stable;
  // duplicate claimants receive new numbers in deterministic age/path order.
  try {
    const numbered = ensureStoryNumbers(config);
    if (numbered.length) {
      logger.system("info", `story numbering migration: assigned ${numbered.length} number(s)`);
      if (isControlPlane) {
        for (const story of numbered) {
          commitTaskFile(
            config.root,
            join(config.root, story.path),
            `stories(#${story.number}): assign number`,
          );
        }
      }
    }
  } catch (e) {
    logger.system("warn", `story numbering migration failed: ${(e as Error).message}`);
  }

  // ---- Fail-closed auth validation at startup (0246) ----
  // When auth is enabled, the server must have a usable login method and a
  // bootstrap admin path — otherwise enable auth silently locks everyone out.
  if (config.auth?.enabled) {
    const hasEmailProvider = !!(
      config.auth.emailProvider?.apiKey && config.auth.emailProvider?.fromAddress
    );
    const hasGoogle = !!(config.auth.google?.clientId && config.auth.google?.clientSecret);
    if (!hasEmailProvider && !hasGoogle) {
      throw new Error(
        "Auth is enabled but no login provider is configured. " +
          "Set [auth.emailProvider] (Resend API key + from address) or " +
          "[auth.google] (client ID + secret) in your config, or disable auth.",
      );
    }
    // Auto-generate a session secret if none was provided. The secret is
    // only meaningful for signed-cookie schemes; with DB-backed sessions
    // the token is opaque — but keep the field consistent for forward
    // compatibility and so the config is explicit about intent.
    if (!config.auth.sessionSecret) {
      config.auth.sessionSecret = randomHex(32);
    }
    const authStore = getAuthStore(config.root);
    const userCount = authStore?.listUsers().length ?? 0;
    if (userCount === 0 && !config.auth.bootstrapAdmin) {
      throw new Error(
        "Auth is enabled but no users exist and no bootstrap admin email is configured. " +
          "Set [auth.bootstrapAdmin] to an email address in your config, " +
          "or use the Settings UI to add users before enabling auth.",
      );
    }
    logger.system("info", "Auth enabled — login providers validated", {
      emailProvider: hasEmailProvider,
      google: hasGoogle,
      userCount,
      bootstrapAdmin: config.auth.bootstrapAdmin ?? null,
    });
  }

  const uiDir = findUiDir(repoos.config.root);

  // `loadedHash` — the build hash of the *served repo root* — drives auto-reload
  // (0066): a replacement triggers whenever the on-disk root hash diverges. It
  // is null for a project repo (no `dist/.build-info.json` at its root), which
  // is why the injected UI hash used to read "unknown" there (#0701). The UI's
  // injected hash and `/api/health`'s `buildHash` fall back to the *running
  // install's* own build hash so a linked `repoos serve` serving a project repo
  // still reports a real build; `serverBuildHash` on health is that same value
  // for the CLI's stale-server check.
  const loadedHash = readBuildHash(config.root);
  const serverBuildHash = readBuildMeta().hash;
  const uiBuildHash = loadedHash ?? serverBuildHash;
  const readUiIndex = (indexPath: string): string =>
    injectBuildHashIntoUiIndex(readFileSync(indexPath, "utf8"), uiBuildHash ?? "");
  const reloadEnabled =
    !isDevBuild() && process.env.REPOOS_PREVIEW_CHILD !== "1" && opts.port !== 0;
  let reload: ReloadManager | null = null;

  // Close-out lock (0143): while `completeTask` holds it, the reload manager
  // defers every auto-reload and parks the new build for the user instead —
  // the close-out pipeline builds/checks dist itself and would be killed by a
  // mid-flight reload. The lock is server-owned: the UI never touches it.
  let closeOutInProgress = false;
  const closeOutLock: CloseOutLock = {
    closingOut: () => closeOutInProgress,
    acquire: () => {
      closeOutInProgress = true;
    },
    release: () => {
      closeOutInProgress = false;
      reload?.releaseCloseOut();
    },
  };

  // Integration job coordinator for serialized close-outs (0118)
  const jobCoordinator = createJobCoordinator(config.root);
  // Durable close-out outcomes (#0640): recorded when a job ends and pushed
  // over SSE so the notices bell shows success/failure/timeout; the list
  // endpoint backfills a tab that was closed while the run happened.
  const closeOutOutcomes = createCloseOutOutcomeStore(config.root, config.cacheDir, (error) =>
    logger.system("warn", `close-out outcome persistence failed: ${(error as Error).message}`),
  );
  const attentionEvents = createAttentionEventStore(config.root, config.cacheDir, (error) =>
    logger.system("warn", `attention event persistence failed: ${(error as Error).message}`),
  );
  const ctoActionRates = createCtoActionRateStore(config.root, config.cacheDir);
  const repoLock = createRepositoryLock(config.root);
  const rootLock = createRootLock(config.root);

  // Remote Validation Runner (docs/remote-validation.md): one instance for the
  // whole server so its warm-VM state and idle/lifetime timers persist across
  // close-out jobs. Only constructed when enabled — the constructor builds a
  // Hetzner client and reads env secrets. `reconcile()` deletes any runner VM
  // leaked by a previous crash (nothing is validating at boot).
  let remoteValidator: RemoteValidator | undefined;
  if (config.remoteValidation?.enabled) {
    try {
      remoteValidator = createRemoteValidator(config, logger);
      void remoteValidator?.reconcile().catch((e) => {
        logger.system("warn", `remote validation reconcile failed: ${(e as Error).message}`);
      });
    } catch (e) {
      logger.system(
        "error",
        `remote validation runner disabled — init failed: ${(e as Error).message}`,
      );
      remoteValidator = undefined;
    }
  }

  // Recovery on startup: resume interrupted jobs (0118)
  const interruptedJobs = jobCoordinator.findInterruptedJobs();
  for (const job of interruptedJobs) {
    console.log(`Resuming interrupted job for task ${job.taskId} from phase ${job.phase}`);
  }

  // Boot-time worktree GC: prune orphaned `repoos/integrate/*` candidate
  // worktrees left by failed/interrupted close-out jobs, plus stale worktree
  // metadata. Deliberately conservative — it never touches `feat/*` task
  // worktrees; `repoos gc` is the path for those. Fire-and-forget so it stays
  // off `server.listen()`'s critical path (same shape as the remote-validation
  // reconcile above). Control-plane only, and opt-out via env.
  if (isControlPlane && process.env.REPOOS_NO_WORKTREE_GC !== "1") {
    // Wait for the async index build to settle first — the sweep's git spawns
    // are synchronous, and running them during boot would compete with the
    // health handshake / first paint.
    void indexReady
      .catch(() => {})
      .then(() => {
        const activeJobIds = new Set(
          jobCoordinator
            .allJobs()
            .filter((j) => j.phase !== "done" && j.phase !== "failed")
            .map((j) => j.taskId),
        );
        sweepAndWarn(config, {
          activeJobIds,
          threshold: config.worktreeWarnThreshold,
          log: (level, msg, meta) => logger.system(level, `boot ${msg}`, meta),
        });
      })
      .catch((e) => logger.system("warn", `boot worktree gc failed: ${(e as Error).message}`));
  }

  const autoEngineering = new AutoEngineeringOrchestrator(
    join(config.root, config.cacheDir ?? ".repoos"),
  );
  let processingJob = false;
  let triggerJobProcessing: () => void = () => {}; // Initialized below

  const watcher = new WorkWatcher(config, index);
  watcher.start();

  // active SSE clients
  const clients = new Set<ServerResponse>();
  const emitEvent = (e: RepoEvent) => {
    // A drained runner unblocks a deferred reload immediately (0066).
    reload?.onEvent(e);
    const frame = `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
    for (const res of clients) {
      try {
        res.write(frame);
      } catch {
        clients.delete(res);
      }
    }
  };
  const bumpAttention = (): void => {
    emitEvent({ type: "attention.updated", at: new Date().toISOString() });
  };
  wireAttentionNotifications(attentionEvents, bumpAttention);
  const recordRemoteFallbackAttention = (taskId: string, detail: string): void => {
    const at = new Date().toISOString();
    const line =
      detail
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean) ?? "";
    attentionEvents.record({
      kind: "remoteFallback",
      taskId,
      message: `Ran locally: #${taskId}`,
      detail: summarizeRemoteFallbackDetail(
        line || "Remote validation is enabled but this close-out used the full local gate.",
      ),
      at,
    });
    bumpAttention();
  };
  const unsubscribe = index.on(emitEvent);

  // Re-read `repoos.toml` when it changes on disk (#0681). A hand edit, or a
  // close-out merging a branch that added a `[[preview.targets]]`/services
  // block to the primary branch, used to leave the running server on the old
  // config until an unrelated Settings PATCH forced a reload. The watcher
  // adopts the fresh config in place — `PreviewManager` captured the same
  // object, so its target resolution updates without a restart — and tells the
  // UI to refetch. Control-plane only: preview children and ephemeral test
  // servers do not own config reconciliation.
  const configWatcher = isControlPlane
    ? new ConfigWatcher({
        root: config.root,
        holder: repoos,
        onChange: (fresh, prev) => {
          // workDir/cacheDir/taskExtensions move where the index looks; only
          // refresh when one actually changed, so an unrelated edit is cheap.
          if (
            fresh.workDir !== prev.workDir ||
            fresh.cacheDir !== prev.cacheDir ||
            fresh.taskExtensions !== prev.taskExtensions
          ) {
            index.refreshAll();
          }
          emitEvent({ type: "config.changed", at: new Date().toISOString() });
        },
        log: (msg) => logger.system("info", msg, { pid: process.pid, source: "config-watch" }),
      })
    : null;
  configWatcher?.start();

  // Sidebar git-state indicator (#0584): one server-owned computation for the
  // repo root checkout, pushed over SSE only when the state actually differs.
  // Two trigger classes feed it — the work watcher (writes under `work/`, plus
  // its explicit `.git/HEAD` · refs · index watches for branch switches,
  // commits and staging) and RepoOS's own commits/merges, which move `main`
  // without tripping a watched file event. Everything else (focus, visibility,
  // SSE reconnect, the slow fallback interval) is the client refetching.
  const repoStatusNotifier = createRepoStatusNotifier({
    root: config.root,
    emit: (status) => emitEvent({ type: "repo.status", status, at: status.computedAt }),
  });
  watcher.setGitSignal(() => repoStatusNotifier.notify());
  const offGitMutation = onGitMutation((mutatedRoot) => {
    // A worktree commit shares `.git` with the root checkout but must not be
    // read as "the main checkout changed" — only a mutation of this checkout.
    if (isSameCheckout(mutatedRoot, config.root)) repoStatusNotifier.notify();
  });

  // Per-task `repoos check` run tracking for the Debug tab (0310): the
  // handoff-finalize check and the MTD merge-gate check are the only two
  // checks the server spawns directly, so only those two are instrumented.
  // The repo root enables durable history for cancelled runs (#0564) — the
  // CLI child records its own completed runs.
  const taskChecks = new TaskCheckManager(config.root, config.cacheDir);
  const onTaskCheckEvent: TaskCheckListener = (run, eventKind, chunk) => {
    if (eventKind === "started") {
      emitEvent({
        type: "task-check.started",
        taskId: run.taskId,
        checkId: run.id,
        checkKind: run.kind,
        scope: run.scope,
        machine: run.machine,
        at: run.startedAt,
      });
    } else if (eventKind === "output") {
      emitEvent({
        type: "task-check.output",
        taskId: run.taskId,
        checkId: run.id,
        chunk: chunk ?? "",
        at: new Date().toISOString(),
      });
    } else {
      emitEvent({
        type: "task-check.done",
        taskId: run.taskId,
        checkId: run.id,
        code: run.code,
        passed: run.passed === true,
        skipped: run.skipped,
        durationMs: run.durationMs ?? 0,
        scope: run.scope,
        machine: run.machine,
        at: run.finishedAt ?? new Date().toISOString(),
      });
    }
  };

  // Last integration-pipeline stage progress reported per task id (0207). The
  // orchestrator's DoneStep callbacks drive the pinned status bar's stage
  // indicator; recorded here so the live `integration` snapshot is accurate.
  const reportedStages: Record<string, DoneStep> = {};

  /** Emit the current integration-pipeline snapshot to every SSE client (0207). */
  const emitIntegration = (): void => {
    emitEvent({
      type: "integration",
      pipeline: buildIntegrationSnapshot(
        jobCoordinator,
        reportedStages,
        resolvePipelineCheckPlan(config),
      ),
    });
  };

  // Initialize job processing (runs after emitEvent is available) (0118)
  triggerJobProcessing = () => {
    if (processingJob) return;
    processingJob = true;
    setImmediate(async () => {
      try {
        // A fresh enqueue (or recovered job) can now be seen by the status bar.
        emitIntegration();
        const orchestrator = new CloseOutOrchestrator(
          config,
          jobCoordinator,
          repoLock,
          rootLock,
          (taskId) => index.getTask(taskId),
          (step) => {
            const job = jobCoordinator.peekNext();
            if (job) {
              reportedStages[job.taskId] = step;
              emitEvent({
                type: "task.progress",
                id: job.taskId,
                step,
                at: new Date().toISOString(),
              });
              emitIntegration();
            }
          },
          logger,
          (taskId, reason) => {
            const task = index.getTask(taskId);
            if (!task) return;
            scheduleMergeConflictRetry(config, task, reason, runner, (absPath) =>
              index.applyFileChange(absPath, { guarded: true }),
            );
          },
          (taskId, reason) => {
            const task = index.getTask(taskId);
            if (!task) return;
            scheduleCloseOutRepairHandback(
              config,
              task,
              "gate-failure",
              reason,
              runner,
              (absPath) => index.applyFileChange(absPath, { guarded: true }),
            );
          },
          remoteValidator,
          taskChecks,
          onTaskCheckEvent,
          (outcome) => {
            closeOutOutcomes.record(outcome);
            emitEvent({ type: "close-out.outcome", outcome, at: outcome.finishedAt });
            bumpAttention();
          },
          recordRemoteFallbackAttention,
        );
        const jobBefore = jobCoordinator.peekNext();
        // Defer auto-reload for the duration of this job's processing: a
        // close-out runs its own `bun run build`, and an auto-reload handover
        // landing mid-flight would tear down the very server orchestrating it
        // (see CloseOutLock above `completeTask` — this is the live path,
        // `completeTask` itself is dead code and never acquires this lock).
        closeOutLock.acquire();
        let result: Awaited<ReturnType<typeof orchestrator.processNext>>;
        try {
          result = await orchestrator.processNext();
        } finally {
          closeOutLock.release();
        }
        // Surface close-out failures (0199): the /done action returns as soon
        // as the job is enqueued, so the UI never learns of a background
        // failure. Only emit for a terminal `failed` phase — "main advanced,
        // revalidating" is a retry, not a failure.
        if (
          jobBefore &&
          result &&
          result.ok === false &&
          result.reason &&
          jobCoordinator.getJob(jobBefore.taskId)?.phase === "failed"
        ) {
          const failedJob = jobCoordinator.getJob(jobBefore.taskId);
          emitEvent({
            type: "task.progress",
            id: jobBefore.taskId,
            step: "failed",
            detail: result.reason,
            phase: failedJob?.failedPhase,
            logPath: failedJob?.logPath,
            tldr: failedJob?.debugTldr,
            at: new Date().toISOString(),
          });
          debugTldr?.onCloseOutFailed(jobBefore.taskId);
        }
        // Keep the live index in sync: the orchestrator writes the task file
        // (markTaskReleased) and merges the branch directly, bypassing the
        // done-action's usual index.applyFileChange/refreshBranches. Must use
        // jobBefore (captured pre-processing), not another peekNext() call —
        // peekNext() filters out done/failed jobs by design, so it can never
        // return the job that was just completed.
        if (jobBefore && jobCoordinator.getJob(jobBefore.taskId)?.phase === "done") {
          const doneTask = index.getTask(jobBefore.taskId);
          if (doneTask) index.applyFileChange(doneTask.absPath);
        }
        index.refreshBranches();
        if (
          jobBefore &&
          jobCoordinator.getJob(jobBefore.taskId)?.phase === "done" &&
          index.getTasks().some((task) => task.dependsOn?.includes(jobBefore.taskId))
        ) {
          const result = await autoEngineering.reconcile(
            config,
            index.getTasks(),
            "dependency-merged",
          );
          if (result.triggered) {
            const activeCount = index.getTasks().filter((task) => task.status === "active").length;
            const maxActiveTasks = config.maxActiveTasks ?? 3;
            emitEvent({
              type: "auto-engineering.state",
              state: {
                enabled: config.autoEngineeringMode ?? false,
                maxActiveTasks,
                activeCount,
                availableSlots: Math.max(0, maxActiveTasks - activeCount),
                reconciling: false,
                decision: autoEngineering.getLastDecision(),
              },
              at: new Date().toISOString(),
            });
          }
        }
        // Reflect the post-job pipeline state (job now done/failed, or the next
        // queued job becoming active) in the pinned status bar (0207).
        emitIntegration();
        // Continue processing if there are more jobs or recovered jobs
        const next = jobCoordinator.peekNext();
        if (next && next.phase !== "done" && next.phase !== "failed") {
          processingJob = false;
          triggerJobProcessing();
        } else {
          processingJob = false;
        }
      } catch (err) {
        console.error("Job processor error:", err);
        processingJob = false;
      }
    });
  };

  // Trigger processing of recovered jobs once emitEvent is ready (0118)
  let triggerRecoveryJobs: (() => void) | null = () => {
    if (interruptedJobs.length > 0) {
      console.log(`Processing ${interruptedJobs.length} recovered jobs`);
      triggerJobProcessing();
    }
    triggerRecoveryJobs = null;
  };

  // Trigger processing of recovered jobs on startup
  if (triggerRecoveryJobs) {
    setImmediate(triggerRecoveryJobs);
  }

  // Tasks that landed in `review` while their engineer turn was still winding
  // down. Reviewing a worktree an agent is still committing to would report on
  // a half-written state, so the review waits for `agent.exited`.
  const pendingReview = new Set<string>();

  // Read-only preview servers for review/active tasks. Orphans from a crashed
  // previous main server are reaped at boot; this instance starts with none.
  // Declared before the runner so its preview-request handler can close over it.
  const previews = new PreviewManager(config, emitEvent);
  previews.cleanupOrphans();

  // Serve process reaper (0168): detect and reap stale serve processes,
  // and prevent port binding conflicts.
  // Port-0 harnesses and preview children must neither overwrite nor remove
  // the real control-plane lock. They are deliberately short-lived and are
  // not valid evidence about who owns 7171.
  const reaper = new ServeReaper(config.root, config.cacheDir, isControlPlane, requestedPort);
  reaper.cleanupStale();
  // Boot-time sweep for historical orphans whose deleted root took their
  // lockfile with it. Deliberately fire-and-forget: the sweep is async and
  // bounded, so serve startup never blocks on it even with hundreds of
  // accumulated orphans. It always resolves (never rejects). Gated like the
  // periodic stray sweep — preview children and ephemeral in-process servers
  // must not each run a full `ps`+`lsof` census of the machine.
  if (shouldReapStrayServeProcesses(opts)) {
    void reaper.cleanupOrphanedRoots();
  }

  // Agent supervisor: periodic health checks and safe recovery (0112)
  let supervisor: AgentSupervisor | null = null;

  // Task watchdog: surfaces active tasks whose agent is dead or stalled (0180).
  // Constructed after the reload manager so it can observe `isReloading()`.
  let watchdog: TaskWatchdog | null = null;

  // Track launched coding agents so Pause can signal them and the UI can
  // reflect live running state without any polling.
  let reviews: ReviewManager; // Assigned after runner creation below
  // Failure tl;dr (#0570): assigned after the index-dependent managers below;
  // the runner's and reviewer's hooks late-bind to it like `reviews`.
  let debugTldr: DebugTldrManager | null = null;
  const runner = new AgentRunner(
    config,
    (e) => {
      emitEvent(e);
      if (e.type !== "agent.exited") return;
      // 0381: a PM chat session ended — clear its "PM is working" flag for
      // the task. Fires on every exit path (clean finish, error, or user
      // interrupt, which kills the process into the same cleanup), so the
      // card/panel indicator can never get stuck. Other live sessions for
      // the same task (another user's chat, a freeform flesh-out) keep it up.
      const pmTaskId = pmChatSessionTaskId(e.id);
      if (pmTaskId) {
        clearPmChatSession(e.id);
        if (!isPmWorking(pmTaskId)) {
          emitEvent({
            type: "task.pmFinished",
            id: pmTaskId,
            at: new Date().toISOString(),
          });
        }
      }
      // #0515: the same contract for a story PM chat — clear the "PM is
      // working" flag its route raised, on every exit path. Re-emitting
      // `story.definitionsChanged` is all the board needs to pick it up, because
      // that flag already rides on the story definition record. The chat is
      // cleared unconditionally (the map entry is per session, so this can
      // never touch a concurrent one); the re-emit is gated on no *other* PM
      // activity being live for the story, or one user exiting would hide
      // another user's still-running turn.
      const storyChatPath = clearStoryPmChat(e.id);
      if (storyChatPath && !isStoryPmWorking(storyChatPath)) {
        emitEvent({ type: "story.definitionsChanged", at: new Date().toISOString() });
      }
      if (pendingReview.delete(e.id)) {
        const task = index.getTask(e.id);
        if (task?.status === "review" && !task.isArchived) void reviews.run(task);
      }
      // #0271 follow-up: when the engineer session `scheduleMergeConflictRetry`
      // resumed finishes its turn, automatically re-enqueue the close-out —
      // the same action "Move to done" performs, so a fixed conflict doesn't
      // sit waiting for a human to notice and re-click. Gated on the job
      // itself still being the failed-on-this-exact-conflict record (not
      // just "task has a nonzero retry count somewhere"), so an unrelated
      // resume of the same task's engineer for something else never
      // mis-triggers a close-out. `enqueue` is idempotent/no-op if the job
      // already moved on (e.g. a human already retried manually).
      const failedJob = jobCoordinator.getJob(e.id);
      if (failedJob?.phase === "failed" && failedJob.reason?.startsWith("merge conflict in ")) {
        const task = index.getTask(e.id);
        if (task?.status === "review" && task.branch && !task.isArchived) {
          const requeued = jobCoordinator.enqueue(task);
          if (requeued) {
            emitIntegration();
            triggerJobProcessing();
          }
        }
      }
    },
    {
      logger,
      getTask: (taskId) => index.getTask(taskId),
      onTaskFilePatched: (absPath) => index.applyFileChange(absPath),
      onDiagnosableFailure: (taskId, reason) => debugTldr?.onFailureEscalated(taskId, reason),
      onHandoff: async (request) => {
        let reachedFinalization = false;
        try {
          if (!runner.consumeHandoff(request)) {
            runner.system(
              request.taskId,
              "✗ server-side handoff rejected: invalid or expired runner session",
            );
            return;
          }
          // AgentRunner marks the handoff as in-flight *before* invoking this
          // callback so it cannot be mistaken for a stalled task or restarted
          // mid-finalization. The capability above is single-use, so a duplicate
          // callback has already been rejected by consumeHandoff(). Checking the
          // in-flight marker here would reject this very handoff every time.
          const task = index.getTask(request.taskId);
          if (!task) {
            runner.system(request.taskId, "✗ server-side handoff failed: task no longer exists");
            return;
          }
          reachedFinalization = true;
          runner.system(
            request.taskId,
            "Server finalization started — validating the runner handoff",
          );
          const result = await handoffTask(
            config,
            task,
            request,
            (step) => {
              emitEvent({
                type: "task.progress",
                id: task.id,
                step: `handoff:${step}`,
                at: new Date().toISOString(),
              });
              if (step !== "validate" && step !== "done") {
                runner.system(task.id, `Server finalization: ${step}`);
              }
            },
            onServerStatusChange,
            taskChecks,
            onTaskCheckEvent,
            remoteValidator,
            previews,
            (id, level, message) => logger.task(id, level, message),
          );
          if (result.ok) {
            index.applyFileChange(task.absPath, { guarded: true });
            runner.system(task.id, "✓ Server finalization complete — task moved to review");
          } else {
            runner.system(
              task.id,
              `✗ Server finalization stopped at ${result.step}: ${result.detail ?? "unknown error"}. The same worktree can be resumed and retried.`,
            );
            scheduleCheckFailureRetry(config, task, result, runner, (absPath) =>
              index.applyFileChange(absPath, { guarded: true }),
            );
          }
        } finally {
          if (reachedFinalization) runner.completeHandoffFinalization(request.taskId);
        }
      },
      onPreviewRequest: async (request) => {
        // The capability was minted by the runner for THIS run: task id, run id,
        // registered branch, and registered worktree all bind to server state.
        // Anything else — a forged or expired run, a cross-task claim, or a
        // substituted path — is rejected before any process is started (#0121).
        if (!runner.validatePreview(request)) {
          runner.system(
            request.taskId,
            "✗ managed preview request rejected: no matching live runner run",
          );
          return;
        }
        const task = index.getTask(request.taskId);
        if (!task) {
          runner.system(request.taskId, "✗ managed preview request failed: task no longer exists");
          return;
        }
        runner.system(
          request.taskId,
          "Server-owned preview requested — validating the run and starting the worktree preview",
        );
        // Reuse the existing PreviewManager: idempotent per task, RepoOS chooses
        // the port and owns the process lifecycle. Never a parallel implementation.
        // The agent request has no picker, so it opts into the first match when
        // the area is ambiguous (#0379) — the label below makes the pick visible.
        const result = await previews.start(task, undefined, {
          allowAmbiguous: true,
        });
        if (!result.ok) {
          runner.system(
            request.taskId,
            `✗ managed preview failed: ${result.error ?? "could not start the preview"}. The worktree is unchanged and the same session can be resumed.`,
          );
          return;
        }
        const url = result.url ?? "";
        // Name the chosen target (#0379) when it's a named target: an agent
        // request has no picker, so a task whose area matches more than one
        // target must still show which one actually ran. The bare "default"
        // command keeps the original, unannotated message.
        const targetNote =
          result.label && result.label !== "default" ? ` (target: ${result.label})` : "";
        const overrideNote = result.overrides?.length
          ? ` (preview overrides active: ${result.overrides.join(", ")})`
          : "";
        runner.system(
          request.taskId,
          `✓ Managed preview ready${targetNote}${overrideNote}: ${url}`,
        );
        // The sandbox may not be able to open the URL — probe it from the
        // privileged server side and record the structured outcome.
        const probe = await probePreview(url, result.readyPath);
        if (probe.ok) {
          runner.system(
            request.taskId,
            `✓ Server-side preview probe passed — ${probe.detail ?? "preview responds"}`,
          );
        } else {
          runner.system(
            request.taskId,
            `✗ Server-side preview probe failed: ${probe.error ?? "unreachable"}`,
          );
        }
      },
      // A durable review turn completed (0288), possibly re-attached after a
      // reload. The ReviewManager finalizes the report from its own durable
      // session rather than a post-`runPrompt` continuation that would have died
      // with the old process. `reviews` is assigned below but the callback only
      // fires asynchronously after completion, so the closure is safe.
      onReviewDone: (sessionKey, exitedCleanly, reviewKind) => {
        if (!reviews) return;
        try {
          reviews.handleReviewDone(sessionKey, exitedCleanly, reviewKind);
        } catch (err) {
          console.error(`[repoos] review completion handler threw: ${(err as Error).message}`);
        }
      },
    },
  );

  // Adopt any agent children that survived a server restart (0214).
  // Reads the durable registry, checks PID aliveness, and re-attaches
  // to still-running children so isRunning() reports true immediately.
  runner.adoptRunningAgents();

  // Recover any pending handoff requests from a previous interrupted turn (#0235).
  // Validates each request (task still exists, active, branch matches) and
  // re-fires onHandoff for valid ones. Runs after `adoptRunningAgents` (so
  // in-flight handoffs from adopted agents are visible) AND after the index
  // has populated: recovery validates via `index.getTask()`, which is empty
  // until `refreshAllAsync` resolves — a fast boot used to run recovery first
  // and silently drop valid requests (`if (!task) clearPendingHandoff()`),
  // leaving the task stuck `active` with its work uncommitted.
  const runHandoffRecovery = (): void => runner.recoverPendingHandoffs();
  void indexReady.then(runHandoffRecovery, runHandoffRecovery).catch(() => {});

  // The one-time area-format migration (#0583) runs once AFTER the index has
  // populated: any task file whose `area` frontmatter still carries a legacy
  // spelling (`server + ui-app`, a comma string, a one-element list) is
  // rewritten to the canonical scalar-or-list form through the shared task
  // engine, then committed in one pass here so `main` never sits dirty and
  // the change lands as ONE reviewable migration commit. The reader
  // tolerates every legacy shape forever, so a skipped file keeps working
  // until its next write. Control-plane only — a preview child (or any
  // worktree-rooted server) must never rewrite the board's own files from a
  // derived copy; a vitest boot skips outright (the VITEST guard below stops
  // any test-spawned server from touching the live board, ports aside), and
  // a non-test tool boot can opt out with REPOOS_SKIP_AREA_MIGRATION=1.
  const runAreaMigration = (): void => {
    try {
      if (!isControlPlane) return;
      // A vitest process must never rewrite the live board, full stop — any
      // suite that boots a real-port server against the repo root would
      // otherwise migrate+commit other tasks' files as a side effect.
      if (process.env.VITEST === "true") return;
      // Non-test processes that want the pass suppressed (a one-off tool) can
      // set REPOOS_SKIP_AREA_MIGRATION=1 explicitly.
      if (process.env.REPOOS_SKIP_AREA_MIGRATION === "1") return;
      const outcome = runAreaMigrationPass(config, (absPaths) =>
        commitFiles(
          config.root,
          absPaths,
          "docs: migrate legacy area values to comma list form (#0583)",
        ),
      );
      if (!outcome.attempted) return;
      if (!outcome.committed) {
        // The rewrite landed on disk but the commit did not: main is dirty and
        // the next boot retries the paths recorded in the pending marker
        // (#0587). Never silent — a dirty main is otherwise invisible.
        logger.system("warn", "area-format migration (#0583): commit failed; will retry on boot", {
          rewritten: outcome.rewritten,
          retried: outcome.retried,
        });
      } else {
        logger.system("info", "area-format migration (#0583)", {
          rewritten: outcome.rewritten,
          retried: outcome.retried,
        });
      }
      // The index holds pre-migration parses; refresh so boards and searches
      // see the canonical `areas` values right away.
      index.refreshAll();
    } catch {
      /* best-effort: the tolerant reader keeps legacy files working anyway */
    }
  };
  void indexReady.then(runAreaMigration, () => {});

  // One-time underspecified sweep (#0668): tasks created before the create path
  // assessed them — or created by `repoos new` while the server was down — must
  // still surface `needs_input` for the Send-to-PM action. Runs once after the
  // index is populated; `sweepUnderspecifiedTasks` is idempotent and never
  // clobbers an unrelated reason, so a second boot is a silent no-op. Terminal
  // and review tasks are skipped by the sweep itself. Control-plane only: a
  // preview child or worktree-rooted server must never rewrite the board, and a
  // vitest boot must not touch the live board (mirrors the area migration).
  const runUnderspecifiedSweep = (): void => {
    try {
      if (!isControlPlane) return;
      if (process.env.VITEST === "true") return;
      const changed = sweepUnderspecifiedTasks(config, index.getTasks());
      if (changed.length === 0) return;
      commitFiles(
        config.root,
        changed.map((task) => task.absPath),
        "docs: flag underspecified tasks (#0668)",
      );
      // The index holds pre-sweep parses; refresh so boards see needs_input now.
      index.refreshAll();
      logger.system("info", `underspecified sweep: flagged ${changed.length} task(s)`);
    } catch {
      /* best-effort: a failed sweep must never block boot */
    }
  };
  void indexReady.then(runUnderspecifiedSweep, runUnderspecifiedSweep).catch(() => {});

  // The review agent (0101): when a task lands in `review`, it inspects the
  // implementation and writes a short report for whoever signs the task off.
  // Advisory only — it never moves a task to `done`.
  // Created after the runner so it can send auto-bounce messages to the engineer.
  reviews = new ReviewManager(config, emitEvent, runner, index, (taskId, reason) =>
    debugTldr?.onFailureEscalated(taskId, reason),
  );

  // Checks → Test Suite tab (0296-adjacent): an
  // ephemeral, non-durable background run, one at a time — see test-run.ts.
  const testRuns = new TestRunManager();

  // Re-arm the hard review timeout for any durable review sessions re-attached
  // from the previous server (0288): the spawner's timer died with it, so an
  // adopted review would otherwise run without a deadline. Also registers the
  // adopted turns in `reviews` so cancellation and run/chat mode work for them.
  reviews.armAdoptedTimeouts();

  // Re-spawn reviews a real (non-reload) shutdown killed: `handle.close()` runs
  // `reviews.cancelAll()` on SIGTERM/SIGINT, so a manual restart (or a crash)
  // leaves tasks stuck in `review` with a stale/missing report and nothing
  // adopts them. Deferred until `indexReady` — it reads `index.getTasks()`.
  const runReviewRecovery = (): void => reviews.recoverInterruptedReviews(index.getTasks());
  void indexReady.then(runReviewRecovery, runReviewRecovery).catch(() => {});

  reviews.bindCleanReviewHandler((task, report) => {
    void tryAutoApproveAfterCleanReview(
      {
        config,
        index,
        jobCoordinator,
        reload,
        emitEvent,
        triggerJobProcessing,
        runner,
        previews,
        reviews,
        attentionEvents,
      },
      task,
      report,
    ).catch((err) => {
      console.error(
        `[repoos] approval policy handler failed for #${task.id}: ${(err as Error).message}`,
      );
    });
  });

  // Skill suggestions (#0429): only after a task genuinely reaches `done` does
  // its session get analysed. A high-bar reusable procedure is persisted
  // internally first and creates nothing; one `New Skill Suggestion: …` task is
  // created only once corroborated by a second independent session (or a named
  // stable external workflow). Off by default; `skillSuggestions: true` enables.
  const skillSuggestions = new SkillSuggestionManager({
    config,
    getTranscript: (taskId) => runner.output(taskId)?.lines ?? [],
    createTask: (input) => {
      const created = repoos.createTask(input);
      index.applyFileChange(created.absPath);
      commitTaskFile(config.root, created.absPath, `docs(${created.id}): add task`);
      return created;
    },
    markOrigin: (origin, suggestionId) => {
      markOriginTask(config, origin, suggestionId);
      index.applyFileChange(origin.absPath);
    },
    logger,
  });

  // Failure tl;dr (#0570): when a task escalates to a diagnosable failure
  // (`review-failed`, `dev-error`, `check-failed-after-retries`,
  // `watchdog-stuck`), the Debugger runs once as a one-shot and its single
  // sentence is persisted as `debug_tldr`. Best-effort: the failure paths that
  // trigger it never wait on it, and a failed run leaves behavior unchanged.
  debugTldr = new DebugTldrManager({
    config,
    getTask: (taskId) => index.getTask(taskId),
    getTranscript: (sessionId) => runner.output(sessionId)?.lines ?? [],
    getTaskLogs: (taskId, limit) => logger.getTaskLogs(taskId, limit),
    onTaskFileChanged: (absPath) => index.applyFileChange(absPath),
    getCloseOutJob: (taskId) => jobCoordinator.getJob(taskId),
    updateCloseOutJob: (taskId, update, expectedAttempt) =>
      jobCoordinator.updateJob(taskId, update, expectedAttempt),
    onDoneErrorTldr: (taskId, tldr) =>
      emitEvent({
        type: "task.doneErrorTldr",
        id: taskId,
        tldr,
        at: new Date().toISOString(),
      }),
    onDiagnosisStarted: (taskId) =>
      emitEvent({
        type: "task.debugTldr",
        id: taskId,
        state: "started",
        at: new Date().toISOString(),
      }),
    onDiagnosisFinished: (taskId) =>
      emitEvent({
        type: "task.debugTldr",
        id: taskId,
        state: "finished",
        at: new Date().toISOString(),
      }),
    logger,
  });

  // The CTO agent (0174): always-on board monitor that detects stuck tasks,
  // stale reviews, and broken builds, then nudges agents or escalates to the human.
  const cto = new CTOManager(config, emitEvent, runner);
  const ctoHeartbeat = new CtoHeartbeatTracker();
  const ctoMonitor = new CTOMonitor(config, index, cto, runner);
  ctoMonitor.wireHeartbeatTouch(() => {
    ctoHeartbeat.touch();
    bumpAttention();
  });
  ctoMonitor.wireSafeActions(() =>
    runCtoMonitorSafeActions({
      config,
      index,
      runner,
      jobCoordinator,
      attentionEvents,
      rates: ctoActionRates,
      logger,
      emitEvent,
      triggerJobProcessing,
      reportedStages,
      remoteValidator,
    }),
  );
  // Run the monitor cadence unconditionally: `checkNow` no-ops while the CTO
  // agent is disabled, so enabling it from the Agents page takes effect on the
  // next tick without a restart, and disabling it stops runs immediately.
  // Interval configurable from config if present; default to 5 minutes.
  const ctoIntervalMs =
    ((config as unknown as Record<string, unknown>)?.ctoMonitorIntervalMs as number | undefined) ||
    5 * 60 * 1000;
  ctoMonitor.start(ctoIntervalMs);

  // Review activity is transient server state, not task-file frontmatter. Add
  // its small authoritative summary to index-shaped API responses so a board
  // refresh/reconnect cannot leave a card stuck in (or missing) Reviewing.
  const withReviewStatus = <T extends Task>(
    task: T,
  ): T & {
    automaticReview: { running: boolean; enabled: boolean };
  } => ({
    ...task,
    automaticReview: {
      running: reviews.isRunning(task.id),
      enabled: reviews.enabled(),
    },
  });

  // System resource polling over SSE. Samples CPU/memory/process stats every
  // 5s while at least one SSE client is connected; idles when no one is
  // listening (a headless server should not burn cycles measuring itself for
  // nobody). Graceful: skips sampling entirely when `ps` is unavailable.
  const SYSTEM_SAMPLE_INTERVAL_MS = 5000;
  const systemSampleTimer = setInterval(() => {
    if (clients.size === 0 || !psAvailable()) return;
    try {
      const stats = sampleSystem({
        serverPid: process.pid,
        cacheDir: join(config.root, config.cacheDir),
        runningAgents: runner.running(),
        knownServePids: previews.knownPids(),
        root: config.root,
        worktreeWarnThreshold: config.worktreeWarnThreshold,
      });
      emitEvent({ type: "system.stats", stats });
    } catch {
      /* sampling is best-effort — never crash the poll loop */
    }
  }, SYSTEM_SAMPLE_INTERVAL_MS);

  // Stray serve-process reaping (#0216): orphaned repoos serve processes
  // (their spawning parent confirmed dead) accumulate from failed
  // reload-replacement attempts and interrupted test/close-out runs. Left
  // alone they starve the close-out gate and, at volume, strain the whole
  // machine — not just this server. Runs independent of SSE client presence
  // (unlike the stats sampler above) since strays keep accumulating whether
  // or not anyone is watching the UI. `psAvailable()` gate matches the
  // sampler's own platform guard.
  const REAP_INTERVAL_MS = 30_000;
  const reapTimer = shouldReapStrayServeProcesses(opts)
    ? setInterval(() => {
        if (!psAvailable()) return;
        try {
          const reaped = reapStrayServeProcesses(
            process.pid,
            new Set(previews.knownPids()),
            undefined,
            undefined,
            config.root,
          );
          if (reaped > 0)
            console.log(
              `serve-reaper: reaped ${reaped} orphaned serve process${reaped === 1 ? "" : "es"}`,
            );
          // The PPID-based pass above cannot see every deleted-root orphan;
          // repeat the narrower root sweep so leaks created after boot do not
          // wait until the next control-plane restart.
          void reaper.cleanupOrphanedRoots();
        } catch {
          /* reaping is best-effort — never crash the server over it */
        }
      }, REAP_INTERVAL_MS)
    : null;

  // Built-in agent scheduling: a single in-flight guard shared with the manual
  // /run endpoint, checked once a minute. An enabled agent whose daily/weekly
  // schedule is due runs exactly one scan per tick; scheduled and manual runs
  // can never overlap. Errors only log — the scheduler is best-effort and must
  // never crash the poll loop.
  /**
   * Announce a finished built-in agent run on the SSE stream (0439) so the UI
   * can toast "Tech Debt Agent finished — 3 findings" and link the run doc.
   * Every agent's result carries the same receipt shape; a null/undefined
   * result (unknown agent) is never announced.
   */
  const emitBuiltInRunEvent = (
    agentName: string,
    result: { runDoc?: string | null; findingsFound?: number; taskId?: string | null } | null,
  ): void => {
    if (!result) return;
    emitEvent({
      type: "built-in.run",
      agent: agentName,
      label: builtInAgentLabel(agentName),
      findings: result.findingsFound ?? 0,
      taskId: result.taskId ?? null,
      runDoc: result.runDoc ?? null,
      at: new Date().toISOString(),
    });
  };
  const BUILT_IN_CHECK_INTERVAL_MS = 60_000;
  const builtInRun = { inFlight: false };
  const builtInTimer = setInterval(() => {
    if (builtInRun.inFlight) return;
    const agents = repoos.config.builtInAgents ?? {};
    for (const name of Object.keys(agents)) {
      // Chat-only agents (the Debugger) have no scan to schedule — their
      // floating-head conversation is the only interaction surface (0201).
      if (name === "debugger") continue;
      if (!isDueForScheduledRun(agents[name])) continue;
      builtInRun.inFlight = true;
      void runBuiltInAgent(name, repoos.config, logger)
        .then((result: any) => {
          if (result && result.failed > 0) {
            console.error(
              `[built-in-agents] scheduled run of "${name}" wrote ${result.failed} failed task(s): ${result.errors.join("; ")}`,
            );
          }
          // Scheduled runs are invisible unless they announce themselves: the
          // human never clicked Run now, so this is the only way the run doc
          // they just got written surfaces in the UI (0439).
          emitBuiltInRunEvent(name, result);
        })
        .catch((err: any) => {
          console.error(`[built-in-agents] scheduled run of "${name}" failed:`, err);
          logger.agent(name, "error", `Built-in agent run failed`, {
            error: String(err),
          });
        })
        .finally(() => {
          builtInRun.inFlight = false;
          index.refreshAll();
        });
      break; // one built-in agent per tick
    }
  }, BUILT_IN_CHECK_INTERVAL_MS);

  // Periodic worktree dirty-status sweep. Task mutations already refresh a
  // task's worktree status via refreshBranches(); this catches the gap where a
  // worktree goes dirty (or clean) with no task activity at all, and keeps the
  // fast-boot skip honest over long uptimes. Batched — one `git status` per
  // worktree whose HEAD moved. Never overlaps itself.
  const WORKTREE_SWEEP_INTERVAL_MS = 90_000;
  const worktreeSweep = { inFlight: false };
  const worktreeSweepTimer = setInterval(() => {
    if (worktreeSweep.inFlight) return;
    worktreeSweep.inFlight = true;
    void index
      .reconcileWorktreeStatus()
      .catch(() => {})
      .finally(() => {
        worktreeSweep.inFlight = false;
      });
  }, WORKTREE_SWEEP_INTERVAL_MS);
  worktreeSweepTimer.unref?.();
  // First sweep shortly after boot: refreshAllAsync() built the index with
  // `git status` skipped for speed, so this is what makes each task's
  // "uncommitted changes" dot accurate. Deferred a few seconds so it never
  // competes with the listener coming up or a reload health handshake.
  const initialWorktreeSweep = setTimeout(() => {
    worktreeSweep.inFlight = true;
    void index
      .reconcileWorktreeStatus()
      .catch(() => {})
      .finally(() => {
        worktreeSweep.inFlight = false;
      });
  }, 3_000);
  initialWorktreeSweep.unref?.();

  // Any status change that leaves active/review must stop the task's preview
  // (done/ready/paused). Previews never outlive the state they preview.
  const stopPreviewIfLeft = (task: Task, _prev: Status, next: Status): void => {
    if (next !== "active" && next !== "review") void previews.stop(task.id);
  };

  // A task that leaves `active` must also release its agent process (0087) —
  // by ANY route: agent self-transition, API PATCH, pause, or a direct file
  // edit. This reuses the exact graceful path `/pause` uses (`runner.stop`:
  // SIGTERM, then SIGKILL after the grace period, clearing the registry on
  // exit), so an agent turn can never keep running against a task that no
  // longer claims it — the 3h54m leak observed on #0069. The SESSION
  // (transcript + resumable session id) lives in `sessions`, not `entries`,
  // and `stop()` only clears `entries` — so logs and chat stay available in
  // review (0053) and a follow-up message still resumes the same conversation.
  // Idempotent: a task whose agent already exited on its own is a silent no-op.
  const stopAgentIfLeftActive = (task: Task, prev: Status, next: Status): void => {
    if (prev === "active" && next !== "active") void runner.stop(task.id);
  };

  // Automatic shot capture on entry to review (#0594): fire-and-forget, and
  // never allowed to fail or delay the transition that triggered it. The
  // PreviewManager is the server-owned lifecycle (#0271/#0379), so this is the
  // regular capture path `repoos shot` uses — nothing parallel to maintain.
  const scheduleAutoShotCapture = (task: Task): void => {
    if (!task.branch) return;
    void runAutoShotCapture(config, task, previews, (id, level, message) =>
      logger.task(id, level, message),
    ).catch((err: unknown) => {
      logger.system("warn", `automatic shot capture crashed for #${task.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  };

  // Combined status-change hook, fired for every status change by any route.
  const onStatusChange = (task: Task, prev: Status, next: Status): void => {
    stopPreviewIfLeft(task, prev, next);
    stopAgentIfLeftActive(task, prev, next);
    if (prev === "active" && next !== "active") runner.discardPendingHandoff(task.id);
    if (next === "done") runner.complete(task.id);
    if (prev !== "review" && next === "review") scheduleAutoShotCapture(task);
    if (next === "done" || (prev === "review" && next !== "review")) {
      clearWorktreeHandoffProtection(config.root, config.cacheDir, task.id);
    }
  };

  /**
   * Hook for the SERVER's own writes (API PATCH, start, sync) — everything
   * `onStatusChange` does, plus: a human moving a task out of `review` drops
   * its pending agent review. Deliberately NOT wired to the index event
   * stream: a task file edited into `done` on disk is exactly the agent
   * overreach the review guard exists to catch, and cancelling on it would
   * disarm the guard.
   */
  const onServerStatusChange = (task: Task, prev: Status, next: Status): void => {
    onStatusChange(task, prev, next);
    if (prev === "review" && next !== "review") {
      pendingReview.delete(task.id);
      reviews.cancel(task.id);
    }
  };

  // Durable freeform PM runs (#0403): the freeform-create route spawns the PM
  // agent through this manager instead of a fire-and-forget closure, so the
  // run (and its result/error) survives a server reload. Completion is
  // post-processed by the same `finalizeFreeformRun` the route used to inline.
  const freeformRuns = new FreeformRunManager(config, emitEvent, (record, result) =>
    finalizeFreeformRun({ config, index, logger, emitEvent, onServerStatusChange }, record, result),
  );

  // Adopt freeform PM runs that survived a server restart (#0403): a still-live
  // child is re-attached and streamed; one that already finished while no
  // server was up is finalized from its durable log. Deferred until `indexReady`
  // so an adopted completion can resolve its draft task.
  const runFreeformAdoption = (): void => freeformRuns.adopt();
  void indexReady.then(runFreeformAdoption, runFreeformAdoption).catch(() => {});

  /**
   * #0507: the single entry point for EVERY route into `review` that is not the
   * agent's own handoff signal — the Review button, board drag-drop, a direct
   * `PATCH status: review`, a task-file edit the watcher picked up, and a
   * `repoos mv` from a human's shell. All of them run the same scoped
   * `repoos check` → commit/vacuity gate → `review` sequence the signal does,
   * via `finalizeReviewHandoff`.
   *
   * It is deliberately fire-and-forget: `repoos check` can take minutes, and
   * holding an HTTP request (or a board drag) open for that long is not
   * acceptable. So the task stays exactly where it was — `active` — while this
   * runs, the in-flight marker makes the card read "running checks…", and the
   * only thing that ever writes `status: review` is the finalization itself
   * once the check and the gate have both passed. A failure leaves the task
   * `active` with the reason in the transcript, the activity log and a
   * `task.progress` event the UI shows.
   *
   * Unlike the agent path this is not resumable across a server reload: there
   * is no runner capability to re-adopt. A reload mid-handoff simply leaves the
   * task `active`, and asking again is one click.
   */
  const startUnifiedHandoff = (
    task: Task,
    opts: { origin: HandoffOrigin; skipChecks?: boolean; actor?: string } = { origin: "api" },
  ): { started: boolean; reason?: string } => {
    // Claimed through the runner so every existing consumer of
    // isHandoffInFlight/hasPendingHandoff — the task card's "requested review"
    // hint, the CTO monitor's nudge suppression, the watchdog — sees this
    // handoff too, without each needing to know which route started it.
    if (!runner.markHandoffInFlight(task.id)) {
      return { started: false, reason: "a handoff is already running for this task" };
    }
    const branchHead = readTaskBranchHead(config, task);
    if (shouldParkForIdenticalHandoffFailures(task, branchHead)) {
      runner.releaseHandoffInFlight(task.id);
      const last = lastHandoffFailureFromBody(task.body);
      parkTaskForIdenticalHandoffFailures(config, task, last?.detail ?? "check failed", (absPath) =>
        index.applyFileChange(absPath, { guarded: true }),
      );
      return {
        started: false,
        reason: "identical handoff validation failures — task parked for a human",
      };
    }
    if (!opts.skipChecks && shouldSkipHandoffValidationForUnchangedTree(task, branchHead)) {
      runner.releaseHandoffInFlight(task.id);
      runner.system(
        task.id,
        "✗ Server finalization skipped: the branch tip is unchanged since the last identical check failure — fix the code or wait for an engineer recovery turn",
      );
      return {
        started: false,
        reason: "unchanged branch tip with a known identical check failure",
      };
    }
    const started = Date.now();
    const progress = (step: string, detail?: string): void => {
      try {
        emitEvent({
          type: "task.progress",
          id: task.id,
          step: `handoff:${step}`,
          ...(detail ? { detail } : {}),
          at: new Date().toISOString(),
        });
      } catch {
        /* best-effort signalling */
      }
    };
    progress("started", opts.skipChecks ? "commit gate only (checks skipped)" : "repoos check");
    void finalizeReviewHandoff(config, task, {
      origin: opts.origin,
      skipChecks: opts.skipChecks,
      actor: opts.actor,
      onStatusChange: onServerStatusChange,
      taskChecks,
      onTaskCheckEvent,
      remoteValidator,
      previews,
      onTaskLog: (id, level, message) => logger.task(id, level, message),
      onProgress: (step) => {
        if (step === "validate") return;
        progress(step, undefined);
        if (step !== "done") runner.system(task.id, `Server finalization: ${step}`);
      },
    })
      .then((result) => {
        if (result.ok) {
          // The finalization wrote both the worktree and the canonical copy;
          // re-read the canonical file into the live index as a guarded change
          // so the transition fires the normal review hooks exactly once.
          index.applyFileChange(task.absPath, { guarded: true });
          runner.system(
            task.id,
            `✓ Server finalization complete — task moved to review (${Math.round((Date.now() - started) / 1000)}s)`,
          );
          progress("done", "moved to review");
          return;
        }
        const detail = result.detail ?? "unknown error";
        const message = `✗ Server finalization stopped at ${result.step}: ${detail}. The task stays ${task.status} — fix the failure and ask again.`;
        runner.system(task.id, message);
        // Durable: the watchdog and any later reader of the activity log can
        // see why this handoff did not land, across a reload.
        const failureReason = `${opts.origin} handoff failed at ${result.step} · ${detail}`;
        runner.persistHandoffFailure(task.id, task, failureReason);
        const parsed = parseHandoffFailureReason(failureReason);
        if (parsed && result.step === "check") {
          persistHandoffFailureLoopMetadata(config, task, branchHead, parsed, (absPath) =>
            index.applyFileChange(absPath, { guarded: true }),
          );
        }
        progress("failed", detail);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        runner.system(task.id, `✗ Server finalization crashed: ${message}`);
        progress("failed", message);
      })
      .finally(() => {
        runner.releaseHandoffInFlight(task.id);
      });
    return { started: true };
  };

  // #0210/#0507: every transition INTO `review` that did NOT come through one
  // of the server's own routes — a direct task-file edit, a `repoos mv` from a
  // human's shell, an agent editing its own file — used to be held only to the
  // commit/vacuity gate, and then allowed straight into `review`. That made
  // the routes agents actually use the *least* checked ones (#0505, #0499).
  //
  // The index defers such transitions here and reverts the file to its previous
  // status whatever we decide, so the task stays `active` and the human sees
  // that nothing moved. We then run the SAME finalization the handoff signal
  // runs — scoped `repoos check`, commit gate, `review` — which is what makes
  // "no route may reach review with only the commit/vacuity gate" true rather
  // than aspirational. Returning false is therefore the NORMAL outcome here,
  // not a rejection: the real transition happens inside `finalizeReviewHandoff`.
  //
  // The exception matters and is not an optimization. The finalization's OWN
  // write of `status: review` reaches the same watcher, and the agent handoff
  // path's slot stays held until `onHandoff` returns, so checking the
  // in-flight marker is what keeps the finalizer from fighting itself: without
  // it, the guard reverts the file the finalization just wrote, fails to claim
  // the (already held) slot, and the task bounces back to `active` with a green
  // check behind it — or, worse, silently starts a second check minutes later.
  //
  // `prev`, not the edited `task`: the index is about to rewrite the file back
  // to `prev.status`, and the finalization is what re-writes it to `review`.
  // Handing it the post-edit task would make it see "already in review" and skip
  // that write entirely.
  index.setReviewGuard(async (task: Task, prev: Task): Promise<boolean> => {
    if (runner.isHandoffInFlight(task.id)) return true; // our own finalization's write
    startUnifiedHandoff(prev, { origin: "task-file" });
    return false;
  });

  /**
   * Kick off the agent review for a task that just landed in `review`. A no-op
   * when the review agent is disabled on the Agents page (`reviews.run` skips
   * silently), and deferred while the task's own agent turn is still running.
   */
  const startReview = (task: Task): void => {
    if (!reviews.enabled()) return;
    // This task is only back in `review` because the guard put it there after
    // an agent overstepped — reviewing it again would just repeat that.
    if (reviews.claimRevert(task.id)) return;
    if (runner.isRunning(task.id)) {
      pendingReview.add(task.id);
      return;
    }
    pendingReview.delete(task.id);
    // A transition back from engineering needs a new assessment even when the
    // branch HEAD has not changed since the last report. The previous report
    // may be newer than HEAD because the engineer's change is still being
    // committed, or because the task needed a non-source fix. The index emits
    // this transition once; ReviewManager rejects an already-running review.
    void reviews.run(task);
  };

  // The file-watcher path (a direct task-file edit on disk) bypasses
  // patchTaskFile, so it never fires `onStatusChange`. The index's own event
  // stream sees EVERY status change from every route (HTTP PATCH, /done,
  // start/pause, the watcher, and the 0077 self-heal) — apply the same cleanup
  // there. Both firing for a single transition is harmless: `previews.stop` and
  // `runner.stop` are idempotent.
  const notificationCtx = notificationContextFromConfig(config, getAuthStore(config.root));
  const unsubscribeNotifications = attachTaskNotificationHandlers(index, notificationCtx, {
    // #0542: the agent-completed notification must know when a later turn,
    // pause, or in-flight review handoff already owns the post-turn state.
    runner,
  });

  const unsubscribeCleanup = index.on((e) => {
    if (e.type === "task.created") {
      // 0381: a PM chat session with pending screenshots may have just
      // created this task through `repoos new` — attach its parked images
      // now, while the session is still running. Best-effort and a no-op
      // when nothing is pending; the re-parsed task goes back through the
      // index so every client sees the Screenshots section.
      const withShots = attachPendingPmImages(config, e.task, (key) => runner.isRunning(key));
      if (withShots) index.applyFileChange(withShots.absPath);
      return;
    }
    if (e.type !== "task.updated") return;
    const prev = e.prev.status;
    if (prev === undefined || prev === e.task.status) return;
    onStatusChange(e.task, prev, e.task.status);
    // Every route into `review` — a board drag, the drawer, an agent editing
    // its own task file — surfaces here, so this is the one place the agent
    // review needs to hang off. The skill-suggestion pass deliberately does
    // NOT run here (#0429): its evidence gate requires a genuinely completed,
    // verified task, so it hangs off `done` only, below.
    if (e.task.status === "review") {
      startReview(e.task);
    } else if (e.task.status === "done") {
      skillSuggestions.maybeSuggest(e.task);
    }
  });

  // Previews are on-demand only (POST /api/tasks/:id/preview), not
  // auto-launched on entering `review` or relaunched at boot. They used to be
  // (#0198) because spinning one up was slow enough to be annoying to wait
  // for; now that startup itself is fast (#0271 follow-up), auto-launching
  // N previews at once — at boot, or as N tasks land in review in quick
  // succession — is no longer worth the CPU contention it causes (each
  // preview is a project-declared command, or this repo's own `repoos serve`
  // — #0370 removed the implicit nested-`repoos serve` default for every
  // OTHER project). MAX_PREVIEWS is 1 (preview.ts) so only one is ever
  // running; starting a new one evicts the last.

  // Trigger CTO monitor on key events: task status changes, review completion, agent exit.
  const unsubscribeCTOEvents = index.on((e) => {
    if (!cto.enabled()) return;
    if (e.type === "task.updated") {
      const prev = e.prev.status;
      if (prev !== undefined && prev !== e.task.status) {
        ctoMonitor.onEvent(`task #${e.task.id} status change: ${prev} → ${e.task.status}`);
      }
    } else if (e.type === "review") {
      ctoMonitor.onEvent(`review complete for task #${e.id}: ${e.state}`);
    } else if (e.type === "agent.exited") {
      const extra = e.cause ? ` — ${e.cause}` : "";
      ctoMonitor.onEvent(`agent exited: task #${e.id}${extra}`);
    } else if (e.type === "close-out.outcome") {
      ctoMonitor.onEvent(
        `close-out ${e.outcome.outcome} for task #${e.outcome.taskId}: ${e.outcome.reason || "(ok)"}`,
      );
    } else if (e.type === "task-check.done") {
      ctoMonitor.onEvent(
        `task-check ${e.passed ? "passed" : "failed"} for task #${e.taskId} (check ${e.checkId})`,
      );
    } else if (e.type === "board.alert") {
      ctoMonitor.onEvent(`${e.alert} on task #${e.taskId}: ${e.cause}`);
    }
  });

  interface SyncResult {
    ok: boolean;
    conflicts: string[];
    reason?: string;
  }

  /**
   * Merge the main checkout's current branch into the task's branch inside its
   * linked worktree. On conflict the merge is aborted and the task file in both
   * copies is flagged `needs_merge`. On success the flag is cleared.
   */
  async function syncTaskBranch(task: Task): Promise<SyncResult> {
    const rel = relative(config.root, task.absPath);
    const result = await syncBranchWithMain(config.root, task.branch, {
      autoResolve: [rel],
    });
    const wtPath = worktreePathForBranch(config.root, task.branch);

    const setNeedsMerge = async (value: boolean): Promise<void> => {
      const mainUpdated = patchTaskFile(
        config,
        task.absPath,
        { needsMerge: value },
        {
          onStatusChange: onServerStatusChange,
        },
      );
      index.applyFileChange(mainUpdated.absPath);
      // Mirror the flag on the worktree copy so an agent resuming there sees it.
      if (wtPath) {
        const wtAbsPath = join(wtPath, task.path);
        if (existsSync(wtAbsPath)) {
          patchTaskFile({ ...config, root: wtPath }, wtAbsPath, {
            needsMerge: value,
          });
        }
      }
    };

    if (!result.ok) {
      await setNeedsMerge(true);
      return {
        ok: false,
        conflicts: result.conflicts,
        reason: result.reason ?? "sync failed",
      };
    }

    await setNeedsMerge(false);
    return { ok: true, conflicts: [] };
  }

  // Initialize route handlers that need runtime configuration
  initInfoHandlers(uiBuildHash || "", tunnelReadiness);
  const pwaIconName = projectDisplayName(config.root);
  setIconRenderer((size: number, color?: string, theme?: "light" | "dark", maskable?: boolean) =>
    renderPwaIcon(pwaIconName, size, color, theme, maskable),
  );

  // Create and register all routes with the router
  const router = new Router();

  // Info/metadata routes
  router.register("GET", "/api/health", health);
  router.register("POST", "/api/server/restart", restart);
  router.register("GET", "/api/counts", getCounts);
  router.register("GET", "/api/index", getIndex);
  router.register("GET", "/api/board", getBoard);
  router.register("GET", "/api/docs", getDocs);
  router.register("GET", "/api/repo/log", getRepoLog);
  router.register("GET", "/api/repo/branches", getRepoBranches);
  router.register("GET", "/api/repo/status", getRepoStatusRoute);
  router.register("POST", "/api/repo/commit", commitRepoRoot);
  router.register("GET", "/api/repo/working-diff", getRepoWorkingDiff);
  router.register("GET", "/api/repo/working-diff/file", getRepoWorkingDiffFile);
  router.register("GET", /^\/api\/repo\/commits\/([^/]+)\/file$/, getRepoCommitFile);
  router.register("GET", /^\/api\/repo\/commits\/([^/]+)$/, getRepoCommitRoute);
  router.register("POST", "/api/docs/create", createDoc);
  router.register("POST", "/api/docs/freeform", createFreeformDoc);
  router.register("GET", "/api/inputs", getInputs);
  router.register("POST", "/api/inputs", postInput);
  router.register("PATCH", /^\/api\/inputs\/([^/]+)$/, patchInput);
  router.register("DELETE", /^\/api\/inputs\/([^/]+)$/, deleteInput);
  router.register("POST", /^\/api\/inputs\/([^/]+)\/resolve$/, postResolveInput);
  router.register("POST", /^\/api\/inputs\/([^/]+)\/attachments$/, uploadInputAttachment);
  router.register("GET", /^\/api\/inputs\/([^/]+)\/attachments\/([^/]+)$/, getInputAttachment);
  router.register("GET", "/api/skills", getSkills);
  router.register("GET", "/api/skill-registry/curated", getRegistryCurated);
  router.register("GET", "/api/skill-registry/search", searchRegistry);
  router.register("GET", "/api/skill-registry/detail", getRegistryDetail);
  router.register("POST", "/api/skill-registry/install", installRegistry);
  router.register("POST", "/api/skills/create", createSkillRoute);
  router.register("POST", "/api/skills/freeform", createFreeformSkillRoute);
  router.register("GET", "/api/stories", getStoryDefinitions);
  router.register("POST", "/api/stories/freeform", createFreeformStory);
  // Story delete (#0634) — registered definitions only; tag-only stories 404.
  router.register("DELETE", /^\/api\/stories\/([^/]+)$/, deleteStory);
  // The story panel's PM chat (#0515) — the story counterparts of the task
  // panel's three PM routes, keyed by the story key the panel already holds.
  router.register("GET", /^\/api\/stories\/([^/]+)\/pm\/output$/, getStoryPmOutput);
  router.register("POST", /^\/api\/stories\/([^/]+)\/pm\/message$/, pmStoryMessage);
  router.register("POST", /^\/api\/stories\/([^/]+)\/pm\/interrupt$/, pmStoryInterrupt);
  router.register("GET", "/api/system", getSystem);
  router.register("GET", "/api/system/logs", getSystemLogs);
  router.register("GET", "/api/support/bundle", getSupportBundlePreview);
  router.register("POST", "/api/support/bundle", createSupportBundle);
  router.register("POST", "/api/support/bundle/open", revealSupportBundle);
  router.register("POST", "/api/support/bug-report", generateBugReport);
  router.register("GET", "/api/tunnel/readiness", getTunnelStatus);
  router.register("GET", "/api/release", getRelease);
  router.register("GET", "/api/release/available", getAvailableRelease);
  router.register("GET", "/api/release/run", getReleaseRun);
  router.register("GET", "/api/release/distribution", getReleaseDistribution);
  router.register("POST", "/api/release", runRelease);
  router.register("POST", "/api/release/notes", generateReleaseNotes);
  router.register("GET", "/api/release/notes/run", getReleaseNotesRun);
  router.register("GET", "/api/release/notes/unpushed", getUnpushedReleaseNotes);
  router.register("GET", "/api/deployments", getDeployments);
  router.register("POST", "/api/deployments/deploy", postDeploy);
  router.register("GET", "/api/chat", getChat);
  router.register("POST", "/api/chat/message", sendChatMessage);
  router.register("POST", "/api/chat/interrupt", interruptChatMessage);
  router.register("GET", "/api/debugger", getDebugger);
  router.register("POST", "/api/debugger/message", sendDebuggerMessage);
  router.register("POST", "/api/debugger/interrupt", interruptDebugger);
  router.register("POST", "/api/debugger/repair", repairWithDebugger);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/debugger$/, getTaskDebugger);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/debugger\/message$/, sendTaskDebuggerMessage);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/debugger\/interrupt$/, interruptTaskDebugger);
  router.register(
    "POST",
    /^\/api\/tasks\/([^/]+)\/debugger\/send-to-engineer$/,
    sendTaskDebuggerToEngineer,
  );
  router.register("POST", /^\/api\/tasks\/([^/]+)\/debugger\/send-to-pm$/, sendTaskDebuggerToPm);

  // Session stats routes
  router.register("GET", "/api/stats/board", getBoardStats);
  router.register("GET", "/api/stats/by-type", getSessionTypeStats);
  router.register("GET", "/api/stats/daily", getDailyTotals);

  // System resource routes
  router.register("POST", "/api/system/kill-process", async (_ctx, req, res) => {
    const body = (await readBody(req)) as { pid?: unknown };
    const pid = body.pid;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
      return json(res, 400, { error: "pid must be a positive integer" });
    }
    if (pid === process.pid) {
      return json(res, 400, {
        error: "refusing to kill the control-plane process itself",
      });
    }
    // Only ever kill a PID RepoOS itself is currently tracking — a fresh
    // sample, not the client's say-so, is what authorizes the kill. This is
    // the same trust boundary reapStrayServeProcesses already uses.
    const stats = sampleSystem({
      serverPid: process.pid,
      cacheDir: join(config.root, config.cacheDir),
      runningAgents: runner.running(),
      knownServePids: previews.knownPids(),
    });
    const known = new Set(stats.processes.map((p) => p.pid));
    for (const p of stats.serve?.processes ?? []) known.add(p.pid);
    if (!known.has(pid)) {
      return json(res, 404, {
        error: `pid ${pid} is not a RepoOS-tracked process`,
      });
    }
    const ok = killTrackedProcess(pid);
    return json(res, ok ? 200 : 404, ok ? { ok: true } : { error: "process was already gone" });
  });

  // Full test-suite run (Checks → Test Suite tab). GET returns current/last
  // state (for a client that just (re)connected mid-run); POST starts one,
  // streaming output over the existing SSE event bus rather than the response
  // itself — a run can take minutes, far past any sane HTTP response timeout.
  router.register("GET", "/api/system/run-tests", (_ctx, _req, res) => {
    return json(res, 200, testRuns.getState());
  });
  router.register("POST", "/api/system/run-tests", async (_ctx, req, res) => {
    const body = (await readBody(req)) as { remote?: unknown };
    const remote = body?.remote === true;
    const at = (): string => new Date().toISOString();
    const emitChunk = (chunk: string): void => {
      emitEvent({ type: "test-run.output", chunk, at: at() });
    };
    const emitDone = (code: number | null): void => {
      emitEvent({ type: "test-run.done", code, at: at() });
    };

    if (remote) {
      if (!config.remoteValidation?.enabled || !remoteValidator) {
        return json(res, 400, {
          ok: false,
          error: "remote validation is not enabled or could not be initialized",
        });
      }
      const begun = testRuns.begin();
      if (!begun.ok) return json(res, 409, { error: begun.reason });
      emitEvent({ type: "test-run.started", at: at() });

      void (async () => {
        const head = await runGit(config.root, ["rev-parse", "HEAD"], 10_000);
        const candidateSha = head.stdout.trim();
        if (!candidateSha) {
          const text = "\n[could not resolve HEAD for remote test run]\n";
          testRuns.appendOutput(text);
          emitChunk(text);
          testRuns.finish(null);
          emitDone(null);
          return;
        }
        // Route like every other remote caller (#0521): a plan step with
        // `runsOn = ["macos"]` must not send this run to a Linux host.
        const result = await remoteValidator.validate({
          taskId: "checks-test-suite",
          worktreePath: config.root,
          candidateSha,
          phase: "cli",
          capabilities: remoteJobCapabilities(config),
          onChunk: (chunk) => {
            testRuns.appendOutput(chunk);
            emitChunk(chunk);
          },
        });
        const code = result.ok ? 0 : (result.exitCode ?? 1);
        testRuns.finish(code);
        emitDone(code);
      })().catch((e) => {
        const text = `\n[remote test run failed: ${(e as Error).message}]\n`;
        testRuns.appendOutput(text);
        emitChunk(text);
        testRuns.finish(null);
        emitDone(null);
      });

      return json(res, 200, { ok: true });
    }

    const result = testRuns.start(config, emitChunk, emitDone);
    if (!result.ok) return json(res, 409, { error: result.reason });
    emitEvent({ type: "test-run.started", at: at() });
    return json(res, 200, { ok: true });
  });

  // Task routes
  router.register("GET", "/api/tasks", getTasks);
  router.register("POST", "/api/tasks", createTask);
  router.register("POST", "/api/tasks/freeform", createFreeformTask);
  // Durable freeform PM run state (#0403): in-flight record and/or persisted
  // failure, keyed by the client's runId.
  router.register("GET", /^\/api\/freeform\/runs\/([^/]+)$/, getFreeformRun);
  router.register("GET", /^\/api\/tasks\/([^/]+)$/, getTask);
  router.register("PATCH", /^\/api\/tasks\/([^/]+)$/, patchTask);
  router.register("DELETE", /^\/api\/tasks\/([^/]+)$/, deleteTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/output$/, getTaskOutput);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/logs$/, getTaskLogs);
  // Per-task `repoos check` history (handoff-finalize + MTD merge-gate) for
  // the Debug tab (0310). The currently-running entry (if any) streams its
  // output live over the existing SSE bus as task-check.* events.
  router.register("GET", /^\/api\/tasks\/([^/]+)\/checks$/, (_ctx, _req, res, params) => {
    return json(res, 200, {
      ok: true,
      runs: taskChecks.getRuns(params.param1),
    });
  });
  router.register("GET", /^\/api\/tasks\/([^/]+)\/stats$/, getTaskStats);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/diff-stats$/, getDiffStatsForTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/diff$/, getDiffForTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/merge-conflict$/, getMergeConflictForTask);
  // Uncommitted files in a task's worktree — fetched by the restart dialog so
  // "Start clean" can name what it would discard (#0512).
  router.register("GET", /^\/api\/tasks\/([^/]+)\/worktree-dirty$/, getWorktreeDirtyForTask);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/file$/, getTaskFile);
  router.register("GET", "/api/remote-validation/status", (_ctx, req, res) => {
    const rv = config.remoteValidation ?? {};
    const rawHostPool = parseFlatToml(readFileSync(join(config.root, "repoos.toml"), "utf8"))[
      "remoteValidation.tailscaleHosts"
    ];
    const hasRichHostRows =
      Array.isArray(rawHostPool) &&
      rawHostPool.some((entry) => typeof entry === "object" && entry !== null);
    const explicitHostList = Array.isArray(rawHostPool) && rawHostPool.length > 0;
    const resolvedHosts = resolveRemoteHosts(rv);
    const shorthand = rv.tailscaleHost?.trim();
    const shorthandHost = shorthand?.includes("@") ? shorthand.split("@").pop() : shorthand;
    let activeServer: { id: number; ip: string; ageMinutes: number } | null = null;
    try {
      const s = JSON.parse(
        readFileSync(join(config.root, ".repoos", "remote-runner.json"), "utf8"),
      ) as { serverId?: number; ip?: string; createdAt?: string };
      if (s?.serverId && s.ip) {
        activeServer = {
          id: s.serverId,
          ip: s.ip,
          ageMinutes: s.createdAt
            ? Math.round((Date.now() - new Date(s.createdAt).getTime()) / 60_000)
            : 0,
        };
      }
    } catch {
      /* no warm runner */
    }
    const sshKeyEnv = process.env.REPOOS_REMOTE_SSH_KEY;
    remoteValidator?.refreshHostLocks?.();
    if (new URL(req.url ?? "/", "http://localhost").searchParams.has("includeStats")) {
      remoteValidator?.refreshHostStats?.();
    }
    // Per-host pool state (#0521): live from the runner when it exists
    // (`applyConfig` keeps this list in sync with Settings saves). Otherwise
    // the configured list (probed:false) so the drawer still shows hosts when
    // the runner wasn't constructed at boot.
    const hosts = remoteValidator?.hostStatus?.() ?? [
      ...resolveRemoteHosts(rv).map((h) => ({
        host: h.host,
        user: remoteHostUser(rv, h),
        os: h.os,
        labels: h.labels ?? [],
        maxConcurrent: remoteHostLimit(rv, h),
        inFlight: 0,
        queued: 0,
        probed: false,
        healthy: false,
        detail: undefined as string | undefined,
        lastRun: undefined as { taskId: string; ok: boolean; at: string } | undefined,
        activeRuns: [] as { taskId: string; startedAt: string }[],
        queuedTasks: [] as string[],
        serverStats: { available: false },
      })),
    ];
    // Annotate each in-flight run with whether it exceeds its kind median
    // (#0720) so the panel can badge it without opening the attention feed. The
    // slow-run detail (stage, cause) also comes from the runner registry.
    annotateHostSlowRuns(hosts, config, remoteValidator, {
      taskChecks,
      awakeClock: watchdog ? () => watchdog!.awakeClock() : undefined,
    });
    return json(res, 200, {
      enabled: !!rv.enabled,
      running: !!remoteValidator,
      provider: rv.provider ?? "hetzner",
      serverType: rv.serverType ?? "cax31",
      location: rv.location ?? "hil",
      idleShutdownMinutes: rv.idleShutdownMinutes ?? 8,
      maxServerLifetimeMinutes: rv.maxServerLifetimeMinutes ?? 120,
      fallbackToLocal: !!rv.fallbackToLocal,
      snapshotConfigured: !!rv.snapshotId,
      sshKeyName: rv.sshKeyName ?? "",
      hasApiToken: !!process.env.HETZNER_API_TOKEN,
      hasSshKey: !!sshKeyEnv && existsSync(sshKeyEnv),
      tailscaleHosts: resolvedHosts.map((h) => h.host),
      tailscaleHost: rv.tailscaleHost ?? "",
      tailscaleHostPinsTop:
        !!shorthandHost && !explicitHostList && resolvedHosts[0]?.host === shorthandHost,
      hostPoolEditable: !hasRichHostRows,
      tailscaleUser: rv.tailscaleUser ?? "root",
      containerImage: rv.containerImage ?? "repoos-ci",
      maxConcurrent: rv.maxConcurrent ?? 1,
      hosts,
      activeServer,
    });
  });
  router.register("POST", "/api/remote-validation/test", async (_ctx, _req, res) => {
    const rv = config.remoteValidation ?? {};
    const provider = rv.provider ?? "hetzner";
    try {
      let output = "";
      if (provider === "tailscale") {
        const hosts = resolveRemoteHosts(rv);
        if (!hosts.length)
          return json(res, 400, {
            ok: false,
            error: "remoteValidation.tailscaleHost is not configured.",
          });
        const sshKeyEnv = process.env.REPOOS_REMOTE_SSH_KEY;
        const keyPath = sshKeyEnv && existsSync(sshKeyEnv) ? sshKeyEnv : undefined;
        const { defaultRemoteExec, prereqProbeCommand, PREREQ_OK_TOKEN } =
          await import("./remote-validation.js");
        const exec = defaultRemoteExec();
        // Same per-host prerequisite check the pool runs (#0521), so the
        // button reports every misconfigured host instead of only the first.
        const reports: string[] = [];
        let allOk = true;
        for (const h of hosts) {
          let probeOutput = "";
          const probeRes = await exec.runRemote(
            { ip: h.host, user: remoteHostUser(rv, h), keyPath },
            prereqProbeCommand(hostRunner(h), rv.containerImage ?? "repoos-ci"),
            (chunk) => {
              probeOutput += chunk;
            },
            15_000,
          );
          const ok = probeRes.code === 0 && probeOutput.includes(PREREQ_OK_TOKEN);
          if (!ok) allOk = false;
          reports.push(
            `── ${h.host}${h.os ? ` (${h.os})` : ""} ──\n` +
              (ok
                ? probeOutput.trim() || "ok"
                : `FAILED (exit ${probeRes.code}): ${probeOutput.trim() || "no output"}`),
          );
        }
        output = reports.join("\n\n");
        if (allOk) return json(res, 200, { ok: true, output });
        return json(res, 200, {
          ok: false,
          error: "One or more hosts failed the prerequisite check.",
          output,
        });
      } else {
        // Hetzner: just verify the API token and that provider config is present
        if (!process.env.HETZNER_API_TOKEN)
          return json(res, 200, { ok: false, error: "HETZNER_API_TOKEN is not set." });
        if (!rv.snapshotId)
          return json(res, 200, {
            ok: false,
            error: "remoteValidation.snapshotId is not configured.",
          });
        const { createHetznerClient } = await import("./hetzner.js");
        const client = createHetznerClient(process.env.HETZNER_API_TOKEN);
        const servers = await client.listServers("repoos-ci=1");
        output = `API token valid. ${servers.length} runner VM(s) currently running.`;
        return json(res, 200, { ok: true, output });
      }
    } catch (e) {
      return json(res, 200, { ok: false, error: (e as Error).message });
    }
  });
  router.register(
    "GET",
    /^\/api\/tasks\/([^/]+)\/remote-validation\/log$/,
    (_ctx, _req, res, params) => {
      if (!remoteValidator) return json(res, 200, { enabled: false, log: "" });
      const p = remoteValidator.logPath(params.param1);
      let log = "";
      try {
        if (existsSync(p)) log = readFileSync(p, "utf8").slice(-200_000);
      } catch {
        /* no log yet */
      }
      return json(res, 200, { enabled: true, log });
    },
  );
  // Structured per-task remote-validation events for the Debug tab (#0568):
  // which host ran, the exit code, and the infra/config error behind a run
  // that did not simply fail its tests. Empty when remote validation is off.
  router.register(
    "GET",
    /^\/api\/tasks\/([^/]+)\/remote-validation\/events$/,
    (_ctx, _req, res, params) => {
      return json(res, 200, {
        ok: true,
        events: remoteValidator?.remoteEvents?.(params.param1) ?? [],
      });
    },
  );
  router.register("GET", /^\/api\/tasks\/([^/]+)\/integration-job$/, getIntegrationJob);
  router.register("GET", "/api/integration-jobs", getIntegrationJobs);
  // Durable close-out outcomes (#0640) — the notices bell's hydrate/backstop.
  router.register("GET", "/api/close-out/outcomes", getCloseOutOutcomes);
  router.register("GET", "/api/attention", getAttention);
  router.register("GET", "/api/decisions", getDecisions);
  router.register("GET", "/api/check-plan", getCheckPlan);
  // Durable check-run history across all tasks (#0564) — the Runs tab.
  router.register("GET", "/api/check-runs", getCheckRuns);
  router.register("GET", "/api/integration/pipeline", getIntegrationPipeline);
  router.register("POST", /^\/api\/integration\/pipeline\/retry\/([^/]+)$/, retryIntegration);
  router.register(
    "POST",
    /^\/api\/integration\/pipeline\/refresh-install\/([^/]+)$/,
    refreshInstallAndRetryIntegration,
  );
  router.register("POST", /^\/api\/tasks\/([^/]+)\/done\/cancel$/, cancelDone);
  router.register(
    "POST",
    /^\/api\/tasks\/([^/]+)\/worktree-handoff\/discard$/,
    discardWorktreeHandoff,
  );
  router.register(
    "POST",
    /^\/api\/tasks\/([^/]+)\/(start|pause|message|done|sync|hotfix|abandon|reopen|archive|unarchive)$/,
    taskAction,
  );
  router.register("POST", /^\/api\/tasks\/([^/]+)\/preview$/, startPreview);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/preview\/stop$/, stopPreview);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/review$/, getTaskReview);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/needs-input\/dismiss$/, dismissNeedsInput);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/clear-worktree$/, clearKeptWorktree);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/review\/again$/, reviewAgain);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/review\/message$/, reviewMessage);
  router.register("GET", "/api/cto", getCTO);
  router.register("POST", "/api/cto/message", ctoMessage);
  router.register("POST", "/api/cto/interrupt", ctoInterrupt);
  router.register("POST", "/api/cto/heartbeat", postCtoHeartbeat);
  router.register("POST", /^\/api\/cto\/actions\/([^/]+)$/, runCtoSafeActionRoute);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/pm\/message$/, pmMessage);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/pm\/interrupt$/, pmInterrupt);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/attachments\/([^/]+)$/, getScreenshot);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/attachments$/, uploadScreenshot);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/shots$/, listTaskShots);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/ui-verification$/, getTaskUiVerification);
  router.register("POST", /^\/api\/tasks\/([^/]+)\/shots$/, uploadTaskShot);
  router.register("GET", /^\/api\/tasks\/([^/]+)\/shots\/([^/]+)$/, getTaskShot);
  // Task drawer shot management (#0627): declare-and-capture via POST (the
  // handler dispatches on the body shape — CLI uploads carry `data`), and
  // per-shot delete incl. its `## Shots` declaration.
  router.register("DELETE", /^\/api\/tasks\/([^/]+)\/shots\/([^/]+)$/, deleteTaskShot);

  // Config routes
  router.register("GET", "/api/config", readConfig);
  router.register("PATCH", "/api/config", patchConfig);
  router.register("GET", "/api/config/raw", readRawConfig);
  router.register("PUT", "/api/config/raw", writeRawConfig);
  router.register("POST", "/api/dev/copy-inspector/open", postCopyInspectorOpen);
  router.register("POST", "/api/dev/open-in-editor", postOpenInEditor);
  router.register("POST", "/api/dev/open-test-in-editor", postOpenTestInEditor);

  // Model routes
  router.register("GET", "/api/models", listModels);
  router.register("POST", "/api/models/test", testModel);
  router.register("GET", "/api/playground/models", getPlaygroundModels);
  router.register("POST", "/api/playground/chat", sendPlaygroundMessage);

  // Model providers tab routes (0327)
  router.register("GET", "/api/model-providers", getModelProviders);
  router.register("GET", /^\/api\/model-providers\/([^/]+)\/usage$/, getModelProviderUsage);
  router.register("POST", /^\/api\/model-providers\/([^/]+)\/key$/, setModelProviderKey);

  // Agent routes
  router.register("GET", "/api/agents/running", runningAgents);
  router.register("GET", "/api/agents/queued", queuedAgents);
  router.register("GET", "/api/agents/detect", detectInstalledAgents);
  router.register("GET", "/api/agents/detect/stream", streamDetectAgents);
  router.register("POST", "/api/agents/updates", checkInstalledAgentUpdates);
  router.register("GET", /^\/api\/agents\/([^/]+)\/logs$/, getAgentLogs);
  router.register(
    "POST",
    /^\/api\/agents\/built-in\/([^/]+)\/run$/,
    async (ctx, _req, res, params) => {
      const agentName = params.param1;
      const cfg = ctx.repoos.config;
      // The Debugger is chat-only (its floating head / bug-paste panel). It has
      // no scan to run now, and exposing a dead endpoint invites a 500 when the
      // dispatch returns null — reject it explicitly before touching the
      // in-flight guard (0201).
      if (agentName === "debugger") {
        return json(res, 400, {
          error: `"${agentName}" is chat-only — talk to it from its floating head instead of running it`,
        });
      }
      // Manual and scheduled runs share one in-flight guard, so two scans can
      // never overlap and block the server twice over.
      if (builtInRun.inFlight) {
        return json(res, 409, {
          error: `A built-in agent run is already in progress — wait for it to finish`,
        });
      }
      builtInRun.inFlight = true;
      try {
        const result = await runBuiltInAgent(agentName, cfg, logger);
        if (!result) {
          return json(res, 404, {
            error: `Unknown built-in agent: ${agentName}`,
          });
        }
        ctx.index.refreshAll();
        emitBuiltInRunEvent(agentName, result);
        return json(res, 200, {
          ok: true,
          taskCount: result.created,
          skipped: "skipped" in result ? result.skipped : 0,
          failed: result.failed,
          errors: result.errors,
          issuesFound: "issuesFound" in result ? result.issuesFound : 0,
          findingsFound: "findingsFound" in result ? result.findingsFound : 0,
          trivialFixesApplied: "trivialFixesApplied" in result ? result.trivialFixesApplied : 0,
          scannedFiles: "scannedFiles" in result ? result.scannedFiles : 0,
          taskId: "taskId" in result ? result.taskId : null,
          autoFixed: "autoFixed" in result ? result.autoFixed : [],
          runDoc: "runDoc" in result ? (result.runDoc ?? null) : null,
          error: "error" in result ? result.error : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to run built-in agent";
        logger.agent(agentName, "error", `Manual run of built-in agent failed`, { error: message });
        return json(res, 500, { error: message });
      } finally {
        builtInRun.inFlight = false;
      }
    },
  );

  // Notification routes
  router.register("POST", "/api/ntfy/test", testNotification);

  // Telegram routes (#0531) — admin-gated connection management (BYO token,
  // status, profile, transport, managed provisioning). The inbound webhook
  // route is #0532's: it must authenticate Telegram's secret-token header and
  // then call the adapter's own update intake.
  router.register("GET", "/api/telegram/status", telegramStatus);
  router.register("POST", "/api/telegram/connect", telegramConnect);
  router.register("POST", "/api/telegram/disconnect", telegramDisconnect);
  router.register("POST", "/api/telegram/profile", telegramProfile);
  router.register("POST", "/api/telegram/transport", telegramTransport);
  router.register("POST", "/api/telegram/test-message", telegramTestMessage);
  router.register("POST", "/api/telegram/provision", telegramProvisionBegin);
  router.register("GET", /^\/api\/telegram\/provision\/([^/]+)$/, telegramProvisionStatus);
  router.register("POST", /^\/api\/telegram\/provision\/([^/]+)\/redeem$/, telegramProvisionRedeem);
  router.register("POST", /^\/api\/telegram\/webhook\/([^/]+)$/, telegramWebhook);

  // Transcription routes
  router.register("POST", "/api/transcribe", transcribe);

  // Auth routes
  router.register("GET", "/api/auth/status", authStatus);
  router.register("POST", "/api/auth/bootstrap-admin", bootstrapAdmin);
  router.register("POST", "/api/auth/request-otp", requestOtp);
  router.register("POST", "/api/auth/verify-otp", verifyOtp);
  router.register("GET", "/api/auth/login/google", googleLogin);
  router.register("GET", "/api/auth/callback/google", googleCallback);
  router.register("GET", "/api/auth/me", authMe);
  router.register("POST", "/api/auth/logout", authLogout);
  router.register("GET", "/api/auth/users", listUsers);
  router.register("POST", "/api/auth/users", addUser);
  router.register("POST", /^\/api\/auth\/users\/([^/]+)\/invite$/, sendInvite);
  router.register("DELETE", /^\/api\/auth\/users\/([^/]+)$/, deleteUser);
  router.register("PATCH", /^\/api\/auth\/users\/([^/]+)$/, updateUserRole);
  router.register("GET", "/api/auth/audit", getAuditLog);
  router.register("POST", "/api/auth/telegram/invites", createTelegramInviteRoute);
  router.register("POST", "/api/auth/telegram/chats/bind-codes", createTelegramChatBindCodeRoute);
  router.register("GET", "/api/auth/telegram/chats", listTelegramChatsRoute);
  router.register("POST", "/api/auth/telegram/chats", bindTelegramChatRoute);
  router.register(
    "PATCH",
    /^\/api\/auth\/telegram\/chats\/([^/]+)$/,
    patchTelegramChatNotificationsRoute,
  );
  router.register("DELETE", /^\/api\/auth\/telegram\/chats\/([^/]+)$/, unbindTelegramChatRoute);
  router.register("GET", "/api/auth/telegram/links", listTelegramLinksRoute);
  router.register("POST", "/api/auth/telegram/disconnect", telegramDisconnectFromAuthRoute);
  router.register("DELETE", /^\/api\/auth\/telegram\/links\/([^/]+)$/, unbindTelegramLinkRoute);
  router.register(
    "POST",
    /^\/api\/auth\/telegram\/links\/([^/]+)\/reassign$/,
    reassignTelegramLinkRoute,
  );
  router.register("POST", "/api/auth/hub-capabilities", createHubCapability);
  router.register("GET", "/api/auth/hub-capabilities", listHubCapabilities);
  router.register("DELETE", /^\/api\/auth\/hub-capabilities\/([^/]+)$/, revokeHubCapability);
  router.register("POST", /^\/api\/auth\/hub-capabilities\/([^/]+)\/rotate$/, rotateHubCapability);
  router.register("GET", "/api/hub/v1/summary", hubSummary);
  router.register("GET", "/api/hub/v1/tasks/search", hubTaskSearch);

  // Background service management routes (0185)
  router.register("GET", "/api/service/status", getServiceStatusRoute);
  router.register("GET", "/api/service/list", listServicesRoute);
  router.register("POST", "/api/service/install", installServiceRoute);
  router.register("POST", "/api/service/start", startServiceRoute);
  router.register("POST", "/api/service/stop", stopServiceRoute);
  router.register("POST", "/api/service/restart", restartServiceRoute);
  router.register("POST", "/api/service/enable", enableAutoStartRoute);
  router.register("POST", "/api/service/disable", disableAutoStartRoute);
  router.register("POST", "/api/service/remove", removeServiceRoute);
  router.register("POST", "/api/service/health", healthCheckRoute);

  recordApiRouteCatalog(router);

  // UI routes
  router.register("GET", "/manifest.webmanifest", serveManifest);
  router.register("GET", /^\/icons\/icon-(\d+)\.png$/, serveIcon);

  const localToken =
    config.auth?.enabled === true ? writeLocalCliToken(config.root, config.cacheDir) : null;

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      // ---- Auth middleware ----
      // When auth is enabled, every request except public routes must carry a
      // valid session cookie. Public routes: /api/health, /api/auth/*,
      // /login, static UI assets, manifest, icons, and OPTIONS. Unauthenticated
      // API requests get 401; browser navigations to non-public non-SPA routes
      // redirect to /login. Auth-disabled deployments pass everything through.
      const authEnabled = config.auth?.enabled === true;
      if (authEnabled) {
        const PUBLIC_PREFIXES = [
          "/api/health",
          "/api/auth/",
          "/api/hub/v1/summary",
          "/api/hub/v1/tasks/search",
          // Telegram webhook (#0532): must stay public so Telegram can POST
          // without a session cookie. Session middleware runs before dispatch,
          // so this prefix only bypasses the cookie gate — the webhook handler
          // still validates X-Telegram-Bot-Api-Secret-Token before reading the
          // body. Do not move secret checks into middleware without re-reading
          // that ordering; a future edit that runs auth after dispatch would
          // break delivery, and one that drops the route handler's secret check
          // would expose the repo to the open internet.
          "/api/telegram/webhook/",
        ];
        const PUBLIC_PATHS = ["/login", "/manifest.webmanifest"];
        const isPublicRoute =
          PUBLIC_PREFIXES.some((p) => path.startsWith(p)) ||
          PUBLIC_PATHS.includes(path) ||
          path.startsWith("/icons/") ||
          path.startsWith("/assets/") ||
          method === "OPTIONS";
        if (!isPublicRoute) {
          const cookies = parseCookies(req.headers.cookie);
          const sessionToken = cookies[SESSION_COOKIE_NAME];
          let validSession = false;
          if (sessionToken) {
            const authStore = getAuthStore(config.root);
            const session = authStore?.getSession(sessionToken);
            validSession = !!session;
          }
          if (!validSession) {
            // A browser-less local CLI (`repoos shot`, #0582) carries the
            // loopback token the server wrote instead of a session cookie. A
            // tunnel forwards traffic FROM loopback, so the address check alone
            // would pass for it; also reject any request carrying a forwarding
            // header. The token's 256-bit secrecy is the actual protection —
            // these checks are defense in depth.
            const provided = req.headers["x-repoos-local-token"];
            const forwarded = Boolean(
              req.headers["x-forwarded-for"] ||
              req.headers["x-real-ip"] ||
              req.headers["cf-connecting-ip"],
            );
            const localCli =
              isLoopbackAddress(req.socket.remoteAddress) &&
              !forwarded &&
              localTokenMatches(typeof provided === "string" ? provided : undefined, localToken);
            if (!localCli) {
              // API requests get 401 JSON; browser GETs to SPA routes are served
              // the login page (via SPA fallback) so the client-side router can
              // render the login UI. Other browser navigations redirect to /login.
              const isApiRequest = path.startsWith("/api/");
              const isNavigation = method === "GET" && req.headers.accept?.includes("text/html");
              if (isApiRequest) {
                return json(res, 401, { error: "Authentication required" });
              }
              if (isNavigation && uiDir) {
                // Serve the SPA shell so the client router renders /login
                const indexPath = join(uiDir, "index.html");
                if (existsSync(indexPath)) {
                  res.writeHead(200, {
                    "Content-Type": "text/html; charset=utf-8",
                    "Access-Control-Allow-Origin": "*",
                  });
                  res.end(readUiIndex(indexPath));
                  return;
                }
              }
              if (isNavigation) {
                // Carry the full original URL (query string included) so
                // deep-link params like /work?task=0340 survive the login
                // round-trip; LoginView redirects back to it verbatim.
                res.writeHead(302, {
                  Location: `/login?redirect=${encodeURIComponent(path + url.search)}`,
                });
                return res.end();
              }
              return json(res, 401, { error: "Authentication required" });
            }
          }
        }
      }

      // ---- SSE stream ----
      if (path === "/api/events" && method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        res.write(`retry: 2000\n\n`);
        // A reload handoff spawns the replacement already accepting connections
        // while the full index build runs in the background (0285). Emit `hello`
        // (which the client treats as "the server is ready to be asked about the
        // index") only once that rebuild has actually completed, so its taskCount
        // is truthful rather than a mid-build 0.
        await indexReady;
        const hello: RepoEvent = {
          type: "hello",
          taskCount: index.snapshot().taskCount,
          at: new Date().toISOString(),
        };
        res.write(`event: hello\ndata: ${JSON.stringify(hello)}\n\n`);
        clients.add(res);
        // keep-alive comment ping every 25s so proxies don't drop the connection
        const ping = setInterval(() => {
          try {
            res.write(`: ping\n\n`);
          } catch {
            /* ignore */
          }
        }, 25000);
        req.on("close", () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }

      // ---- Supervisor routes ----
      if (path === "/api/supervisor/status" && method === "GET") {
        const heartbeat = supervisor?.getLatestHeartbeat() ?? null;
        return json(res, 200, {
          ok: true,
          enabled: supervisor?.config.enabled ?? false,
          mode: supervisor?.config.mode ?? "observe",
          latestHeartbeat: heartbeat,
        });
      }
      if (path === "/api/supervisor/heartbeats" && method === "GET") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 100);
        const heartbeats = supervisor?.getRecentHeartbeats(limit) ?? [];
        return json(res, 200, { ok: true, heartbeats });
      }
      if (path === "/api/supervisor/check-now" && method === "POST") {
        if (!supervisor) {
          return json(res, 503, { error: "Supervisor not available" });
        }
        void supervisor.runCycle();
        return json(res, 202, {
          ok: true,
          message: "Supervisor check started",
        });
      }

      // Create the route context with all necessary dependencies
      const routeContext: RouteContext = {
        config,
        index,
        indexReady,
        runner,
        previews,
        reviews,
        cto,
        ctoHeartbeat,
        freeformRuns,
        repoos,
        logger,
        emitEvent: (e: RepoEvent) => {
          for (const client of clients) {
            try {
              client.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
            } catch {
              /* client disconnected */
            }
          }
        },
        closeOutLock,
        rootLock,
        jobCoordinator,
        closeOutOutcomes,
        attentionEvents,
        ctoActionRates,
        remoteValidator,
        taskChecks,
        awakeClock: watchdog ? () => watchdog!.awakeClock() : undefined,
        reportedStages,
        triggerJobProcessing,
        pendingReview,
        uiDir,
        syncTaskBranch,
        onServerStatusChange,
        startUnifiedHandoff,
        reload,
      } as RouteContext;

      // Try to dispatch through the router for all API routes
      const handled = await router.dispatch(routeContext, method, path, req, res);
      if (handled) return;

      // ---- Not an API route; try doc serving ----
      if (method === "GET" && !path.startsWith("/api/")) {
        const docAbs = safeRepoFile(config.root, path);
        if (docAbs) {
          res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(readFileSync(docAbs, "utf8"));
          return;
        }
      }

      // ---- Static UI serving + SPA fallback ----
      if (method === "GET" && uiDir) {
        if (serveStaticUi(res, uiDir, path)) return;
      }

      // Never answer a missing hashed asset with the SPA document. The old
      // shell must receive a real 404 so its dynamic import can reach the
      // router recovery handler instead of failing with a module MIME error.
      if (method === "GET" && path.startsWith("/assets/")) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Asset not found");
        return;
      }

      // SPA fallback: unknown GET paths render the app
      if (method === "GET" && uiDir) {
        const indexPath = join(uiDir, "index.html");
        if (existsSync(indexPath)) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(readUiIndex(indexPath));
          return;
        }
        return json(res, 500, {
          error: "UI asset not found — run `bun run build`",
        });
      }

      return json(res, 404, { error: "Not found", path });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof WriteError ? 400 : 500;
      if (code === 500) {
        logger.system("error", "Request handler error", {
          method,
          path,
          error: msg,
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
      return json(res, code, { error: msg });
    }
  });

  const port = requestedPort;
  const host = bindHost;

  /** One bind attempt: resolves once listening, rejects on the listen error. */
  const bindOnce = (withReusePort: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const onErr = (e: Error) => reject(e);
      server.once("error", onErr);
      server.listen({ port, host, reusePort: withReusePort }, () => {
        server.removeListener("error", onErr);
        opts.onListening?.(index);
        resolve();
      });
    });

  /** Release the HTTP listener (drain window / shutdown). Idempotent. */
  const closeHttp = (): Promise<void> =>
    new Promise((resolve) => {
      if (!server.listening) {
        resolve();
        return;
      }
      // End in-flight/keep-alive connections (SSE included) so the port frees
      // promptly instead of waiting on them.
      try {
        server.closeAllConnections?.();
      } catch {
        /* ignore */
      }
      server.close(() => resolve());
    });

  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        if (opts.reloadReplacement) {
          // Replacement (REPOOS_RELOAD=1): first try SO_REUSEPORT so the new
          // process can share the port with the old one (zero-downtime on
          // platforms that support it). Where that is unsupported (ENOTSUP on
          // macOS) or the old process bound without it (EADDRINUSE), fall back
          // to a plain bind retried until the old process releases the port.
          const deadline = Date.now() + RELOAD_BIND_TIMEOUT_MS;
          let bound = false;
          try {
            await bindOnce(true);
            bound = true;
          } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (code !== "ENOTSUP" && code !== "EOPNOTSUPP" && code !== "EADDRINUSE") throw e;
          }
          while (!bound && Date.now() < deadline) {
            try {
              await bindOnce(false);
              bound = true;
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
              await sleep(RELOAD_BIND_RETRY_MS);
            }
          }
          if (!bound)
            throw new Error(`EADDRINUSE: port ${port} never freed for the reload replacement`);
        } else {
          // Check for port conflicts before binding (0168). detectConflict is
          // async: it probes the port for a live listener so a missing/stale
          // lockfile can't mask a process that already owns this port (#0284).
          const conflict = await reaper.detectConflict(port, host);
          if (conflict) throw new Error(conflict);
          try {
            await bindOnce(false);
          } catch (error) {
            const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
            throw explainBindFailure(
              error as Error,
              port,
              host,
              await isPortListening(port, probeHost),
            );
          }
        }
      } catch (err) {
        logger.system("error", "RepoOS server bind failed", {
          pid: process.pid,
          port,
          host,
          mode,
          error: err instanceof Error ? err.message : String(err),
        });
        // A bind-only failure must terminate the process cleanly: the file
        // watcher and SSE subscriber are live handles that would otherwise keep
        // a listenerless `repoos serve` process alive (the #0096 incident).
        try {
          watcher.stop();
        } catch {
          /* ignore */
        }
        configWatcher?.stop();
        repoStatusNotifier.stop();
        offGitMutation();
        try {
          unsubscribe();
        } catch {
          /* ignore */
        }
        clearInterval(systemSampleTimer);
        if (reapTimer) clearInterval(reapTimer);
        clearInterval(builtInTimer);
        clearInterval(worktreeSweepTimer);
        clearTimeout(initialWorktreeSweep);
        ctoMonitor.stop();
        runner.dispose();
        throw err;
      }

      const actualPort = (server.address() as { port: number }).port;
      // "0.0.0.0" is a valid bind address but not a connectable one — anything
      // that needs to actually call back into this server (spawned agents via
      // runner.apiUrl, the URL handed to callers below) must use localhost
      // instead, regardless of which interfaces are actually bound.
      const connectHost = host === "0.0.0.0" ? "127.0.0.1" : host;
      const url = `http://${connectHost}:${actualPort}`;
      logger.system("info", "RepoOS server listening", {
        pid: process.pid,
        port: actualPort,
        host,
        mode,
        buildHash: loadedHash,
      });
      // The agent runner injects the real control-plane URL into every spawned
      // agent so preview requests target THIS server, never a hardcoded port.
      runner.apiUrl = url;
      notificationCtx.publicOrigin = url;

      // Register this serve process in the lockfile so port conflicts can be
      // detected on the next startup (0168).
      reaper.register(actualPort, host);
      const handle: ServerHandle = {
        url,
        port: actualPort,
        index,
        ...(config.previewOverrides?.length ? { previewOverrides: config.previewOverrides } : {}),
        close: async (reason: string = "handle.close") => {
          if (isControlPlane) {
            logger.system("info", "RepoOS control plane shutting down", {
              pid: process.pid,
              port: actualPort,
              reason,
            });
          }
          clearInterval(systemSampleTimer);
          if (reapTimer) clearInterval(reapTimer);
          clearInterval(worktreeSweepTimer);
          clearTimeout(initialWorktreeSweep);
          clearInterval(builtInTimer);
          ctoMonitor.stop();
          runner.dispose();
          // Stop the Telegram polling transport (if armed) with the rest of
          // the background services. Non-destructive by design: stored
          // connection state survives; only the in-process loop ends.
          resetTelegramProviders();
          // Delete any warm runner VM. On a reload the replacement process's
          // reconcile() would clean it anyway; doing it here keeps the window
          // with a paid-for idle VM as short as possible.
          void remoteValidator?.dispose();
          unsubscribe();
          unsubscribeCleanup();
          unsubscribeNotifications();
          unsubscribeCTOEvents();
          repoStatusNotifier.stop();
          offGitMutation();
          watcher.stop();
          configWatcher?.stop();
          supervisor?.stop();
          watchdog?.stop();
          reload?.stop();
          // No preview survives the main server: on SIGTERM/SIGINT (or an
          // in-process close / reload handover) tear them all down so no
          // orphan `repoos serve` process is left behind.
          //
          // Review agents differ (0288): on a RELOAD handover they must NOT be
          // cancelled — they are durable (registered in the runner's durable
          // registry + log files) and the replacement process re-attaches and
          // finalizes their reports. Cancelling here would kill every in-flight
          // review on every reload, re-introducing the mid-review death this
          // task fixes. Only a REAL shutdown (not a reload) reaps them: a
          // one-shot child must not outlive the server that launched it and
          // wait 15 minutes to write a report nobody reads. The CTO monitor is
          // still always cancelled (it is NOT durable), so it is reaped even on
          // a reload rather than left as an un-adoptable orphan.
          cto.cancelAll();
          if (!(reload?.isReloading ?? false)) {
            reviews.cancelAll();
            // Freeform PM runs are durable (#0403): on a RELOAD handover they
            // must survive so the replacement re-adopts them. Only a real
            // shutdown kills them, so a one-shot PM child does not outlive the
            // server that launched it.
            freeformRuns.cancelAll();
          }
          await previews.stopAll();
          runner.flushAll();
          for (const c of clients) {
            try {
              c.end();
            } catch {
              /* ignore */
            }
          }
          clients.clear();
          reaper.unregister();
          await closeHttp();
          if (isControlPlane) {
            logger.system("info", "RepoOS control plane stopped", {
              pid: process.pid,
              port: actualPort,
              reason,
            });
          }
        },
      };

      // A fixture or preview can have its checkout deleted while this child is
      // still alive (for example when a test aborts before its finally block).
      // Do not let that leave a server with an unreapable lockfile inside the
      // deleted root: close its listener and all owned resources on its own.
      // Only ephemeral test servers and preview children watch their root.
      // A live control plane can serve a real checkout on a briefly unavailable
      // network volume; it must not terminate itself in that situation.
      if (opts.port === 0 || process.env.REPOOS_PREVIEW_CHILD === "1") {
        reaper.watchRoot(() => {
          void handle.close();
        });
      }

      // Auto-reload (0066): watch dist/.build-info.json and hand over to a
      // replacement process on a hash change. Deferred while an agent runs.
      reload = new ReloadManager({
        root: config.root,
        host,
        port: actualPort,
        loadedHash,
        enabled: reloadEnabled,
        isReplacement: process.env.REPOOS_RELOAD === "1",
        // An in-flight agent review is a spawned turn like any other: reloading
        // under it would kill the report the human is waiting on.
        isBusy: () => runner.running().length + reviews.runningCount(),
        // A close-out holds this lock for its whole pipeline (0143): no
        // auto-reload may fire under it, and any build it produces is parked
        // for the user to apply on their own schedule. A job still queued
        // counts too: the lock is released between two jobs, and a reload
        // decided in that gap gets a replacement that "resumes" the next job
        // the old process is already running (#0518).
        closingOut: () => closeOutPending(closeOutLock, jobCoordinator),
        // A close-out build landed on disk: surface a persistent "New version
        // available" notice so the user can reload when they choose.
        onBuildAvailable: (hash) => {
          emitEvent({
            type: "build.available",
            hash,
            buildAt: loadBuildInfo().buildAt,
            at: new Date().toISOString(),
          });
        },
        cliEntry: cliEntryPath,
        stopListening: closeHttp,
        listen: () => bindOnce(false),
        onReloadConfirmed: async () => {
          await handle.close("reload replacement confirmed");
          process.exit(0);
        },
        onReloadFailed: (reason) => {
          console.log(`  ${reason} — old process keeps serving`);
          logger.system("warn", "RepoOS reload failed; old control plane retained", {
            pid: process.pid,
            port: actualPort,
            reason,
          });
          // A manual restart failed: the old server keeps serving (no outage).
          // Release the UI's "Restarting…" state so the notice stays actionable.
          emitEvent({
            type: "reload.failed",
            reason,
            at: new Date().toISOString(),
          });
        },
        log: (msg) => {
          console.log(msg);
          logger.system("info", "RepoOS reload lifecycle", {
            pid: process.pid,
            port: actualPort,
            message: msg,
          });
        },
      });
      reload.start();
      // Stale-boot self-heal: a newer build that landed while we were starting
      // is picked up immediately (skipped by REPOOS_RELOAD=1 replacements).
      void reload.bootSelfHeal();

      // Agent supervisor: periodic health checks and safe recovery (0112)
      supervisor = new AgentSupervisor(config, index, emitEvent);
      supervisor.start();

      // Task watchdog: surface active tasks whose agent session is dead or
      // stalled (0180). Guarded so it never fires while the server is handing
      // over to a reload replacement.
      const watchdogConfig = config.watchdog ?? {};
      watchdog = new TaskWatchdog(
        config,
        index,
        runner,
        watchdogConfig.stalenessMs ?? 5 * 60 * 1000,
        {
          autoTransition: watchdogConfig.autoTransition !== false,
          canRun: () => !(reload?.isReloading ?? false),
          reviews,
          onDiagnosableFailure: (taskId, reason) => debugTldr?.onFailureEscalated(taskId, reason),
        },
      );
      if (watchdogConfig.enabled !== false) watchdog.start();

      // Telegram transport resume (#0531): a stored `transport.mode =
      // "polling"` must survive a restart — re-arm the long-poll loop at
      // boot. Safe and never-throwing (reports one log line); the loop
      // gates on the live `telegram.enabled` switch itself, so a disabled
      // integration arms paused with no Telegram traffic.
      //
      // #0541 registers the agent-chat surface on the same intake: a linked
      // sender's plain message becomes a Ross guide turn on the shared
      // AgentRunner (state per Telegram user), replies delivered back to the
      // originating chat. #0542's task-agent follow-ups (/msg) and #0540's
      // read-only commands run on this same single sink —
      // `chainedOnAuthorized` composes them.
      void bootstrapTelegramAtBoot(config, {
        index,
        runner,
        reviews,
        publicOrigin: url,
        agentChat: { logger },
        onAuthorized: createTelegramGuideTurn(config, runner, {
          getTasks: () => index.getTasks(),
          resolveBotUsername: () => getTelegramProvider(config).status().bot?.username ?? null,
          audit: (action, actor, details) => {
            const store = getAuthStore(config.root);
            store?.logAudit(action, actor.email, actor.email, JSON.stringify(details));
          },
        }),
      }).then((resumed) => {
        if (resumed.detail) {
          logger.system(resumed.resumed ? "info" : "warn", "Telegram transport resume", {
            pid: process.pid,
            detail: resumed.detail,
            mode: resumed.resumed ? "polling" : "off",
          });
        }
      });

      // The port is already bound and accepting connections above; this only

      // delays the resolved handle (and the CLI's own "watching N tasks"
      // banner, which reads handle.index.snapshot()) until the background
      // index build finishes, so it reports an accurate count instead of 0.
      await indexReady;
      resolve(handle);
    })().catch((e) => reject(e as Error));
  });
}
