/**
 * Build remote task activity snapshots for the active-task card (#1000).
 */
import type { RemoteHostStatus, RemoteTaskActivity, RemoteValidator } from "./remote-validation.js";

/** Find host-lock holder/waiter rows for a task across probed hosts. */
export function hostLockJobsForTask(
  hosts: RemoteHostStatus[] | undefined,
  taskId: string,
): { holding: boolean; waiting: boolean; host: string; phase: string; ageSecs: number } | null {
  if (!hosts?.length) return null;
  for (const h of hosts) {
    const lock = h.hostLock;
    if (!lock) continue;
    for (const job of lock.holders) {
      if (job.taskId === taskId) {
        return {
          holding: true,
          waiting: false,
          host: h.host,
          phase: job.phase,
          ageSecs: job.ageSecs,
        };
      }
    }
    for (const job of lock.waiters) {
      if (job.taskId === taskId) {
        return {
          holding: false,
          waiting: true,
          host: h.host,
          phase: job.phase,
          ageSecs: job.ageSecs,
        };
      }
    }
  }
  return null;
}

/**
 * When host-lock telemetry shows this task on a host but the server run registry
 * does not, surface an abnormal state (#0998).
 */
export function remoteTelemetryMismatch(
  taskId: string,
  activity: RemoteTaskActivity | null,
  hosts: RemoteHostStatus[] | undefined,
  registeredRun: boolean,
): string | null {
  if (activity?.run || activity?.queue) return null;
  if (registeredRun) return null;
  const lock = hostLockJobsForTask(hosts, taskId);
  if (!lock) return null;
  const verb = lock.holding
    ? "holds an SSH validation slot"
    : "is queued for an SSH validation slot";
  return (
    `Host ${lock.host} still ${verb} for #${taskId} (${lock.phase}, ${lock.ageSecs}s) ` +
    "but the runner registry shows idle — investigate before restarting."
  );
}

/** Remote activity for the task card, including host-lock mismatch detail (#1000). */
export function taskRemoteActivityForCard(
  taskId: string,
  remoteValidator: RemoteValidator | undefined,
): RemoteTaskActivity | null {
  const base = remoteValidator?.taskActivity?.(taskId) ?? null;
  const registered = (remoteValidator?.activeRemoteRuns?.() ?? []).some((r) => r.taskId === taskId);
  const hosts = remoteValidator?.hostStatus?.();
  const telemetryMismatch = remoteTelemetryMismatch(taskId, base, hosts, registered);
  if (!base && !telemetryMismatch) return null;
  return {
    run: base?.run ?? null,
    queue: base?.queue ?? null,
    telemetryMismatch,
  };
}

export function taskHasBlockingCheckOrRemote(
  taskId: string,
  getRuns: (id: string) => { running: boolean }[],
  remoteValidator: RemoteValidator | undefined,
): boolean {
  if (getRuns(taskId).some((r) => r.running)) return true;
  const remote = taskRemoteActivityForCard(taskId, remoteValidator);
  return !!(remote?.run || remote?.queue || remote?.telemetryMismatch);
}
