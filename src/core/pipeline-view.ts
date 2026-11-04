/**
 * Pipeline view-model for the Work page race track (#1035).
 *
 * Pure mapping from one task plus the live store signals the board card
 * already reads (running set, handoff/check state, review state, stuck/held
 * flags) to a discrete stage column and a step label. Position is always a
 * stage — never a synthesised progress percentage.
 *
 * Stuck, needs-input, paused and held are *states*, not stages: the card
 * stays in the stage where it stalled and the state only changes the chip,
 * the dot and the dimming. See `docs/pipeline-stage-mapping.md` for the
 * full table and the ambiguous cases.
 */

/** Stage columns, left to right. The last one is the tinted goal area. */
export const PIPELINE_STAGES = [
  "coding",
  "checks",
  "handoff",
  "review",
  "closeout",
  "merged",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  coding: "Coding",
  checks: "Checks",
  handoff: "Handoff",
  review: "Review",
  closeout: "Close-out",
  merged: "Merged",
};

/**
 * Recently merged tasks sit in the Merged goal for this long, then drop out
 * of the track. A constant so the window is one obvious knob (#1035).
 */
export const PIPELINE_MERGED_WINDOW_MS = 10 * 60 * 1000;

/** Card state layered over the stage — drives chip, dot and dimming only. */
export type PipelineCardState = "ok" | "stuck" | "needs-input" | "paused" | "held" | "merged";

export interface PipelineCheckProgress {
  done: number | null;
  total: number | null;
}

export interface PipelineTaskInput {
  id: string;
  status: "active" | "review" | "done";
  priority: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** Successful review-to-done merge timestamp, or null when not released. */
  releasedAt: string | null;
  /** A live engineer (or fix-up) agent process is attached. */
  running: boolean;
  /** Waiting for a free maxConcurrentAgents slot. */
  queuedForAgent: boolean;
  /** The agent asked for review; finalization is pending the turn end. */
  handoffRequested: boolean;
  /** Handoff finalization (commit + checks) is running. */
  handoffFinalizing: boolean;
  /** A self-check / local check run is in progress. */
  checkRunning: boolean;
  /** Waiting for a check slot (local queue or remote pool queue). */
  checkQueued: boolean;
  checkProgress: PipelineCheckProgress | null;
  /** The automatic reviewer is actively inspecting the worktree. */
  reviewRunning: boolean;
  /** Move to done is queued or running in the integration pipeline. */
  closeoutActive: boolean;
  closeoutQueued: boolean;
  /** The close-out job has gone quiet past the stall threshold. */
  closeoutStalled: boolean;
  /**
   * The worker is stalled: agent silent past the stuck window, a stalled
   * check, stalled remote validation, or a telemetry mismatch. The caller
   * derives this the same way the board card does (its `tc-stuck` hint).
   */
  stuck: boolean;
  /** The agent is waiting on the human (questions, flags, failed runs). */
  needsInput: boolean;
  /** Held out of ALL automation — dims the card, keeps its stage. */
  held: boolean;
  /** Completed review passes (`extra.review_passes` in the task panel). */
  reviewPasses: number;
  /** Auto-bounce rounds (`extra.review_rounds` in the task panel). */
  reviewRounds: number;
}

export interface PipelineCardModel {
  stage: PipelineStage;
  state: PipelineCardState;
  stepLabel: string;
  /** How often review sent the task back to coding. Drives the amber note. */
  sentBackCount: number;
  /** Held and paused cards render dimmed. */
  dimmed: boolean;
}

function progressSuffix(p: PipelineCheckProgress | null): string {
  if (p?.done != null && p?.total != null && p.total > 0) return ` ${p.done}/${p.total}`;
  return "";
}

/**
 * How often review sent this task back to coding. Auto-bounces are counted
 * exactly (`review_rounds`); a task back in `active` with completed passes
 * but no bounce counter (manual "Review again" / older records) counts once.
 * A task still in `review` was never sent back by the pass it is showing.
 */
export function pipelineSentBackCount(input: Pick<
  PipelineTaskInput,
  "status" | "reviewPasses" | "reviewRounds"
>): number {
  if (input.reviewRounds > 0) return input.reviewRounds;
  if (input.status === "active" && input.reviewPasses > 0) return 1;
  return 0;
}

/** True when the task belongs on the track right now. */
export function isPipelineVisible(
  input: Pick<PipelineTaskInput, "status" | "releasedAt" | "updatedAt">,
  nowMs: number,
): boolean {
  if (input.status === "active" || input.status === "review") return true;
  if (input.status !== "done") return false;
  const at = Date.parse(input.releasedAt ?? input.updatedAt ?? "");
  if (!Number.isFinite(at)) return false;
  return nowMs - at <= PIPELINE_MERGED_WINDOW_MS;
}

/** Map one task to its stage column, card state and step label. */
export function resolvePipelineCard(
  input: PipelineTaskInput,
  _nowMs: number,
): PipelineCardModel {
  const sentBackCount = pipelineSentBackCount(input);

  if (input.status === "done") {
    return { stage: "merged", state: "merged", stepLabel: "Merged", sentBackCount, dimmed: false };
  }
  if (input.held) {
    // Held keeps the stage where it parked — resolve the stage first so a
    // held task still reads positionally, then layer the held state on top.
    const parked = resolvePipelineCard({ ...input, held: false }, _nowMs);
    return { ...parked, state: "held", dimmed: true };
  }

  let stage: PipelineStage;
  let stepLabel: string;
  if (input.closeoutActive || input.closeoutQueued) {
    stage = "closeout";
    stepLabel = input.closeoutStalled
      ? "Close-out stalled"
      : input.closeoutActive
        ? "Merging"
        : "Queued for close-out";
  } else if (input.status === "review") {
    stage = "review";
    stepLabel = input.reviewRunning ? "Reviewing…" : "In review";
  } else if (input.handoffFinalizing || input.handoffRequested) {
    // Handoff finalization IS a check run under the hood, but the user asked
    // for review — "Confirming handoff" is the honest step, with progress
    // appended when the gate reports it. See docs/pipeline-stage-mapping.md.
    stage = "handoff";
    stepLabel = `Confirming handoff${progressSuffix(input.checkProgress)}`;
  } else if (input.checkRunning || input.checkQueued) {
    stage = "checks";
    stepLabel = input.checkQueued
      ? "Queued for checks"
      : `Running checks${progressSuffix(input.checkProgress)}`;
  } else {
    stage = "coding";
    stepLabel = input.running ? "Coding" : input.queuedForAgent ? "Queued" : "Paused";
  }

  let state: PipelineCardState = "ok";
  let dimmed = false;
  if (input.stuck) state = "stuck";
  else if (input.needsInput) state = "needs-input";
  else if (input.status === "active" && !input.running && !input.queuedForAgent) state = "paused";
  if (state === "paused") dimmed = true;

  return { stage, state, stepLabel, sentBackCount, dimmed };
}

const PIPELINE_PRIORITY_RANK: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

function laneTimeMs(t: Pick<PipelineTaskInput, "createdAt" | "id">): number {
  const at = Date.parse(t.createdAt ?? "");
  // Tasks without a timestamp sort after dated ones, stably by id.
  return Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER;
}

/**
 * Lane order: priority first, then time in flight — the longest-running task
 * (oldest `created_at`) rides at the top so a stale lane is visible without
 * scrolling. Ties break by id so the order is stable frame to frame.
 */
export function sortPipelineLanes<T extends Pick<
  PipelineTaskInput,
  "priority" | "createdAt" | "id"
>>(tasks: readonly T[]): T[] {
  return [...tasks].sort((a, b) => {
    const pa = PIPELINE_PRIORITY_RANK[a.priority] ?? 99;
    const pb = PIPELINE_PRIORITY_RANK[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = laneTimeMs(a);
    const tb = laneTimeMs(b);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Compact elapsed time for "time in this state", e.g. "12m". Never a fake
 * percentage — just how long the state timestamp is ago.
 */
export function formatPipelineElapsed(sinceIso: string | null | undefined, nowMs: number): string {
  const at = Date.parse(sinceIso ?? "");
  if (!Number.isFinite(at)) return "—";
  const sec = Math.max(0, Math.floor((nowMs - at) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}
