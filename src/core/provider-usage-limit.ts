/** Usage/quota failures are distinct from ordinary agent crashes. */
export interface ProviderUsageLimit {
  reason: string;
  retryAt?: string;
}

const LIMIT_PATTERNS = [
  /\b(?:usage|rate|request|quota)\s+limit\s+(?:has\s+been\s+)?(?:exceeded|reached)\b/i,
  /\b(?:exceeded|reached)\b.*\b(?:usage|quota)\s+limit\b/i,
  /\b(?:out of|exceeded|reached)\s+(?:your\s+)?(?:usage|credits?|quota)\b/i,
  /\b429\s*(?:too many requests|rate.?limit|quota|usage)?\b/i,
  /\bHTTP\s+429\b/i,
  // Codex: "You've hit your usage limit ... try again at 9:07 PM".
  /\bhit\s+your\s+usage\s+limit\b/i,
  // Antigravity/Gemini: "Individual quota reached", "RESOURCE_EXHAUSTED".
  /\bquota\s+(?:reached|exceeded|exhausted)\b/i,
  /\bRESOURCE_EXHAUSTED\b/,
];

/** "Resets in 147h15m0s" → ms, or null. */
function parseResetsIn(text: string): number | null {
  const m = text.match(/\bresets?\s+in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000;
}

/** "try again at 9:07 PM" → the next local occurrence of that clock time, or null. */
function parseTryAgainAt(text: string, now: number): number | null {
  const m = text.match(/\btry\s+again\s+at\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/**
 * A recorded usage-limit probe whose error only restates a known quota pause.
 * Mission Control's recent-failures list omits these so they do not bury
 * real session failures.
 */
export function isUsageLimitProbeConfirmation(session: {
  sessionType: string;
  errorReason?: string | null;
}): boolean {
  return (
    session.sessionType === "usage-limit-probe" &&
    detectProviderUsageLimit(session.errorReason ?? "") !== null
  );
}

/** Classify explicit quota and HTTP 429 output across supported CLIs. */
export function detectProviderUsageLimit(output: string): ProviderUsageLimit | null {
  const text = output.replace(/\u0000/g, " ").trim();
  if (!text || !LIMIT_PATTERNS.some((pattern) => pattern.test(text))) return null;
  const retry = text.match(
    /(?:retry[- ]after|reset(?:s|s at| time)?|resets? at)\s*[:=]?\s*(\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?|\d{1,10})/i,
  );
  let retryAt: string | undefined;
  if (retry?.[1]) {
    const raw = retry[1];
    const timestamp = /^\d{1,10}$/.test(raw) ? Date.now() + Number(raw) * 1000 : Date.parse(raw);
    if (Number.isFinite(timestamp)) retryAt = new Date(timestamp).toISOString();
  }
  if (!retryAt) {
    const now = Date.now();
    const resetsIn = parseResetsIn(text);
    const at = resetsIn !== null ? now + resetsIn : parseTryAgainAt(text, now);
    if (at !== null) retryAt = new Date(at).toISOString();
  }
  return { reason: text.slice(0, 500), ...(retryAt ? { retryAt } : {}) };
}
