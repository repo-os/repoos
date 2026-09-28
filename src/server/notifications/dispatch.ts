import { projectDisplayName } from "../../core/config.js";
import type { RepoOSConfig, Status, Task } from "../../core/types.js";
import type { AgentRunner } from "../agents.js";
import type { LiveIndex, RepoEvent } from "../live-index.js";
import { taskNotificationLink } from "./link.js";
import { NtfyNotificationProvider } from "./ntfy-provider.js";
import { isAgentFailureNeedsInputReason } from "./reasons.js";
import { TelegramNotificationProvider } from "./telegram-provider.js";
import {
  notificationForAgentCompleted,
  notificationForAgentFailed,
  notificationForIntegrationFailed,
  notificationForMergeConflict,
  notificationForMovedToReview,
  notificationForNeedsInput,
  notificationForReviewFeedback,
  notificationForServerFailed,
  notificationForStatusChange,
  notificationForTaskCreated,
} from "./spec.js";
import { progressFailureNotification } from "./progress.js";
import type {
  NotificationDispatchContext,
  NotificationKind,
  NotificationPayload,
  NotificationProvider,
} from "./types.js";

const defaultProviders: NotificationProvider[] = [
  new NtfyNotificationProvider(),
  new TelegramNotificationProvider(),
];

export function dispatchNotification(
  ctx: NotificationDispatchContext,
  payload: NotificationPayload,
  providers: NotificationProvider[] = defaultProviders,
): void {
  for (const provider of providers) {
    try {
      if (!provider.isEnabled(ctx)) continue;
      provider.deliver(ctx, payload);
    } catch (err) {
      console.error(`[notifications] Provider ${provider.id} threw (ignored):`, err);
    }
  }
}

function basePayload(
  ctx: NotificationDispatchContext,
  task: Task,
  kind: NotificationKind,
  spec: { headline: string; severity: NotificationPayload["severity"]; subtitle?: string },
  summary: string,
): NotificationPayload {
  const link = taskNotificationLink(ctx.config, task.id, ctx.publicOrigin);
  return {
    kind,
    severity: spec.severity,
    repositoryName: projectDisplayName(ctx.config.root),
    taskId: task.id,
    taskTitle: task.title,
    status: task.status,
    summary,
    link,
    headline: spec.headline,
    subtitle: spec.subtitle,
    actions: link.startsWith("http") ? [{ label: "Open task", url: link }] : undefined,
  };
}

export function notifyTaskCreated(ctx: NotificationDispatchContext, task: Task): void {
  const spec = notificationForTaskCreated();
  dispatchNotification(
    ctx,
    basePayload(ctx, task, "task.created", spec, "A new task was added to the board."),
  );
}

export function notifyStatusChange(
  ctx: NotificationDispatchContext,
  task: Task,
  prev: Status,
  next: Status,
): void {
  const spec = notificationForStatusChange(prev, next);
  if (!spec) return;
  const kind: NotificationKind =
    prev === "ready" && next === "active"
      ? "task.started"
      : next === "done"
        ? "task.done"
        : "task.started";
  const summary =
    kind === "task.done" ? "The task was marked done." : "An agent started work on this task.";
  dispatchNotification(ctx, basePayload(ctx, task, kind, spec, summary));
}

export function notifyNeedsInput(ctx: NotificationDispatchContext, task: Task): void {
  const spec = notificationForNeedsInput();
  dispatchNotification(
    ctx,
    basePayload(
      ctx,
      task,
      "task.needs_input",
      spec,
      task.needsInputReason?.trim() || "The agent is waiting for your decision.",
    ),
  );
}

export function notifyMovedToReview(ctx: NotificationDispatchContext, task: Task): void {
  const spec = notificationForMovedToReview();
  dispatchNotification(
    ctx,
    basePayload(ctx, task, "task.moved_to_review", spec, "The task is ready for human review."),
  );
}

export function notifyReviewFeedback(ctx: NotificationDispatchContext, task: Task): void {
  const spec = notificationForReviewFeedback();
  dispatchNotification(
    ctx,
    basePayload(
      ctx,
      task,
      "task.review_feedback",
      spec,
      "Automated review feedback is available in the task drawer.",
    ),
  );
}

export function notifyIntegrationFailed(
  ctx: NotificationDispatchContext,
  task: Task,
  detail?: string,
): void {
  const spec = notificationForIntegrationFailed(detail);
  dispatchNotification(
    ctx,
    basePayload(ctx, task, "task.integration_failed", spec, spec.subtitle ?? detail ?? ""),
  );
}

export function notifyServerFailed(
  ctx: NotificationDispatchContext,
  task: Task,
  detail?: string,
): void {
  const spec = notificationForServerFailed(detail);
  dispatchNotification(
    ctx,
    basePayload(ctx, task, "task.server_failed", spec, spec.subtitle ?? detail ?? ""),
  );
}

export function notifyAgentFailed(
  ctx: NotificationDispatchContext,
  task: Task,
  detail?: string,
): void {
  const spec = notificationForAgentFailed(detail);
  dispatchNotification(
    ctx,
    basePayload(ctx, task, "task.agent_failed", spec, spec.subtitle ?? detail ?? ""),
  );
}

export interface TaskNotificationHandlersOptions {
  providers?: NotificationProvider[];
  /**
   * The live runner, when one is available (#0542). The agent-completed
   * notification must not fire while a later turn is already resuming or a
   * review handoff is finalizing — those carry their own notifications.
   */
  runner?: Pick<AgentRunner, "isRunning" | "isHandoffInFlight" | "isPaused">;
  /**
   * Test seam: overrides the grace the agent-completed notification waits out
   * after `agent.exited` (needs-input writes and handoff finalization land
   * moments later; the subscriber must lose every race to them).
   */
  completedGraceMs?: number;
}

/**
 * Grace between `agent.exited` and the "agent finished" notification. Long
 * enough that needs_input writes (which can land right after the exit —
 * escalateFailedExit runs in the same cleanup tick) and handoff state changes
 * have settled; short enough to still feel live. Tested with 0 via
 * `completedGraceMs`; production uses this default.
 */
const AGENT_COMPLETED_GRACE_MS = 4_000;

/** Subscribe to index events and fan out lifecycle notifications. */
export function attachTaskNotificationHandlers(
  index: LiveIndex,
  ctx: NotificationDispatchContext,
  opts: TaskNotificationHandlersOptions = {},
): () => void {
  const providers = opts.providers ?? defaultProviders;
  const dispatch = (payload: NotificationPayload) => dispatchNotification(ctx, payload, providers);

  const notifyCreated = (task: Task) => {
    const spec = notificationForTaskCreated();
    dispatch(basePayload(ctx, task, "task.created", spec, "A new task was added to the board."));
  };

  const onStatus = (task: Task, prev: Status, next: Status) => {
    const spec = notificationForStatusChange(prev, next);
    if (spec) {
      const kind: NotificationKind =
        prev === "ready" && next === "active"
          ? "task.started"
          : next === "done"
            ? "task.done"
            : "task.started";
      const summary =
        kind === "task.done" ? "The task was marked done." : "An agent started work on this task.";
      dispatch(basePayload(ctx, task, kind, spec, summary));
    }
    // `active → review` is owned by moved_to_review (engineering handoff), not agent_completed.
    if (prev !== next && next === "review") {
      const reviewSpec = notificationForMovedToReview();
      dispatch(
        basePayload(
          ctx,
          task,
          "task.moved_to_review",
          reviewSpec,
          "The task is ready for human review.",
        ),
      );
    }
  };

  const unsubMain = index.on((e: RepoEvent) => {
    if (e.type === "task.created") {
      notifyCreated(e.task);
      return;
    }
    if (e.type !== "task.updated") return;
    const prev = e.prev.status;
    if (prev === undefined || prev === e.task.status) return;
    onStatus(e.task, prev, e.task.status);
  });

  /**
   * Flag-edge detection with the index's event contract: `prev` is a *diff of
   * changed fields*, so a flag key present in `prev` means the flag changed on
   * THIS event, and its value there is the prior value. A bare `?? false`
   * against `prev.flag` would re-fire on every unrelated write that keeps the
   * flag held — a duplicated push per task-file touch while a task waits.
   * Fires only when the flag was off/unset before this event and is on now.
   */
  const flippedOn = (
    e: Extract<RepoEvent, { type: "task.updated" }>,
    key: "needsInput" | "needsMerge",
  ): boolean => {
    if (e.task[key] !== true) return false;
    if (!(key in e.prev)) return false;
    return !e.prev[key];
  };

  const unsubNeedsInput = index.on((e: RepoEvent) => {
    if (e.type !== "task.updated") return;
    if (!flippedOn(e, "needsInput")) return;
    const reason = e.task.needsInputReason?.trim();
    const detail = e.task.needsInputDetail?.trim() || reason || "";
    if (isAgentFailureNeedsInputReason(reason)) {
      const spec = notificationForAgentFailed(detail || reason);
      dispatch(
        basePayload(ctx, e.task, "task.agent_failed", spec, detail || reason || spec.subtitle!),
      );
      return;
    }
    const spec = notificationForNeedsInput();
    dispatch(
      basePayload(
        ctx,
        e.task,
        "task.needs_input",
        spec,
        reason || "The agent is waiting for your decision.",
      ),
    );
  });

  const unsubReview = index.on((e: RepoEvent) => {
    if (e.type !== "review" || e.state !== "ready") return;
    const task = index.getTask(e.id);
    if (!task) return;
    const spec = notificationForReviewFeedback();
    dispatch(
      basePayload(
        ctx,
        task,
        "task.review_feedback",
        spec,
        "Automated review feedback is available in the task drawer.",
      ),
    );
  });

  const unsubProgress = index.on((e: RepoEvent) => {
    if (e.type !== "task.progress") return;
    const task = index.getTask(e.id);
    if (!task) return;
    const failure = progressFailureNotification(task, e.step, e.detail);
    if (!failure) return;
    dispatch(basePayload(ctx, task, failure.kind, failure.spec, failure.summary));
  });

  // #0542: needsMerge false→true is a merge failure that currently only
  // surfaces on the board — exactly the silent stall the Telegram channel
  // exists to break. The sync route (syncTaskBranch) is this flag's only
  // writer; it sets and clears it.
  const unsubNeedsMerge = index.on((e: RepoEvent) => {
    if (e.type !== "task.updated") return;
    if (!flippedOn(e, "needsMerge")) return;
    const spec = notificationForMergeConflict();
    dispatch(
      basePayload(
        ctx,
        e.task,
        "task.integration_failed",
        spec,
        spec.subtitle ?? "Task branch conflicts with main",
      ),
    );
  });

  // #0542: "agent completed" — a turn ended and NOTHING took over: the task
  // still reads active with no turn, no paused marker, no handoff in flight,
  // and no needs-input escalation. Every one of those states has its own
  // (louder) notification, so completed stays silent when it loses the race.
  // The check runs after a short grace because escalateFailedExit (dev-error
  // needs_input) and handoff finalization both act moments after the exit.
  const pendingCompleted = new Map<string, ReturnType<typeof setTimeout>>();
  const unsubAgentExited = index.on((e: RepoEvent) => {
    if (e.type !== "agent.exited") return;
    // Review sessions run under `review:<taskId>` keys; `getTask` resolves
    // neither that shape nor unknown ids, so they are naturally ignored.
    const earlier = pendingCompleted.get(e.id);
    if (earlier !== undefined) clearTimeout(earlier);
    pendingCompleted.set(
      e.id,
      setTimeout(() => {
        pendingCompleted.delete(e.id);
        const task = index.getTask(e.id);
        if (!task) return;
        if (task.status !== "active" || task.needsInput || task.needsMerge) return;
        if (opts.runner) {
          if (opts.runner.isRunning(e.id) || opts.runner.isHandoffInFlight(e.id)) return;
          if (opts.runner.isPaused(e.id)) return;
        }
        const spec = notificationForAgentCompleted();
        const summary =
          `The agent finished its turn and the task is still active — ` +
          `send "/msg ${task.id} <message>" over Telegram to continue it, or use the web UI.`;
        dispatch(basePayload(ctx, task, "task.agent_completed", spec, summary));
      }, opts.completedGraceMs ?? AGENT_COMPLETED_GRACE_MS),
    );
  });

  return () => {
    unsubMain();
    unsubNeedsInput();
    unsubReview();
    unsubProgress();
    unsubNeedsMerge();
    unsubAgentExited();
    for (const timer of pendingCompleted.values()) clearTimeout(timer);
    pendingCompleted.clear();
  };
}

export function notificationContextFromConfig(
  config: RepoOSConfig,
  authStore: NotificationDispatchContext["authStore"],
  publicOrigin?: string,
): NotificationDispatchContext {
  return { config, authStore, publicOrigin };
}
