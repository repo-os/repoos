import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, Task, Status } from "../../core/types.js";
import type { RepoOS } from "../../core/repoos.js";
import type { LiveIndex, RepoEvent } from "../live-index.js";
import type { AgentRunner } from "../agents.js";
import type { PreviewManager } from "../preview.js";
import type { ReviewManager } from "../review.js";
import type { CTOManager } from "../cto.js";
import type { CloseOutLock } from "../done.js";
import type { RootLock } from "../repo-lock.js";
import type { ReloadManager } from "../reload.js";
import type { JobCoordinator } from "../integration-job.js";
import type { CloseOutOutcomeStore } from "../close-out-outcome.js";
import type { AttentionEventStore } from "../attention-events.js";
import type { CtoActionRateStore } from "../cto-action-rates.js";
import type { DoneStep } from "../done.js";
import type { Logger } from "../../core/logger.js";
import type { RemoteValidator } from "../remote-validation.js";
import type { FreeformRunManager } from "../freeform-runs.js";
import type { HandoffOrigin } from "../handoff.js";
import type { TaskCheckManager } from "../task-check.js";
import type { CtoHeartbeatTracker } from "../cto-heartbeat.js";

export interface SyncResult {
  ok: boolean;
  conflicts: string[];
  reason?: string;
}

export interface RouteContext {
  config: RepoOSConfig;
  index: LiveIndex;
  /**
   * Resolves once the full background index build finishes on server boot
   * (the `refreshAllAsync` kicked off in `startServer`). Index-reading routes
   * (board, tasks, index) await this so a request racing the boot-time
   * asynchronous reindex — the exact shape that left the board showing a
   * stale/partial snapshot after a reload handoff (0285) — can never answer
   * against a half-built index.
   */
  indexReady: Promise<void>;
  runner: AgentRunner;
  previews: PreviewManager;
  reviews: ReviewManager;
  cto: CTOManager;
  /** CTO liveness for the attention feed (#0728). */
  ctoHeartbeat?: CtoHeartbeatTracker;
  /**
   * Durable, reload-resumable registry for freeform PM task-creation runs
   * (#0403). The freeform route starts a run here instead of fire-and-forget
   * `runPrompt`, so a server reload mid-run does not silently lose it.
   */
  freeformRuns: FreeformRunManager;
  repoos: RepoOS;
  logger: Logger;
  emitEvent: (e: RepoEvent) => void;
  closeOutLock: CloseOutLock;
  rootLock: RootLock;
  jobCoordinator: JobCoordinator;
  /**
   * Durable close-out outcomes (#0640). Shared so the `GET /api/close-out/
   * outcomes` route reads the same in-memory mirror the orchestrator records
   * into — a disk-write failure is reported and the event still backfills.
   * Optional so route tests can build a partial context.
   */
  closeOutOutcomes?: CloseOutOutcomeStore;
  /** Durable provider-failure and remote-fallback events (#0687). */
  attentionEvents?: AttentionEventStore;
  /**
   * In-memory live check runs (#0720) — the attention feed reads the ones still
   * in flight to compare their elapsed time against the history median.
   * Optional so route tests can build a partial context.
   */
  taskChecks?: TaskCheckManager;
  /**
   * Awake-clock sample (last watchdog tick + cadence) so the slow-run detector
   * can exclude laptop-sleep gaps (#0720/#0678). Optional.
   */
  awakeClock?: () => { lastTickMs: number; intervalMs: number };
  /** CTO safe-action rate windows (#0688). */
  ctoActionRates?: CtoActionRateStore;
  /** Remote Validation Runner (docs/remote-validation.md). Undefined when not configured. */
  remoteValidator?: RemoteValidator;
  /**
   * Live progress step last reported by the close-out orchestrator for each
   * in-flight task (the same map `emitIntegration`'s SSE push uses) — keyed
   * by task id. A route that builds a pipeline snapshot for an
   * ALREADY-in-flight job (the GET hydration endpoint) must read this rather
   * than pass `{}`, or the stage shown falls back to a coarse per-phase
   * guess (e.g. "validating" always reads as "merge", even mid-test-run)
   * until the next SSE event happens to correct it — misleading on a page
   * refresh mid-pipeline (0207 follow-up).
   */
  reportedStages: Record<string, DoneStep>;
  /** ISO timestamp per task id when {@link reportedStages} last changed (#0740). */
  reportedStageAt: Record<string, string>;
  triggerJobProcessing: () => void;
  pendingReview: Set<string>;
  uiDir: string | null;
  reload: ReloadManager | null;
  // Functions
  syncTaskBranch: (task: Task) => Promise<SyncResult>;
  onServerStatusChange: (task: Task, prev: Status, next: Status) => void;
  /**
   * #0507: run the one handoff finalization for a task, from any route that is
   * not the agent's own handoff signal. Fire-and-forget — the task stays
   * `active` with a visible "running checks…" state until the scoped
   * `repoos check` and the commit gate have both passed, and `finalizeReviewHandoff`
   * itself is the only thing that writes `status: review`. Injected rather than
   * imported so every route shares the server's single instance (and its
   * in-flight bookkeeping) instead of each spawning its own finalization.
   */
  startUnifiedHandoff: (
    task: Task,
    opts?: { origin?: HandoffOrigin; skipChecks?: boolean; actor?: string },
  ) => { started: boolean; reason?: string };
}

export type RouteHandler = (
  ctx: RouteContext,
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void> | void;

export interface Route {
  method: string;
  path: string | RegExp;
  handler: RouteHandler;
}
