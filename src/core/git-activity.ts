/**
 * Process-wide "RepoOS just changed git state" notifications (#0584).
 *
 * The sidebar's git-state indicator is server-owned and pushed over SSE, and
 * one of its trigger classes is *RepoOS's own* commits and merges: those
 * move `main` (or the checked-out branch) without necessarily tripping a
 * working-tree event on a path anyone is watching — a `docs(NNNN): task file`
 * commit leaves the tree clean and the refs updated a few milliseconds later.
 *
 * `src/core/git.ts` cannot emit an SSE frame itself (core has no server), so
 * it notifies here and the server subscribes. Deliberately tiny: a `Set` of
 * listeners, synchronous fan-out, listener errors swallowed — a broken
 * subscriber must never turn a successful commit into a failure.
 *
 * This is a *signal to recompute*, not the state itself. The subscriber
 * debounces and coalesces before it spawns any git process, and only emits an
 * SSE event when the recomputed state actually differs.
 */
export type GitMutationKind =
  /** A commit landed (`commitFiles`, `commitDirtyFiles`, checkpoint commits). */
  | "commit"
  /** A merge landed (`mergeBranch`, close-out publish). */
  | "merge"
  /** HEAD moved to another ref (checkout, reset). */
  | "checkout";

export type GitMutationListener = (root: string, kind: GitMutationKind) => void;

const listeners = new Set<GitMutationListener>();

/**
 * Subscribe to RepoOS-initiated git mutations. Returns an unsubscribe function
 * (tests use it to keep one case from leaking into the next).
 */
export function onGitMutation(listener: GitMutationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Report a mutation that just completed in `root` (a checkout path). */
export function notifyGitMutation(root: string, kind: GitMutationKind): void {
  for (const listener of listeners) {
    try {
      listener(root, kind);
    } catch {
      /* a subscriber must never break the git operation it is watching */
    }
  }
}

/** Test hook: drop every subscriber. */
export function clearGitMutationListeners(): void {
  listeners.clear();
}
