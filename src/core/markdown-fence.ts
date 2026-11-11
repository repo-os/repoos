/**
 * CommonMark fence helpers — a closing fence is the same marker run with only
 * trailing whitespace (no info string on the closing line).
 */
export function isMarkdownFenceClose(trimmedStart: string, openFence: string): boolean {
  if (!openFence) return false;
  const ch = openFence[0];
  const min = openFence.length;
  if (ch === "`") return new RegExp(`^\`{${min},}\\s*$`).test(trimmedStart);
  return new RegExp(`^~{${min},}\\s*$`).test(trimmedStart);
}
