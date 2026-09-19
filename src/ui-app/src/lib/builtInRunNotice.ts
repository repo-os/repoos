/**
 * The one-line notice a finished built-in agent run shows in the UI (0439).
 *
 * Pure so the wording is testable without an SSE stream: the server emits a
 * `built-in.run` event (manual and scheduled runs alike) and the repo store
 * turns it into a toast with this text. A run that found nothing still
 * announces itself — "ran clean" is the answer to "did anything happen?".
 */
import type { RepoEvent } from "../types";

type BuiltInRunEvent = Extract<RepoEvent, { type: "built-in.run" }>;

export function builtInRunNotice(event: BuiltInRunEvent): string {
  const label = event.label || event.agent;
  if (event.findings <= 0) return `${label} finished — ran clean`;
  const noun = event.findings === 1 ? "1 finding" : `${event.findings} findings`;
  const task = event.taskId ? `, task #${event.taskId} created` : "";
  return `${label} finished — ${noun}${task}`;
}
