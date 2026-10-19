/**
 * Dependency-free TOML syntax validator (#0375).
 *
 * The Settings page's raw editor writes `repoos.toml` verbatim, so a malformed
 * save must be rejected *before* it reaches disk — `loadConfig`'s reader is
 * deliberately forgiving (it skips lines it can't parse), which would turn a
 * typo into a silently-ignored config instead of an error the user can see.
 *
 * This is a validator, not a parser: it walks the document and reports the
 * first structural problem it finds (unterminated string/array, missing `=`,
 * bad table header, invalid scalar) with a 1-based line number. It accepts the
 * TOML shapes RepoOS itself emits plus the common hand-written ones (dotted
 * and quoted keys, literal strings, single-line arrays, dates/times,
 * hex/octal/binary numbers). It deliberately does not enforce key uniqueness
 * or table-redefinition rules — those are valid-TOML concerns that never
 * affect what `loadConfig` reads, and rejecting on them would make the escape
 * hatch stricter than the loader it feeds.
 *
 * Crucially, it rejects the *valid TOML* shapes that `parseFlatToml`
 * (`config.ts`) cannot read: multi-line arrays and inline tables (multi-line
 * strings are supported by both). Those would otherwise sail through a save and
 * then be silently misread (the first line of a multi-line array parses as the
 * string `"["`, an inline table as a plain string), so a whole save could take
 * no effect with no error — the exact silent-config failure this gate exists to
 * stop.
 */

export interface TomlValidationResult {
  ok: boolean;
  /** Human-readable reason, without a line prefix. Present when `ok` is false. */
  error?: string;
  /** 1-based line the problem was found on. Present when `ok` is false. */
  line?: number;
}

class TomlSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = "TomlSyntaxError";
  }
}

const BARE_KEY_CHAR = /^[A-Za-z0-9_-]$/;

const INT_DECIMAL = /^[+-]?(0|[1-9](_?[0-9])*)$/;
const INT_HEX = /^[+-]?0x[0-9A-Fa-f](_?[0-9A-Fa-f])*$/;
const INT_OCTAL = /^[+-]?0o[0-7](_?[0-7])*$/;
const INT_BINARY = /^[+-]?0b[01](_?[01])*$/;
const FLOAT = /^[+-]?(0|[1-9](_?[0-9])*)(\.[0-9](_?[0-9])*)?([eE][+-]?[0-9](_?[0-9])*)?$/;
const SPECIAL_FLOAT = /^[+-]?(inf|nan)$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/;
const LOCALTIME = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

function isBareValue(token: string): boolean {
  if (token === "true" || token === "false") return true;
  return (
    INT_DECIMAL.test(token) ||
    INT_HEX.test(token) ||
    INT_OCTAL.test(token) ||
    INT_BINARY.test(token) ||
    FLOAT.test(token) ||
    SPECIAL_FLOAT.test(token) ||
    DATETIME.test(token) ||
    LOCALTIME.test(token)
  );
}

class TomlScanner {
  private i = 0;
  private line = 1;

  constructor(private readonly source: string) {}

  eof(): boolean {
    return this.i >= this.source.length;
  }

  /** Current 1-based line, for callers that need to detect a value spanning lines. */
  get lineNumber(): number {
    return this.line;
  }

  peek(offset = 0): string {
    return this.source[this.i + offset] ?? "";
  }

  advance(): string {
    const ch = this.source[this.i++];
    if (ch === "\n") this.line++;
    return ch;
  }

  fail(message: string): never {
    throw new TomlSyntaxError(message, this.line);
  }

  /** Spaces and tabs only — never crosses a line boundary. */
  skipInlineWhitespace(): void {
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === " " || ch === "\t") this.advance();
      else break;
    }
  }

  skipWhitespace(): void {
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") this.advance();
      else break;
    }
  }

  skipComment(): void {
    if (this.peek() !== "#") return;
    while (!this.eof() && this.peek() !== "\n") this.advance();
  }

  /** After a complete statement: trailing whitespace, an optional comment, then EOL/EOF. */
  finishStatement(): void {
    this.skipInlineWhitespace();
    this.skipComment();
    if (this.eof()) return;
    if (this.peek() === "\n" || this.peek() === "\r") {
      if (this.peek() === "\r") this.advance();
      if (this.peek() === "\n") this.advance();
      return;
    }
    this.fail(`unexpected character ${JSON.stringify(this.peek())} after statement`);
  }
}

/** Parse a dotted key path (`a.b`, `"a b".c`); validates but discards the value. */
function parseKey(sc: TomlScanner): void {
  parseSimpleKey(sc);
  sc.skipInlineWhitespace();
  while (sc.peek() === ".") {
    sc.advance();
    sc.skipInlineWhitespace();
    parseSimpleKey(sc);
    sc.skipInlineWhitespace();
  }
}

function parseSimpleKey(sc: TomlScanner): void {
  const ch = sc.peek();
  if (ch === '"') {
    readBasicString(sc);
    return;
  }
  if (ch === "'") {
    readLiteralString(sc);
    return;
  }
  let key = "";
  while (!sc.eof() && BARE_KEY_CHAR.test(sc.peek())) key += sc.advance();
  if (!key) sc.fail("expected a key");
}

const BASIC_ESCAPES = new Set(["b", "t", "n", "f", "r", '"', "\\"]);

/**
 * Read the escape sequence after a `\`. TOML allows only `\b \t \n \f \r \" \\`,
 * `\uXXXX`/`\UXXXXXXXX`, and (in multi-line basic strings) a line-ending
 * backslash. Anything else — `\q`, a short unicode escape, `\ ` with no newline
 * — is invalid TOML, not "drop the backslash".
 */
function readBasicEscape(sc: TomlScanner, allowLineEnding: boolean): void {
  sc.advance(); // backslash
  if (sc.eof()) sc.fail("unterminated string");
  const ch = sc.peek();
  if (BASIC_ESCAPES.has(ch)) {
    sc.advance();
    return;
  }
  if (ch === "u" || ch === "U") {
    const digits = ch === "u" ? 4 : 8;
    sc.advance();
    let hex = "";
    for (let n = 0; n < digits; n++) {
      if (!/^[0-9A-Fa-f]$/.test(sc.peek())) sc.fail("invalid unicode escape");
      hex += sc.advance();
    }
    // TOML requires a valid Unicode scalar value: `\uD800` (a surrogate) and
    // `\U00110000` (beyond the last code point) are invalid escapes.
    const code = parseInt(hex, 16);
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      sc.fail(`invalid unicode escape \\${ch}${hex}`);
    }
    return;
  }
  if (allowLineEnding && (ch === " " || ch === "\t" || ch === "\n" || ch === "\r")) {
    // A line-ending backslash trims all whitespace through the newline; a run
    // of spaces with no newline is still an invalid escape.
    let sawNewline = false;
    while (!sc.eof()) {
      const c = sc.peek();
      if (c === "\n" || c === "\r") {
        sawNewline = true;
        sc.advance();
        continue;
      }
      if (c === " " || c === "\t") {
        sc.advance();
        continue;
      }
      break;
    }
    if (!sawNewline) sc.fail("invalid escape sequence");
    return;
  }
  sc.fail(`invalid escape sequence \\${ch}`);
}

function readBasicString(sc: TomlScanner): void {
  sc.advance(); // opening quote
  while (!sc.eof()) {
    const ch = sc.peek();
    if (ch === "\n" || ch === "\r") sc.fail("unterminated string");
    if (ch === '"') {
      sc.advance();
      return;
    }
    if (ch === "\\") {
      readBasicEscape(sc, false);
      continue;
    }
    sc.advance();
  }
  sc.fail("unterminated string");
}

function readLiteralString(sc: TomlScanner): void {
  sc.advance(); // opening quote
  while (!sc.eof()) {
    const ch = sc.peek();
    if (ch === "\n" || ch === "\r") sc.fail("unterminated string");
    if (ch === "'") {
      sc.advance();
      return;
    }
    sc.advance();
  }
  sc.fail("unterminated string");
}

function readMultiLineBasicString(sc: TomlScanner): void {
  // Opening """
  sc.advance();
  sc.advance();
  sc.advance();
  // TOML trims the first newline after opening
  if (sc.peek() === "\n") {
    sc.advance();
  } else if (sc.peek() === "\r" && sc.peek(1) === "\n") {
    sc.advance();
    sc.advance();
  }
  while (!sc.eof()) {
    if (sc.peek() === '"' && sc.peek(1) === '"' && sc.peek(2) === '"') {
      // One or two quotes immediately before the delimiter are content; the
      // last three close the string (TOML allows up to five in the run).
      for (let n = 0; n < 5 && sc.peek() === '"'; n++) sc.advance();
      return;
    }
    if (sc.peek() === "\\") {
      readBasicEscape(sc, true);
      continue;
    }
    if (sc.peek() === "\r") {
      sc.advance();
      if (sc.peek() === "\n") sc.advance();
      continue;
    }
    sc.advance();
  }
  sc.fail("unterminated multi-line basic string");
}

function readMultiLineLiteralString(sc: TomlScanner): void {
  // Opening '''
  sc.advance();
  sc.advance();
  sc.advance();
  // TOML trims the first newline after opening
  if (sc.peek() === "\n") {
    sc.advance();
  } else if (sc.peek() === "\r" && sc.peek(1) === "\n") {
    sc.advance();
    sc.advance();
  }
  while (!sc.eof()) {
    if (sc.peek() === "'" && sc.peek(1) === "'" && sc.peek(2) === "'") {
      // One or two quotes immediately before the delimiter are content.
      for (let n = 0; n < 5 && sc.peek() === "'"; n++) sc.advance();
      return;
    }
    sc.advance();
  }
  sc.fail("unterminated multi-line literal string");
}

function readArray(sc: TomlScanner): void {
  sc.advance(); // [
  while (true) {
    sc.skipWhitespace();
    sc.skipComment();
    sc.skipWhitespace();
    if (sc.eof()) sc.fail("unterminated array");
    if (sc.peek() === "]") {
      sc.advance();
      return;
    }
    readValue(sc);
    sc.skipWhitespace();
    sc.skipComment();
    sc.skipWhitespace();
    if (sc.peek() === ",") {
      sc.advance();
      continue;
    }
    if (sc.peek() === "]") {
      sc.advance();
      return;
    }
    sc.fail("expected ',' or ']' in array");
  }
}

function readBareValue(sc: TomlScanner): void {
  let token = "";
  while (!sc.eof()) {
    const ch = sc.peek();
    if (
      ch === " " ||
      ch === "\t" ||
      ch === "\r" ||
      ch === "\n" ||
      ch === "," ||
      ch === "]" ||
      ch === "}" ||
      ch === "#"
    ) {
      break;
    }
    token += sc.advance();
  }
  if (!token) sc.fail("expected a value");
  if (!isBareValue(token)) sc.fail(`invalid value ${JSON.stringify(token)}`);
}

function readValue(sc: TomlScanner): boolean {
  const ch = sc.peek();
  if (ch === '"') {
    if (sc.peek(1) === '"' && sc.peek(2) === '"') {
      readMultiLineBasicString(sc);
      return true;
    }
    readBasicString(sc);
    return false;
  }
  if (ch === "'") {
    if (sc.peek(1) === "'" && sc.peek(2) === "'") {
      readMultiLineLiteralString(sc);
      return true;
    }
    readLiteralString(sc);
    return false;
  }
  if (ch === "[") {
    readArray(sc);
    return false;
  }
  if (ch === "{") {
    sc.fail(
      "inline tables aren't supported — use a [section] or [[array-of-tables]] block instead",
    );
  }
  readBareValue(sc);
  return false;
}

function readTableHeader(sc: TomlScanner): void {
  sc.advance(); // [
  let array = false;
  if (sc.peek() === "[") {
    sc.advance();
    array = true;
  }
  sc.skipInlineWhitespace();
  parseKey(sc);
  sc.skipInlineWhitespace();
  if (array) {
    if (!(sc.peek() === "]" && sc.peek(1) === "]")) {
      sc.fail("expected ']]' to close an array-of-tables header");
    }
    sc.advance();
    sc.advance();
  } else {
    if (sc.peek() !== "]") sc.fail("expected ']' to close a table header");
    sc.advance();
  }
  sc.finishStatement();
}

function readKeyValue(sc: TomlScanner): void {
  parseKey(sc);
  sc.skipInlineWhitespace();
  if (sc.peek() !== "=") sc.fail("expected '=' after key");
  sc.advance();
  sc.skipInlineWhitespace();
  const startLine = sc.lineNumber;
  const isMultiLineString = readValue(sc);
  if (sc.lineNumber !== startLine && !isMultiLineString) {
    sc.fail(
      "multi-line arrays aren't supported by RepoOS's config reader — keep the array on a single line",
    );
  }
  sc.finishStatement();
}

/**
 * Validate a TOML document's syntax. Returns `{ ok: true }` when the whole
 * document is structurally well-formed, or `{ ok: false, error, line }` with
 * the first problem found. Never throws on malformed input.
 */
export function validateToml(source: string): TomlValidationResult {
  const sc = new TomlScanner(source);
  try {
    while (!sc.eof()) {
      sc.skipWhitespace();
      if (sc.eof()) break;
      const ch = sc.peek();
      if (ch === "#") {
        sc.skipComment();
        continue;
      }
      if (ch === "[") {
        readTableHeader(sc);
        continue;
      }
      readKeyValue(sc);
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof TomlSyntaxError) {
      return { ok: false, error: err.message, line: err.line };
    }
    throw err;
  }
}

/**
 * Format a validation failure for display, with the line folded into the
 * message so callers that only carry a string (the HTTP JSON error, the store)
 * still surface it.
 */
export function formatTomlError(result: TomlValidationResult): string {
  if (result.ok) return "";
  return `Invalid TOML on line ${result.line}: ${result.error}`;
}
