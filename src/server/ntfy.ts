/**
 * Optional ntfy push notifications for task lifecycle events (#0134).
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

/** The ntfy server base URL: env var wins, then config, then the default. */
export function ntfyBaseUrl(config: RepoOSConfig): string {
  const fromEnv = process.env.NTFY_BASE_URL?.trim();
  return (fromEnv || config.ntfyBaseUrl || NTFY_DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Human-readable message for a status transition, or null when it isn't one. */
export function ntfyMessageFor(prev: Status, next: Status, title: string): string | null {
  if (prev === "ready" && next === "active") {
    return `Task "${title}" started (ready → active)`;
  }
  if (prev === "active" && next === "review") {
    return `Task "${title}" moved from active to review`;
  }
  if (prev === "review" && next === "done") {
    return `Task "${title}" moved from review to done (review approved)`;
  }
  if (prev === "review" && next !== "review") {
    return `Task "${title}" review returned with issues — moved back from review to ${next}`;
  }
  return null;
}

/** Human-readable message when a task needs human input. */
export function ntfyMessageForNeedsInput(title: string): string {
  return `Task "${title}" is waiting for human input`;
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
export function publish(config: RepoOSConfig, message: string): void {
  if (!shouldSend(config)) return;
  const topic = encodeURIComponent((config.ntfyTopic ?? "").trim());
  const url = `${ntfyBaseUrl(config)}/${topic}`;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain", Title: "RepoOS" },
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
  const message = ntfyMessageFor(prev, next, task.title);
  if (message) {
    console.log(`[ntfy] Sending notification for ${task.id}: ${prev} → ${next}`);
    publish(config, message);
  } else {
    console.log(`[ntfy] No notification for ${task.id}: ${prev} → ${next} (no message configured)`);
  }
}

/** Fire a notification when a task is created (stretch from #0134). */
export function notifyTaskCreated(config: RepoOSConfig, task: Task): void {
  publish(config, `Task "${task.title}" created`);
}

/** Fire a notification when a task needs human input. */
export function notifyNeedsInput(config: RepoOSConfig, task: Task): void {
  const message = ntfyMessageForNeedsInput(task.title);
  publish(config, message);
}
