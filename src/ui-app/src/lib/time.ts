/**
 * Human-relative age of a timestamp, e.g. "just now", "10 seconds ago",
 * "3 minutes ago", "48 hours ago". Returns "unknown" when the input is
 * missing or unparseable so the UI can fall back gracefully.
 */
export function relTime(buildAt: string | null | undefined, now: Date = new Date()): string {
  if (!buildAt) return "unknown";
  const t = new Date(buildAt).getTime();
  if (Number.isNaN(t)) return "unknown";
  const sec = Math.max(0, Math.floor((now.getTime() - t) / 1000));
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  if (hr <= 48) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "1 day ago" : `${day} days ago`;
}

/**
 * Compact elapsed duration for live stopwatches, e.g. "0s", "42s",
 * "3m 07s", "1h 04m". Negative or non-finite inputs clamp to "0s".
 */
export function formatDuration(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Local clock time of an ISO timestamp for chat message bubbles, e.g.
 * "3:42 PM". Returns an empty string when the input is missing or unparseable
 * so the UI can hide the timestamp gracefully (legacy transcripts have none).
 */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
