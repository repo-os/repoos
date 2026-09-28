import type { NotificationSeverity } from "./types.js";

/** Legacy shared shape for one-line ntfy messages — headline + severity + optional subtitle. */
export interface NotificationSpec {
  headline: string;
  severity: NotificationSeverity;
  subtitle?: string;
}

/** Truncate title to fit on one line with the headline. Aim for ~50 chars total. */
function truncateTitle(title: string, headlineLen: number): string {
  const maxLen = 50 - headlineLen - 3; // 3 for " · "
  if (title.length <= maxLen) return title;
  return title.slice(0, Math.max(1, maxLen - 1)) + "…";
}

/** Format a notification spec into the final ntfy/plaintext message string. */
export function formatNotification(spec: NotificationSpec, title: string): string {
  const truncated = truncateTitle(title, spec.headline.length);
  const message = `${spec.headline} · ${truncated}`;
  if (spec.subtitle) {
    return `${message}\n${spec.subtitle}`;
  }
  return message;
}

export function specFromPayload(payload: {
  headline: string;
  severity: NotificationSeverity;
  subtitle?: string;
}): NotificationSpec {
  return {
    headline: payload.headline,
    severity: payload.severity,
    subtitle: payload.subtitle,
  };
}
