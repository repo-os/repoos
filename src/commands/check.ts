/**
 * `repoos check` — the definition-of-done gate.
 *
 * Runs, in sequence: build staleness check, formatting & lint guard
 * (fmt:check + lint, since nothing else enforces them — deliberately BEFORE
 * the build: both are pure source-level checks with no build dependency, and
 * running them first means a formatting fix never has to pay for a second
 * full build in the same `repoos check` invocation — see the "Formatting &
 * lint guard" comment below), full build (tsc + asset copy), CSS layering
 * guard, theme contrast guard (button-gradient validity + WCAG contrast on
 * every theme's fg/bg token pairs), test suite (if present), and a headless
 * browser smoke test. The UI smoke step is per-project and opt-in (#0348): a
 * project declares a command via a `smoke` package.json script or `[check]
 * uiSmoke` in repoos.toml, and skips cleanly when it declares neither. RepoOS
 * itself opts in the same way (its `smoke` script runs src/commands/ui-smoke.ts).
 * The stylesheet guards are likewise opt-in (#0351): `[check] uiStylesheet`
 * plus a `themeScopes`/`contrastPairs`/`gradientTokens` vocabulary, so neither
 * guard carries a RepoOS-only path or token name.
 *
 * Exits non-zero on any failure. Designed for CI gates and agent pre-review.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { c } from "../cli/colors.js";
import { checkBuildForRoot, type BuildCheckResult } from "../core/build.js";
import { findRepoRoot, loadConfig } from "../core/config.js";
import type { CheckContrastPair, CheckThemeScope } from "../core/types.js";
import { availableMemBytes } from "../core/sysmem.js";
import { preferBunForDevTasks } from "../core/runtime.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

function pass(name: string, detail?: string): CheckResult {
  return { name, ok: true, detail };
}
function fail(name: string, detail: string): CheckResult {
  return { name, ok: false, detail };
}

/**
 * Split a CSS selector list on top-level commas (respecting parentheses,
 * so `:not(.a,.b)` stays one group).
 */
function selectorGroups(sel: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sel) {
    if (ch === "(") {
      depth++;
      cur += ch;
    } else if (ch === ")") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** True for a selector that targets every element of a kind: `*` or a bare tag. */
function isBroadSelector(g: string): boolean {
  if (g === "*") return true;
  return /^[a-z][a-z0-9-]*([\s.#:\[>~+]|$)/.test(g);
}

/** Recursively list `.ts` files under `dir`, skipping node_modules/dist/dotdirs. */
function walkTsFiles(dir: string, acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkTsFiles(full, acc);
    else if (e.name.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

/**
 * Bare `require(...)` calls guard (#0271 follow-up): this package is
 * `"type": "module"` (ESM) — a bare, un-shadowed `require` is undefined at
 * runtime in the compiled `dist/` output, throwing `ReferenceError`.
 * Confirmed live: `integration-job.ts`'s `removeJob()` used bare
 * `require("fs")` inside a try/catch that silently swallowed the
 * `ReferenceError`, so a moot close-out job was never actually deleted from
 * disk — it kept getting re-picked-up and re-processed in a tight infinite
 * loop, live, in production (task #0258), until someone noticed and asked
 * why it was stuck.
 *
 * vitest transpiles TypeScript on the fly with its own module loader, which
 * DOES provide a working `require()` even in these ESM-flagged files — so
 * this bug is invisible to every unit test that imports the affected module,
 * no matter how thorough. Only the actual compiled `dist/` output, run under
 * Node's real ESM semantics, exposes it. This static, textual guard is the
 * only check in the whole gate that runs against the real failure mode.
 *
 * `createRequire(...)` (a real, valid way to get a working `require` in ESM
 * — see `ui-harness.ts`) shadows the global; a file that uses it anywhere is
 * exempted file-wide rather than precisely scoping which calls are shadowed
 * and which aren't — simpler, and a false negative here just means a
 * legitimately-shadowed file's OTHER bare-require bugs (if any) go
 * uncaught, never that a broken bare require ships silently.
 */
export function bareRequireOffenders(
  roots: string[],
  opts: { repoRoot?: string; excludes?: string[] } = {},
): string[] {
  const offenders: string[] = [];
  const repoRoot = opts.repoRoot ?? ".";
  const excludes = (opts.excludes ?? []).map(normalizeGuardDir).filter(Boolean);
  for (const root of roots) {
    const rootRel = root === "." ? "." : normalizeGuardDir(root);
    if (!rootRel) continue;
    const absRoot = rootRel === "." ? repoRoot : join(repoRoot, rootRel);
    for (const absPath of walkTsFiles(absRoot)) {
      const relPath = relative(repoRoot, absPath).split(sep).join("/");
      if (relPath.endsWith(".test.ts")) continue; // vitest supplies its own require shim
      if (isExcludedPath(relPath, excludes)) continue;
      let content: string;
      try {
        content = readFileSync(absPath, "utf8");
      } catch {
        continue;
      }
      if (content.includes("createRequire")) continue; // legitimately shadowed file-wide
      content.split("\n").forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
        if (/\brequire\(/.test(line)) offenders.push(`${relPath}:${i + 1}`);
      });
    }
  }
  return offenders;
}

/**
 * Strip `//` and `/* *​/` comments and trailing commas from a tsconfig so it
 * parses as JSON (tsconfig.json is JSONC, which `JSON.parse` rejects). Both
 * transformations are string-aware: a `//` or `,]` inside a double-quoted
 * string value is left untouched, and only a comma whose next significant
 * token is `}` or `]` is dropped.
 */
function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  let inStr = false;
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") {
        out += text[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      out += ch;
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === ",") {
      const next = nextSignificantChar(text, i + 1);
      if (next === "}" || next === "]") {
        i++; // trailing comma
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/** The next non-whitespace, non-comment character at or after `from`, or null. */
function nextSignificantChar(text: string, from: number): string | null {
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    return ch;
  }
  return null;
}

/** Parse a `tsconfig.json` (JSONC) and read the fields the guard needs, or null. */
export function readTsconfig(
  repoRoot: string,
): { include?: unknown; files?: unknown; exclude?: unknown } | null {
  const path = join(repoRoot, "tsconfig.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(stripJsonComments(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

/**
 * Turn one tsconfig glob (`src/**​/*.ts`, `packages/app/src`, `lib/index.ts`)
 * into a repo-relative directory to walk. Returns `"."` for a whole-repo glob
 * (`**​/*.ts`), "" for anything absolute, home-relative, or negated.
 */
function globToScanRoot(glob: string): string {
  let g = glob.replace(/\\/g, "/");
  while (g.startsWith("./")) g = g.slice(2);
  if (g.startsWith("!") || g.startsWith("/") || g.startsWith("~")) return "";
  const globAt = g.search(/[*?[{]/);
  let base = globAt === -1 ? g : g.slice(0, globAt);
  if (/\.(ts|tsx|mts|cts)$/.test(base)) base = base.replace(/\/[^/]*$/, "");
  if (base === "" || base === ".") return ".";
  return normalizeGuardDir(base);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a tsconfig-style glob (`src/**​/*.ts`, `**​/*.spec.ts`) to a regex. */
function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          re += "(?:.*/)?"; // `**​/` — any number of leading directories
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "{") {
      const end = pattern.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        const alts = pattern
          .slice(i + 1, end)
          .split(",")
          .map(escapeRegExp);
        re += `(?:${alts.join("|")})`;
        i = end;
      }
    } else {
      re += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * Whether a repo-relative path is excluded. A literal path excludes that file
 * exactly, or — for a directory — everything beneath it. A pattern containing
 * glob metacharacters is compiled and matched against the whole path. Keeping
 * these distinct matters: `globToScanRoot("src/legacy.ts")` would collapse a
 * single-file exclude to `src` and wipe out the whole tree (#0352 review).
 */
function isExcludedPath(relPath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (!/[*?[{]/.test(p)) {
      if (relPath === p || relPath.startsWith(`${p}/`)) return true;
    } else if (globToRegExp(p).test(relPath)) {
      return true;
    }
  }
  return false;
}

export interface ResolvedBareRequireRoots {
  /** Repo-relative source roots to scan; empty when nothing could be resolved. */
  roots: string[];
  /**
   * Repo-relative globs/paths to skip — from `[check] bareRequireExcludes`, or
   * the tsconfig's own `exclude` when the roots came from there.
   */
  excludes: string[];
  /** Where the roots came from, for the check's status message. */
  source: "config" | "tsconfig" | "none";
}

/**
 * Decide which source roots the bare-`require()` guard scans (#0352). Explicit
 * `[check] bareRequireDirs` wins; otherwise the repo's tsconfig `include` (plus
 * `files`) is mapped to directories, minus its `exclude` list. Pure so the
 * resolution is unit-testable; if neither yields a root the guard skips rather
 * than passing vacuously.
 */
export function resolveBareRequireRoots(
  configured: string[] | undefined,
  tsconfig: { include?: unknown; files?: unknown; exclude?: unknown } | null,
  configuredExcludes?: string[],
): ResolvedBareRequireRoots {
  const normalizePatterns = (v: string[] | undefined): string[] => [
    ...new Set((v ?? []).map(normalizeGuardDir).filter(Boolean)),
  ];

  const configRoots = dedupeRoots(
    (configured ?? []).map((d) => (d === "." ? "." : normalizeGuardDir(d))).filter(Boolean),
  );
  if (configRoots.length) {
    return {
      roots: configRoots,
      excludes: normalizePatterns(configuredExcludes),
      source: "config",
    };
  }

  const patterns = [
    ...(Array.isArray(tsconfig?.include) ? tsconfig.include : []),
    ...(Array.isArray(tsconfig?.files) ? tsconfig.files : []),
  ].filter((v): v is string => typeof v === "string" && v.trim() !== "");
  const roots = dedupeRoots(patterns.map(globToScanRoot).filter(Boolean));
  const excludes = normalizePatterns(
    (Array.isArray(tsconfig?.exclude) ? tsconfig.exclude : []).filter(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    ),
  );
  return { roots, excludes, source: roots.length ? "tsconfig" : "none" };
}

/** Drop any root that is a descendant of another, and collapse to `["."]` if present. */
function dedupeRoots(roots: string[]): string[] {
  const set = [...new Set(roots)];
  if (set.includes(".")) return ["."];
  return set.filter((r) => !set.some((o) => o !== r && r.startsWith(`${o}/`)));
}

/**
 * Binary attachments (screenshots, PDFs) under the task/input folders must
 * never enter git history: they are uploaded through the UI, written to
 * `<dir>/.attachments/`, and served back by the running server from disk — the
 * committed record is the task/input `.md`, not the pixels. Binaries in
 * history bloat the repo irreversibly (this repo once carried ~250 MiB of
 * stale screenshot churn). Product image assets — UI, icons, logos, docs —
 * live outside those folders and stay tracked.
 *
 * The folder names come from `repoos.toml` (`workDir`/`inputsDir`) so a managed
 * repo that renames them still gets the guard; they default to `work`/`inputs`.
 *
 * Pure (takes the tracked-file list) so it is unit-testable; the check block
 * feeds it `git ls-files`.
 */
/**
 * Normalize a configured guard directory (`workDir`/`inputsDir`) for prefix
 * matching against `git ls-files` output, which is always repo-root-relative:
 * strip any leading `./` and trailing slashes. Returns empty for anything that
 * can't be a repo-relative directory — an explicit `""`, `"."`/`"./"`, an
 * absolute path, a home-relative `~/…`, or a path containing a `..` segment.
 * Those would all silently match nothing (or, for `""`, fatal git's pathspec),
 * so callers must treat empty as unusable rather than as "match everything".
 */
export function normalizeGuardDir(d: string): string {
  let trimmed = d;
  while (trimmed.startsWith("./")) trimmed = trimmed.slice(2);
  trimmed = trimmed.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === ".") return "";
  if (isAbsolute(trimmed) || trimmed.startsWith("~") || trimmed.split("/").includes("..")) {
    return "";
  }
  return trimmed;
}

export function taskAssetOffenders(
  trackedPaths: string[],
  dirs: { workDir?: string; inputsDir?: string } = {},
): string[] {
  const IMG = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|pdf)$/i;
  const prefixes = [dirs.workDir ?? "work", dirs.inputsDir ?? "inputs"]
    .map(normalizeGuardDir)
    .filter(Boolean)
    .map((d) => `${d}/`);
  return trackedPaths.filter((p) => prefixes.some((pre) => p.startsWith(pre)) && IMG.test(p));
}

/**
 * Scan a stylesheet for UNLAYERED universal/bare-element selectors.
 * With Tailwind v4 everything lives in cascade layers; an unlayered `*`
 * or tag rule silently beats every utility (unlayered > @layer), which
 * already collapsed all shadcn padding once. Scoped class/ID/attribute
 * rules are intentional legacy overrides and stay allowed.
 */
export function cssLayeringOffenders(css: string): string[] {
  const out: string[] = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const scopes: string[] = [];
  const inLayer = () => scopes.includes("layer");
  const inKeyframes = () => scopes.includes("keyframes");
  src.split("\n").forEach((line, li) => {
    let seg = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "{") {
        const sel = seg.trim();
        if (sel.startsWith("@")) {
          if (/^@keyframes\b/.test(sel)) scopes.push("keyframes");
          else if (/^@layer\b/.test(sel)) scopes.push("layer");
          else scopes.push("");
        } else {
          if (!inLayer() && !inKeyframes()) {
            for (const g of selectorGroups(sel)) {
              if (isBroadSelector(g)) out.push(`${li + 1}: ${g}`);
            }
          }
          scopes.push("");
        }
        seg = "";
      } else if (ch === "}") {
        scopes.pop();
        seg = "";
      } else if (ch === ";") {
        seg = "";
      } else {
        seg += ch;
      }
    }
  });
  return out;
}

function heading(label: string): void {
  console.log(c.bold(c.cyan(`\n  ◆ ${label}`)));
}

// ── Theme contrast guard ────────────────────────────────────────────────
// Every theme block a project declares defines text/button tokens as CSS
// custom properties in its stylesheet. Buttons may consume a bg token via
// `background-image` (a solid-color value then silently renders a transparent
// button), and hand-picked fg/bg pairs can drift into invisible text. The
// stylesheet path and the full token vocabulary — which blocks exist, how they
// inherit, which pairs to compare, which tokens must be gradients — come from
// `[check]` in repoos.toml (#0351). This module carries no RepoOS-specific
// selector or token names.

interface ThemeBlock {
  variant: string;
  decls: Record<string, string>;
}

const MIN_CONTRAST = 3.0;

/** The `[check]` token vocabulary the theme-contrast guard evaluates. */
export interface ThemeContrastConfig {
  scopes: CheckThemeScope[];
  pairs: CheckContrastPair[];
  gradientTokens: string[];
  /** Token to composite semi-transparent colors over; see CheckConfig. */
  backdropToken?: string;
}

function parseThemeBlocks(css: string, scopeNames: Map<string, string>): ThemeBlock[] {
  const blocks: ThemeBlock[] = [];
  let cur: string | null = null;
  let buf = "";
  for (const raw of css.split("\n")) {
    const t = raw.trim();
    if (cur === null) {
      if (t.endsWith("{") && !t.startsWith("@")) {
        const sel = t.slice(0, -1).trim();
        cur = scopeNames.get(sel) ?? "";
        buf = "";
      }
    } else if (t === "}") {
      if (cur) {
        const decls: Record<string, string> = {};
        for (const pair of buf.split(";")) {
          const idx = pair.indexOf(":");
          if (idx > 0) {
            const k = pair.slice(0, idx).trim();
            const v = pair.slice(idx + 1).trim();
            if (k.startsWith("--")) decls[k] = v;
          }
        }
        blocks.push({ variant: cur, decls });
      }
      cur = null;
    } else if (cur) {
      buf += t;
    }
  }
  return blocks;
}

function resolveVar(value: string, map: Record<string, string>, depth = 0): string {
  if (depth > 6) return value;
  const m = value.trim().match(/^var\(--([a-z0-9-]+)\)$/i);
  if (!m) return value;
  const next = map[`--${m[1]}`];
  return next !== undefined ? resolveVar(next, map, depth + 1) : value;
}

interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseColor(v: string): RGB | null {
  const s = v.trim().toLowerCase();
  if (!s || s === "none") return null;
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      const full = h
        .split("")
        .map((ch) => ch + ch)
        .join("");
      return parseColor("#" + full);
    }
    if (h.length === 6 || h.length === 8) {
      const n = parseInt(h.slice(0, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
    }
    return null;
  }
  const m = s.match(/^rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)$/);
  if (m) {
    return {
      r: parseInt(m[1], 10),
      g: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
      a: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }
  return null;
}

function composite(
  fg: RGB,
  bg: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

function channelLum(ch: number): number {
  const c = ch / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channelLum(c.r) + 0.7152 * channelLum(c.g) + 0.0722 * channelLum(c.b);
}

function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve a token value to concrete colors (composited over `bg`). */
function colorCandidates(
  raw: string,
  map: Record<string, string>,
  bg: { r: number; g: number; b: number },
): { r: number; g: number; b: number }[] {
  const resolved = resolveVar(raw, map);
  const out: { r: number; g: number; b: number }[] = [];
  if (resolved.includes("gradient(")) {
    const re = /#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|transparent/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(resolved))) {
      const c = parseColor(m[0]);
      if (c) out.push(composite(c, bg));
    }
  } else {
    const c = parseColor(resolved);
    if (c) out.push(composite(c, bg));
  }
  return out;
}

/**
 * An opaque backdrop to composite semi-transparent colors over before their
 * luminance is meaningful. Prefer the configured `backdropToken` (the page
 * background); otherwise fall back to the pair's own background token when that
 * resolves to a solid color; only then to white. A missing backdrop never skips
 * a pair — at worst it approximates an alpha channel.
 */
function resolveBackdrop(
  map: Record<string, string>,
  bgToken: string,
  backdropToken: string | undefined,
): { r: number; g: number; b: number } {
  const configured = backdropToken ? map[backdropToken] : undefined;
  for (const raw of [configured, map[bgToken]]) {
    if (raw === undefined) continue;
    const solid = parseColor(resolveVar(raw, map));
    if (solid) return composite(solid, solid);
  }
  return { r: 255, g: 255, b: 255 };
}

/**
 * True when at least one configured scope selector opens a block in `css`.
 * The theme-contrast step uses this to skip a stylesheet with no theme blocks
 * rather than keying off a hardcoded RepoOS selector like `:root`.
 */
export function hasThemeBlocks(css: string, scopes: CheckThemeScope[]): boolean {
  return parseThemeBlocks(css, new Map(scopes.map((s) => [s.selector, s.name]))).length > 0;
}

/**
 * Advisory config-shape warnings for declared theme scopes: a typo'd
 * `inherits` target or a duplicated selector/name otherwise collapses
 * silently (empty declarations / last-wins). Returned rather than thrown so
 * `repoos check` can surface them without failing the gate on a config typo.
 */
export function themeScopeConfigWarnings(scopes: CheckThemeScope[]): string[] {
  const warnings: string[] = [];
  const names = new Set(scopes.map((s) => s.name));
  const seenNames = new Set<string>();
  const seenSelectors = new Set<string>();
  for (const s of scopes) {
    if (seenNames.has(s.name)) warnings.push(`[check] themeScopes: duplicate name "${s.name}"`);
    seenNames.add(s.name);
    if (seenSelectors.has(s.selector)) {
      warnings.push(`[check] themeScopes: duplicate selector "${s.selector}"`);
    }
    seenSelectors.add(s.selector);
    for (const base of s.inherits ?? []) {
      if (!names.has(base)) {
        warnings.push(`[check] themeScopes: "${s.name}" inherits unknown scope "${base}"`);
      }
    }
  }
  return warnings;
}

export function themeContrastOffenders(css: string, config: ThemeContrastConfig): string[] {
  const { scopes, pairs, gradientTokens, backdropToken } = config;
  const blocks = parseThemeBlocks(css, new Map(scopes.map((s) => [s.selector, s.name])));
  if (!blocks.length) return [];
  const byVariant: Record<string, ThemeBlock> = {};
  for (const b of blocks) byVariant[b.variant] = b;
  const out: string[] = [];

  for (const scope of scopes) {
    const map: Record<string, string> = {};
    for (const base of scope.inherits?.length ? scope.inherits : [scope.name]) {
      Object.assign(map, byVariant[base]?.decls ?? {});
    }

    for (const tk of gradientTokens) {
      const raw = map[tk];
      if (raw !== undefined && !resolveVar(raw, map).includes("gradient(")) {
        out.push(`${scope.name} · ${tk} must be a gradient — it is consumed via background-image`);
      }
    }

    for (const { fg, bg: bgK } of pairs) {
      if (map[fg] === undefined || map[bgK] === undefined) continue;
      const backdrop = resolveBackdrop(map, bgK, backdropToken);
      const fgs = colorCandidates(map[fg], map, backdrop);
      const bgs = colorCandidates(map[bgK], map, backdrop);
      if (!fgs.length || !bgs.length) continue;
      let worst = Infinity;
      for (const f of fgs)
        for (const b of bgs) {
          const c = contrastRatio(luminance(f), luminance(b));
          if (c < worst) worst = c;
        }
      if (worst < MIN_CONTRAST) {
        out.push(`${scope.name} · ${fg} on ${bgK} → ${worst.toFixed(2)} (need ≥${MIN_CONTRAST})`);
      }
    }
  }
  return out;
}

/**
 * Which git ref (if any) to scope the Tests step to, via Vitest's own
 * `--changed <ref>` (git-diff + module graph, only runs tests that could
 * actually be affected). Unset for a standalone `repoos check` — that path
 * is the full definition-of-done gate and must never narrow coverage.
 *
 * Only the two per-branch pre-merge checks set this: the engineer's own
 * self-check before requesting handoff, and the server's handoff-finalize
 * re-verification (both re-checking the SAME isolated branch, just diffed
 * against its own base). The close-out gate that validates the actual merge
 * onto main (integration-orchestrator.ts's validateCandidate) deliberately
 * never sets it — that check is about interaction with whatever else has
 * landed on main since, which a per-branch diff can't see.
 */
export function changedTestRef(env: NodeJS.ProcessEnv): string | undefined {
  const ref = env.REPOOS_CHECK_CHANGED;
  return ref && ref.trim() ? ref.trim() : undefined;
}

/**
 * The `package.json` script name a project uses to opt into `repoos check`'s
 * UI smoke step with no configuration — the same zero-config convention
 * `build`/`test`/`lint` already follow elsewhere in this gate.
 */
export const UI_SMOKE_SCRIPT = "smoke";

export type SmokeCommand =
  | { source: "config"; command: string }
  | { source: "script"; script: string };

/**
 * Resolve which UI smoke command (if any) `repoos check` should run for the
 * current project (#0348). Precedence: `repoos.toml` `[check] uiSmoke` wins,
 * then a `smoke` package.json script, else null — the caller then skips the
 * step cleanly. RepoOS's own repo resolves through this same path (its `smoke`
 * script); there is no RepoOS-only fallback.
 */
export function resolveSmokeCommand(
  configured: string | undefined,
  pkgScripts: Record<string, string> | undefined,
): SmokeCommand | null {
  const fromConfig = configured?.trim();
  if (fromConfig) return { source: "config", command: fromConfig };
  if (pkgScripts?.[UI_SMOKE_SCRIPT]) return { source: "script", script: UI_SMOKE_SCRIPT };
  return null;
}

/**
 * Vitest worker-pool size for the Tests step. `vite.config.ts` pins a
 * conservative floor (`maxWorkers: 2`) because several agent-driven check runs
 * routinely overlap across worktrees and each pool otherwise multiplies against
 * the others. But a solo run on an idle machine with memory to spare leaves
 * most of the box idle — the subprocess-heavy suites (agent-review,
 * done-reliability, task-watchdog) are I/O-bound on `waitFor` polls, so more
 * workers is close to linear there.
 *
 * Scale up only with real headroom, gated on BOTH cpu count and reclaimable
 * memory (budget ~900MB per worker + its fixture subprocesses). An explicit
 * `REPOOS_TEST_WORKERS` always wins; anything else falls back to the config
 * floor via `undefined`.
 */
export function testPoolSize(env: NodeJS.ProcessEnv): number | undefined {
  const pinned = Number(env.REPOOS_TEST_WORKERS);
  if (Number.isFinite(pinned) && pinned >= 1) return Math.floor(pinned);
  const avail = availableMemBytes();
  // Scale up only with genuine headroom. `availableMem` counts reclaimable
  // inactive/cache, but on a box that has been thrashing that memory is slow
  // and expensive to actually reclaim — so also require it to be a solid
  // fraction of total before trusting it. A starved machine stays at the
  // config floor (2).
  if (avail < totalmem() * 0.45) return undefined;
  const byCpu = Math.floor(cpus().length * 0.75);
  const byMem = Math.floor(avail / (900 * 1024 * 1024));
  const n = Math.min(byCpu, byMem, 8);
  return n >= 3 ? n : undefined;
}

export async function cmdCheck(): Promise<void> {
  let exitCode = 0;
  const results: CheckResult[] = [];

  // ── 1. Build staleness ──────────────────────────────────────────────
  heading("Build staleness check");
  // `repoos check` validates the checkout it was invoked in. In particular,
  // a global/dev-linked CLI may be running from the main checkout while cwd
  // is a task worktree with its own source and build marker.
  const stale: BuildCheckResult = checkBuildForRoot(findRepoRoot());
  if (stale.stale && stale.applicable) {
    console.log(c.yellow(`  ⚠ ${stale.message}`));
    results.push(fail("staleness", stale.message ?? "build is stale"));
    exitCode = 1;
  } else if (stale.code === "fresh") {
    console.log(c.green("  ✔ Build is fresh"));
    results.push(pass("staleness"));
  } else {
    // Not a RepoOS-style build (no dist/ or no marker) — degrade to a skip
    // rather than failing a project whose pipeline simply isn't ours. See
    // checkBuildForRoot: `applicable` is false exactly when no marker exists.
    console.log(c.dim(`  · ${stale.message ?? stale.code}`));
    results.push(pass("staleness", stale.message ?? stale.code));
  }

  // ── 1b. Lockfile sync check ─────────────────────────────────────────
  // A dependency bump in package.json without a regenerated bun.lock passes
  // every other check here (node_modules is already installed) but breaks
  // `bun install --frozen-lockfile` for every fresh worktree bootstrap
  // (bootstrap.ts installDeps) — silently, since bootstrap runs on a
  // different checkout than the one that merged the drift. Dry-run makes
  // the frozen install fail loudly instead, before the merge lands.
  heading("Lockfile sync check");
  if (!existsSync("bun.lock")) {
    console.log(c.dim("  · No bun.lock — skipping"));
    results.push(pass("lockfile-sync", "skipped — no bun.lock"));
  } else {
    try {
      execSync("bun install --frozen-lockfile --dry-run", { stdio: "pipe", timeout: 60_000 });
      console.log(c.green("  ✔ bun.lock matches package.json"));
      results.push(pass("lockfile-sync"));
    } catch {
      const msg =
        "bun.lock is out of sync with package.json — run `bun install` and commit the updated lockfile";
      console.log(c.red("  ✗ " + msg));
      results.push(fail("lockfile-sync", msg));
      exitCode = 1;
    }
  }

  const pkg = JSON.parse(existsSync("package.json") ? readFileSync("package.json", "utf8") : "{}");

  // Per-project step config (#0348) — `[check] uiSmoke` from repoos.toml. Read
  // once here so the UI smoke step below can resolve its command without a
  // second config load; loadConfig is cheap and repoos.toml is git-tracked.
  const cfg = loadConfig(findRepoRoot());

  // ── 1c. Zero-runtime-dependencies guard ─────────────────────────────
  // "Zero runtime dependencies" is a hard design constraint (AGENTS.md),
  // publicly claimed on the landing page (landing/src/App.vue), and it has
  // already silently drifted from `package.json` once (#0343: mermaid ended
  // up in `dependencies` instead of `devDependencies`, discovered only by a
  // manual audit). This makes the claim self-enforcing instead of
  // convention-only.
  //
  // Scoped to RepoOS's own package.json (`name === "repoos"`) rather than
  // running for every managed project: this constraint is specific to this
  // repo, not a general rule `repoos check` should impose on projects it
  // manages (a typical managed project has legitimate runtime deps). #0348
  // tracks making check steps like this declarable per-project instead of
  // hardcoded here; do not widen this scope without that mechanism.
  heading("Zero runtime dependencies guard");
  if (pkg.name !== "repoos") {
    results.push(pass("zero-runtime-deps", "skipped — not RepoOS's own package.json"));
  } else {
    const deps = Object.keys(pkg.dependencies ?? {});
    if (deps.length > 0) {
      const msg =
        `package.json "dependencies" must be empty (zero runtime dependencies is a hard ` +
        `design constraint — AGENTS.md). Found: ${deps.join(", ")}. Move build-time-only ` +
        `packages to devDependencies, or if the constraint no longer holds, update AGENTS.md ` +
        `and landing/src/App.vue's "Zero runtime dependencies" claim instead (see #0343).`;
      console.log(c.red("  ✗ " + msg));
      results.push(fail("zero-runtime-deps", msg));
      exitCode = 1;
    } else {
      console.log(c.green("  ✔ package.json has no runtime dependencies"));
      results.push(pass("zero-runtime-deps"));
    }
  }

  // ── 1d. Formatting & lint guard ──────────────────────────────────────
  // Nothing else runs the formatter/linter — no git hook, no CI job — so
  // without this step `dist/` builds fine while the source silently drifts out
  // of the house style (that's how it accumulated ~10 unformatted files). Both
  // are sub-second with oxfmt/oxlint. Gated on the scripts existing so a plain
  // `repoos init` repo without them just skips.
  // Runs BEFORE the build (not after, as it originally did): fmt/lint are
  // pure source-level checks, no build dependency either way, but a fix
  // (`bun run fmt`) rewrites files — if that happened after a build already
  // ran, the next `repoos check` would see source newer than the build
  // marker and pay for a second full rebuild of nothing but whitespace
  // changes. Checking first means the build only ever runs once source is
  // already clean.
  heading("Formatting & lint guard");
  // Gates the (expensive) Full build and UI smoke test below: a fix here
  // (`bun run fmt`) rewrites source, so a build against the still-unformatted
  // tree is immediately invalidated the moment that fix lands — building it
  // anyway just burns a full tsc pass for nothing. This doesn't weaken the
  // gate: it already fails this run (exitCode is set below) either way, so
  // there is no scenario where skipping the build here lets a broken one
  // slip through unnoticed — it only defers verifying the build to the
  // rerun once source is actually clean.
  let fmtLintFailed = false;
  for (const [label, script, hint] of [
    ["Formatting", "fmt:check", "run `bun run fmt` to fix"],
    ["Lint", "lint", "fix the reported errors"],
  ] as const) {
    if (!pkg.scripts?.[script]) {
      console.log(c.dim(`  · No \`${script}\` script — skipping ${label.toLowerCase()}`));
      results.push(pass(`check-${script}`, `skipped — no ${script} script`));
      continue;
    }
    try {
      execSync(`${preferBunForDevTasks() ? "bun run" : "npm run"} ${script}`, {
        stdio: "pipe",
        timeout: 120_000,
      });
      console.log(c.green(`  ✔ ${label} clean`));
      results.push(pass(`check-${script}`));
    } catch (e) {
      const out = [(e as { stdout?: Buffer }).stdout, (e as { stderr?: Buffer }).stderr]
        .map((b) => b?.toString().trim())
        .filter(Boolean)
        .join("\n");
      const msg = `${label} check failed — ${hint}:\n${out || (e as Error).message}`;
      console.log(c.red(`  ✗ ${label} check failed — ${hint}`));
      results.push(fail(`check-${script}`, msg));
      exitCode = 1;
      fmtLintFailed = true;
    }
  }

  // ── 2. Full build ───────────────────────────────────────────────────
  // Always run `bun run build`; it is staleness-aware now (scripts/build.mjs,
  // #0377) and skips in ~0.1s when src/ is unchanged since the marker was
  // written. That replaces the old REPOOS_SKIP_BUILD opt-in: the close-out
  // pipeline (src/server/done.ts, integration-orchestrator.ts, release.ts) runs
  // `bun run build` just before invoking `repoos check`, and this step now
  // detects the fresh marker on its own instead of via a private env flag.
  //
  // The staleness step above still runs and reports FIRST (#0276): a genuinely
  // stale build is surfaced there, then this step repairs it within the same
  // invocation. The build's skip is safe here precisely because step 1 already
  // verified the marker matches src/ — a stale or missing marker never skips.
  heading("Full build");
  if (fmtLintFailed) {
    console.log(
      c.dim(
        "  · Skipped — formatting/lint failed above; fix that first, dist would be stale " +
          "the moment you do, and this run already fails regardless",
      ),
    );
    results.push(pass("build", "skipped — formatting/lint failed, fix and rerun"));
  } else {
    try {
      execSync("bun run build", { stdio: "inherit", timeout: 120_000 });
      console.log(c.green("  ✔ Build succeeded"));
      results.push(pass("build"));
    } catch (e) {
      const msg = (e as Error).message;
      console.log(c.red("  ✗ Build failed"));
      results.push(fail("build", msg));
      exitCode = 1;
    }
  }

  // ── 2b. CSS layering guard ──────────────────────────────────────────
  // Both stylesheet guards below read `[check] uiStylesheet` (#0351): there is
  // no RepoOS-shaped default path, so a project that declares neither a
  // stylesheet nor a token vocabulary skips both cleanly. The path is resolved
  // against the repo root (not cwd) and read once here; a configured path that
  // doesn't exist is a misconfiguration worth a warning, not a silent skip.
  heading("CSS layering guard");
  const cssRelPath = cfg.check?.uiStylesheet;
  const repoRoot = findRepoRoot();
  const cssPath = cssRelPath && !isAbsolute(cssRelPath) ? join(repoRoot, cssRelPath) : cssRelPath;
  const cssExists = Boolean(cssPath && existsSync(cssPath));
  if (cssRelPath && !cssExists) {
    console.log(
      c.yellow(
        `  ⚠ [check] uiStylesheet "${cssRelPath}" does not exist in this repo — stylesheet guards will skip`,
      ),
    );
  }
  const cssSrc = cssPath && cssExists ? readFileSync(cssPath, "utf8") : "";
  if (!cssRelPath) {
    console.log(c.dim("  · No [check] uiStylesheet configured — skipping"));
    results.push(pass("css-layers", "skipped — no [check] uiStylesheet configured"));
  } else if (!cssExists) {
    console.log(c.dim(`  · ${cssRelPath} does not exist — skipping`));
    results.push(pass("css-layers", `skipped — ${cssRelPath} not found`));
  } else if (!cssSrc.includes('@import "tailwindcss"')) {
    console.log(c.dim(`  · ${cssPath} is not a Tailwind v4 stylesheet — skipping`));
    results.push(pass("css-layers", `skipped — ${cssPath} has no Tailwind v4 import`));
  } else {
    const offenders = cssLayeringOffenders(cssSrc);
    if (offenders.length > 0) {
      const msg =
        "Unlayered universal/bare-element selectors (they silently beat all Tailwind utilities):\n    " +
        offenders.slice(0, 8).join("\n    ") +
        "\n    Wrap them in @layer base or scope them to a class/id.";
      console.log(c.red("  ✗ " + msg.split("\n")[0]));
      results.push(fail("css-layers", msg));
      exitCode = 1;
    } else {
      console.log(c.green("  ✔ No unlayered universal/bare-element selectors"));
      results.push(pass("css-layers"));
    }
  }

  // ── 2c. Theme contrast guard ────────────────────────────────────────
  heading("Theme contrast guard");
  const themeScopes = cfg.check?.themeScopes ?? [];
  for (const w of themeScopeConfigWarnings(themeScopes)) console.log(c.yellow(`  ⚠ ${w}`));
  if (!cssRelPath) {
    console.log(c.dim("  · No [check] uiStylesheet configured — skipping"));
    results.push(pass("theme-contrast", "skipped — no [check] uiStylesheet configured"));
  } else if (!cssExists) {
    console.log(c.dim(`  · ${cssRelPath} does not exist — skipping`));
    results.push(pass("theme-contrast", `skipped — ${cssRelPath} not found`));
  } else if (!themeScopes.length) {
    console.log(c.dim("  · No [check] themeScopes configured — skipping"));
    results.push(pass("theme-contrast", "skipped — no [check] themeScopes configured"));
  } else if (!hasThemeBlocks(cssSrc, themeScopes)) {
    console.log(c.dim(`  · No configured theme scope matched a block in ${cssRelPath} — skipping`));
    results.push(pass("theme-contrast", "skipped — no configured theme block found"));
  } else {
    const offenders = themeContrastOffenders(cssSrc, {
      scopes: themeScopes,
      pairs: cfg.check?.contrastPairs ?? [],
      gradientTokens: cfg.check?.gradientTokens ?? [],
      backdropToken: cfg.check?.backdropToken,
    });
    if (offenders.length > 0) {
      const msg =
        "Low-contrast or invalid theme tokens (invisible text risk):\n    " +
        offenders.slice(0, 10).join("\n    ");
      console.log(c.red("  ✗ " + msg.split("\n")[0]));
      results.push(fail("theme-contrast", msg));
      exitCode = 1;
    } else {
      console.log(c.green("  ✔ Theme tokens have valid button gradients and ≥3:1 contrast"));
      results.push(pass("theme-contrast"));
    }
  }

  // ── 2d. Bare require() guard ─────────────────────────────────────────
  // The bug this guards is specific to `"type": "module"` packages (a bare
  // `require` is valid in CJS), and the directories to scan are per-project
  // (#0352): `[check] bareRequireDirs`, else the tsconfig include list.
  heading("Bare require() guard");
  {
    const resolved = resolveBareRequireRoots(
      cfg.check?.bareRequireDirs,
      readTsconfig(repoRoot),
      cfg.check?.bareRequireExcludes,
    );
    if (pkg.type !== "module") {
      console.log(
        c.dim(
          '  · package.json is not "type": "module" — skipping (bare require() is valid in CJS)',
        ),
      );
      results.push(pass("bare-require", 'skipped — package.json is not "type": "module"'));
    } else if (resolved.roots.length === 0) {
      console.log(
        c.dim(
          "  · No source roots to scan — set [check] bareRequireDirs or a tsconfig include — skipping",
        ),
      );
      results.push(pass("bare-require", "skipped — no source roots configured"));
    } else {
      const offenders = bareRequireOffenders(resolved.roots, {
        repoRoot,
        excludes: resolved.excludes,
      });
      if (offenders.length > 0) {
        const msg =
          'Bare require() in ESM source (this package is "type": "module" — a bare require throws ' +
          "ReferenceError at runtime in dist/, silently if caught):\n    " +
          offenders.slice(0, 10).join("\n    ") +
          '\n    Import from "node:..." normally, or use createRequire(import.meta.url) if you ' +
          "genuinely need CJS interop (see ui-harness.ts).";
        console.log(c.red("  ✗ " + msg.split("\n")[0]));
        results.push(fail("bare-require", msg));
        exitCode = 1;
      } else {
        const from = resolved.source === "config" ? "[check] bareRequireDirs" : "tsconfig include";
        console.log(c.green(`  ✔ No bare require() calls in ESM source (${from})`));
        results.push(pass("bare-require"));
      }
    }
  }

  // ── 2d′. Task / input asset guard ───────────────────────────────────
  heading("Task asset guard");
  {
    // Folder names are configurable (`workDir`/`inputsDir` in repoos.toml); a
    // managed repo that renames them must still be guarded, so read them rather
    // than assuming the default `work`/`inputs`.
    const config = loadConfig();
    const inputsDirRaw = config.inputsDir ?? "inputs";
    const guardDirs = [
      { label: "workDir", raw: config.workDir, norm: normalizeGuardDir(config.workDir) },
      { label: "inputsDir", raw: inputsDirRaw, norm: normalizeGuardDir(inputsDirRaw) },
    ];
    for (const { label, raw, norm } of guardDirs) {
      if (!norm) {
        console.log(
          c.yellow(
            `  ⚠ repoos.toml's ${label} ("${raw}") doesn't resolve to a repo-relative ` +
              "directory — the task-asset guard can't be scoped to it. Fix the config.",
          ),
        );
      }
    }
    // Only usable, repo-relative dirs go into the pathspec. An empty one is
    // dropped, not passed to git (`git ls-files -- ""` exits fatally, and the
    // catch below would turn that into a silent green). If BOTH are unusable
    // the guard can't run at all — fail loudly rather than pass with nothing
    // to check.
    const usableDirs = guardDirs.map((d) => d.norm).filter(Boolean);
    if (usableDirs.length === 0) {
      const msg =
        "task-asset guard is disabled — neither workDir nor inputsDir in repoos.toml resolves " +
        "to a repo-relative directory, so no task/input folder can be checked. Fix the config.";
      console.log(c.red("  ✗ " + msg));
      results.push(fail("task-assets", msg));
      exitCode = 1;
    } else {
      let tracked: string[] = [];
      try {
        // Pathspecs are pre-validated (non-empty, repo-relative) above, so a
        // failure here means no git repo / git unavailable — not bad config.
        tracked = execFileSync("git", ["ls-files", "--", ...usableDirs], {
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        })
          .split("\n")
          .filter(Boolean);
      } catch {
        /* not a git repo / git unavailable — nothing to guard */
      }
      const offenders = taskAssetOffenders(tracked, {
        workDir: config.workDir,
        inputsDir: inputsDirRaw,
      });
      const labels = usableDirs.map((d) => `${d}/`).join(" or ");
      if (offenders.length > 0) {
        const msg =
          `Binary attachments committed under ${labels} — these are served by ` +
          "the running server from disk and must never enter git history (it bloats the repo " +
          "irreversibly). Run `git rm --cached` on them (they stay on disk) and let " +
          "`.gitignore` keep them out:\n    " +
          offenders.slice(0, 15).join("\n    ") +
          (offenders.length > 15 ? `\n    …and ${offenders.length - 15} more` : "");
        console.log(c.red("  ✗ " + msg.split("\n")[0]));
        results.push(fail("task-assets", msg));
        exitCode = 1;
      } else {
        console.log(c.green(`  ✔ No committed binaries under ${labels}`));
        results.push(pass("task-assets"));
      }
    }
  }

  // ── 3. Tests (if any) ───────────────────────────────────────────────
  heading("Tests");
  const hasTestScript = Boolean(pkg.scripts && pkg.scripts.test);
  const hasTestFiles = existsSync("test") || existsSync("__tests__") || existsSync("tests");
  // The close-out pipeline can hand the test suite to the Remote Validation
  // Runner (docs/remote-validation.md) — a Hetzner VM runs `bun run build` +
  // `bun run test` off this machine — and then invoke the LOCAL `repoos check`
  // with REPOOS_SKIP_TESTS=1 for only the cheap static guards + UI smoke.
  // Standalone `repoos check` never sets it, so the CLI gate is unchanged.
  if (process.env.REPOOS_SKIP_TESTS === "1") {
    console.log(
      c.dim("  · Skipped — test suite ran on the remote validation runner (REPOOS_SKIP_TESTS=1)"),
    );
    results.push(pass("tests", "skipped — ran on the remote validation runner"));
  } else if (hasTestScript || hasTestFiles) {
    // Only the vitest-backed `bun run test` script understands `--changed`;
    // the bare `bun test` fallback (no package.json test script) is left
    // unscoped. `--bun` forces vitest's `#!/usr/bin/env node` shebang onto
    // Bun for a Bun-native repo (has bun.lock) unless pinned to Node — ~5x
    // faster and it stops the swap-thrash flake on a loaded machine.
    // preferBunForDevTasks() checks the lockfile so a managed repo whose
    // tests want Node is never switched.
    const changedRef = hasTestScript ? changedTestRef(process.env) : undefined;
    const runScript = preferBunForDevTasks() ? "bun run --bun test" : "bun run test";
    const cmd = hasTestScript
      ? changedRef
        ? `${runScript} -- --changed ${changedRef}`
        : runScript
      : "bun test";
    if (changedRef) {
      console.log(c.dim(`  · Scoped to files changed vs ${changedRef} (--changed)`));
    }
    // Worker pool: `undefined` keeps the config floor (2). A solo run with
    // headroom scales up — passed through env, read back in vite.config.ts.
    const workers = hasTestScript ? testPoolSize(process.env) : undefined;
    const testEnv = workers
      ? { ...process.env, REPOOS_TEST_WORKERS: String(workers) }
      : process.env;
    if (workers && !changedRef) {
      const availGiB = (availableMemBytes() / 1024 ** 3).toFixed(1);
      console.log(c.dim(`  · Full suite · ${workers} workers (${availGiB} GiB reclaimable)`));
    }
    // A full unscoped run is ~10min even healthy and can legitimately reach
    // ~25min on a slow box; a too-tight cap SIGTERMs `bun run test` mid-run
    // (exit 143) even when every test is green. Vitest's own per-test
    // `testTimeout` fails a genuine hang fast; this is only the outer backstop.
    const timeoutMs = changedRef ? 300_000 : 1_500_000;
    try {
      execSync(cmd, { stdio: "inherit", timeout: timeoutMs, env: testEnv });
      console.log(c.green("  ✔ Tests passed"));
      results.push(pass("tests", changedRef ? `scoped to changed vs ${changedRef}` : undefined));
    } catch (e) {
      console.log(c.red("  ✗ Tests failed"));
      results.push(fail("tests", (e as Error).message));
      exitCode = 1;
    }
  } else {
    console.log(c.dim("  · No test suite found — skipping"));
    results.push(pass("tests", "skipped — no test suite"));
  }

  // ── 4. UI smoke test ────────────────────────────────────────────────
  // Per-project and opt-in (#0348). `repoos check` is the generic gate every
  // managed project runs, so it must not boot RepoOS's own dashboard for a
  // project that never declared a smoke command — that either silently tested
  // RepoOS's UI or failed on RepoOS-only infrastructure. A project opts in
  // with a `smoke` package.json script (zero-config default) or `[check]
  // uiSmoke` in repoos.toml (overrides the script). With neither, the step
  // skips cleanly. RepoOS dogfoods this: its own dashboard assertions live in
  // src/commands/ui-smoke.ts behind a `smoke` script (scripts/ui-smoke.mjs),
  // so the declaration path is exercised on every RepoOS check.
  heading("UI smoke test");
  const smokeCommand = resolveSmokeCommand(cfg.check?.uiSmoke, pkg.scripts);
  if (fmtLintFailed) {
    // Build was skipped above, so dist reflects whatever the last successful
    // build was (possibly stale, possibly absent) — never a build of the
    // current, still-unformatted source. Probing it here would be testing the
    // wrong thing — the same reason the build step above is gated on it.
    console.log(c.dim("  · Skipped — formatting/lint failed above, so build was skipped too"));
    results.push(pass("ui-smoke", "skipped — formatting/lint failed, fix and rerun"));
  } else if (smokeCommand) {
    const runner = preferBunForDevTasks() ? "bun run" : "npm run";
    const cmd =
      smokeCommand.source === "config" ? smokeCommand.command : `${runner} ${smokeCommand.script}`;
    const origin =
      smokeCommand.source === "config"
        ? "repoos.toml [check] uiSmoke"
        : "package.json smoke script";
    console.log(c.dim(`  · Running ${origin}: ${cmd}`));
    try {
      execSync(cmd, { stdio: "inherit", timeout: 300_000 });
      console.log(c.green("  ✔ Smoke command passed"));
      results.push(pass("ui-smoke", `ran ${origin}`));
    } catch (e) {
      console.log(c.red("  ✗ Smoke command failed"));
      results.push(fail("ui-smoke", (e as Error).message));
      exitCode = 1;
    }
  } else {
    console.log(c.dim("  · No smoke command configured — skipping"));
    console.log(
      c.dim(
        '    Declare one with a `smoke` package.json script or [check] uiSmoke = "bun run smoke" in repoos.toml',
      ),
    );
    results.push(pass("ui-smoke", "skipped — no smoke command configured"));
  }

  // ── Summary ─────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(c.bold(c.cyan("\n  ── Results ──")));
  for (const r of results) {
    const icon = r.ok ? c.green("✔") : c.red("✗");
    const detail = r.detail ? c.dim(`  — ${r.detail}`) : "";
    console.log(`  ${icon} ${r.name}${detail}`);
  }
  if (failed.length === 0) {
    console.log(c.bold(c.green("\n  All checks passed.\n")));
  } else {
    console.log(c.bold(c.red(`\n  ${failed.length} check(s) failed.\n`)));
  }
  process.exit(exitCode);
}
