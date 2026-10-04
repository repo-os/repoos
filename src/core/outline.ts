/**
 * `repoos outline` — a compact structural map of a source file (#0653).
 *
 * Engineer agents routinely re-read whole files (analysis of 234 sessions,
 * 2026-10-05: 38% of reads were of a file already read that session) because
 * they have no cheap way to learn where the symbol they want lives. `outline`
 * prints exported/top-level functions, classes, types, enums and constants
 * with their start-end line numbers; for `.vue` it adds the SFC block ranges,
 * and for `.css` its top-level selectors. An agent runs it once, then reads
 * only the range it needs.
 *
 * ── Why a line scanner, not the TypeScript compiler API ────────────────────
 * `typescript` sits in devDependencies, but the published package ships only
 * `dist/` (`package.json` "files"), so at runtime for a real `repoos` install
 * it is absent. Depending on it when present would make the same command
 * produce different output in the dev checkout and on a user's machine. The
 * scanner below has zero runtime dependencies, is deterministic, and runs in
 * well under the 200ms budget even for the largest files here (it only walks
 * the source once to mask strings/comments, then once per parser). That is the
 * same zero-runtime-dependency constraint every other command honours.
 */
import { readFileSync } from "node:fs";
import { extname } from "node:path";

export type OutlineLanguage = "script" | "vue" | "css" | "unsupported";

export interface OutlineEntry {
  /** One of function/class/interface/type/enum/variable/method/property/constructor/block/selector/at-rule. */
  kind: string;
  name: string;
  /** 1-based first line. */
  start: number;
  /** 1-based last line, inclusive (=== start for one-line declarations). */
  end: number;
  exported: boolean;
  /** Brace-nesting depth; 0 is top level. Used only for indentation. */
  depth: number;
  /** Enclosing class/function/interface name, when nested. */
  parent?: string;
}

export interface Outline {
  /** Path exactly as the caller supplied it. */
  file: string;
  language: OutlineLanguage;
  entries: OutlineEntry[];
  /** Human-readable supported-type list, set only for `unsupported`. */
  unsupported?: string;
}

const SCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);

const UNSUPPORTED_MESSAGE = "supported: .ts/.tsx/.js/.jsx/.mjs/.cjs/.vue/.css";

export function detectLanguage(file: string): OutlineLanguage {
  const ext = extname(file).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(ext)) return "script";
  if (ext === ".vue") return "vue";
  if (ext === ".css") return "css";
  return "unsupported";
}

/** Read and outline one file from disk. */
export function outlineFile(file: string): Outline {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return { file, language: "unsupported", entries: [], unsupported: "unreadable file" };
  }
  return outlineSource(file, source);
}

/** Outline in-memory source. `file` is only used for language detection/labels. */
export function outlineSource(file: string, source: string): Outline {
  const language = detectLanguage(file);
  if (language === "script") return { file, language, entries: parseScript(source) };
  if (language === "vue") return { file, language, entries: parseVue(source) };
  if (language === "css") return { file, language, entries: parseCss(source) };
  return { file, language, entries: [], unsupported: UNSUPPORTED_MESSAGE };
}

// ── Text helpers ────────────────────────────────────────────────────────────

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  return starts;
}

/** 1-based line containing `offset`. */
function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans + 1;
}

/**
 * Blank out comments, string/template literals and regex literals, preserving
 * length and every newline. The result is safe for brace counting and for
 * declaration regexes: an identifier inside a string can no longer look like a
 * declaration, and braces inside a literal no longer move the nesting depth.
 */
export function maskCode(source: string): string {
  const out = source.split("");
  const n = source.length;
  const blank = (i: number) => {
    const ch = source[i];
    if (ch !== undefined && ch !== "\n" && ch !== "\r") out[i] = " ";
  };
  let i = 0;

  function regexAllowed(at: number): boolean {
    let j = at - 1;
    while (j >= 0 && /\s/.test(source[j])) j--;
    if (j < 0) return true;
    const ch = source[j];
    if ("(,=:[!&|?{};+-*%<>~^".includes(ch)) return true;
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let k = j;
      while (k >= 0 && /[A-Za-z0-9_$]/.test(source[k])) k--;
      const word = source.slice(k + 1, j + 1);
      return /^(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await|throw)$/.test(
        word,
      );
    }
    return false;
  }

  function scanRegex(): void {
    blank(i);
    i++;
    let inClass = false;
    while (i < n) {
      const ch = source[i];
      if (ch === "\\") {
        blank(i);
        blank(i + 1);
        i += 2;
        continue;
      }
      if (ch === "\n") return; // unterminated; bail rather than swallow the file
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) {
        blank(i);
        i++;
        return;
      }
      blank(i);
      i++;
    }
  }

  function scanTemplate(): void {
    blank(i);
    i++;
    while (i < n) {
      const ch = source[i];
      if (ch === "\\") {
        blank(i);
        blank(i + 1);
        i += 2;
        continue;
      }
      if (ch === "`") {
        blank(i);
        i++;
        return;
      }
      if (ch === "$" && source[i + 1] === "{") {
        blank(i);
        blank(i + 1);
        i += 2;
        scanCode(true);
        continue;
      }
      blank(i);
      i++;
    }
  }

  function scanCode(stopOnCloseBrace: boolean): void {
    let depth = 0;
    while (i < n) {
      const ch = source[i];
      const next = source[i + 1];
      if (ch === "/" && next === "/") {
        blank(i);
        blank(i + 1);
        i += 2;
        while (i < n && source[i] !== "\n") {
          blank(i);
          i++;
        }
        continue;
      }
      if (ch === "/" && next === "*") {
        blank(i);
        blank(i + 1);
        i += 2;
        while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
          blank(i);
          i++;
        }
        if (i < n) {
          blank(i);
          blank(i + 1);
          i += 2;
        }
        continue;
      }
      if (ch === "'" || ch === '"') {
        const quote = ch;
        blank(i);
        i++;
        while (i < n && source[i] !== quote) {
          if (source[i] === "\\") {
            blank(i);
            blank(i + 1);
            i += 2;
          } else {
            blank(i);
            i++;
          }
        }
        if (i < n) {
          blank(i);
          i++;
        }
        continue;
      }
      if (ch === "`") {
        scanTemplate();
        continue;
      }
      if (ch === "/" && regexAllowed(i)) {
        scanRegex();
        continue;
      }
      if (ch === "{") {
        depth++;
        i++;
        continue;
      }
      if (ch === "}") {
        if (stopOnCloseBrace && depth === 0) {
          i++;
          return;
        }
        if (depth > 0) depth--;
        i++;
        continue;
      }
      i++;
    }
  }

  scanCode(false);
  return out.join("");
}

/** Offset of the `}` matching the `{` at `open`, or -1. Input must be masked. */
function matchBrace(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const ch = masked[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Brace depth at the start of every line of masked source. */
function lineStartDepths(masked: string, lineStarts: number[]): number[] {
  const depths = new Array(lineStarts.length).fill(0);
  let depth = 0;
  let line = 0;
  for (let i = 0; i < masked.length; i++) {
    while (line + 1 < lineStarts.length && i === lineStarts[line + 1]) {
      line++;
      depths[line] = depth;
    }
    const ch = masked[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
  }
  return depths;
}

interface StatementEnd {
  /** Offset of the terminating `;`/newline/EOF when there is no block body. */
  end: number;
  /** Offset of the block `{`, or -1 when the declaration has no brace body. */
  bodyOpen: number;
}

/**
 * Find where a declaration's statement ends, distinguishing a block body
 * (`{` at paren/bracket depth 0) from a plain `;`/newline-terminated one. The
 * newline continuation check keeps multi-line signatures (`class Foo\nextends
 * Bar {`, `type X =\n | A`) from being cut short.
 */
function findStatementEnd(masked: string, from: number): StatementEnd {
  let i = from;
  let paren = 0;
  let bracket = 0;
  let lastMeaningful = "";
  while (i < masked.length) {
    const ch = masked[i];
    if (ch === "(") {
      paren++;
      lastMeaningful = ch;
      i++;
      continue;
    }
    if (ch === ")") {
      paren = Math.max(0, paren - 1);
      lastMeaningful = ch;
      i++;
      continue;
    }
    if (ch === "[") {
      bracket++;
      lastMeaningful = ch;
      i++;
      continue;
    }
    if (ch === "]") {
      bracket = Math.max(0, bracket - 1);
      lastMeaningful = ch;
      i++;
      continue;
    }
    if (paren === 0 && bracket === 0) {
      if (ch === ";") return { end: i, bodyOpen: -1 };
      if (ch === "{") return { end: -1, bodyOpen: i };
    }
    if (ch === "\n" && paren === 0 && bracket === 0) {
      let j = i + 1;
      while (j < masked.length && /\s/.test(masked[j])) j++;
      const nextCh = j < masked.length ? masked[j] : "";
      const nextWord = (masked.slice(j).match(/^[A-Za-z_$][\w$]*/) ?? [""])[0];
      const continues =
        "=|&{(".includes(nextCh) ||
        nextWord === "extends" ||
        nextWord === "implements" ||
        "=([{.:|&,+-*/?<>".includes(lastMeaningful);
      if (!continues) return { end: i, bodyOpen: -1 };
    }
    if (!/\s/.test(ch)) lastMeaningful = ch;
    i++;
  }
  return { end: Math.max(0, masked.length - 1), bodyOpen: -1 };
}

// ── Script parser ───────────────────────────────────────────────────────────

interface DeclMatch {
  kind: string;
  name: string;
  exported: boolean;
}

const METHOD_RE =
  /^(?:(?:public|private|protected|static|readonly|abstract|override|declare|async)\s+)*(?:get\s+|set\s+)?(?:\*\s*)?(#?[A-Za-z_$][\w$]*|\[[^\]]*\])\s*\(/;
const PROPERTY_RE =
  /^(?:(?:public|private|protected|static|readonly|abstract|declare|override)\s+)*(#?[A-Za-z_$][\w$]*)\s*(?::|=|;|\?|$)/;
const ARROW_FN_RE = /=\s*(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/;

function matchClassMember(line: string): DeclMatch | null {
  const work = line.replace(/^\s+/, "");
  if (!work || work.startsWith("@")) return null;
  const method = work.match(METHOD_RE);
  if (method) {
    const name = method[1].replace(/^#/, "");
    return { kind: name === "constructor" ? "constructor" : "method", name, exported: false };
  }
  const property = work.match(PROPERTY_RE);
  if (property) return { kind: "property", name: property[1].replace(/^#/, ""), exported: false };
  return null;
}

function matchDeclaration(rawLine: string, inClass: boolean, topLevel: boolean): DeclMatch | null {
  if (inClass) return matchClassMember(rawLine);
  let work = rawLine.replace(/^\s+/, "");
  if (!work || work.startsWith("@")) return null;
  const exported = /^export\b/.test(work);
  work = work.replace(/^export\s+/, "").replace(/^default\s+/, "");

  let m = work.match(/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/);
  if (m) return { kind: "function", name: m[1], exported };
  m = work.match(/^(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: "class", name: m[1], exported };
  m = work.match(/^(?:declare\s+)?(?:abstract\s+)?interface\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: "interface", name: m[1], exported };
  m = work.match(/^(?:declare\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/);
  if (m) return { kind: "type", name: m[1], exported };
  m = work.match(/^(?:declare\s+)?const\s+enum\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: "enum", name: m[1], exported };
  m = work.match(/^(?:declare\s+)?enum\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: "enum", name: m[1], exported };
  if (!topLevel) return null;
  // Constants only at the top level; a `const` inside a function body is noise,
  // and one inside a class body is a field (handled by matchClassMember).
  m = work.match(/^(?:declare\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (m) return { kind: ARROW_FN_RE.test(work) ? "function" : m[1], name: m[2], exported };
  return null;
}

interface Scope {
  entry: OutlineEntry;
  /** Expected brace depth of a direct child declaration line. */
  innerDepth: number;
  /** 1-based last line of the scope's body. */
  endLine: number;
  /** Whether this scope's children are class members. */
  isClass: boolean;
}

/** Parse a script body. `baseLine` shifts reported lines (used by the .vue parser). */
function parseScript(source: string, baseLine = 1): OutlineEntry[] {
  const masked = maskCode(source);
  const starts = computeLineStarts(masked);
  const depths = lineStartDepths(masked, starts);
  const lines = masked.split("\n");
  const entries: OutlineEntry[] = [];
  const scopes: Scope[] = [];
  const shift = baseLine - 1;

  for (let ln = 0; ln < lines.length; ln++) {
    const lineNo = ln + 1;
    while (scopes.length && scopes[scopes.length - 1].endLine < lineNo) scopes.pop();
    const current = scopes.length ? scopes[scopes.length - 1] : null;
    const expectedDepth = current ? current.innerDepth : 0;
    if (depths[ln] !== expectedDepth) continue;

    const match = matchDeclaration(lines[ln], current?.isClass ?? false, current === null);
    if (!match) continue;

    const from = starts[ln];
    const { end, bodyOpen } = findStatementEnd(masked, from);
    const bodyClose = bodyOpen >= 0 ? matchBrace(masked, bodyOpen) : -1;
    const entry: OutlineEntry = {
      kind: match.kind,
      name: match.name,
      start: lineNo + shift,
      end: (bodyClose >= 0 ? lineAt(starts, bodyClose) : lineAt(starts, end)) + shift,
      exported: match.exported,
      depth: expectedDepth,
    };
    if (current) entry.parent = current.entry.name;
    entries.push(entry);

    // Descend only into constructs that actually contain declarations; an
    // object-literal body on a plain `const` is not a code block.
    const descends =
      match.kind === "function" ||
      match.kind === "class" ||
      match.kind === "interface" ||
      match.kind === "enum" ||
      match.kind === "method" ||
      match.kind === "constructor";
    if (bodyOpen >= 0 && bodyClose >= 0 && descends) {
      scopes.push({
        entry,
        innerDepth: expectedDepth + 1,
        endLine: lineAt(starts, bodyClose) + shift,
        isClass: match.kind === "class",
      });
    }
  }
  return entries;
}

// ── Vue SFC parser ──────────────────────────────────────────────────────────

interface SfcBlock {
  tag: string;
  attrs: string;
  contentStart: number;
  closeStart: number;
}

function findSfcBlocks(source: string): SfcBlock[] {
  const tagRe = /<(\/?)(template|script|style)\b([^>]*)>/gi;
  const blocks: SfcBlock[] = [];
  const stack: Array<{ tag: string; attrs: string; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(source))) {
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (!closing) {
      if (tag === "template" && stack.some((s) => s.tag === "template")) {
        // A nested <template v-if> inside the top-level template: track depth
        // so its close doesn't end the whole block.
        stack.push({ tag, attrs: m[3] ?? "", contentStart: tagRe.lastIndex });
        continue;
      }
      if (stack.length === 0) {
        stack.push({ tag, attrs: m[3] ?? "", contentStart: tagRe.lastIndex });
      } else if (stack[stack.length - 1].tag === "template" && tag === "template") {
        stack.push({ tag, attrs: m[3] ?? "", contentStart: tagRe.lastIndex });
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && top.tag === tag) {
      stack.pop();
      if (stack.length === 0) {
        blocks.push({
          tag: top.tag,
          attrs: top.attrs,
          contentStart: top.contentStart,
          closeStart: m.index,
        });
      }
    }
  }
  return blocks;
}

function parseVue(source: string): OutlineEntry[] {
  const starts = computeLineStarts(source);
  const entries: OutlineEntry[] = [];
  for (const block of findSfcBlocks(source)) {
    const start = lineAt(starts, source.lastIndexOf("<" + block.tag, block.contentStart));
    const end = lineAt(starts, block.closeStart);
    let name = block.tag;
    if (block.tag === "script" && /\bsetup\b/.test(block.attrs)) name = "script setup";
    entries.push({ kind: "block", name, start, end, exported: false, depth: 0 });

    if (block.tag === "script") {
      const content = source.slice(block.contentStart, block.closeStart);
      const contentLine = lineAt(starts, block.contentStart);
      for (const entry of parseScript(content, contentLine)) {
        // Script symbols live at SFC top level, not under the block entry.
        entries.push({ ...entry, depth: 0, parent: undefined });
      }
    }
  }
  return entries;
}

// ── CSS parser ──────────────────────────────────────────────────────────────

function maskCss(source: string): string {
  const out = source.split("");
  const n = source.length;
  const blank = (i: number) => {
    const ch = source[i];
    if (ch !== undefined && ch !== "\n" && ch !== "\r") out[i] = " ";
  };
  let i = 0;
  while (i < n) {
    if (source[i] === "/" && source[i + 1] === "*") {
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        blank(i);
        i++;
      }
      if (i < n) {
        blank(i);
        blank(i + 1);
        i += 2;
      }
      continue;
    }
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      blank(i);
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          blank(i);
          blank(i + 1);
          i += 2;
        } else {
          blank(i);
          i++;
        }
      }
      if (i < n) {
        blank(i);
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

function parseCss(source: string): OutlineEntry[] {
  const masked = maskCss(source);
  const starts = computeLineStarts(masked);
  const entries: OutlineEntry[] = [];
  let depth = 0;
  let segmentStart = 0;
  let i = 0;
  while (i < masked.length) {
    const ch = masked[i];
    if (ch === "{") {
      const rawSegment = masked.slice(segmentStart, i);
      const selector = rawSegment.replace(/\s+/g, " ").trim();
      // Top-level selectors/at-rules only: nested rules inside @media/@layer
      // are already covered by their parent's line range, and keeping just the
      // top level keeps the map compact for large stylesheets.
      if (selector && depth === 0) {
        const leading = rawSegment.length - rawSegment.trimStart().length;
        const close = matchBrace(masked, i);
        entries.push({
          kind: selector.startsWith("@") ? "at-rule" : "selector",
          name: selector,
          start: lineAt(starts, segmentStart + leading),
          end: close >= 0 ? lineAt(starts, close) : lineAt(starts, i),
          exported: false,
          depth,
        });
      }
      depth++;
      segmentStart = i + 1;
      i++;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      segmentStart = i + 1;
      i++;
      continue;
    }
    i++;
  }
  return entries;
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Plain-text, greppable form: `[export ]<kind> <name> <start>[-<end>]`. */
export function formatOutline(outline: Outline): string {
  if (outline.language === "unsupported") {
    return `${outline.file} — unsupported file type (${outline.unsupported ?? UNSUPPORTED_MESSAGE})`;
  }
  const lines: string[] = [
    `${outline.file} (${outline.language}, ${outline.entries.length} symbols)`,
  ];
  for (const entry of outline.entries) {
    const indent = "  ".repeat(Math.min(entry.depth, 4));
    const prefix = entry.exported ? "export " : "";
    const range = entry.start === entry.end ? `${entry.start}` : `${entry.start}-${entry.end}`;
    lines.push(`${indent}${prefix}${entry.kind} ${entry.name} ${range}`);
  }
  return lines.join("\n");
}
