import type { Task } from "../../../core/types.js";
import { needsInputSuppressedOnReview } from "../../../core/needs-input.js";

/**
 * Copy and labels for `needs_input` on board cards and the task drawer (#0511).
 * Single source so card status lines, header chips, and banners stay aligned.
 */

export { needsInputSuppressedOnReview } from "../../../core/needs-input.js";

export function needsInputSurfaces(
  task: Pick<Task, "status" | "needsInput" | "needsInputReason">,
): boolean {
  return Boolean(task.needsInput && !needsInputSuppressedOnReview(task));
}

export const STALE_REVIEW_DEV_ERROR_BANNER =
  "This task is already in review — the dev-error flag is stale from handoff and can be dismissed if the reviewer report looks fine.";

export const NEEDS_INPUT_STATUS_LABELS: Record<string, string> = {
  "review-failed": "Reviewer failed — no report",
  "dev-error": "Agent exited with an error",
  "check-failed-after-retries": "Checks failed after retries",
  "cto-escalation": "Agent asked a question",
  "watchdog-stuck": "No agent running",
  questions: "Agent asked a question",
};

export const NEEDS_INPUT_BANNER_LABELS: Record<string, string> = {
  "review-failed": "The reviewer crashed or timed out without producing a report.",
  "dev-error": "The agent exited with an error.",
  "check-failed-after-retries": "Checks failed after automatic retries.",
  "cto-escalation": "The CTO agent flagged this for a human decision.",
  "watchdog-stuck": "The task went quiet with no agent running.",
  questions: "The agent is waiting on your answer before it can continue.",
};

export const NEEDS_INPUT_SUGGESTION_LABELS: Record<string, string> = {
  "review-failed":
    "Try Review again from the Review tab. If it keeps failing, check the CLI/model picker there — an invalid pairing (e.g. after switching CLI) causes exactly this.",
  "dev-error":
    "Restart work to resume the agent, or reply below with more context first. If it keeps failing on the same error, check the coding agent/model picker above — a CLI switch without a matching model pin causes exactly this.",
  "check-failed-after-retries":
    "Open the Debug tab for the failing check output, fix the issue or adjust the check plan, then Restart work. Move to done only after checks pass.",
  "watchdog-stuck":
    "On a review task, use Review again. On an active task, restart work when no agent is running.",
  "cto-escalation": "Open the PM tab and send a reply — the flag clears when your message is sent.",
  questions: "Answer the questions below or reply in the PM tab so the agent can continue.",
};

export type NeedsInputPrimaryActionKind = "restart" | "review" | "answer";

export interface NeedsInputPrimaryAction {
  kind: NeedsInputPrimaryActionKind;
  label: string;
}

/** Context for whether Restart / Review again is actually allowed by the server. */
export interface NeedsInputActionContext {
  status: string;
  agentRunning: boolean;
}

const REVIEW_AGAIN_ACTION: NeedsInputPrimaryAction = {
  kind: "review",
  label: "Review again (clears this)",
};

const RESTART_ACTION: NeedsInputPrimaryAction = {
  kind: "restart",
  label: "Restart work (clears this)",
};

const PM_REPLY_ACTION: NeedsInputPrimaryAction = {
  kind: "answer",
  label: "Reply in PM (clears when sent)",
};

function canRestartWork(ctx: NeedsInputActionContext): boolean {
  return ctx.status === "ready" || (ctx.status === "active" && !ctx.agentRunning);
}

/** Normalize watchdog detail strings and legacy reason shapes to a lookup key. */
export function resolveNeedsInputReasonKey(
  reason: string | undefined,
  hasQuestions: boolean,
): string | undefined {
  if (hasQuestions && (!reason || reason === "cto-escalation")) {
    return reason === "cto-escalation" ? "cto-escalation" : "questions";
  }
  if (!reason) return undefined;
  if (reason.startsWith("check-failed-after-retries")) return "check-failed-after-retries";
  return reason;
}

export function needsInputStatusLabel(reason: string | undefined, hasQuestions = false): string {
  const key = resolveNeedsInputReasonKey(reason, hasQuestions);
  return (key && NEEDS_INPUT_STATUS_LABELS[key]) || "Needs your input";
}

export function needsInputBannerText(reason: string | undefined, hasQuestions = false): string {
  const key = resolveNeedsInputReasonKey(reason, hasQuestions);
  return (
    (key && NEEDS_INPUT_BANNER_LABELS[key]) ||
    "The agent needs your input — use the actions below to continue."
  );
}

export function needsInputSuggestionText(
  reason: string | undefined,
  hasQuestions = false,
): string | null {
  const key = resolveNeedsInputReasonKey(reason, hasQuestions);
  return (key && NEEDS_INPUT_SUGGESTION_LABELS[key]) || null;
}

export function needsInputPrimaryAction(
  reason: string | undefined,
  hasQuestions: boolean,
  ctx: NeedsInputActionContext,
): NeedsInputPrimaryAction | null {
  const key = resolveNeedsInputReasonKey(reason, hasQuestions);
  switch (key) {
    case "review-failed":
      return ctx.status === "review" ? REVIEW_AGAIN_ACTION : null;
    case "watchdog-stuck":
      return canRestartWork(ctx) ? RESTART_ACTION : null;
    case "dev-error":
    case "check-failed-after-retries":
      return canRestartWork(ctx) ? RESTART_ACTION : null;
    case "cto-escalation":
    case "questions":
      return PM_REPLY_ACTION;
    default:
      return null;
  }
}
