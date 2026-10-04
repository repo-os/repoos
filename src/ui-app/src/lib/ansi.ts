/**
 * Minimal ANSI SGR renderer for streamed check output. Splits text into styled
 * segments (rendered as spans — never `v-html`). The ESC byte is optional: it
 * is sometimes lost between the child process and the browser, leaving a bare
 * `[32m`, so both forms are recognised.
 */
export interface AnsiSegment {
  text: string;
  /** CSS color token name (`green`, `red`, …) or null for default. */
  color: string | null;
  bold: boolean;
  dim: boolean;
}

const COLORS: Record<number, string> = {
  30: "txt-dim",
  31: "red",
  32: "green",
  33: "amber",
  34: "cyan",
  35: "violet",
  36: "cyan",
  37: "txt",
};

// eslint-disable-next-line no-control-regex
const SGR = /\u001b?\[((?:\d{1,3}(?:;\d{1,3})*)?)m/g;
// Any other CSI sequence (cursor moves, erase line) is noise here.
// eslint-disable-next-line no-control-regex
const OTHER_CSI = /\u001b\[[0-9;?]*[A-LN-Za-ln-z]/g;

export function parseAnsi(input: string): AnsiSegment[] {
  const text = input.replace(OTHER_CSI, "").replace(/\r(?!\n)/g, "");
  const out: AnsiSegment[] = [];
  let color: string | null = null;
  let bold = false;
  let dim = false;
  let last = 0;
  const push = (end: number): void => {
    if (end > last) out.push({ text: text.slice(last, end), color, bold, dim });
  };
  for (const m of text.matchAll(SGR)) {
    push(m.index);
    last = m.index + m[0].length;
    const codes = m[1] === "" ? [0] : m[1].split(";").map(Number);
    for (const c of codes) {
      if (c === 0) {
        color = null;
        bold = false;
        dim = false;
      } else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) {
        bold = false;
        dim = false;
      } else if (c === 39) color = null;
      else if (COLORS[c]) color = COLORS[c];
      else if (c >= 90 && c <= 97) color = COLORS[c - 60] ?? null;
    }
  }
  push(text.length);
  return out;
}

/** Plain text with every escape sequence removed. */
export function stripAnsi(input: string): string {
  return parseAnsi(input)
    .map((s) => s.text)
    .join("");
}
