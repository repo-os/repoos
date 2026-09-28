import { projectDisplayName } from "../../core/config.js";
import type { RepoOSConfig, Status, Task } from "../../core/types.js";
import type { LiveIndex, RepoEvent } from "../live-index.js";
import { taskNotificationLink } from "./link.js";
import { NtfyNotificationProvider } from "./ntfy-provider.js";
import { isAgentFailureNeedsInputReason } from "./reasons.js";
import { TelegramNotificationProvider } from "./telegram-provider.js";
import {
  notificationForAgentFailed,
  notificationForIntegrationFailed,
  notificationForMovedToReview,
  notificationForNeedsInput,
  notificationForReviewFeedback,
  notificationForServerFailed,
  notificationForStatusChange,
  notificationForTaskCreated,
} from "./spec.js";
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
}

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

  const unsubNeedsInput = index.on((e: RepoEvent) => {
    if (e.type !== "task.updated") return;
    const prevNeedsInput = e.prev.needsInput ?? false;
    const nextNeedsInput = e.task.needsInput;
    if (!prevNeedsInput && nextNeedsInput) {
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
    }
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
    if (e.step === "handoff:failed") {
      const spec = notificationForServerFailed(e.detail);
      dispatch(basePayload(ctx, task, "task.server_failed", spec, e.detail ?? spec.subtitle ?? ""));
      return;
    }
    if (e.step !== "failed") return;
    const spec = notificationForIntegrationFailed(e.detail);
    dispatch(
      basePayload(ctx, task, "task.integration_failed", spec, e.detail ?? spec.subtitle ?? ""),
    );
  });

  return () => {
    unsubMain();
    unsubNeedsInput();
    unsubReview();
    unsubProgress();
  };
}

export function notificationContextFromConfig(
  config: RepoOSConfig,
  authStore: NotificationDispatchContext["authStore"],
  publicOrigin?: string,
): NotificationDispatchContext {
  return { config, authStore, publicOrigin };
}
