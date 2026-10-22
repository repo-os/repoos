import type { LocalQueueMarker } from "../../../core/local-queue-marker.js";

export interface LocalQueueHint {
  label: string;
  title: string;
}

export function localQueueHintForTask(
  markers: LocalQueueMarker[] | undefined,
  taskId: string,
): LocalQueueHint | null {
  if (!markers?.length) return null;
  const m = markers.find((x) => x.taskId === taskId);
  if (!m) return null;
  const pos = m.position > 1 ? ` #${m.position}` : "";
  if (m.kind === "local-check") {
    return {
      label: `queued${pos}`,
      title: m.message || "waiting for a local check slot",
    };
  }
  if (m.kind === "playwright") {
    return {
      label: `queued${pos}`,
      title: m.message || "waiting for a Playwright slot",
    };
  }
  return {
    label: "queued · pressure",
    title: m.message,
  };
}
