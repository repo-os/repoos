import type { RepoOSConfig } from "../../core/types.js";
import { formatNotification } from "./format.js";
import { notificationForNeedsInput } from "./spec.js";
import type {
  NotificationDispatchContext,
  NotificationKind,
  NotificationPayload,
  NotificationProvider,
  NotificationSeverity,
} from "./types.js";

const NTFY_DEFAULT_BASE_URL = "https://ntfy.sh";

type NtfyPriority = "min" | "low" | "default" | "high" | "max";

const SEVERITY_TO_NTFY: Record<NotificationSeverity, NtfyPriority> = {
  background: "min",
  low: "low",
  normal: "default",
  high: "high",
  urgent: "max",
};

/** Kinds the legacy ntfy integration emits — unchanged from pre-#0537 behavior. */
const NTFY_KINDS = new Set<NotificationKind>([
  "task.created",
  "task.started",
  "task.needs_input",
  "task.agent_failed",
  "task.done",
]);

export function ntfyBaseUrl(config: RepoOSConfig): string {
  const fromEnv = process.env.NTFY_BASE_URL?.trim();
  return (fromEnv || config.ntfyBaseUrl || NTFY_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function ntfyConfigured(config: RepoOSConfig): boolean {
  if (config.ntfyEnabled !== true) return false;
  return (config.ntfyTopic ?? "").trim().length > 0;
}

export class NtfyNotificationProvider implements NotificationProvider {
  readonly id = "ntfy";

  isEnabled(ctx: NotificationDispatchContext): boolean {
    return ntfyConfigured(ctx.config);
  }

  deliver(ctx: NotificationDispatchContext, payload: NotificationPayload): void {
    if (!NTFY_KINDS.has(payload.kind)) return;
    if (!ntfyConfigured(ctx.config)) return;
    const topic = encodeURIComponent((ctx.config.ntfyTopic ?? "").trim());
    const url = `${ntfyBaseUrl(ctx.config)}/${topic}`;
    const spec =
      payload.kind === "task.agent_failed"
        ? notificationForNeedsInput()
        : {
            headline: payload.headline,
            severity: payload.severity,
            subtitle: payload.subtitle,
          };
    const message = formatNotification(spec, payload.taskTitle);
    const priority = SEVERITY_TO_NTFY[payload.severity];
    const fetchImpl = ctx.fetch ?? fetch;
    void fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        Title: "RepoOS",
        Priority: priority,
      },
      body: message,
    }).catch((err) => {
      console.error(`[ntfy] Failed to send notification to ${url}:`, err);
    });
  }
}

/** Best-effort publish of a raw message (test notification route). Never throws. */
export function publishNtfyRaw(
  config: RepoOSConfig,
  message: string,
  severity: NotificationSeverity = "normal",
  fetchImpl: typeof fetch = fetch,
): void {
  if (!ntfyConfigured(config)) return;
  const topic = encodeURIComponent((config.ntfyTopic ?? "").trim());
  const url = `${ntfyBaseUrl(config)}/${topic}`;
  const priority = SEVERITY_TO_NTFY[severity];
  void fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Title: "RepoOS",
      Priority: priority,
    },
    body: message,
  }).catch((err) => {
    console.error(`[ntfy] Failed to send notification to ${url}:`, err);
  });
}
