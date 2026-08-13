/**
 * Optional ntfy push notifications for task lifecycle events (#0161).
 *
 * Redesigned to be scannable one-line notifications using the grammar:
 * [emoji] [short human event] · [task title]
 *
 * Fire-and-forget HTTP POSTs to a ntfy topic. Best-effort by design: a network
 * error, bad topic, or offline server must never block or fail the status
 * transition that triggered the notification — callers just call
 * `notifyStatusChange` and ignore the result.
 *
 * No runtime dependencies: publishing uses the platform's native `fetch`
 * (Node >= 18 / Bun). If the topic is empty or the toggle is off, nothing is
 * ever sent.
 */
import type { RepoOSConfig, Status, Task } from "../core/types.js";

const NTFY_DEFAULT_BASE_URL = "https://ntfy.sh";

type NotificationPriority = "min" | "low" | "default" | "high" | "max";

interface NotificationSpec {
  /** Emoji + short verb, e.g. "▶️ Started" */
  headline: string;
  /** ntfy priority header: "Needs you", "Blocked", "Failed" = high/max; "Done", "Started" = low */
  priority: NotificationPriority;
  /** Optional second line for "Needs you" notifications, e.g. "Agent is waiting for your decision" */
  subtitle?: string;
}

/** The ntfy server base URL: env var wins, then config, then the default. */
export function ntfyBaseUrl(config: RepoOSConfig): string {
  const fromEnv = process.env.NTFY_BASE_URL?.trim();
  return (fromEnv || config.ntfyBaseUrl || NTFY_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Truncate title to fit on one line with the headline. Aim for ~50 chars total. */
function truncateTitle(title: string, headlineLen: number): string {
  const maxLen = 50 - headlineLen - 3; // 3 for " · "
  if (title.length <= maxLen) return title;
  return title.slice(0, Math.max(1, maxLen - 1)) + "…";
}

/**
 * Build a notification spec for a status transition, or null if no notification applies.
 * For ready → active, returns "Started" (lower priority to avoid noise).
 * For active/review → done, returns "Done" (lower priority).
 * Other transitions do not currently trigger notifications.
 */
export function notificationForStatusChange(
  prev: Status,
  next: Status,
): NotificationSpec | null {
  if (prev === "ready" && next === "active") {
    return { headline: "▶️ Started", priority: "low" };
  }
  if ((prev === "active" || prev === "review") && next === "done") {
    return { headline: "✅ Done", priority: "low" };
  }
  return null;
}

/**
 * Build a notification spec for task creation.
 * Returns "New" with low priority (informational).
 */
export function notificationForTaskCreated(): NotificationSpec {
  return { headline: "🆕 New", priority: "low" };
}

/**
 * Build a notification spec when a task needs human input.
 * Returns "Needs you" with high priority and a subtitle explaining the situation.
 */
export function notificationForNeedsInput(): NotificationSpec {
  return {
    headline: "🙋 Needs you",
    priority: "high",
    subtitle: "Agent is waiting for your decision",
  };
}

/** Format a notification spec into the final message string. */
export function formatNotification(spec: NotificationSpec, title: string): string {
  const truncated = truncateTitle(title, spec.headline.length);
  const message = `${spec.headline} · ${truncated}`;
  if (spec.subtitle) {
    return `${message}\n${spec.subtitle}`;
  }
  return message;
}

/** True when notifications are enabled AND a topic is configured. */
export function shouldSend(config: RepoOSConfig): boolean {
  if (config.ntfyEnabled !== true) {
    console.log(`[ntfy] Notifications disabled (ntfyEnabled=${config.ntfyEnabled})`);
    return false;
  }
  const topic = (config.ntfyTopic ?? "").trim();
  if (topic.length === 0) {
    console.log(`[ntfy] No topic configured (ntfyTopic="${config.ntfyTopic}")`);
    return false;
  }
  console.log(`[ntfy] Notifications enabled for topic: ${topic}`);
  return true;
}

/** Best-effort publish of a message to the configured topic. Never throws. */
export function publish(
  config: RepoOSConfig,
  message: string,
  priority: NotificationPriority = "default",
): void {
  if (!shouldSend(config)) return;
  const topic = encodeURIComponent((config.ntfyTopic ?? "").trim());
  const url = `${ntfyBaseUrl(config)}/${topic}`;
  void fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Title: "RepoOS",
      Priority: priority,
    },
    body: message,
  }).catch((err) => {
    // Log errors for debugging, but never throw
    console.error(`[ntfy] Failed to send notification to ${url}:`, err);
  });
}

/** Fire a notification for a task status transition, if one applies. */
export function notifyStatusChange(
  config: RepoOSConfig,
  task: Task,
  prev: Status,
  next: Status,
): void {
  const spec = notificationForStatusChange(prev, next);
  if (spec) {
    const message = formatNotification(spec, task.title);
    console.log(`[ntfy] Sending notification for ${task.id}: ${prev} → ${next}`);
    publish(config, message, spec.priority);
  } else {
    console.log(`[ntfy] No notification for ${task.id}: ${prev} → ${next} (no message configured)`);
  }
}

/** Fire a notification when a task is created (stretch from #0134). */
export function notifyTaskCreated(config: RepoOSConfig, task: Task): void {
  const spec = notificationForTaskCreated();
  const message = formatNotification(spec, task.title);
  publish(config, message, spec.priority);
}

/** Fire a notification when a task needs human input. */
export function notifyNeedsInput(config: RepoOSConfig, task: Task): void {
  const spec = notificationForNeedsInput();
  const message = formatNotification(spec, task.title);
  publish(config, message, spec.priority);
}
