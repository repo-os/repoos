/** Usage/quota failures are distinct from ordinary agent crashes. */
export interface ProviderUsageLimit {
  reason: string;
  retryAt?: string;
}

const LIMIT_PATTERNS = [
  /\b(?:usage|rate|request|quota)\s+limit\s+(?:has\s+been\s+)?(?:exceeded|reached)\b/i,
  /\b(?:out of|exceeded|reached)\s+(?:your\s+)?(?:usage|credits?|quota)\b/i,
  /\b429\s*(?:too many requests|rate.?limit|quota|usage)?\b/i,
  /\bHTTP\s+429\b/i,
];

/** Classify explicit quota and HTTP 429 output across supported CLIs. */
export function detectProviderUsageLimit(output: string): ProviderUsageLimit | null {
  const text = output.replace(/\u0000/g, " ").trim();
  if (!text || !LIMIT_PATTERNS.some((pattern) => pattern.test(text))) return null;
  const retry = text.match(
    /(?:retry[- ]after|reset(?:s|s at| time)?|resets? at)\s*[:=]?\s*(\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d)?(?:\.\d+)?Z?)/i,
  );
  const retryAt = retry?.[1] ? new Date(retry[1]).toISOString() : undefined;
  return { reason: text.slice(0, 500), ...(retryAt ? { retryAt } : {}) };
}
