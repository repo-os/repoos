/**
 * The canonical status-transition table (lifecycle audit, #0295-adjacent).
 *
 * Before this, `patchTaskFile` accepted any `(from, to)` status pair with no
 * rule about which ones make sense — reachable from the task-panel dropdown,
 * board drag-drop, and a direct PATCH, none of which know an agent might be
 * running or a review mid-flight. This module is the single reference for
 * which edges are legitimate and, of those, which are safe to perform as a
 * bare metadata write versus which require a dedicated action endpoint
 * (start/pause/done/abandon/reopen) because they carry real side effects
 * (spawning or stopping an agent, running the close-out pipeline).
 *
 * Twelve edges total. Six are cheap enough (no side effect beyond the write
 * itself, or a side effect — `guardReviewTransition` — that already runs
 * safely inline within a PATCH request) to allow through the generic patch
 * path; those are `GENERIC_PATCH_EDGES` below. The other six — spawning an
 * agent, running the close-out pipeline, stopping a live agent/review, or
 * re-provisioning a deleted worktree — each already have (or, for the two
 * new ones, now have) their own `/api/tasks/:id/<action>` endpoint that
 * performs the effect and writes the status as part of the same request.
 * `GENERIC_PATCH_EDGES` is the enforcement point for the *other* six: they
 * are rejected outright, from every generic-write caller (PATCH, the task
 * drawer's dropdown, board drag-drop), no matter how the request arrives.
 *
 * `reopen` (done -> active in the original design sketch) lands on `ready`
 * instead: the close-out pipeline deletes the task's branch and worktree, so
 * re-provisioning them is exactly what `/start` (ready -> active) already
 * does. Landing reopen on `ready` reuses that machinery instead of
 * duplicating it.
 */
import type { Status } from "../core/types.js";

export interface TransitionEdge {
  /** Human-readable one-liner: what happens when this edge fires. */
  effect: string;
  /** Where this edge is actually performed. */
  via:
    | "generic-patch"
    | "action:start"
    | "action:done"
    | "action:pause"
    | "action:abandon"
    | "action:reopen"
    | "automated";
}

/** The full 12-edge allow-list. Absence of a `(from, to)` pair here means the
 *  transition is rejected, from every caller, with no exceptions. */
export const TRANSITIONS: Partial<Record<Status, Partial<Record<Status, TransitionEdge>>>> = {
  draft: {
    inbox: { effect: "none", via: "generic-patch" },
  },
  inbox: {
    draft: { effect: "none", via: "generic-patch" },
    ready: { effect: "none", via: "generic-patch" },
  },
  ready: {
    inbox: { effect: "none", via: "generic-patch" },
    active: {
      effect: "provision branch/worktree if new; clear needsInput; spawn agent",
      via: "action:start",
    },
  },
  active: {
    active: { effect: "resume agent on existing worktree", via: "action:start" },
    review: {
      effect: "commit + validate diff; auto-sync branch; kick off automatic review",
      via: "generic-patch",
    },
    ready: { effect: "stop agent if running; worktree kept, not deleted", via: "action:abandon" },
  },
  review: {
    active: {
      effect: "resume engineer with reviewer feedback as instruction",
      via: "generic-patch",
    },
    done: {
      effect: "close-out job: merge, build, check, cleanup worktree+branch",
      via: "action:done",
    },
    ready: { effect: "cancel running review; worktree kept, not deleted", via: "action:abandon" },
  },
  done: {
    ready: {
      effect:
        "clear stale branch reference + needsInput; re-provisioning happens on the next Start",
      via: "action:reopen",
    },
  },
};

/** Edges the generic write path (PATCH /api/tasks/:id, and therefore the task
 *  drawer's status dropdown and board drag-drop) may perform directly. Every
 *  other edge above requires its dedicated action endpoint. */
const GENERIC_PATCH_EDGES = new Set<string>(
  (Object.entries(TRANSITIONS) as [Status, Partial<Record<Status, TransitionEdge>>][]).flatMap(
    ([from, tos]) =>
      (Object.entries(tos ?? {}) as [Status, TransitionEdge][])
        .filter(([, edge]) => edge.via === "generic-patch")
        .map(([to]) => `${from}->${to}`),
  ),
);

/** Where a rejected target status should actually be requested, for a useful error message. */
const SUGGESTED_ACTION: Partial<Record<Status, string>> = {
  active: "POST /api/tasks/:id/start",
  done: "POST /api/tasks/:id/done",
};

/**
 * Whether a bare status write (no accompanying action) from `from` to `to`
 * is allowed. `from === to` is always fine (no-op). Returns a reason and a
 * pointer to the right endpoint when rejected.
 */
export function checkGenericStatusPatch(
  from: Status,
  to: Status,
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true };
  const edge = TRANSITIONS[from]?.[to];
  if (!edge) {
    return {
      ok: false,
      reason: `cannot move a task from "${from}" directly to "${to}" — no such transition exists`,
    };
  }
  if (edge.via !== "generic-patch") {
    const suggestion = SUGGESTED_ACTION[to];
    return {
      ok: false,
      reason: `"${from}" → "${to}" requires ${suggestion ?? `the ${edge.via.replace("action:", "")} action`}, not a direct status write`,
    };
  }
  return { ok: true };
}
