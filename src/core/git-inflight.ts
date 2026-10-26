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

export interface GitCallEvent {
  id: number;
  label: string;
  root: string;
  startedAt: number;
  end: boolean;
}

let sink: ((event: GitCallEvent) => void) | null = null;

/** Worker children report calls to the HTTP process; the parent has no other view. */
export function setGitCallSink(next: ((event: GitCallEvent) => void) | null): void {
  sink = next;
}

/** Register one actual git child. The returned cleanup is idempotent. */
export function trackGitCall(root: string, args: string[]): () => void {
  const id = nextId++;
  const startedAt = Date.now();
  const label = `git ${args.join(" ")}`.slice(0, 240);
  calls.set(id, { id, root, label, startedAt, state: "running" });
  sink?.({ id, label, root, startedAt, end: false });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    calls.delete(id);
    sink?.({ id, label, root, startedAt, end: true });
  };
}

export function inFlightGitCalls(now = Date.now()): InFlightGitCall[] {
  return [...calls.values()]
    .map((call) => ({ ...call, ageMs: Math.max(0, now - call.startedAt) }))
    .sort((a, b) => a.startedAt - b.startedAt);
}
