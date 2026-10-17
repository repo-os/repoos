/**
 * Project history for a routing candidate (#0812), read from the project's own
 * sessions data.
 *
 * The decision model is told how a candidate has actually performed **in this
 * project** for the role being routed — success and failure rate, average
 * tokens, turns, cost, and how many review passes its work needed. This is the
 * project's data (the repo the task lives in), deliberately not RepoOS's own,
 * because a model that works here need not work in another project.
 *
 * Fail-soft: any missing table, absent SQLite, or empty result yields null, and
 * the candidate simply carries no history rather than a fabricated zero.
 */
import type { RepoOSDb, SessionRecord } from "../core/db.js";
import type { ProjectRoleHistory } from "../core/model-routing/facts.js";

/** Session types that represent a review round. */
const REVIEW_SESSION_TYPES = ["reviewer", "review"];

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Non-null numbers only — a CLI that reported nothing contributes nothing. */
function numbers(values: Array<number | null | undefined>): number[] {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

/**
 * Build the history from already-fetched session rows (pure, so it is
 * unit-testable without a database). Returns null when there are no runs.
 */
export function historyFromSessions(
  rows: SessionRecord[],
  reviewCountsByTask: Map<string, number> = new Map(),
): ProjectRoleHistory | null {
  if (rows.length === 0) return null;
  const runs = rows.length;
  const failures = rows.filter((r) => r.status === "errored").length;
  const successRate = (runs - failures) / runs;

  // Only real spend counts; a legacy `estimate` row is not a cost (#0676).
  const costs = rows
    .filter((r) => r.costUsd != null && r.costSource !== "estimate")
    .map((r) => r.costUsd as number);

  // Average review passes per task the candidate worked on. A task with no
  // review sessions counts as zero — that is a known fact, not a missing one.
  const taskIds = [...new Set(rows.map((r) => r.taskId).filter((t): t is string => !!t))];
  const avgReviewPasses =
    taskIds.length === 0 ? null : mean(taskIds.map((t) => reviewCountsByTask.get(t) ?? 0));

  return {
    runs,
    successRate,
    failureRate: 1 - successRate,
    avgTokens: mean(numbers(rows.map((r) => r.totalTokens))),
    avgTurns: mean(numbers(rows.map((r) => r.turns))),
    avgCostUsd: mean(costs),
    avgReviewPasses,
  };
}

/** Read the project history for one candidate + role from the sessions DB. */
export function candidateHistory(
  db: RepoOSDb | null,
  role: string,
  cli: string,
  model: string,
): ProjectRoleHistory | null {
  if (!db) return null;
  try {
    const rows = db.getCandidateSessions(cli, model, role);
    if (rows.length === 0) return null;
    const taskIds = [...new Set(rows.map((r) => r.taskId).filter((t): t is string => !!t))];
    const reviewCounts = db.getTaskSessionTypeCounts(taskIds, REVIEW_SESSION_TYPES);
    return historyFromSessions(rows, reviewCounts);
  } catch {
    return null;
  }
}
