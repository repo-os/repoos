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

/**
 * The opening fence marker on a (trimmed) line, or null. CommonMark: a backtick
 * fence's info string may not contain a backtick, so ```` ```inline``` text ````
 * is inline code, not a fence.
 */
export function markdownFenceOpen(trimmedStart: string): string | null {
  const m = /^(`{3,}|~{3,})(.*)$/.exec(trimmedStart);
  if (!m) return null;
  if (m[1]![0] === "`" && m[2]!.includes("`")) return null;
  return m[1]!;
}

/** For each line: true when it is a fence delimiter or sits inside a fenced block. */
export function markdownFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let fence = "";
  for (const line of lines) {
    const t = line.trim();
    if (fence) {
      mask.push(true);
      if (isMarkdownFenceClose(t, fence)) fence = "";
      continue;
    }
    const open = markdownFenceOpen(t);
    if (open) {
      fence = open;
      mask.push(true);
      continue;
    }
    mask.push(false);
  }
  return mask;
}
