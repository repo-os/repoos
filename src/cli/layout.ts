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
const ANSI_SGR_ANCHORED = new RegExp("^" + SGR_SOURCE);

/** Visible width of `s` — its length with ANSI SGR codes removed. */
export function visibleWidth(s: string): number {
  return s.replace(ANSI_SGR, "").length;
}

/**
 * The width to lay out for: the terminal's columns (or `$COLUMNS` when stdout
 * is not a TTY, e.g. piped through `cat`), capped at 100 so a very wide
 * terminal doesn't stretch descriptions into unreadable lines. Falls back to
 * 80 when neither is available.
 */
export function termWidth(
  env: NodeJS.ProcessEnv = process.env,
  columns: number | undefined = process.stdout.columns,
): number {
  const fromTty = typeof columns === "number" && columns > 0 ? columns : undefined;
  const fromEnv = Number(env.COLUMNS);
  const raw = fromTty ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 80);
  return Math.min(raw, 100);
}

/**
 * Break a single word that is wider than the line into `width`-wide chunks,
 * counting visible characters only so an embedded ANSI code is copied through
 * without consuming a column. A broken colored word loses its color on the
 * continuation (the opening code stayed on the first chunk) — acceptable for
 * the long, uncolored URLs and paths this exists for.
 */
function hardBreak(word: string, width: number): string[] {
  const parts: string[] = [];
  let cur = "";
  let curW = 0;
  for (let i = 0; i < word.length;) {
    const code = ANSI_SGR_ANCHORED.exec(word.slice(i))?.[0];
    if (code) {
      cur += code;
      i += code.length;
      continue;
    }
    if (curW === width) {
      parts.push(cur);
      cur = "";
      curW = 0;
    }
    cur += word[i];
    curW += 1;
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
  const descWidth = Math.max(1, width - descCol);

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
