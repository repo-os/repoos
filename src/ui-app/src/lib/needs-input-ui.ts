import type { Task } from "../../../core/types.js";
import { MAX_AUTO_REVIEW_ROUNDS, needsInputSuppressedOnReview } from "../../../core/needs-input.js";

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
  "review-rounds-exhausted": "Review still finding issues",
  "dev-error": "Agent exited with an error",
  "provider-failure": "Provider or credit error",
  "degenerate-output": "Degenerate agent output",
  "check-failed-after-retries": "Checks failed after retries",
  "cto-escalation": "Agent asked a question",
  "watchdog-stuck": "No agent running",
  underspecified: "Doesn't look fully fleshed out",
  questions: "Agent asked a question",
};

export const NEEDS_INPUT_BANNER_LABELS: Record<string, string> = {
  "review-failed": "The reviewer crashed or timed out without producing a report.",
  "review-rounds-exhausted": `The reviewer has sent this back to the engineer ${MAX_AUTO_REVIEW_ROUNDS} times and still found issues. No review is running now.`,
  "dev-error": "The agent exited with an error.",
  "provider-failure": "The model provider returned a credit, auth, or availability error.",
  "degenerate-output": "The agent looped on repetitive or runaway output and was stopped.",
  "check-failed-after-retries": "Checks failed after automatic retries.",
  "cto-escalation": "The CTO agent flagged this for a human decision.",
  "watchdog-stuck": "The task went quiet with no agent running.",
  underspecified:
    "This task doesn't look fully fleshed out yet — probably the PM agent didn't finish writing it.",
  questions: "The agent is waiting on your answer before it can continue.",
};

export const NEEDS_INPUT_SUGGESTION_LABELS: Record<string, string> = {
  "review-failed":
    "Try Review again from the Review tab (or Restart work if the task is back in active). If it keeps failing, check the CLI/model picker there — an invalid pairing (e.g. after switching CLI) causes exactly this.",
  "review-rounds-exhausted":
    "Read the latest review report, then send it to the engineer, fix it yourself, or move to done if the remaining findings are acceptable. A review already finished with findings, so re-reviewing the same code would just repeat it — review again after the fixes.",
  "dev-error":
    "Restart work to resume the agent, or reply below with more context first. If it keeps failing on the same error, check the coding agent/model picker above — a CLI switch without a matching model pin causes exactly this.",
  "provider-failure":
    "Add credits or fix the API key on the Providers page, then Restart work. Consider a per-task model override if this model stays unavailable.",
  "degenerate-output":
    "Restart work with a different model or agent, or narrow the task scope. If it repeats, move the task to a stronger model via per-task override.",
  "check-failed-after-retries":
    "Open the Debug tab for the failing check output, fix the issue or adjust the check plan, then Restart work. Move to done only after checks pass.",
  "watchdog-stuck":
    "On a review task, use Review again. On an active task, restart work when no agent is running.",
  "cto-escalation": "Open the PM tab and send a reply — the flag clears when your message is sent.",
  underspecified:
    "Send it to the PM agent to flesh it out, or write the missing sections yourself.",
  "closeout-worktree-dirty":
    "The merge already landed. Inspect the kept worktree if you want its uncommitted files, or Clear worktree to force-remove it and delete the merged branch.",
  questions: "Open the PM tab to answer — your reply is sent with the questions attached.",
};

export type NeedsInputPrimaryActionKind =
  | "restart"
  | "review"
  | "send-engineer"
  | "answer"
  | "send-pm";

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

const SEND_ENGINEER_ACTION: NeedsInputPrimaryAction = {
  kind: "send-engineer",
  label: "Send to engineer",
};

const RESTART_ACTION: NeedsInputPrimaryAction = {
  kind: "restart",
  label: "Restart work (clears this)",
};

const ANSWER_IN_PM_ACTION: NeedsInputPrimaryAction = {
  kind: "answer",
  label: "Answer in PM",
};

const PM_REPLY_ACTION: NeedsInputPrimaryAction = {
  kind: "answer",
  label: "Reply in PM (clears when sent)",
};

const SEND_TO_PM_ACTION: NeedsInputPrimaryAction = {
  kind: "send-pm",
  label: "Send to PM (fleshes this out)",
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
      if (ctx.status === "review") return REVIEW_AGAIN_ACTION;
      return canRestartWork(ctx) ? RESTART_ACTION : null;
    case "review-rounds-exhausted":
      // A review already finished with findings: the next step is acting on
      // them, not paying for another review of the same code.
      return ctx.status === "review" ? SEND_ENGINEER_ACTION : null;
    case "watchdog-stuck":
      if (ctx.status === "review") return REVIEW_AGAIN_ACTION;
      return canRestartWork(ctx) ? RESTART_ACTION : null;
    case "dev-error":
    case "provider-failure":
    case "degenerate-output":
    case "check-failed-after-retries":
      return canRestartWork(ctx) ? RESTART_ACTION : null;
    case "cto-escalation":
      return PM_REPLY_ACTION;
    case "questions":
      return ANSWER_IN_PM_ACTION;
    case "underspecified":
      return SEND_TO_PM_ACTION;
    default:
      return null;
  }
}
