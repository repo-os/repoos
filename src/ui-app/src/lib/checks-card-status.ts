import { checkProgressLabel, type CheckProgress } from "./check-progress.js";
import { formatDuration } from "./time.js";

export function isReusedCheckOutput(output: string | null | undefined): boolean {
  return output?.includes("reused check ") ?? false;
}

/**
 * One line for the task card and drawer while checks or handoff gates run (#1054).
 * Examples: `Checks · step 3 of 9 · 41s`, `Checks · reused earlier check · 12s`.
 */
export function formatChecksCardLine(opts: {
  nowMs: number;
  startedAt?: string | null;
  progress?: CheckProgress | null;
  handoffStep?: string | null;
  checkOutput?: string | null;
  slow?: boolean;
  slotAgeMs?: number | null;
}): string {
  const parts = ["Checks"];
  if (isReusedCheckOutput(opts.checkOutput)) {
    parts.push("reused earlier check");
  } else if (opts.progress) {
    const hasCounts =
      opts.progress.stepsDone != null ||
      opts.progress.currentStep != null ||
      opts.progress.testsDone != null;
    if (hasCounts) {
      parts.push(checkProgressLabel(opts.progress));
    } else if (opts.progress.stepName) {
      parts.push(`checking ${opts.progress.stepName}`);
    } else {
      parts.push("starting…");
    }
  } else if (opts.handoffStep) {
    parts.push(`checking ${opts.handoffStep}`);
  } else if (opts.slotAgeMs != null) {
    parts.push("check");
  } else {
    parts.push("starting…");
  }

  let elapsed: string | null = null;
  if (opts.startedAt) {
    elapsed = formatDuration(Math.max(0, opts.nowMs - Date.parse(opts.startedAt)));
  } else if (opts.slotAgeMs != null) {
    elapsed = formatDuration(opts.slotAgeMs);
  }
  if (elapsed) parts.push(elapsed);
  if (opts.slow) parts.push("slow");
  return parts.join(" · ");
}
