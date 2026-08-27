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
import type { Logger } from "../../core/logger.js";
import type { DoneStep } from "../done.js";

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
  repoos: RepoOS;
  logger: Logger;
  emitEvent: (e: RepoEvent) => void;
  closeOutLock: CloseOutLock;
  rootLock: RootLock;
  jobCoordinator: JobCoordinator;
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
  triggerJobProcessing: () => void;
  pendingReview: Set<string>;
  uiDir: string | null;
  reload: ReloadManager | null;
  // Functions
  syncTaskBranch: (task: Task) => Promise<SyncResult>;
  onServerStatusChange: (task: Task, prev: Status, next: Status) => void;
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
