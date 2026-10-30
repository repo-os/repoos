import type { LocalQueueMarker } from "../../../core/local-queue-marker.js";
import { formatDuration } from "./time.js";

export interface LocalQueueHint {
  label: string;
  title: string;
}

/**
 * Hint for a task whose check is waiting — on the pressure guard, a heavy
 * slot or a Playwright slot. #0974: the chip must show how long the wait has
 * been going ("waiting · 4m"), not just that it exists; the tooltip spells
 * out "waiting: <reason> for Nm" so a 26-minute silent wait (#0970) is
 * visible at a glance.
 */
export function localQueueHintForTask(
  markers: LocalQueueMarker[] | undefined,
  taskId: string,
  now: Date = new Date(),
): LocalQueueHint | null {
  if (!markers?.length) return null;
  const m = markers.find((x) => x.taskId === taskId);
  if (!m) return null;
  const startedMs = Date.parse(m.since);
  const waitedMs = Number.isFinite(startedMs) ? Math.max(0, now.getTime() - startedMs) : 0;
  const duration = formatDuration(waitedMs);
  const pos = m.position > 1 ? ` #${m.position}` : "";
  const message = m.message || "for a free slot";
  const reason = /^waiting\b/i.test(message) ? message : `waiting: ${message}`;
  return {
    label: `${m.kind === "pressure" ? `waiting: ${message}` : m.kind === "playwright" ? "waiting for a browser slot" : "waiting for a check slot"}${pos} · ${duration}`,
    title: `${reason} for ${duration}`,
  };
}
