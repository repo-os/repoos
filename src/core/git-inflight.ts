/** Process-local registry used by HTTP stuck-request diagnostics. */
export interface InFlightGitCall {
  id: number;
  label: string;
  root: string;
  startedAt: number;
  ageMs: number;
  state: "running" | "queued";
}

const calls = new Map<number, Omit<InFlightGitCall, "ageMs">>();
let nextId = 1;

/** Register one actual git child. The returned cleanup is idempotent. */
export function trackGitCall(root: string, args: string[]): () => void {
  const id = nextId++;
  calls.set(id, {
    id,
    root,
    label: `git ${args.join(" ")}`.slice(0, 240),
    startedAt: Date.now(),
    state: "running",
  });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    calls.delete(id);
  };
}

export function inFlightGitCalls(now = Date.now()): InFlightGitCall[] {
  return [...calls.values()]
    .map((call) => ({ ...call, ageMs: Math.max(0, now - call.startedAt) }))
    .sort((a, b) => a.startedAt - b.startedAt);
}
