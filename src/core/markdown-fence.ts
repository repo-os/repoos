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

/**
 * For each line: true when it is a fence delimiter or sits inside a closed
 * fenced block. An opener with no matching close before EOF is plain text
 * (one stray fence must not hide every later heading), so all scanners that
 * need fence awareness share this one mask.
 */
export function markdownFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = new Array(lines.length).fill(false);
  let i = 0;
  while (i < lines.length) {
    const open = markdownFenceOpen(lines[i]!.trim());
    if (!open) {
      i++;
      continue;
    }
    let close = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (isMarkdownFenceClose(lines[j]!.trim(), open)) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      i++; // unclosed opener: plain text
      continue;
    }
    for (let k = i; k <= close; k++) mask[k] = true;
    i = close + 1;
  }
  return mask;
}
