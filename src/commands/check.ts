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
 * Exits non-zero on any failure. The one exception (#0592): a repo whose plan
 * resolves to zero steps AND zero errors — no declared steps, no legacy keys,
 * nothing inferable — SKIPS the gate (exit 0, outcome `skipped`, never green)
 * with an actionable "no check plan" reminder, so task handoffs in an early
 * planning-phase repo are not permanently blocked. Plan errors and an
 * unresolvable `--changed` ref still exit non-zero. Designed for CI gates and
 * agent pre-review.
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
  NO_CHECK_PLAN_NOTICE,
  noCheckPlanReminderLines,
  planGateSkips,
} from "../core/check-skip.js";
import {
  detectRepoMarkers,
  missingBinaries,
  prereqDetail,
  runCommand,
  stepCwd,
  type StepRunResult,
  type StepStatus,
} from "../core/check-runner.js";
import { formatFixCommand } from "../core/check-format.js";
import { writeCheckRun } from "../core/check-results-store.js";
import { extractFailedTests } from "../core/check-failure-summary.js";
import {
  envToRunContext,
  getCheckStore,
  localMachineName,
  type CheckRunPhase,
} from "../core/check-store.js";
import { mainCheckoutRoot } from "../core/git.js";
import { Logger } from "../core/logger.js";
import {
  boardRootForEngineerRemote,
  boardTaskAbsPath,
  commitWipCheckpointForRemoteGate,
  createBoardRemoteValidator,
  isManagedEngineerCheck,
  runEngineerRemoteSelfCheckGate,
} from "../server/engineer-remote-self-check.js";
import { createRemoteValidator } from "../server/remote-validation.js";
import {
  runRemotePreReviewGate,
  standaloneCliCanUseRemote,
  remoteValidationAlreadyAttempted,
  uncommittedFilesBlockingRemoteGate,
  shouldRunCliRemotePreReviewGate,
} from "../server/pre-review-remote-gate.js";

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

/**
 * Recursively list files under `dir` whose extension is in `exts`, skipping
 * node_modules/dist/dotdirs.
 */
function walkFiles(dir: string, exts: string[], acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(full);
  }
  return acc;
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

// ── Hard-coded-color source guard (#0596) ───────────────────────────────
// The rendered contrast audit (`src/commands/ui-contrast-audit.ts`) catches
// what a component's own colors actually look like on screen; this one catches
// the regression at the source. A component `<style>` block that hard-codes
// `#hex` or `rgba(255,…)` overrides the token-based rules in the theme
// stylesheet, so a light hard-coded color silently wins in a light theme (the
// task drawer's Changes-tab file header did exactly this: near-white on
// near-white, unnoticed). Theme stylesheets are NOT scanned — their literals
// are the token vocabulary the `theme-contrast` guard checks.

/** Marker that allowlists a hard-coded color; must carry a reason. */
export const HARDCODED_COLOR_MARKER = "hardcode-ok";

/**
 * File extensions whose style lives inside `<style>` blocks. Stylesheet
 * extensions are deliberately absent: a stylesheet's literals are theme
 * tokens, checked by `theme-contrast`, not one-off component overrides.
 */
export const STYLE_BLOCK_EXTENSIONS = [".vue", ".svelte", ".astro", ".html"];

/** `hardcode-ok:` followed by a reason — the only accepted allowlist form. */
const MARKER_RE = /hardcode-ok\s*:\s*\S/;

/** A hex color literal (`#abc`, `#aabbcc`, 8-digit alpha forms). */
const HEX_LITERAL_RE = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F\w])/;

/**
 * `rgba(255,…)`, `rgb(255, 255, 255)`, `rgb(255 255 255 / 4%)` — a white(or
 * near-white-first-channel) literal, the shape translucent-white panels and
 * near-white text are written in. Other channel triples (accent tints) are
 * out of this guard's scope on purpose: they don't invert across themes the
 * way white does.
 */
const WHITE_RGB_RE = /\brgba?\(\s*255(?=[\s,/(])/i;

/**
 * Strip `/* … *​/` comments from one line of a style block, given the
 * in-comment carry-over state from previous lines. Comments are stripped
 * BEFORE literal matching (so a `#0444` task id mentioned in prose never
 * reads as a color) but after marker detection (the marker IS a comment).
 */
function stripStyleComments(line: string, state: { inComment: boolean }): string {
  let out = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (state.inComment) {
      if (ch === "*" && line[i + 1] === "/") {
        state.inComment = false;
        i++;
      }
      continue;
    }
    if (ch === "/" && line[i + 1] === "*") {
      state.inComment = true;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Hard-coded color literals in a source file's `<style>` blocks that carry no
 * `hardcode-ok: <reason>` marker. Returns `path:line` strings with the
 * offending declaration so a fix (use the theme token) or an allowlist
 * (annotate with a reason) is a one-line decision.
 *
 * A marker exempts **the rule block it appears in** — the declaration line it
 * sits on (or the line above it) plus the rest of that rule, and, when it
 * sits between rules (at brace depth 0), the rule that follows. One reason
 * covers one rule, not one literal, so a fixed-color block reads as a single
 * documented decision instead of a marker on every line.
 *
 * `src` is the whole file; `path` is only used to prefix the results.
 */
export function hardcodedColorOffenders(src: string, path = "<file>"): string[] {
  const out: string[] = [];
  const blocks = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  for (const block of blocks) {
    const body = block[1];
    const startLine = src.slice(0, block.index ?? 0).split("\n").length;
    const commentState = { inComment: false };
    let depth = 0;
    /** When set, every line at brace depth ≥ this is exempt (see above). */
    let exemptFromDepth: number | null = null;
    /**
     * A marker BETWEEN rules (brace depth 0) exempts the rule that follows —
     * including a one-line rule, whose declarations share the `{` line and so
     * are still at depth 0 when the line is examined.
     */
    let pendingRule = false;
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      // The marker is a comment, so test it before stripping comments.
      const marked = MARKER_RE.test(raw);
      const code = stripStyleComments(raw, commentState);
      const exempt =
        marked || pendingRule || (exemptFromDepth !== null && depth >= exemptFromDepth);
      if (marked) {
        // Inside a rule → the rest of this rule; between rules → the next one.
        exemptFromDepth = Math.max(exemptFromDepth ?? 0, depth === 0 ? 1 : depth);
        if (depth === 0) pendingRule = true;
      }
      if (!exempt && (HEX_LITERAL_RE.test(code) || WHITE_RGB_RE.test(code))) {
        out.push(`${path}:${startLine + i}  ${raw.trim()}`);
      }
      const opens = (code.match(/\{/g) ?? []).length;
      if (pendingRule && opens > 0) pendingRule = false;
      depth += opens - (code.match(/\}/g) ?? []).length;
      if (exemptFromDepth !== null && depth < exemptFromDepth) exemptFromDepth = null;
    }
  }
  return out;
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

// Both rgb()/rgba() forms are whitespace-tolerant (`\s*` after each separator),
// so a formatter's `rgba(110, 157, 106, 0.22)` parses (#0504). Before that fix
// these branches tolerated no whitespace, which silently skipped any
// contrastPairs whose colour could not be read; if you ever loosen them again,
// a pair that fails to parse is SKIPPED rather than failed, so re-run the real
// guard against the real stylesheet rather than reasoning about it.
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

/**
 * WCAG relative luminance of an sRGB color. Exported (#0596): the rendered
 * contrast audit judges real pixels with the SAME math the token guard uses,
 * so the two can never drift into disagreeing about what a ratio means.
 */
export function luminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channelLum(c.r) + 0.7152 * channelLum(c.g) + 0.0722 * channelLum(c.b);
}

/** WCAG contrast ratio between two luminances. Exported for #0596 as above. */
export function contrastRatio(a: number, b: number): number {
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
 * Set after a remote validation pass (close-out, pre-review handoff, or
 * `repoos check` when `remoteValidation.enabled`) so the local gate skips only
 * the Tests step. Per-branch pre-merge checks also set `REPOOS_CHECK_CHANGED`
 * (engineer self-check and handoff re-verification). Close-out's merge-gate
 * check deliberately never sets `REPOOS_CHECK_CHANGED` — that gate validates
 * interaction with whatever else has landed on main since.
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
  /** Skip the remote runner even when `remoteValidation.enabled` (#0520). */
  localTestsOnly?: boolean;
  /**
   * Run each `format` step's fixer before its check (#0651). Off by default,
   * so the close-out gate still fails an unformatted committed tree; handoff
   * opts in. `kind = "format"` fixes via the `fmt` script, or a step's `fix`.
   */
  fix?: boolean;
  /** Only run these step names — backs `repoos check --step <name>` (#0651). */
  steps?: string[];
}

/** Parse `repoos check` flags. Unknown flags are ignored, never fatal. */
export function parseCheckArgs(argv: string[] = []): CheckOptions {
  const opts: CheckOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile" || a === "-p") opts.profile = argv[++i];
    else if (a === "--changed") opts.changed = argv[++i];
    else if (a === "--print-plan") opts.printPlan = true;
    else if (a === "--local-tests") opts.localTestsOnly = true;
    else if (a === "--fix") opts.fix = true;
    else if (a === "--step") {
      opts.steps = [...(opts.steps ?? []), ...splitStepArg(argv[++i])];
    } else if (a === "--steps") {
      opts.steps = [...(opts.steps ?? []), ...splitStepArg(argv[++i])];
    }
  }
  return opts;
}

/** One `--step` value, accepting a comma-separated list. */
function splitStepArg(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  /** Fix command to run before the check, when `--fix` is active. */
  fixCommand?: string;
  /**
   * Failing test names (`file > suite > test`) from the previous run for this
   * task/worktree (#0655). When present, the tests step re-runs those files
   * first and stops early if they still fail. Ordering only — never a skip.
   */
  previousFailedTests?: string[];
  /** Re-runs per failing file for the isolation label (#0655). 0 disables. */
  isolationRuns?: number;
}

/** What a built-in `kind` handler returns. */
interface BuiltinOutcome {
  status: StepStatus;
  /** The command it resolved to (so the results block can name it). */
  command?: string;
  detail?: string;
  output?: string;
  /** Informational isolation re-run label (#0655); never affects `status`. */
  isolationNote?: string;
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

/**
 * Hard-coded color literals in component `<style>` blocks (#0596). Reads its
 * source roots from `[check] hardcodedColorDirs` like the bare-require guard
 * reads `bareRequireDirs` — which trees hold component style blocks is a
 * project fact, so nothing here assumes a Vue app or a `src/ui-app` path.
 */
async function stepHardcodedColors(ctx: StepContext): Promise<BuiltinOutcome> {
  const dirs = ctx.cfg.check?.hardcodedColorDirs ?? [];
  if (dirs.length === 0) return skipped("skipped — no [check] hardcodedColorDirs configured");

  const offenders: string[] = [];
  let scanned = 0;
  for (const raw of dirs) {
    const rel = normalizeGuardDir(raw);
    if (!rel) continue;
    const abs = join(ctx.repoRoot, rel);
    if (!existsSync(abs)) continue;
    for (const file of walkFiles(abs, STYLE_BLOCK_EXTENSIONS)) {
      let src: string;
      try {
        src = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      scanned++;
      const relFile = relative(ctx.repoRoot, file).split(sep).join("/");
      offenders.push(...hardcodedColorOffenders(src, relFile));
    }
  }
  if (scanned === 0) {
    return skipped(
      `skipped — no style-block files (${STYLE_BLOCK_EXTENSIONS.join(", ")}) under ${dirs.join(", ")}`,
    );
  }
  if (offenders.length === 0) return { status: "passed", detail: `scanned ${scanned} file(s)` };
  const shown = offenders.slice(0, 12);
  const rest =
    offenders.length > shown.length ? `\n    …and ${offenders.length - shown.length} more` : "";
  return {
    status: "failed",
    detail:
      "Hard-coded colors in component <style> blocks — they override the theme's token rules and " +
      "can invert across themes (near-white on near-white in light mode):\n    " +
      shown.join("\n    ") +
      rest +
      `\n    Use the theme token instead, or allowlist an intentional literal with \`/* ${HARDCODED_COLOR_MARKER}: <reason> */\` ` +
      "on the declaration (or just above the rule) — one reason covers the whole rule block.",
  };
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

/** Hard cap on failing files that get an isolation re-run (#0655). Above it,
 *  the failure is broad enough that per-file triage says nothing useful. */
export const MAX_ISOLATION_TRIAGE_FILES = 3;

/** Quote one shell argument only when it needs it. */
function shellQuoteArg(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The test file from a `file > suite > test` failed-test name. */
export function failedTestFile(name: string): string {
  return name.split(" > ")[0]?.trim() ?? "";
}

/**
 * Unique, still-present test files from recorded failure names, in order.
 * A filter naming a deleted file makes vitest exit 1 on "no test files found",
 * which would be a false failed-first failure — so drop paths that don't exist.
 */
export function failedTestFiles(names: string[], repoRoot: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const file = failedTestFile(name);
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (!existsSync(join(repoRoot, file))) continue;
    out.push(file);
  }
  return out;
}

/**
 * Args appended after `--` that scope a project's test script to `files`, or
 * null when the script can't be scoped that way (#0655). RepoOS's own two-pass
 * runner gets its dedicated `--failed-first` single-pass mode (so the
 * latency-sensitive isolated pass is skipped); a plain vitest/jest script
 * accepts positional file filters.
 */
export function testFileFilterArgs(
  testScript: string | undefined,
  files: string[],
): string[] | null {
  if (files.length === 0) return null;
  const script = testScript ?? "";
  if (script.includes("run-tests.mjs")) return ["--failed-first", ...files];
  if (/\bvitest\b|\bjest\b/.test(script)) return [...files];
  return null;
}

/**
 * Re-run each failing test file alone `isolationRuns` times and return the
 * informational label (#0655). Purely advisory: the caller still reports the
 * step failed. Returns undefined when triage is disabled, unscopeable, or the
 * failure spans more than {@link MAX_ISOLATION_TRIAGE_FILES} files.
 */
async function triageIsolatedFailures(
  ctx: StepContext,
  base: string,
  testScript: string | undefined,
  output: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const runs = ctx.isolationRuns ?? 3;
  if (runs <= 0) return undefined;
  const files = failedTestFiles(extractFailedTests(output), ctx.repoRoot);
  if (files.length === 0 || files.length > MAX_ISOLATION_TRIAGE_FILES) return undefined;
  const notes: string[] = [];
  for (const file of files) {
    const args = testFileFilterArgs(testScript, [file]);
    if (!args) return undefined;
    const command = `${base} -- ${args.map(shellQuoteArg).join(" ")}`;
    console.log(c.dim(`  · isolation re-run · ${file} ×${runs}`));
    let passed = 0;
    for (let i = 0; i < runs; i++) {
      const r = await runCommand({
        command,
        cwd: ctx.cwd,
        timeoutMs: 300_000,
        env,
        echo: false,
      });
      if (r.status === "passed") passed++;
    }
    const failed = runs - passed;
    notes.push(
      passed === runs
        ? `${file}: passed ${runs}/${runs} alone`
        : passed === 0
          ? `${file}: failed ${runs}/${runs} alone`
          : `${file}: passed ${passed}/${runs} alone, failed ${failed}/${runs}`,
    );
  }
  return notes.join("; ");
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

  // Failed-first (#0655): re-run the files that failed last time before paying
  // for the whole suite. This is an ordering optimisation, never a skip — if
  // they pass, the full suite below still runs to completion on this tree.
  const testScript = ctx.scriptPkg.scripts?.test;
  const priorFiles = hasTestScript
    ? failedTestFiles(ctx.previousFailedTests ?? [], ctx.repoRoot)
    : [];
  const filterArgs = testFileFilterArgs(testScript, priorFiles);
  if (filterArgs) {
    const preflight = `${base} -- ${filterArgs.map(shellQuoteArg).join(" ")}`;
    console.log(c.dim(`  · previously-failed test file(s) first · ${priorFiles.join(", ")}`));
    const pre = await runCommand({ command: preflight, cwd: ctx.cwd, timeoutMs: 300_000, env });
    if (pre.status !== "passed") {
      const why =
        pre.status === "timeout"
          ? `timed out after ${timeoutLabel(300_000)}`
          : (outputTail(pre.output) ?? `still failing (exit ${pre.exitCode})`);
      return {
        status: pre.status === "timeout" ? "timeout" : "failed",
        command: preflight,
        detail: `previously-failed test file(s) still fail — ${why}`,
        output: pre.output,
      };
    }
    console.log(c.green("  ✔ previously-failed test file(s) pass now — running the full suite"));
  }

  if (workers && !changedRef) {
    const availGiB = (availableMemBytes() / 1024 ** 3).toFixed(1);
    console.log(c.dim(`  · Full suite · ${workers} workers (${availGiB} GiB reclaimable)`));
  }

  // A full unscoped run is ~10min healthy and can legitimately reach ~25min on
  // a slow box; a too-tight cap SIGTERMs a green suite (exit 143). Vitest's own
  // per-test timeout fails a genuine hang fast — this is the outer backstop.
  // Scoped runs still execute the full wrapped suite (main pass + boot-timing);
  // on a laptop that legitimately finishes in ~5–6 minutes, a 300s cap SIGTERMs
  // a green run (exit 143) — see AGENTS.md debugging-check-failures.
  const timeoutMs = changedRef ? 420_000 : 1_500_000;
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
  // Flake triage (#0655): informational only. A pass alone is NOT proof the
  // failure was load-induced (AGENTS.md), so this never turns the run green.
  const isolationNote = await triageIsolatedFailures(ctx, base, testScript, res.output, env);
  return {
    status: "failed",
    command,
    detail: outputTail(res.output) ?? `Tests failed (exit ${res.exitCode})`,
    output: res.output,
    isolationNote,
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
  format: async (ctx) => {
    // `--fix` runs the fixer first, so a format-only violation passes instead
    // of failing the gate. A fixer that itself fails is reported as the step's
    // failure; the check still runs and would name the remaining problem.
    if (ctx.fixCommand) {
      // Check the step's declared tools before spawning the fixer, so a machine
      // without the runner gets the install advice instead of a raw spawn error.
      const blocked = prereqs(ctx);
      if (blocked) return { ...blocked, command: ctx.fixCommand };
      console.log(c.dim(`  · auto-format: ${ctx.fixCommand}`));
      const fix = await runCommand({
        command: ctx.fixCommand,
        cwd: ctx.cwd,
        timeoutMs: 120_000,
        echo: false,
      });
      if (fix.status !== "passed") {
        const out = fix.output.trim();
        return {
          status: fix.status === "timeout" ? "timeout" : "failed",
          command: ctx.fixCommand,
          detail: `auto-format \`${ctx.fixCommand}\` failed${out ? `:\n${out}` : ""}`,
          output: fix.output,
        };
      }
    }
    return runScript(ctx, "fmt:check", {
      label: "Formatting",
      hint: "run `bun run fmt` to fix",
      timeoutMs: 120_000,
      echo: false,
    });
  },
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
  "hardcoded-colors": stepHardcodedColors,
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
  /** Run each `format` step's fixer before its check (#0651). */
  fix?: boolean;
  /** Only run these step names (`repoos check --step`). Empty means all. */
  stepNames?: string[];
  /** Failing test names from the previous run, for failed-first ordering (#0655). */
  previousFailedTests?: string[];
  /** Isolation re-runs per failing file for the flake-triage label (#0655). */
  isolationRuns?: number;
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
  const selected = selectSteps(plan, {
    profile: opts.profile,
    changedPaths: opts.changedPaths,
    stepNames: opts.stepNames,
  });
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
        fixCommand: opts.fix ? (formatFixCommand(step, repoRoot) ?? undefined) : undefined,
        previousFailedTests: opts.previousFailedTests,
        isolationRuns: opts.isolationRuns,
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
      isolationNote: outcome.isolationNote,
    });
  }
  return results;
}

export async function cmdCheck(argv: string[] = []): Promise<void> {
  const opts = parseCheckArgs(argv);
  const repoRoot = findRepoRoot();
  // Where this run's history row(s) go (#0564 review): the MAIN checkout's
  // `.repoos/checks.db`, the one store the running server reads. A standalone
  // `repoos check` inside a task worktree used to write to the worktree's own
  // file, so an agent's self-check never appeared in Checks → Runs. An
  // explicit REPOOS_CHECK_STORE_ROOT (server-spawned paths) already points at
  // the main root and wins. Deliberately a local value, NOT a process.env
  // write: an exported env var reaches every child this command spawns —
  // including the test suite, whose own check-store fixtures would then
  // record into this repo's live store instead of their own tmp ones.
  const checkStoreRoot = resolveCheckStoreRoot(repoRoot);
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

  const changedPaths = changedRef ? changedPathsSince(repoRoot, changedRef) : undefined;
  if (changedRef && changedPaths === null) {
    // A ref git can't resolve is a mistake, not "nothing changed": scoping the
    // run to it would skip every `whenChanged` step and could go green having
    // verified nothing. This stays fatal even for an empty plan (#0592),
    // because a typo'd ref is the caller's mistake — not the repo's.
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

  // Plan errors always fail the gate: a malformed config or an unusable step
  // is a real problem with the declared gate, never a "nothing to verify" case.
  if (plan.errors.length > 0) {
    console.log(c.red(`\n  ✗ ${plan.errors[0]}\n`));
    process.exit(1);
  }

  // A `--step` that names nothing is a typo, not a run that verified nothing:
  // without this, every step would be filtered out and the run could read green.
  if (opts.steps?.length) {
    const known = new Set(plan.steps.map((s) => s.name));
    const unknown = opts.steps.filter((n) => !known.has(n));
    if (unknown.length > 0) {
      const available = plan.steps.map((s) => s.name).join(", ") || "(none)";
      console.log(
        c.red(
          `\n  ✗ --step names no step in this plan: ${unknown.join(", ")}. ` +
            `Available steps: ${available}\n`,
        ),
      );
      process.exit(1);
    }
  }

  // #0592: an EMPTY plan (no declared steps, no legacy keys, nothing
  // inferable) with no errors is an explicit SKIP, not a failure. Handoffs in
  // an early planning-phase repo used to block on this forever. The gate is
  // still never green: the run records outcome `skipped` (not `passed`) and
  // the summary says plainly that nothing was verified. A repo WITH a plan
  // that resolves to nothing usable errors instead (handled above), and a
  // `--changed` ref that cannot resolve kept its fatal path above too.
  if (planGateSkips(plan)) {
    const startedAt = new Date();
    console.log(c.yellow(`\n  ⚠ ${NO_CHECK_PLAN_NOTICE}\n`));
    for (const line of noCheckPlanReminderLines()) {
      console.log(c.dim(`    ${line}`));
    }
    console.log();
    writeCheckRun(
      repoRoot,
      {
        profile,
        source: plan.source,
        changedRef,
        startedAt: startedAt.toISOString(),
        finishedAt: startedAt.toISOString(),
        durationMs: 0,
        passed: false,
        outcome: "skipped",
        results: [],
      },
      cfg.cacheDir,
    );
    recordRunHistoryRow({
      root: checkStoreRoot,
      cacheDir: cfg.cacheDir,
      scope: changedRef ? `changed:${changedRef}` : "full",
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      outcome: "skipped",
      failedStep: null,
      skippedSteps: [],
      detail: NO_CHECK_PLAN_NOTICE,
    });
    process.exit(0);
  }

  if (
    cfg.remoteValidation?.enabled &&
    !standaloneCliCanUseRemote(cfg) &&
    !isManagedEngineerCheck(process.env) &&
    !opts.localTestsOnly &&
    !remoteValidationAlreadyAttempted(process.env)
  ) {
    console.log(
      c.dim(
        "  · remote validation: the Hetzner runner is owned by the server, so a standalone " +
          "`repoos check` runs the full local gate (handoff and close-out still use the runner)",
      ),
    );
  }
  let runRemoteGate = shouldRunCliRemotePreReviewGate(cfg, { ...opts, changedRef }, process.env);
  if (runRemoteGate) {
    const uncommitted = await uncommittedFilesBlockingRemoteGate(repoRoot, cfg);
    if (uncommitted.length > 0) {
      if (isManagedEngineerCheck(process.env)) {
        const taskId = process.env.REPOOS_TASK_ID!.trim();
        const wipErr = await commitWipCheckpointForRemoteGate(repoRoot, cfg, taskId);
        if (wipErr) {
          runRemoteGate = false;
          console.log(
            c.yellow(
              `  ⚠ uncommitted changes — could not commit a WIP checkpoint (${wipErr}); ` +
                "running the full local gate on the working tree instead\n",
            ),
          );
        } else {
          console.log(
            c.dim(
              "  · uncommitted work committed as a WIP checkpoint so the remote runner tests this tree\n",
            ),
          );
        }
      } else {
        runRemoteGate = false;
        const shown = uncommitted.slice(0, 5).join(", ");
        console.log(
          c.yellow(
            `  ⚠ uncommitted changes (${shown}${uncommitted.length > 5 ? ", …" : ""}) — the remote ` +
              "gate tests committed HEAD only, so running the full local gate on the working tree instead\n",
          ),
        );
      }
    }
  }
  // The plan never runs when the remote gate fails, so the normal end-of-run
  // record is never written: persist the failure for the Checks surface too,
  // like a local failure and like the handoff path (fail-soft).
  const persistRemoteFailure = (detail: string, output: string, startedAt: Date): void => {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    writeCheckRun(
      repoRoot,
      {
        profile,
        source: plan.source,
        changedRef,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        passed: false,
        results: [
          {
            name: "remote-validation",
            status: "failed",
            durationMs,
            output: output || undefined,
            detail,
            required: true,
          },
        ],
      },
      cfg.cacheDir,
    );
  };
  if (runRemoteGate) {
    heading("Remote validation");
    const logger = new Logger({ root: repoRoot });
    const managed = isManagedEngineerCheck(process.env);
    let remoteValidator;
    try {
      remoteValidator = managed
        ? createBoardRemoteValidator(repoRoot, cfg)
        : createRemoteValidator(cfg, logger);
    } catch (e) {
      const msg = `remote validation init failed: ${(e as Error).message}`;
      if (!cfg.remoteValidation?.fallbackToLocal) {
        console.log(c.red(`\n  ✗ ${msg}\n`));
        persistRemoteFailure(msg, "", new Date());
        // The runner never dispatched, so nothing else will record this
        // failed remote attempt in the history (#0564). Record it here —
        // machine unknown (no host was ever chosen), remote half only.
        recordRunHistoryRow({
          root: checkStoreRoot,
          cacheDir: cfg.cacheDir,
          scope: "full",
          startedAt: new Date().toISOString(),
          durationMs: 0,
          outcome: "fail",
          failedStep: "remote-validation",
          skippedSteps: [],
          detail: msg,
        });
        process.exit(1);
      }
      console.log(c.yellow(`  ⚠ ${msg} — running the full local gate\n`));
    }
    if (remoteValidator) {
      const prevStoreRoot = process.env.REPOOS_CHECK_STORE_ROOT;
      process.env.REPOOS_CHECK_STORE_ROOT = checkStoreRoot;
      try {
        const taskId = process.env.REPOOS_TASK_ID?.trim() || "pre-review";
        const remoteStartedAt = new Date();
        let remoteOutput = "";
        const { phase: runPhase } = envToRunContext(process.env);
        const boardRoot = boardRootForEngineerRemote(repoRoot);
        const gateConfig = managed ? loadConfig(boardRoot) : cfg;
        const taskAbsPath =
          managed && /^\d+$/.test(taskId) ? boardTaskAbsPath(gateConfig, taskId) : undefined;
        const gate = managed
          ? await runEngineerRemoteSelfCheckGate({
              worktreeConfig: cfg,
              worktreePath: repoRoot,
              taskId,
              taskAbsPath,
              onChunk: (chunk) => {
                remoteOutput += chunk;
                process.stdout.write(chunk);
              },
            })
          : await runRemotePreReviewGate({
              config: gateConfig,
              remoteValidator,
              worktreePath: repoRoot,
              taskId,
              phase: runPhase,
              onChunk: (chunk) => {
                remoteOutput += chunk;
                process.stdout.write(chunk);
              },
            });
        if (!managed) {
          await remoteValidator.dispose().catch(() => {});
        }
        if (gate.kind === "fail") {
          console.log(c.red(`\n  ✗ ${gate.detail}\n`));
          persistRemoteFailure(gate.detail, remoteOutput, remoteStartedAt);
          process.exit(1);
        }
        if (gate.kind === "local-only" && gate.skipTests) {
          process.env.REPOOS_SKIP_TESTS = "1";
          console.log(c.green("  ✔ remote gate passed — running local guards only\n"));
        } else if (gate.kind === "local-only") {
          console.log(c.yellow("  ⚠ remote unavailable — running the full local gate\n"));
        }
      } finally {
        if (prevStoreRoot === undefined) delete process.env.REPOOS_CHECK_STORE_ROOT;
        else process.env.REPOOS_CHECK_STORE_ROOT = prevStoreRoot;
      }
    }
  }

  const runStartedAt = new Date();
  // Failed-first ordering (#0655): only interactive/CLI and pre-review runs
  // reorder. Close-out and release always run the full suite from a clean
  // slate, and the remote close-out gate never reaches this point.
  const preflightContext = envToRunContext(process.env);
  const previousFailedTests = previousFailedTestsForRun({
    root: checkStoreRoot,
    cacheDir: cfg.cacheDir,
    worktree: repoRoot,
    taskId: preflightContext.taskId,
    phase: preflightContext.phase,
  });
  let results: StepRunResult[];
  try {
    results = await runCheckPlan(plan, {
      repoRoot,
      cfg,
      profile,
      // Narrowed above after the null check; `?? undefined` keeps the types
      // honest without a cast.
      changedPaths: changedPaths ?? undefined,
      changedRef,
      fix: opts.fix,
      stepNames: opts.steps,
      previousFailedTests,
      isolationRuns: cfg.check?.isolationRuns,
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
  } catch (e) {
    // The plan runner is not expected to throw, but if it does the normal
    // end-of-run record below never runs — and the server-side check manager
    // records only `code === null`, so a child that dies on an unhandled
    // error would leave NO row at all (#0564 review). Record the crash, then
    // re-throw for the usual CLI error path.
    const finishedAt = new Date();
    recordRunHistoryRow({
      root: checkStoreRoot,
      cacheDir: cfg.cacheDir,
      scope: changedRef ? `changed:${changedRef}` : "full",
      startedAt: runStartedAt.toISOString(),
      durationMs: finishedAt.getTime() - runStartedAt.getTime(),
      outcome: "fail",
      failedStep: "check",
      skippedSteps: [],
      detail: `check crashed before completing: ${(e as Error).message}`,
    });
    throw e;
  }

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

  // ── Failed-steps summary (#0651) ─────────────────────────────────────
  // Fixed position, at the very end of the run and short enough that `tail -20`
  // always contains it: an agent that pipes the gate through `tail`/`grep` must
  // still see WHICH step failed and the one command that reruns it, instead of
  // re-running the whole gate because the failing step scrolled out of view.
  // Printed AFTER the terminal line so `parseCheckResults` stops before it.
  const stepByName = new Map(plan.steps.map((s) => [s.name, s]));
  console.log(c.bold(c.cyan("\n  ── Failed steps ──")));
  if (gatingFailures.length === 0) {
    console.log(c.green("  ✔ none"));
  } else {
    for (const r of gatingFailures) {
      const step = stepByName.get(r.name);
      const fix = step ? formatFixCommand(step, repoRoot) : null;
      const rerun = rerunCommandFor(r.name, profile, plan.defaultProfile, changedRef);
      const fixPart = fix && fix !== r.command ? `fix: ${fix} · ` : "";
      console.log(`  ${c.red("✗")} ${r.name} — ${c.dim(`${fixPart}rerun: ${rerun}`)}`);
    }
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

  // Record the run in the durable history (#0564). The caller (handoff,
  // close-out, release) identifies itself via env; a bare `repoos check`
  // records as phase "cli" with a null task id. The store lives in the MAIN
  // checkout (resolved at the top of this command, #0564 review) so worktree
  // runs land in the history the server reads.
  recordRunHistoryRow({
    root: checkStoreRoot,
    cacheDir: cfg.cacheDir,
    scope: changedRef ? `changed:${changedRef}` : "full",
    worktree: repoRoot,
    startedAt: runStartedAt.toISOString(),
    durationMs: finishedAt.getTime() - runStartedAt.getTime(),
    outcome: gatingFailures.length === 0 ? "pass" : "fail",
    failedStep: gatingFailures[0]?.name ?? null,
    skippedSteps: results.filter((r) => r.status === "skipped").map((r) => r.name),
    detail: gatingFailures[0]?.detail ?? null,
    // The stored detail is a short log tail that routinely loses the failing
    // test's name; keep the names themselves so "which test?" is a query.
    failedTests: gatingFailures.flatMap((r) => extractFailedTests(r.output ?? "")),
    // Informational isolation label (#0655) — never part of the outcome.
    isolationNote: results.find((r) => r.isolationNote)?.isolationNote ?? null,
  });

  process.exit(gatingFailures.length > 0 ? 1 : 0);
}

/**
 * Where a standalone run's check-run history rows belong (#0564 review): an
 * explicit `REPOOS_CHECK_STORE_ROOT` (server-spawned paths) wins; otherwise
 * the MAIN checkout, resolved through any linked worktree. Fail-soft.
 */
function resolveCheckStoreRoot(repoRoot: string): string {
  const envRoot = process.env.REPOOS_CHECK_STORE_ROOT?.trim();
  return envRoot || mainCheckoutRoot(repoRoot);
}

/**
 * Failing test names from this task's most recent run (#0655), or none. Only
 * when that most recent run actually failed — once a run is green, the next
 * `repoos check` starts from a clean slate. Interactive/CLI and pre-review
 * only: close-out and release always run the full suite. Fail-soft.
 */
export function previousFailedTestsForRun(opts: {
  root: string;
  cacheDir: string;
  /** Absolute worktree path the new run will execute in, when known. */
  worktree?: string;
  taskId: string | null;
  phase: CheckRunPhase;
}): string[] {
  if (opts.phase !== "cli" && opts.phase !== "pre-review") return [];
  try {
    const rows = getCheckStore(opts.root, opts.cacheDir).list({ limit: 100 });
    // Prefer the worktree's own most recent run — a bare CLI self-check and the
    // pre-review handoff share a worktree but not a task id (#0655). Fall back
    // to the task id so a run recorded before worktree tagging still works.
    const byWorktree = opts.worktree ? rows.find((r) => r.worktree === opts.worktree) : undefined;
    const latest = byWorktree ?? rows.find((r) => (r.taskId ?? null) === opts.taskId);
    if (!latest || latest.outcome !== "fail") return [];
    return latest.failedTests;
  } catch {
    return [];
  }
}

/**
 * Write one local check-run row into the durable history (#0564), attributing
 * the caller/phase from the environment. Fail-soft: history is observability,
 * never a gate input.
 */
function recordRunHistoryRow(row: {
  root: string;
  cacheDir: string;
  scope: string;
  worktree?: string;
  startedAt: string;
  durationMs: number;
  outcome: "pass" | "fail" | "skipped";
  failedStep: string | null;
  skippedSteps: string[];
  detail: string | null;
  failedTests?: string[];
  isolationNote?: string | null;
}): void {
  try {
    const { taskId, phase } = envToRunContext(process.env);
    getCheckStore(row.root, row.cacheDir).record({
      taskId,
      phase,
      worktree: row.worktree,
      machine: localMachineName(),
      remote: false,
      scope: row.scope,
      startedAt: row.startedAt,
      durationMs: row.durationMs,
      outcome: row.outcome,
      failedStep: row.failedStep,
      skippedSteps: row.skippedSteps,
      detail: row.detail,
      failedTests: row.failedTests,
      isolationNote: row.isolationNote,
    });
  } catch {
    /* never fail the gate on a history write */
  }
}

/**
 * The command that reruns one step (#0651), preserving the run's profile and
 * changed-path scope so a close-out failure (`--profile full`) is reproducible.
 */
function rerunCommandFor(
  name: string,
  profile: string,
  defaultProfile: string,
  changedRef?: string,
): string {
  const parts = ["repoos", "check"];
  if (profile && profile !== (defaultProfile || DEFAULT_PROFILE)) {
    parts.push("--profile", profile);
  }
  parts.push("--step", name);
  if (changedRef) parts.push("--changed", changedRef);
  return parts.join(" ");
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
