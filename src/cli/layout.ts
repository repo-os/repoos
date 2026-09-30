/**
 * Width-aware terminal layout helpers (#0591).
 *
 * The CLI prints with fixed `padEnd` columns and no knowledge of the terminal
 * width, so long text wraps back to column 0 under the terminal's own,
 * unaware line wrapping and breaks hanging indents (`repoos help`,
 * `repoos doctor`, the serve banner). These helpers are the shared,
 * dependency-free fix: `visibleWidth` and `wrap` measure and break text while
 * ignoring ANSI SGR codes, and `table`/`kv` lay out a label column with a
 * wrapped description column.
 *
 * Pure functions (width is a parameter, never read from the terminal inside
 * them), so they are unit-testable at fixed widths. Zero runtime deps: no
 * chalk, wrap-ansi or cli-table3.
 */

// SGR sequences only — the palette in `colors.ts` is the sole source of ANSI
// in CLI output, and it only emits `ESC [ <n;…> m`. Built from strings so the
// ESC control character is not a literal inside a regex (lint:
// no-control-regex).
const SGR_SOURCE = "\\x1b\\[[0-9;]*m";
const ANSI_SGR = new RegExp(SGR_SOURCE, "g");

/** Visible width of `s` in display columns, ignoring ANSI SGR codes. */
export function visibleWidth(s: string): number {
  let width = 0;
  for (const ch of s.replace(ANSI_SGR, "")) width += codePointWidth(ch.codePointAt(0) ?? 0);
  return width;
}

/**
 * Display width of one code point: 0 for combining/zero-width marks, 2 for
 * East Asian wide and emoji, else 1. A pragmatic `wcwidth` subset with no
 * dependency — it covers the scripts that actually show up in project paths and
 * task titles. Emoji ZWJ sequences are over-counted (each emoji counts 2),
 * which errs toward lines that are shorter than the terminal, never over.
 */
function codePointWidth(cp: number): number {
  if (cp === 0) return 0;
  if (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    cp === 0x200b || // zero-width space
    cp === 0x200d || // zero-width joiner
    cp === 0x200e ||
    cp === 0x200f ||
    cp === 0xfeff
  ) {
    return 0;
  }
  if (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    cp === 0x2329 ||
    cp === 0x232a ||
    (cp >= 0x2e80 && cp <= 0x303e) || // CJK radicals / Kangxi / punctuation
    (cp >= 0x3041 && cp <= 0x33ff) || // Hiragana … CJK compatibility
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) || // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK compatibility forms
    (cp >= 0xff00 && cp <= 0xff60) || // Fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK Ext B+
  ) {
    return 2;
  }
  return 1;
}

/**
 * The width to lay out for. `$COLUMNS` wins when it is set and positive — so
 * `COLUMNS=60 repoos help` works even under a TTY, which is how the layout is
 * verified at fixed widths — then the terminal's own columns, then 80. Capped
 * at 100 so a very wide terminal doesn't stretch descriptions into unreadable
 * lines.
 */
export function termWidth(
  env: NodeJS.ProcessEnv = process.env,
  columns: number | undefined = process.stdout.columns,
): number {
  const fromEnv = Number(env.COLUMNS);
  const envOk = Number.isFinite(fromEnv) && fromEnv > 0;
  const fromTty = typeof columns === "number" && columns > 0 ? columns : undefined;
  return Math.min(envOk ? fromEnv : (fromTty ?? 80), 100);
}

/**
 * Break a single word that is wider than the line into `width`-wide chunks.
 * Iterates code points (so astral characters/emoji aren't split) and counts
 * display columns, copying embedded ANSI codes through without consuming a
 * column. A broken colored word loses its color on the continuation (the
 * opening code stayed on the first chunk) — acceptable for the long, uncolored
 * URLs and paths this exists for.
 */
function hardBreak(word: string, width: number): string[] {
  const chars = [...word];
  const parts: string[] = [];
  let cur = "";
  let curW = 0;
  for (let i = 0; i < chars.length;) {
    if (chars[i] === "\x1b") {
      // Consume a whole CSI sequence so it is never split across a line.
      let j = i + 1;
      while (j < chars.length && !/[A-Za-z]/.test(chars[j] as string)) j += 1;
      if (j < chars.length) j += 1;
      cur += chars.slice(i, j).join("");
      i = j;
      continue;
    }
    const w = codePointWidth(chars[i]?.codePointAt(0) ?? 0);
    if (curW > 0 && curW + w > width) {
      parts.push(cur);
      cur = "";
      curW = 0;
    }
    cur += chars[i];
    curW += w;
    i += 1;
  }
  parts.push(cur);
  return parts;
}

/** Word-wrap one already-newline-free paragraph; returns lines without indent. */
function wrapParagraph(text: string, width: number): string[] {
  const words = text.match(/\S+/g) ?? [];
  if (words.length === 0) return [""];
  const out: string[] = [];
  let line = "";
  let lineW = 0;
  for (const word of words) {
    const w = visibleWidth(word);
    if (lineW === 0) {
      // Overlong word on an empty line: hard-break it and keep the tail.
      const parts = w <= width ? [word] : hardBreak(word, width);
      for (let i = 0; i < parts.length - 1; i++) out.push(parts[i]);
      line = parts[parts.length - 1];
      lineW = visibleWidth(line);
    } else if (lineW + 1 + w <= width) {
      line += " " + word;
      lineW += 1 + w;
    } else {
      out.push(line);
      const parts = w <= width ? [word] : hardBreak(word, width);
      for (let i = 0; i < parts.length - 1; i++) out.push(parts[i]);
      line = parts[parts.length - 1];
      lineW = visibleWidth(line);
    }
  }
  out.push(line);
  return out;
}

/**
 * ANSI-aware word wrap with a hanging indent. `text` may contain explicit
 * newlines (they start a new wrapped line); `width` is the visible budget for
 * each line *excluding* `indent`, so every returned line is at most
 * `visibleWidth(indent) + width` visible characters wide. Pass the indentation
 * as `indent` rather than embedding it in `text` — leading whitespace is a
 * word separator and would be collapsed.
 */
export function wrap(text: string, width: number, indent = ""): string {
  const budget = Math.max(1, Math.floor(width));
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    for (const line of wrapParagraph(paragraph, budget)) lines.push(indent + line);
  }
  return lines.join("\n");
}

export interface TableRow {
  /** Left column — command name or check title. May contain ANSI. */
  label: string;
  /** Right column — wrapped at the remaining width. May contain ANSI. */
  description: string;
}

export interface TableOptions {
  /** Spaces between the label column and the description (default 2). */
  gap?: number;
  /** Leading spaces before the label column (default 0). */
  indent?: number;
  /** Total width to lay out for (default `termWidth()`). */
  width?: number;
  /** Force the label column width instead of sizing to the widest row. */
  labelWidth?: number;
}

/**
 * A two-column table: a label column sized to its widest entry, then a
 * description column that word-wraps to the remaining width with a hanging
 * indent. Every line stays within `width`.
 */
export function table(rows: readonly TableRow[], opts: TableOptions = {}): string {
  const gap = Math.max(0, opts.gap ?? 2);
  const indent = Math.max(0, opts.indent ?? 0);
  const width = Math.max(1, opts.width ?? termWidth());
  const labelW =
    opts.labelWidth ?? rows.reduce((max, r) => Math.max(max, visibleWidth(r.label)), 0);
  const prefix = " ".repeat(indent);
  const descCol = indent + labelW + gap;
  const descIndent = " ".repeat(descCol);

  // Degenerate width: a two-column layout cannot fit. Stack the label over the
  // description so no line exceeds the width (e.g. a 10-column terminal).
  if (width < descCol + 1) {
    const lines: string[] = [];
    for (const r of rows) {
      lines.push(...wrap(r.label, Math.max(1, width - indent), prefix).split("\n"));
      if (visibleWidth(r.description) > 0) {
        lines.push(
          ...wrap(r.description, Math.max(1, width - indent - 2), prefix + "  ").split("\n"),
        );
      }
    }
    return lines.join("\n");
  }

  const descWidth = width - descCol;
  const lines: string[] = [];
  for (const r of rows) {
    const wrapped = wrap(r.description, descWidth, "").split("\n");
    const first = wrapped.shift() ?? "";
    const label = r.label + " ".repeat(Math.max(0, labelW - visibleWidth(r.label)));
    lines.push(prefix + label + " ".repeat(gap) + first);
    for (const cont of wrapped) lines.push(descIndent + cont);
  }
  return lines.join("\n");
}

export interface KVRow {
  label: string;
  value: string;
}

/** `table` for a label/value listing — the shared shape serve/status/doctor use. */
export function kv(rows: readonly KVRow[], opts: TableOptions = {}): string {
  return table(
    rows.map((r) => ({ label: r.label, description: r.value })),
    opts,
  );
}
