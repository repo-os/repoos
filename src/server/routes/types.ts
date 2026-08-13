import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig, Task, Status } from "../../core/types.js";
import type { RepoOS } from "../../core/repoos.js";
import type { LiveIndex, RepoEvent } from "../live-index.js";
import type { AgentRunner } from "../agents.js";
import type { PreviewManager } from "../preview.js";
import type { ReviewManager } from "../review.js";
import type { CloseOutLock } from "../done.js";

export interface SyncResult {
  ok: boolean;
  conflicts: string[];
  reason?: string;
}

export interface RouteContext {
  config: RepoOSConfig;
  index: LiveIndex;
  runner: AgentRunner;
  previews: PreviewManager;
  reviews: ReviewManager;
  repoos: RepoOS;
  emitEvent: (e: RepoEvent) => void;
  closeOutLock: CloseOutLock;
  pendingReview: Set<string>;
  uiDir: string | null;
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
