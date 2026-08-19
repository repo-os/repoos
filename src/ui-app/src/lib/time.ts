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
