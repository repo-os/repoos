/**
 * What a `repoos check` run waited on before its first step (#0974).
 *
 * A check can sit silently for a long time before any work starts: the
 * pressure guard (`waitForPressureRelief`), a cross-process heavy slot, or a
 * serialized local fallback. The 2026-10-28 incident (#0970) was a handoff
 * check that sat 26 minutes at 0% CPU behind a stale branch-local pressure
 * guard with nothing on the task card. The gates already emit `[pressure]` /
 * `[queue]` status lines and write queue markers; this recorder turns those
 * lines into (a) a human-readable "waiting: <reason> for Nm" trail on stdout —
 * which the handoff transcript captures — and (b) a `waited` fact persisted on
 * the run's CheckRunRecord. A wait that crosses ten minutes reminds the
 * engineer to keep waiting.
 * Queueing is normal and does not itself request human input.
 */

/** How often the "still waiting" line repeats while the wait continues. */
export const CHECK_WAIT_REMINDER_MS = 60_000;

/** A long normal wait gets an explicit keep-waiting reminder. */
export const CHECK_WAIT_REMINDER_THRESHOLD_MS = 10 * 60_000;

/** Missing holder heartbeats for this long indicate an abnormal wait. */
export const CHECK_WAIT_STALLED_MS = 30 * 60_000;

export interface CheckWait {
  /** Latest observed reason, verbatim from the gate's status line. */
  reason: string;
  /** Wall clock when the first wait line was seen. */
  startedAt: number;
  /** Wall clock when the wait ended (slot acquired); absent while waiting. */
  endedAt?: number;
}

export interface CheckWaitRecorder {
  /** Feed each gate status line (`[pressure] …`, `[queue] …`) here. */
  onStatusLine(line: string): void;
  /** Snapshot when the wait is over; null when the run never waited. */
  finish(): CheckWait | null;
  /** Total wait for the just-finished run, 0 when it never waited. */
  waitedMs(): number;
}

export function createCheckWaitRecorder(
  emit: (line: string) => void,
  now: () => number = Date.now,
): CheckWaitRecorder {
  let current: CheckWait | null = null;
  let lastAnnouncedAt = 0;
  let announcedLongWait = false;
  return {
    onStatusLine(line: string): void {
      const reason = line.trim();
      if (!reason) return;
      if (!current) {
        current = { reason, startedAt: now() };
        lastAnnouncedAt = current.startedAt;
        emit(`waiting: ${reason}`);
        return;
      }
      current.reason = reason;
      const waitedMs = now() - current.startedAt;
      if (now() - lastAnnouncedAt >= CHECK_WAIT_REMINDER_MS) {
        lastAnnouncedAt = now();
        emit(`waiting: ${reason} for ${formatWaitDuration(waitedMs)}`);
      }
      if (!announcedLongWait && waitedMs >= CHECK_WAIT_REMINDER_THRESHOLD_MS) {
        announcedLongWait = true;
        emit(
          `waiting: ${reason} for ${formatWaitDuration(waitedMs)} — ` +
            "queued checks are normal — keep waiting; do not end your turn",
        );
      }
    },
    finish(): CheckWait | null {
      if (!current) return null;
      return { ...current, endedAt: now() };
    },
    waitedMs(): number {
      if (!current) return 0;
      return Math.max(0, now() - current.startedAt);
    },
  };
}

/** Compact "for Nm"-style duration: 42s / 7m / 1h 05m. */
export function formatWaitDuration(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}
