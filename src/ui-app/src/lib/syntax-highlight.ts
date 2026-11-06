/**
 * Read-only syntax highlighting for the full-file before/after diff view (#0449).
 *
 * Shiki tokenizes with TextMate grammars, which is exactly what a diff view
 * needs: accurate token colours, no editor/AST surface. Everything heavy — the
 * Shiki core, the regex engine, each grammar, and the active light/dark theme
 * pair — is imported dynamically, so a repo that never opens a supported file
 * never pays for it and the initial UI bundle holds no grammars at all.
 *
 * Safety and performance are the two hard constraints here:
 *  - Token text is escaped before it is joined into HTML, so untrusted
 *    repository content can never become executable markup (`DiffView` renders
 *    the result with `v-html`, and this is the only place that HTML is built).
 *  - A deliberately conservative size ceiling keeps tokenization bounded. Above
 *    it we return escaped plain text with a one-line explanation rather than
 *    freezing the main thread on a huge file.
 *
 * Themes are resolved in the browser via CSS custom properties, not here: each
 * token carries both a light and a dark colour for the *active* Shiki family
 * (GitHub defaults vs Catppuccin), and `style.css` picks the active one off
 * `[data-theme]` and `[data-ui-theme]`. Light/dark toggles stay instant; switching
 * design family (`data-ui-theme`) re-highlights so the matching pair is loaded.
 */

import type { HighlighterCore } from "@shikijs/core";

/**
 * The deliberately scoped initial language set. Each id is a Shiki grammar id
 * (so it doubles as the dynamic import target below); unknown paths fall back to
 * plain text in `DiffView`.
 */
export type SupportedLanguage =
  | "typescript"
  | "tsx"
  | "javascript"
  | "jsx"
  | "vue"
  | "json"
  | "jsonc"
  | "toml"
  | "yaml"
  | "markdown"
  | "css"
  | "html"
  | "go"
  | "rust"
  | "kotlin"
  | "groovy"
  | "java"
  | "python"
  | "shellscript"
  | "sql";

/** Extension → grammar id. `gradle` is Groovy, the build-script language Gradle uses. */
const EXTENSION_LANGUAGE: Record<string, SupportedLanguage> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  vue: "vue",
  json: "json",
  jsonc: "jsonc",
  toml: "toml",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "html",
  htm: "html",
  go: "go",
  rs: "rust",
  kt: "kotlin",
  kts: "kotlin",
  gradle: "groovy",
  groovy: "groovy",
  java: "java",
  py: "python",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  sql: "sql",
};

/** Lazy grammar loaders, one dynamic chunk each — never in the initial bundle. */
const LANGUAGE_LOADERS: Record<SupportedLanguage, () => Promise<unknown>> = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  vue: () => import("@shikijs/langs/vue"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  toml: () => import("@shikijs/langs/toml"),
  yaml: () => import("@shikijs/langs/yaml"),
  markdown: () => import("@shikijs/langs/markdown"),
  css: () => import("@shikijs/langs/css"),
  html: () => import("@shikijs/langs/html"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  groovy: () => import("@shikijs/langs/groovy"),
  java: () => import("@shikijs/langs/java"),
  python: () => import("@shikijs/langs/python"),
  shellscript: () => import("@shikijs/langs/shellscript"),
  sql: () => import("@shikijs/langs/sql"),
};

/**
 * Shiki theme ids for each highlight family. Only one family's pair is loaded and
 * tokenized per `highlightPair` call (#1046); `style.css` maps variants to
 * `--shiki-*` custom properties.
 */
const HIGHLIGHT_THEME_IDS = {
  github: {
    light: "github-light-default",
    dark: "github-dark-default",
  },
  catppuccin: {
    catppuccinLight: "catppuccin-latte",
    catppuccinDark: "catppuccin-mocha",
  },
} as const;

/** Which Shiki light/dark pair to tokenize for the diff view (#1046). */
export type DiffHighlightThemeFamily = keyof typeof HIGHLIGHT_THEME_IDS;

/** Map UI design theme (`data-ui-theme`) to the Shiki pair used for diff code. */
export function diffHighlightFamilyForUiTheme(uiTheme: string): DiffHighlightThemeFamily {
  return uiTheme === "catppuccin" ? "catppuccin" : "github";
}

/**
 * Upper bound on a single before/after pair. The JS regex engine tokenizes
 * roughly 3k lines in well under a second once warm; beyond this the work is no
 * longer bounded enough to run on the UI thread, so we stay on plain text.
 * Both limits are on the pair's combined size.
 */
export const MAX_HIGHLIGHT_TOTAL_LINES = 3000;
export const MAX_HIGHLIGHT_TOTAL_CHARS = 300_000;

/** Minimal token shape this module renders — a structural subset of Shiki's. */
export interface SyntaxToken {
  content: string;
  variants?: Record<string, { color?: string; fontStyle?: number } | undefined>;
}

/** Escape a raw token for HTML text content. Quotes are intentionally left
 * alone: this output is only ever inserted as element text, never an attribute. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Detect a grammar from a file path's extension. Returns null for anything not
 * in the scoped set; the caller renders that as escaped plain text.
 */
export function detectLanguage(filename: string): SupportedLanguage | null {
  const base = (filename.split(/[\\/]/).pop() ?? filename).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return EXTENSION_LANGUAGE[base.slice(dot + 1)] ?? null;
}

const FONT_ITALIC = 1;
const FONT_BOLD = 2;
const FONT_UNDERLINE = 4;
const FONT_STRIKETHROUGH = 8;

function tokenStyle(variants: SyntaxToken["variants"]): string {
  if (!variants) return "";
  const light = variants.light?.color;
  const dark = variants.dark?.color;
  const catppuccinLight = variants.catppuccinLight?.color;
  const catppuccinDark = variants.catppuccinDark?.color;
  const fontStyle =
    variants.light?.fontStyle ??
    variants.dark?.fontStyle ??
    variants.catppuccinLight?.fontStyle ??
    variants.catppuccinDark?.fontStyle ??
    0;
  const parts: string[] = [];
  if (light) parts.push(`--shiki-light:${light}`);
  if (dark) parts.push(`--shiki-dark:${dark}`);
  if (catppuccinLight) parts.push(`--shiki-catppuccin-light:${catppuccinLight}`);
  if (catppuccinDark) parts.push(`--shiki-catppuccin-dark:${catppuccinDark}`);
  if (fontStyle & FONT_ITALIC) parts.push("font-style:italic");
  if (fontStyle & FONT_BOLD) parts.push("font-weight:600");
  const decorations: string[] = [];
  if (fontStyle & FONT_UNDERLINE) decorations.push("underline");
  if (fontStyle & FONT_STRIKETHROUGH) decorations.push("line-through");
  if (decorations.length) parts.push(`text-decoration:${decorations.join(" ")}`);
  return parts.join(";");
}

/**
 * Render tokenized lines to escaped HTML, one string per line. Colours travel
 * as `--shiki-*` custom properties; `style.css` resolves them per appearance.
 */
export function renderTokenLines(lines: SyntaxToken[][]): string[] {
  return lines.map((line) =>
    line
      .map((token) => {
        const text = escapeHtml(token.content);
        const style = tokenStyle(token.variants);
        return style ? `<span class="diff-tok" style="${style}">${text}</span>` : text;
      })
      .join(""),
  );
}

let corePromise: Promise<HighlighterCore> | null = null;

const THEME_IMPORTS: Record<DiffHighlightThemeFamily, Record<string, () => Promise<unknown>>> = {
  github: {
    light: () => import("@shikijs/themes/github-light-default"),
    dark: () => import("@shikijs/themes/github-dark-default"),
  },
  catppuccin: {
    catppuccinLight: () => import("@shikijs/themes/catppuccin-latte"),
    catppuccinDark: () => import("@shikijs/themes/catppuccin-mocha"),
  },
};

const loadedThemeFamilies = new Set<DiffHighlightThemeFamily>();

/** Load only the Shiki themes for the given family, once per process (#1046). */
async function ensureThemesForFamily(
  core: HighlighterCore,
  family: DiffHighlightThemeFamily,
): Promise<void> {
  if (loadedThemeFamilies.has(family)) return;
  const loaders = THEME_IMPORTS[family];
  await core.loadTheme(...Object.values(loaders).map((fn) => fn() as never));
  loadedThemeFamilies.add(family);
}

/** Create the shared highlighter once, loading core + engine on first use. */
function getCore(): Promise<HighlighterCore> {
  if (!corePromise) {
    corePromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import("@shikijs/core"),
        import("@shikijs/engine-javascript"),
      ]);
      return createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    })();
  }
  return corePromise;
}

const languageLoads = new Map<string, Promise<void>>();

/** Load one grammar exactly once, sharing the in-flight promise across callers. */
async function ensureLanguage(core: HighlighterCore, language: SupportedLanguage): Promise<void> {
  if (core.getLoadedLanguages().includes(language)) return;
  let pending = languageLoads.get(language);
  if (!pending) {
    pending = Promise.resolve(core.loadLanguage(LANGUAGE_LOADERS[language]() as never));
    languageLoads.set(language, pending);
  }
  await pending;
}

/**
 * Yield to the browser before the synchronous tokenize pass, so opening a file
 * never blocks navigation or the first paint of the plain-text rows.
 */
function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 400 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export interface HighlightPairInput {
  filename: string;
  /** Before-pane text, already split into lines. */
  before: string[];
  /** After-pane text, already split into lines. */
  after: string[];
  /**
   * Which Shiki light/dark pair to tokenize (#1046). Derived from `data-ui-theme`
   * via `diffHighlightFamilyForUiTheme` at the call site.
   */
  themeFamily: DiffHighlightThemeFamily;
}

export interface HighlightPairResult {
  before: string[];
  after: string[];
  language: SupportedLanguage | null;
  highlighted: boolean;
  /** Concise, user-facing explanation when highlighting was skipped. */
  notice: string | null;
}

/** FNV-1a over a string — cache key without storing full file bodies (#1046). */
function fnv1aHex(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function highlightPairCacheKey(input: HighlightPairInput): string {
  const { themeFamily, filename, before, after } = input;
  const body = `${filename}\n${before.join("\n")}\n--\n${after.join("\n")}`;
  return `${themeFamily}:${fnv1aHex(body)}`;
}

const highlightPairResultCache = new Map<string, HighlightPairResult>();

/**
 * Test and diagnostics: counts Shiki tokenize work vs cache reuse (#1046).
 * Reset in tests with `resetHighlightPairMetrics`.
 */
export const highlightPairMetrics = {
  shikiTokenizeRuns: 0,
  cacheHits: 0,
};

/** Clears the per-pair highlight cache (vitest only). */
export function resetHighlightPairCacheForTests(): void {
  highlightPairResultCache.clear();
}

/** Resets tokenize/cache metrics (vitest only). */
export function resetHighlightPairMetricsForTests(): void {
  highlightPairMetrics.shikiTokenizeRuns = 0;
  highlightPairMetrics.cacheHits = 0;
}

function plainResult(
  language: SupportedLanguage | null,
  before: string[],
  after: string[],
  notice: string | null,
): HighlightPairResult {
  return {
    before: before.map(escapeHtml),
    after: after.map(escapeHtml),
    language,
    highlighted: false,
    notice,
  };
}

/**
 * Highlight a full-file before/after pair. Always resolves to line-aligned HTML
 * arrays (identical length to the inputs); `highlighted` says whether they carry
 * token markup or safe escaped text.
 */
export async function highlightPair(input: HighlightPairInput): Promise<HighlightPairResult> {
  const { filename, before, after, themeFamily } = input;
  const language = detectLanguage(filename);
  if (!language) return plainResult(null, before, after, null);

  const totalLines = before.length + after.length;
  const totalChars =
    before.reduce((n, line) => n + line.length + 1, 0) +
    after.reduce((n, line) => n + line.length + 1, 0);
  if (totalLines > MAX_HIGHLIGHT_TOTAL_LINES || totalChars > MAX_HIGHLIGHT_TOTAL_CHARS) {
    return plainResult(
      language,
      before,
      after,
      `Plain text — file too large to highlight safely (${totalLines.toLocaleString()} lines).`,
    );
  }

  const cacheKey = highlightPairCacheKey(input);
  const cached = highlightPairResultCache.get(cacheKey);
  if (cached) {
    highlightPairMetrics.cacheHits++;
    return cached;
  }

  try {
    const core = await getCore();
    await ensureThemesForFamily(core, themeFamily);
    await ensureLanguage(core, language);
    await yieldToBrowser();
    const themes = HIGHLIGHT_THEME_IDS[themeFamily];
    const tokenize = (lines: string[]): string[] => {
      if (!lines.length) return [];
      highlightPairMetrics.shikiTokenizeRuns++;
      return renderTokenLines(
        core.codeToTokensWithThemes(lines.join("\n"), {
          lang: language,
          themes,
        }) as SyntaxToken[][],
      );
    };
    const result: HighlightPairResult = {
      before: tokenize(before),
      after: tokenize(after),
      language,
      highlighted: true,
      notice: null,
    };
    highlightPairResultCache.set(cacheKey, result);
    return result;
  } catch {
    return plainResult(language, before, after, "Plain text — syntax highlighting unavailable.");
  }
}
