import {
  parseRemotePoolQueueMessage,
  type RemotePoolQueueInfo,
} from "../../../core/remote-pool-queue.js";

/** Latest pool-queue line from buffered check / handoff output (#0706). */
export function remotePoolQueueFromOutput(output: string): RemotePoolQueueInfo | null {
  return parseRemotePoolQueueMessage(output);
}

/** Card / chip copy when a run is waiting on the Tailscale pool, not stuck. */
export function remotePoolQueueHint(output: string): { label: string; title: string } | null {
  const q = remotePoolQueueFromOutput(output);
  if (!q) return null;
  const label = q.host
    ? `waiting for runner on ${q.host} (position ${q.position})`
    : `waiting for runner (position ${q.position})`;
  const where = q.host ? `queued on ${q.host}` : "queued while eligible hosts recover";
  return {
    label,
    title:
      `Remote validation is ${where} — ${q.ahead} other run(s) ahead in the pool. ` +
      "Every eligible host is at capacity or recovering; this is expected, not a stuck agent.",
  };
}

/** Scan in-flight server-tracked check output for a task. */
export function remotePoolQueueHintForTaskChecks(
  runs: Array<{ running: boolean; output: string }> | undefined,
): { label: string; title: string } | null {
  if (!runs) return null;
  for (const run of runs) {
    if (!run.running) continue;
    const hint = remotePoolQueueHint(run.output);
    if (hint) return hint;
  }
  return null;
}
