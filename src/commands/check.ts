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
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { c } from "../cli/colors.js";
import { checkBuildForRoot } from "../core/build.js";
import { findRepoRoot, loadConfig } from "../core/config.js";
import type { CheckContrastPair, CheckThemeScope, RepoOSConfig } from "../core/types.js";
import { availableMemBytes } from "../core/sysmem.js";
import { preferBunForDevTasks } from "../core/runtime.js";
import {
  blockingFailures,
  DEFAULT_PROFILE,
  describeStep,
  formatPlanToml,
  resolveCheckPlan,
  selectSteps,
  type BuiltinCheckKind,
  type CheckPlan,
  type CheckStep,
} from "../core/check-plan.js";
import {
  detectRepoMarkers,
  missingBinaries,
  prereqDetail,
  runCommand,
  stepCwd,
  type StepRunResult,
  type StepStatus,
} from "../core/check-runner.js";
import { writeCheckRun } from "../core/check-results-store.js";

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

// KNOWN LIMITATION (fix tracked in #0504, found while registering the gruvbox
// theme in #0503): the rgb()/rgba() branches below tolerate no whitespace between
// components, but oxfmt writes `rgba(110, 157, 106, 0.22)` with spaces, so every
// spaced literal fails to parse and returns null. A pair whose fg or bg yields no
// candidates is SKIPPED rather than failed, so a `[check] contrastPairs` bg token
// written as a spaced `rgba()` is silently never checked — as are the spaced
// `rgba()` stops inside a gradient, which drop out of `colorCandidates`. Measured
// on this repo's own stylesheet: 425 spaced literals, leaving 4-6 of the 9
// configured pairs unchecked in every theme. A whitespace-tolerant regex (`\s*`
// after each separator) was measured to produce ZERO new offenders across all five
// themes, so the fix is a one-liner that only strengthens the gate. It is its own
// task rather than folded into a theme change because it alters the guard's
// behaviour repo-wide and for every project that configures
// `[check] contrastPairs`. Until it lands, do not rely on this guard to catch a
// contrast problem in a token written as `rgba(r, g, b, a)`; gruvbox deliberately
// uses 8-digit hex for its checked alpha tokens to stay verifiable.
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
  const m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
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
    const re =
      /#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)|transparent/g;
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

// ── Plan-driven gate (#0446) ────────────────────────────────────────────
// Everything above is a pure guard or resolver. What follows is the gate
// itself: it resolves a declarative plan (declared `[[check.steps]]`, else the
// legacy per-step keys, else stack inference) and runs exactly that, for any
// stack. Nothing here assumes a package.json, a Bun pipeline, or a JS build.

/** `repoos check` CLI flags (#0446). */
export interface CheckOptions {
  /** Profile to select. Defaults to `[check] defaultProfile`, else `default`. */
  profile?: string;
  /** Git ref for changed-path mode. Also read from `REPOOS_CHECK_CHANGED`. */
  changed?: string;
  /** Print the resolved plan as `[[check.steps]]` TOML and exit 0. */
  printPlan?: boolean;
}

/** Parse `repoos check` flags. Unknown flags are ignored, never fatal. */
export function parseCheckArgs(argv: string[] = []): CheckOptions {
  const opts: CheckOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile" || a === "-p") opts.profile = argv[++i];
    else if (a === "--changed") opts.changed = argv[++i];
    else if (a === "--print-plan") opts.printPlan = true;
  }
  return opts;
}

interface PkgJson {
  name?: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, unknown>;
}

/** Everything one step needs to run: repo root, its own cwd, config, manifest. */
interface StepContext {
  repoRoot: string;
  /** Absolute working directory for this step. */
  cwd: string;
  cfg: RepoOSConfig;
  /** The repo-root package.json — RepoOS's own invariants are read from here. */
  pkg: PkgJson;
  /**
   * The package.json in the step's own `cwd`. A monorepo step declared with
   * `cwd = "web"` must read web's scripts, not the root's.
   */
  scriptPkg: PkgJson;
  /**
   * Binaries the step declared it needs. Checked only once the step knows it
   * actually applies — see `prereqs`.
   */
  requires: string[];
  /** Git ref for changed-path mode, when active. */
  changedRef?: string;
}

/** What a built-in `kind` handler returns. */
interface BuiltinOutcome {
  status: StepStatus;
  /** The command it resolved to (so the results block can name it). */
  command?: string;
  detail?: string;
  output?: string;
}

function skipped(detail: string): BuiltinOutcome {
  return { status: "skipped", detail };
}

/** Read a repo's package.json, tolerating an absent or broken file. */
function readPkg(dir: string): PkgJson {
  try {
    const raw = readFileSync(join(dir, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PkgJson) : {};
  } catch {
    return {};
  }
}

/** The `bun run` / `npm run` prefix this project's scripts should use. */
function scriptRunner(cwd: string): "bun" | "npm" {
  return preferBunForDevTasks(cwd) ? "bun" : "npm";
}

/**
 * A missing-prerequisite outcome for the tools this step needs, or null when
 * everything is installed.
 *
 * Handlers call this AFTER deciding the step applies to this repo, never
 * before: a `kind` that would skip anyway (no `bun.lock`, no `build` script)
 * must keep skipping, whether or not its nominal tool is installed. Checking
 * `requires` up front instead would turn "this repo has no Bun pipeline" into
 * a hard failure on a Node-only machine — exactly the compatibility break
 * #0446 exists to avoid.
 */
function prereqs(ctx: StepContext, extra: string[] = []): BuiltinOutcome | null {
  const missing = missingBinaries([...ctx.requires, ...extra]);
  return missing.length > 0 ? { status: "missing-prereq", detail: prereqDetail(missing) } : null;
}

/**
 * Run a package.json script through the project's own runner. A missing script
 * is an explicit skip — never an unconditional `bun run build` for a repo that
 * has no build script (#0446) — and a missing runner is a `missing-prereq`
 * failure with install advice, because a required step that cannot run must
 * not read as green.
 */
async function runScript(
  ctx: StepContext,
  script: string,
  opts: { label: string; hint: string; timeoutMs: number; echo: boolean },
): Promise<BuiltinOutcome> {
  if (!ctx.scriptPkg.scripts?.[script]) {
    return skipped(`skipped — no \`${script}\` script in package.json`);
  }
  const runner = scriptRunner(ctx.cwd);
  const command = `${runner} run ${script}`;
  const blocked = prereqs(ctx, [runner]);
  if (blocked) return { ...blocked, command };

  const res = await runCommand({
    command,
    cwd: ctx.cwd,
    timeoutMs: opts.timeoutMs,
    echo: opts.echo,
  });
  if (res.status === "passed") return { status: "passed", command, output: res.output };
  if (res.status === "timeout") {
    return {
      status: "timeout",
      command,
      detail: `timed out after ${timeoutLabel(opts.timeoutMs)}`,
      output: res.output,
    };
  }
  const out = res.output.trim();
  return {
    status: "failed",
    command,
    detail: `${opts.label} failed — ${opts.hint}${out ? `:\n${out}` : ` (${res.error ?? `exit ${res.exitCode}`})`}`,
    output: res.output,
  };
}

// ── Built-in step kinds ─────────────────────────────────────────────────

async function stepStaleness(ctx: StepContext): Promise<BuiltinOutcome> {
  const stale = checkBuildForRoot(ctx.repoRoot);
  if (stale.stale && stale.applicable) {
    return { status: "failed", detail: stale.message ?? "build is stale" };
  }
  if (stale.code === "fresh") return { status: "passed" };
  // Not a RepoOS-style build — an explicit skip, not a pass, and not a
  // failure of a project whose pipeline simply isn't ours.
  return skipped(`skipped — ${stale.message ?? stale.code}`);
}

async function stepLockfileSync(ctx: StepContext): Promise<BuiltinOutcome> {
  if (!existsSync(join(ctx.cwd, "bun.lock"))) return skipped("skipped — no bun.lock");
  const command = "bun install --frozen-lockfile --dry-run";
  // Only now does the missing `bun` matter — a repo with no bun.lock is not a
  // Bun repo, and the step is already skipping.
  const blocked = prereqs(ctx, ["bun"]);
  if (blocked) return { ...blocked, command };
  const res = await runCommand({ command, cwd: ctx.cwd, timeoutMs: 60_000, echo: false });
  if (res.status === "passed") return { status: "passed", command };
  if (res.status === "timeout") {
    return { status: "timeout", command, detail: "timed out after 60s", output: res.output };
  }
  return {
    status: "failed",
    command,
    detail:
      "bun.lock is out of sync with package.json — run `bun install` and commit the updated lockfile",
    output: res.output,
  };
}

async function stepZeroRuntimeDeps(ctx: StepContext): Promise<BuiltinOutcome> {
  // Scoped to RepoOS's own package.json: zero runtime dependencies is this
  // repo's constraint, not a rule to impose on managed projects.
  const base = typeof ctx.pkg.name === "string" ? ctx.pkg.name.split("/").pop() : undefined;
  if (base !== "repoos") return skipped("skipped — not RepoOS's own package.json");
  const deps = Object.keys(ctx.pkg.dependencies ?? {});
  if (deps.length === 0) return { status: "passed" };
  return {
    status: "failed",
    detail:
      `package.json "dependencies" must be empty (zero runtime dependencies is a hard ` +
      `design constraint — AGENTS.md). Found: ${deps.join(", ")}. Move build-time-only ` +
      `packages to devDependencies, or if the constraint no longer holds, update AGENTS.md ` +
      `and landing/src/App.vue's "Zero runtime dependencies" claim instead (see #0343).`,
  };
}

async function stepCssLayers(ctx: StepContext): Promise<BuiltinOutcome> {
  const css = readStylesheet(ctx);
  if (!css) return skipped(cssSkipReason(ctx));
  const { path, src } = css;
  if (!src.includes('@import "tailwindcss"')) {
    return skipped(`skipped — ${path} is not a Tailwind v4 stylesheet`);
  }
  const offenders = cssLayeringOffenders(src);
  if (offenders.length === 0) return { status: "passed" };
  return {
    status: "failed",
    detail:
      "Unlayered universal/bare-element selectors (they silently beat all Tailwind utilities):\n    " +
      offenders.slice(0, 8).join("\n    ") +
      "\n    Wrap them in @layer base or scope them to a class/id.",
  };
}

async function stepThemeContrast(ctx: StepContext): Promise<BuiltinOutcome> {
  const scopes = ctx.cfg.check?.themeScopes ?? [];
  const css = readStylesheet(ctx);
  if (!css) return skipped(cssSkipReason(ctx));
  if (!scopes.length) return skipped("skipped — no [check] themeScopes configured");
  if (!hasThemeBlocks(css.src, scopes)) {
    return skipped(`skipped — no configured theme scope matched a block in ${css.path}`);
  }
  const offenders = themeContrastOffenders(css.src, {
    scopes,
    pairs: ctx.cfg.check?.contrastPairs ?? [],
    gradientTokens: ctx.cfg.check?.gradientTokens ?? [],
    backdropToken: ctx.cfg.check?.backdropToken,
  });
  if (offenders.length === 0) return { status: "passed" };
  return {
    status: "failed",
    detail:
      "Low-contrast or invalid theme tokens (invisible text risk):\n    " +
      offenders.slice(0, 10).join("\n    "),
  };
}

/** The configured stylesheet, read once. Null when it can't be checked. */
function readStylesheet(ctx: StepContext): { path: string; src: string } | null {
  const rel = ctx.cfg.check?.uiStylesheet;
  if (!rel) return null;
  const abs = isAbsolute(rel) ? rel : join(ctx.repoRoot, rel);
  if (!existsSync(abs)) return null;
  try {
    return { path: rel, src: readFileSync(abs, "utf8") };
  } catch {
    return null;
  }
}

function cssSkipReason(ctx: StepContext): string {
  const rel = ctx.cfg.check?.uiStylesheet;
  if (!rel) return "skipped — no [check] uiStylesheet configured";
  return `skipped — ${rel} does not exist`;
}

async function stepBareRequire(ctx: StepContext): Promise<BuiltinOutcome> {
  if (ctx.pkg.type !== "module") {
    return skipped('skipped — package.json is not "type": "module"');
  }
  const resolved = resolveBareRequireRoots(
    ctx.cfg.check?.bareRequireDirs,
    readTsconfig(ctx.repoRoot),
    ctx.cfg.check?.bareRequireExcludes,
  );
  if (resolved.roots.length === 0) {
    return skipped("skipped — no source roots configured");
  }
  const offenders = bareRequireOffenders(resolved.roots, {
    repoRoot: ctx.repoRoot,
    excludes: resolved.excludes,
  });
  if (offenders.length === 0) {
    const from = resolved.source === "config" ? "[check] bareRequireDirs" : "tsconfig include";
    return { status: "passed", detail: `scanned ${from}` };
  }
  return {
    status: "failed",
    detail:
      'Bare require() in ESM source (this package is "type": "module" — a bare require throws ' +
      "ReferenceError at runtime in dist/, silently if caught):\n    " +
      offenders.slice(0, 10).join("\n    ") +
      '\n    Import from "node:..." normally, or use createRequire(import.meta.url) if you ' +
      "genuinely need CJS interop (see ui-harness.ts).",
  };
}

async function stepTaskAssets(ctx: StepContext): Promise<BuiltinOutcome> {
  // Folder names are configurable (`workDir`/`inputsDir`), so a repo that
  // renames them is still guarded.
  const config = ctx.cfg;
  const dirs = [
    { label: "workDir", raw: config.workDir ?? "work" },
    { label: "inputsDir", raw: config.inputsDir ?? "inputs" },
  ];
  const usable: string[] = [];
  const broken: string[] = [];
  for (const d of dirs) {
    const norm = normalizeGuardDir(d.raw);
    if (norm) usable.push(norm);
    else broken.push(`${d.label} ("${d.raw}")`);
  }
  if (usable.length === 0) {
    // Configured but unusable — the guard cannot run at all, so say so
    // loudly rather than passing with nothing checked.
    return {
      status: "failed",
      detail:
        `task-asset guard is disabled — ${broken.join(" and ")} in repoos.toml ` +
        "don't resolve to repo-relative directories, so no task/input folder can be checked. " +
        "Fix the config.",
    };
  }
  let tracked: string[] = [];
  try {
    tracked = execFileSync("git", ["ls-files", "--", ...usable], {
      cwd: ctx.repoRoot,
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
    inputsDir: config.inputsDir,
  });
  const labels = usable.map((d) => `${d}/`).join(" or ");
  if (offenders.length === 0)
    return { status: "passed", detail: `no committed binaries under ${labels}` };
  return {
    status: "failed",
    detail:
      `Binary attachments committed under ${labels} — these are served by ` +
      "the running server from disk and must never enter git history (it bloats the repo " +
      "irreversibly). Run `git rm --cached` on them (they stay on disk) and let " +
      "`.gitignore` keep them out:\n    " +
      offenders.slice(0, 15).join("\n    ") +
      (offenders.length > 15 ? `\n    …and ${offenders.length - 15} more` : ""),
  };
}

async function stepTests(ctx: StepContext): Promise<BuiltinOutcome> {
  // The close-out pipeline can hand the suite to the Remote Validation Runner
  // and then run only the cheap local guards (REPOOS_SKIP_TESTS=1).
  if (process.env.REPOOS_SKIP_TESTS === "1") {
    return skipped(
      "skipped — test suite ran on the remote validation runner (REPOOS_SKIP_TESTS=1)",
    );
  }
  const hasTestScript = Boolean(ctx.scriptPkg.scripts?.test);
  const hasTestFiles = ["test", "__tests__", "tests"].some((d) => existsSync(join(ctx.cwd, d)));
  if (!hasTestScript && !hasTestFiles) return skipped("skipped — no test suite found");

  // Only the vitest-backed script understands `--changed`; the bare runner
  // fallback is left unscoped. `--bun` forces vitest onto Bun for a
  // Bun-native repo (~5x faster, and it stops the swap-thrash flake).
  const changedRef = hasTestScript ? ctx.changedRef : undefined;
  const bun = scriptRunner(ctx.cwd) === "bun";
  // Run the project's OWN runner. An npm project must not be handed a `bun run
  // test` it can't execute on a machine with no Bun — the prerequisite a plan
  // declares (`requires = ["npm"]`) and the command the step actually runs
  // have to agree.
  const runner = hasTestScript ? (bun ? "bun" : "npm") : "bun";
  const base =
    hasTestScript && !bun ? "npm run test" : hasTestScript ? "bun run --bun test" : "bun test";
  const command = changedRef ? `${base} -- --changed ${changedRef}` : base;
  const blocked = prereqs(ctx, [runner]);
  if (blocked) return { ...blocked, command };

  const workers = hasTestScript ? testPoolSize(process.env) : undefined;
  const env = workers ? { ...process.env, REPOOS_TEST_WORKERS: String(workers) } : process.env;
  if (workers && !changedRef) {
    const availGiB = (availableMemBytes() / 1024 ** 3).toFixed(1);
    console.log(c.dim(`  · Full suite · ${workers} workers (${availGiB} GiB reclaimable)`));
  }
  // A full unscoped run is ~10min healthy and can legitimately reach ~25min on
  // a slow box; a too-tight cap SIGTERMs a green suite (exit 143). Vitest's own
  // per-test timeout fails a genuine hang fast — this is the outer backstop.
  const timeoutMs = changedRef ? 300_000 : 1_500_000;
  const res = await runCommand({ command, cwd: ctx.cwd, timeoutMs, env });
  if (res.status === "passed") {
    return {
      status: "passed",
      command,
      detail: changedRef ? `scoped to changed vs ${changedRef}` : undefined,
    };
  }
  if (res.status === "timeout") {
    return {
      status: "timeout",
      command,
      detail: `timed out after ${timeoutLabel(timeoutMs)}`,
      output: res.output,
    };
  }
  return {
    status: "failed",
    command,
    detail: outputTail(res.output) ?? `Tests failed (exit ${res.exitCode})`,
    output: res.output,
  };
}

async function stepUiSmoke(ctx: StepContext): Promise<BuiltinOutcome> {
  const smoke = resolveSmokeCommand(ctx.cfg.check?.uiSmoke, ctx.scriptPkg.scripts);
  if (!smoke) {
    return skipped(
      "skipped — no smoke command configured (declare a `smoke` package.json script or [check] uiSmoke)",
    );
  }
  const runner = scriptRunner(ctx.cwd);
  const command = smoke.source === "config" ? smoke.command : `${runner} run ${smoke.script}`;
  const origin =
    smoke.source === "config" ? "repoos.toml [check] uiSmoke" : "package.json smoke script";
  const blocked = prereqs(ctx, smoke.source === "config" ? [] : [runner]);
  if (blocked) return { ...blocked, command };
  const res = await runCommand({ command, cwd: ctx.cwd, timeoutMs: 300_000 });
  if (res.status === "passed") return { status: "passed", command, detail: `ran ${origin}` };
  if (res.status === "timeout") {
    return { status: "timeout", command, detail: "timed out after 300s", output: res.output };
  }
  return {
    status: "failed",
    command,
    detail: outputTail(res.output) ?? `Smoke command failed (exit ${res.exitCode})`,
    output: res.output,
  };
}

const BUILTIN_HANDLERS: Record<BuiltinCheckKind, (ctx: StepContext) => Promise<BuiltinOutcome>> = {
  staleness: stepStaleness,
  "lockfile-sync": stepLockfileSync,
  "zero-runtime-deps": stepZeroRuntimeDeps,
  format: (ctx) =>
    runScript(ctx, "fmt:check", {
      label: "Formatting",
      hint: "run `bun run fmt` to fix",
      timeoutMs: 120_000,
      echo: false,
    }),
  lint: (ctx) =>
    runScript(ctx, "lint", {
      label: "Lint",
      hint: "fix the reported errors",
      timeoutMs: 120_000,
      echo: false,
    }),
  build: (ctx) =>
    runScript(ctx, "build", {
      label: "Build",
      hint: "fix the build errors",
      timeoutMs: 120_000,
      echo: true,
    }),
  tests: stepTests,
  "ui-smoke": stepUiSmoke,
  "css-layers": stepCssLayers,
  "theme-contrast": stepThemeContrast,
  "bare-require": stepBareRequire,
  "task-assets": stepTaskAssets,
};

/** Human-readable duration for a timeout message (ms when sub-second). */
function timeoutLabel(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  return `${Number.isInteger(secs) ? secs : secs.toFixed(1)}s`;
}

/** Last lines of a failed command's output — the part that names the failure. */
function outputTail(output: string | undefined, lines = 25): string | undefined {
  if (!output || !output.trim()) return undefined;
  const all = output.replace(/\s+$/, "").split("\n");
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

/**
 * Repo-relative paths that differ from `ref`, plus anything uncommitted or
 * untracked — the working tree an agent actually hands over, not just what is
 * committed on the branch.
 *
 * Returns `null` when `ref` itself can't be resolved. That has to be
 * distinguishable from "nothing changed": a typo'd ref with an empty result
 * would silently scope every `whenChanged` step away and let the gate go green
 * having verified nothing at all.
 */
export function changedPathsSince(repoRoot: string, ref: string): string[] | null {
  const run = (args: string[]): string[] => {
    try {
      return execFileSync("git", args, {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  };
  // Verify the ref first: `git diff <bogus>...` exits non-zero, and `run`
  // swallows that — indistinguishable from a clean diff without this.
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], {
      cwd: repoRoot,
      stdio: "pipe",
    });
  } catch {
    return null;
  }
  const paths = new Set([
    ...run(["diff", "--name-only", `${ref}...`]),
    ...run(["diff", "--name-only"]),
    ...run(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...paths];
}

function planSourceLabel(plan: CheckPlan): string {
  switch (plan.source) {
    case "declared":
      return `declared in repoos.toml (v${plan.version})`;
    case "legacy":
      return "legacy [check] keys — migrate to [[check.steps]]";
    case "inferred":
      return "inferred from the repo layout — not committed";
    default:
      return "none";
  }
}

const STATUS_ICON: Record<StepStatus, string> = {
  passed: "✔",
  failed: "✗",
  timeout: "✗",
  "missing-prereq": "✗",
  skipped: "⏭",
};

/** One result line's detail: the reason, and how to act on it. */
function statusDetail(r: StepRunResult): string {
  switch (r.status) {
    case "timeout":
      return `timed out — ${r.detail ?? "exceeded its timeout"}`;
    case "missing-prereq":
      return r.detail ?? "missing prerequisite";
    case "skipped":
      return r.detail ?? "skipped";
    case "failed":
      return r.detail ?? "failed";
    default:
      return r.detail ?? "";
  }
}

export interface RunPlanOptions {
  repoRoot: string;
  /** Config for the repo; loaded here when not supplied. */
  cfg?: RepoOSConfig;
  profile?: string;
  /** Changed paths for changed-path mode; absent means a full run. */
  changedPaths?: string[];
  /** Git ref the changed paths came from — the Tests step scopes itself to it. */
  changedRef?: string;
  onStart?: (step: CheckStep) => void;
  onResult?: (result: StepRunResult) => void;
}

/**
 * Run a resolved plan, in declaration order, and return one structured result
 * per step. Pure with respect to the caller's output: printing happens through
 * the callbacks, so this is unit-testable end to end (see
 * ui-app/tests/check-plan.test.ts).
 *
 * Every step ends in exactly one of: passed, failed, timeout, missing
 * prerequisite, or an explicit skip that says why. Nothing here can "pass" by
 * not running.
 */
export async function runCheckPlan(
  plan: CheckPlan,
  opts: RunPlanOptions,
): Promise<StepRunResult[]> {
  const { repoRoot } = opts;
  const cfg = opts.cfg ?? loadConfig(repoRoot);
  const pkg = readPkg(repoRoot);
  const selected = selectSteps(plan, { profile: opts.profile, changedPaths: opts.changedPaths });
  const results: StepRunResult[] = [];
  const push = (r: StepRunResult): StepRunResult => {
    results.push(r);
    opts.onResult?.(r);
    return r;
  };

  for (const { step, skip } of selected) {
    const cwd = stepCwd(repoRoot, step) ?? repoRoot;
    opts.onStart?.(step);

    if (skip) {
      push({
        name: step.name,
        status: "skipped",
        detail: skip.detail,
        durationMs: 0,
        required: step.required,
      });
      continue;
    }

    // A step whose declared dependency failed is blocked, not run: the gate is
    // already failing on the real cause (e.g. formatting), and building or
    // testing on top of it would only obscure that.
    const blocked = blockingFailures(step, failedNames(results));
    if (blocked.length > 0) {
      push({
        name: step.name,
        status: "skipped",
        detail: `skipped — blocked by failed step(s): ${blocked.join(", ")}`,
        durationMs: 0,
        required: step.required,
      });
      continue;
    }

    const started = Date.now();
    let outcome: BuiltinOutcome;
    if (step.kind) {
      // The handler decides whether the step applies to this repo BEFORE any
      // prerequisite is checked — a guard that would skip anyway must not fail
      // on a missing tool (see `prereqs`).
      outcome = await BUILTIN_HANDLERS[step.kind]({
        repoRoot,
        cwd,
        cfg,
        pkg,
        scriptPkg: readPkg(cwd),
        requires: step.requires,
        changedRef: opts.changedRef,
      });
    } else if (missingBinaries(step.requires).length > 0) {
      outcome = {
        status: "missing-prereq",
        command: step.command,
        detail: prereqDetail(missingBinaries(step.requires)),
      };
    } else {
      const res = await runCommand({ command: step.command ?? "", cwd, timeoutMs: step.timeoutMs });
      outcome = {
        status:
          res.status === "passed" ? "passed" : res.status === "timeout" ? "timeout" : "failed",
        command: step.command,
        output: res.output,
        detail:
          res.status === "timeout"
            ? `timed out after ${timeoutLabel(step.timeoutMs)}`
            : res.status === "error"
              ? `could not run: ${res.error ?? "spawn failed"}`
              : (outputTail(res.output) ?? `command failed (exit ${res.exitCode})`),
      };
    }
    push({
      name: step.name,
      status: outcome.status,
      command: outcome.command,
      cwd: step.cwd,
      durationMs: Date.now() - started,
      output: outcome.output,
      detail: outcome.detail,
      required: step.required,
    });
  }
  return results;
}

export async function cmdCheck(argv: string[] = []): Promise<void> {
  const opts = parseCheckArgs(argv);
  const repoRoot = findRepoRoot();
  const cfg = loadConfig(repoRoot);
  const markers = detectRepoMarkers(repoRoot);
  const plan = resolveCheckPlan({
    check: cfg.check,
    markers,
    bunRunner: preferBunForDevTasks(repoRoot),
  });

  // `--print-plan` is the migration aid: it emits the plan the gate resolved
  // (legacy or inferred) as the [[check.steps]] TOML to commit.
  if (opts.printPlan) {
    // Self-contained: the built-in kinds read their vocabulary from [check],
    // so the emitted TOML carries those keys too — otherwise committing it
    // would silently drop the stylesheet/bare-require/smoke guards.
    console.log(formatPlanToml(plan, cfg.check));
    return;
  }

  const profile = opts.profile?.trim() || plan.defaultProfile || DEFAULT_PROFILE;
  const changedRef = opts.changed?.trim() || changedTestRef(process.env);

  heading("Check plan");
  const scope = changedRef ? ` · changed-path mode vs ${changedRef}` : "";
  console.log(
    c.dim(
      `  · ${plan.steps.length} step(s) · ${planSourceLabel(plan)} · profile "${profile}"${scope}`,
    ),
  );
  for (const s of plan.steps) {
    console.log(
      c.dim(
        `      ${s.name}: ${describeStep(s)}${s.required ? "" : " (optional)"}${
          s.whenChanged.length ? ` · when ${s.whenChanged.join(", ")} changes` : ""
        }`,
      ),
    );
  }
  for (const w of plan.warnings) console.log(c.yellow(`  ⚠ ${w}`));
  for (const e of plan.errors) console.log(c.red(`  ✗ ${e}`));

  // Default safe: a repo with no meaningful plan must never get an all-green
  // definition of done. A gate that ran nothing is not a gate.
  if (plan.steps.length === 0 || plan.errors.length > 0) {
    const msg =
      plan.errors[0] ??
      "No check plan: this repo declares no [[check.steps]] and nothing could be inferred " +
        "from it (no go.mod, Cargo.toml, gradlew/build.gradle, or package.json scripts). " +
        "Declare what 'done' means for this repo under [[check.steps]] in repoos.toml — " +
        "see user-docs/check.md — or run `repoos check --print-plan` for a starting point.";
    console.log(c.red(`\n  ✗ ${msg}\n`));
    process.exit(1);
  }

  const changedPaths = changedRef ? changedPathsSince(repoRoot, changedRef) : undefined;
  if (changedRef && changedPaths === null) {
    // A ref git can't resolve is a mistake, not "nothing changed": scoping the
    // run to it would skip every `whenChanged` step and could go green having
    // verified nothing.
    console.log(
      c.red(
        `\n  ✗ Changed-path mode needs a git ref this repo can resolve: "${changedRef}" is not ` +
          "a commit, branch or tag here. Fix the ref (or drop --changed to run the full plan).\n",
      ),
    );
    process.exit(1);
  }
  if (changedRef) {
    console.log(
      c.dim(
        `  · Changed-path mode: ${changedPaths?.length ?? 0} path(s) differ from ${changedRef} ` +
          "(fast pre-review pass — close-out still runs the full plan)",
      ),
    );
  }

  const runStartedAt = new Date();
  const results = await runCheckPlan(plan, {
    repoRoot,
    cfg,
    profile,
    // Narrowed above after the null check; `?? undefined` keeps the types
    // honest without a cast.
    changedPaths: changedPaths ?? undefined,
    changedRef,
    onStart: (step) => {
      heading(step.name);
      console.log(c.dim(`  · ${describeStep(step)}`));
    },
    onResult: (r) => {
      const secs = r.durationMs >= 1000 ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : "";
      if (r.status === "passed") {
        console.log(c.green(`  ✔ ${r.name}${secs}${r.detail ? ` — ${r.detail}` : ""}`));
      } else if (r.status === "skipped") {
        console.log(c.dim(`  ⏭ ${r.name} — ${statusDetail(r)}`));
      } else if (!r.required) {
        console.log(c.yellow(`  ⚠ ${r.name} failed (optional) — ${statusDetail(r)}`));
      } else {
        console.log(c.red(`  ✗ ${r.name}${secs}`));
      }
    },
  });

  // ── Summary ─────────────────────────────────────────────────────────
  const gatingFailures = results.filter(
    (r) => r.required && r.status !== "passed" && r.status !== "skipped",
  );
  const optionalFailures = results.filter(
    (r) => !r.required && r.status !== "passed" && r.status !== "skipped",
  );
  console.log(c.bold(c.cyan("\n  ── Results ──")));
  for (const r of results) {
    const icon = !r.required && STATUS_ICON[r.status] === "✗" ? "⚠" : STATUS_ICON[r.status];
    const detail = statusDetail(r);
    console.log(`  ${icon} ${r.name}${detail ? c.dim(`  — ${detail}`) : ""}`);
  }
  if (results.length > 0 && results.every((r) => r.status === "skipped")) {
    // Every step was excluded (profile, or changed paths that matched nothing).
    // That is not a green build — it is a run that verified nothing. Say so
    // plainly rather than letting "All checks passed" imply otherwise.
    console.log(
      c.yellow(
        "\n  ⚠ No steps ran — every one was skipped. Nothing in this run verified the code; " +
          "check the profile and the `whenChanged` globs.\n",
      ),
    );
  }
  if (gatingFailures.length === 0) {
    console.log(c.bold(c.green("\n  All checks passed.\n")));
  } else {
    console.log(c.bold(c.red(`\n  ${gatingFailures.length} check(s) failed.\n`)));
  }
  if (optionalFailures.length > 0) {
    console.log(
      c.yellow(
        `  ${optionalFailures.length} optional check(s) failed — reported, not gating: ` +
          optionalFailures.map((r) => r.name).join(", ") +
          "\n",
      ),
    );
  }

  // Persist the run for the Checks surface (#0447) before exiting. Fail-soft:
  // visibility only, never a reason to fail an otherwise-green gate.
  const finishedAt = new Date();
  writeCheckRun(
    repoRoot,
    {
      profile,
      source: plan.source,
      changedRef,
      startedAt: runStartedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - runStartedAt.getTime(),
      passed: gatingFailures.length === 0,
      results: results.map((r) => ({
        name: r.name,
        status: r.status,
        command: r.command,
        cwd: r.cwd,
        durationMs: r.durationMs,
        output: r.output,
        detail: r.detail,
        required: r.required,
      })),
    },
    cfg.cacheDir,
  );

  process.exit(gatingFailures.length > 0 ? 1 : 0);
}

/**
 * Names of steps that already failed and therefore block their dependents.
 * A timeout or a missing prerequisite counts; an OPTIONAL step never does —
 * it is advisory by declaration, so letting its failure skip the required
 * build or test that depends on it would let the gate exit green without ever
 * building (the failure that matters is reported on the optional step itself).
 */
function failedNames(results: StepRunResult[]): Set<string> {
  const out = new Set<string>();
  for (const r of results) {
    if (r.required && r.status !== "passed" && r.status !== "skipped") out.add(r.name);
  }
  return out;
}
