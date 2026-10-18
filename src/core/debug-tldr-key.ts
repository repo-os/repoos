/**
 * `debug_tldr_key` fingerprints (#0570) must stay plain UTF-8 text in task
 * frontmatter — NUL separators (#0835) made git treat task files as binary.
 */

/** Visible separator between fingerprint segments (never a control character). */
export const DEBUG_TLDR_KEY_SEP = "|";

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Strip control characters from a single segment (reason, detail, …). */
function sanitizeSegment(part: string): string {
  return part.replace(CONTROL_CHARS, "");
}

function joinParts(...parts: string[]): string {
  return parts.map(sanitizeSegment).join(DEBUG_TLDR_KEY_SEP);
}

/**
 * Canonical on-disk / in-memory form: legacy NUL keys become `|`, and any
 * other control characters are removed.
 */
export function normalizeDebugTldrKey(key: string): string {
  return sanitizeSegment(key.replace(/\u0000/g, DEBUG_TLDR_KEY_SEP));
}

export function debugTldrKeysEqual(
  a: string | undefined,
  b: string | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return normalizeDebugTldrKey(a) === normalizeDebugTldrKey(b);
}

/** Stable fingerprint of the failure a tl;dr describes, for dedupe. */
export function tldrFingerprint(reason: string, detail: string | undefined): string {
  return joinParts(reason, detail ?? "");
}

/** Stable fingerprint for a Move-to-done error card tl;dr (#0595). */
export function doneErrorTldrFingerprint(
  step: string,
  message: string,
  detail: string | undefined,
): string {
  return joinParts("done-error", step, message, detail ?? "");
}

/** True when the string is safe to persist in YAML frontmatter (no control chars). */
export function isTextSafeFrontmatterValue(value: string): boolean {
  return !CONTROL_CHARS.test(value);
}
