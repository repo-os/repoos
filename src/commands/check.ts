/**
 * `repoos check` — the definition-of-done gate.
 *
 * Runs, in sequence: build staleness check, full build (tsc + asset copy),
 * CSS layering guard, theme contrast guard (button-gradient validity + WCAG
 * contrast on every theme's fg/bg token pairs), test suite (if present), and a
 * headless browser smoke test that verifies the UI mounts and has zero console
 * errors.
 *
 * Exits non-zero on any failure. Designed for CI gates and agent pre-review.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { join, sep } from "node:path";
import { c } from "../cli/colors.js";
import { checkBuildForRoot, type BuildCheckResult } from "../core/build.js";
import { findRepoRoot } from "../core/config.js";
import { availableMemBytes } from "../core/sysmem.js";
import { startPreviewServer, launchWebkit, type SmokeBrowser } from "./ui-harness.js";


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
function bareRequireOffenders(): string[] {
  const offenders: string[] = [];
  const srcRoot = "src";
  for (const dir of ["core", "server", "commands", "cli"]) {
    for (const absPath of walkTsFiles(join(srcRoot, dir))) {
      if (absPath.endsWith(".test.ts")) continue; // vitest supplies its own require shim
      let content: string;
      try {
        content = readFileSync(absPath, "utf8");
      } catch {
        continue;
      }
      if (content.includes("createRequire")) continue; // legitimately shadowed file-wide
      const relPath = absPath.split(sep).join("/");
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
 * Scan a stylesheet for UNLAYERED universal/bare-element selectors.
 * With Tailwind v4 everything lives in cascade layers; an unlayered `*`
 * or tag rule silently beats every utility (unlayered > @layer), which
 * already collapsed all shadcn padding once. Scoped class/ID/attribute
 * rules are intentional legacy overrides and stay allowed.
 */
function cssLayeringOffenders(css: string): string[] {
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
// Every theme (classic/clear/gen-z × dark/light) defines text/button tokens
// as CSS custom properties in style.css. Buttons in components/ui/button.vue
// consume `--btn-primary-bg` / `--btn-new-bg` via `background-image`, so a
// solid-color value silently renders a transparent button (the clear-dark
// "Save changes" bug). And hand-picked fg/bg pairs can drift into invisible
// text. This gate parses each theme block and enforces both rules.

interface ThemeBlock {
  variant: string;
  decls: Record<string, string>;
}

const THEME_VARIANTS: Record<string, string> = {
  ":root": "classic-dark",
  '[data-theme="light"]': "classic-light",
  ':root[data-ui-theme="clear"]': "clear-dark",
  ':root[data-ui-theme="clear"][data-theme="light"]': "clear-light",
  ':root[data-ui-theme="gen z"]': "gen-z-dark",
  ':root[data-ui-theme="gen z"][data-theme="light"]': "gen-z-light",
  ':root[data-ui-theme="jelly"]': "jelly-dark",
  ':root[data-ui-theme="jelly"][data-theme="light"]': "jelly-light",
};

/** Which blocks each variant inherits from, in order (later wins). */
const THEME_INHERIT: Record<string, string[]> = {
  "classic-dark": ["classic-dark"],
  "classic-light": ["classic-dark", "classic-light"],
  "clear-dark": ["classic-dark", "clear-dark"],
  "clear-light": ["classic-dark", "clear-dark", "clear-light"],
  "gen-z-dark": ["classic-dark", "gen-z-dark"],
  "gen-z-light": ["classic-dark", "gen-z-dark", "gen-z-light"],
  "jelly-dark": ["classic-dark", "jelly-dark"],
  "jelly-light": ["classic-dark", "jelly-dark", "jelly-light"],
};

/** (foreground token, background token) pairs checked for contrast. */
const CONTRAST_PAIRS: [string, string][] = [
  ["--txt", "--bg"],
  ["--txt-dim", "--bg"],
  ["--btn-primary-color", "--btn-primary-bg"],
  ["--btn-new-color", "--btn-new-bg"],
  ["--status-on-color", "--status-on-bg"],
  ["--tag-stream-color", "--tag-stream-bg"],
  ["--tag-reconnect-color", "--tag-reconnect-bg"],
  ["--doc-row-sel-color", "--doc-row-sel-bg"],
  ["--nav-active-color", "--nav-active-bg"],
];

/** Tokens consumed as `background-image` by components — must be gradients. */
const GRADIENT_TOKENS = ["--btn-primary-bg", "--btn-new-bg"];

const MIN_CONTRAST = 3.0;

function parseThemeBlocks(css: string): ThemeBlock[] {
  const blocks: ThemeBlock[] = [];
  let cur: string | null = null;
  let buf = "";
  for (const raw of css.split("\n")) {
    const t = raw.trim();
    if (cur === null) {
      if (t.endsWith("{") && !t.startsWith("@")) {
        const sel = t.slice(0, -1).trim();
        cur = THEME_VARIANTS[sel] ?? "";
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

interface RGB { r: number; g: number; b: number; a: number }

function parseColor(v: string): RGB | null {
  const s = v.trim().toLowerCase();
  if (!s || s === "none") return null;
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      const full = h.split("").map((ch) => ch + ch).join("");
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

function composite(fg: RGB, bg: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const a = fg.a;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
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
function colorCandidates(raw: string, map: Record<string, string>, bg: { r: number; g: number; b: number }): { r: number; g: number; b: number }[] {
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

function themeContrastOffenders(css: string): string[] {
  const blocks = parseThemeBlocks(css);
  if (!blocks.length) return [];
  const byVariant: Record<string, ThemeBlock> = {};
  for (const b of blocks) byVariant[b.variant] = b;
  const out: string[] = [];

  for (const variant of Object.keys(THEME_INHERIT)) {
    const map: Record<string, string> = {};
    for (const base of THEME_INHERIT[variant]) Object.assign(map, byVariant[base]?.decls ?? {});

    for (const tk of GRADIENT_TOKENS) {
      const raw = map[tk];
      if (raw !== undefined && !resolveVar(raw, map).includes("gradient(")) {
        out.push(`${variant} · ${tk} must be a gradient — button.vue consumes it via background-image`);
      }
    }

    const bgColor = parseColor(resolveVar(map["--bg"] ?? "", map));
    if (!bgColor) continue;
    const bg = composite(bgColor, bgColor);
    for (const [fgK, bgK] of CONTRAST_PAIRS) {
      if (map[fgK] === undefined || map[bgK] === undefined) continue;
      const fgs = colorCandidates(map[fgK], map, bg);
      const bgs = colorCandidates(map[bgK], map, bg);
      if (!fgs.length || !bgs.length) continue;
      let worst = Infinity;
      for (const f of fgs) for (const b of bgs) {
        const c = contrastRatio(luminance(f), luminance(b));
        if (c < worst) worst = c;
      }
      if (worst < MIN_CONTRAST) {
        out.push(`${variant} · ${fgK} on ${bgK} → ${worst.toFixed(2)} (need ≥${MIN_CONTRAST})`);
      }
    }
  }
  return out;
}

/**
 * What the "Full build" step should do for a given run.
 *
 * Standalone `repoos check` (env without REPOOS_SKIP_BUILD) always builds —
 * that path is agents' definition-of-done gate and must never weaken. Only the
 * close-out pipeline (done.ts / integration-orchestrator.ts) sets
 * REPOOS_SKIP_BUILD=1 after running `bun run build` itself, and even then the
 * skip only applies when the staleness check above verified dist matches the
 * current source exactly. If dist is missing or stale the build still runs, so
 * REPOOS_SKIP_BUILD can never let the UI smoke test probe a bad build.
 */
export type BuildStepAction = "skip" | "build" | "build-not-fresh";

export function skipBuildAction(
  env: NodeJS.ProcessEnv,
  buildFresh: boolean,
): BuildStepAction {
  if (env.REPOOS_SKIP_BUILD !== "1") return "build";
  return buildFresh ? "skip" : "build-not-fresh";
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
  if (stale.stale) {
    console.log(c.yellow(`  ⚠ ${stale.message}`));
    results.push(fail("staleness", stale.message ?? "build is stale"));
    exitCode = 1;
  } else if (stale.code === "fresh") {
    console.log(c.green("  ✔ Build is fresh"));
    results.push(pass("staleness"));
  } else {
    console.log(c.dim(`  · ${stale.message ?? stale.code}`));
    results.push(pass("staleness", stale.message ?? stale.code));
  }
  // True when dist matches the current source exactly — the precondition under
  // which REPOOS_SKIP_BUILD may skip the build below (nothing changed since the
  // caller built). Never true when dist is missing or stale.
  const buildFresh = !stale.stale && stale.code === "fresh";

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
      const msg = "bun.lock is out of sync with package.json — run `bun install` and commit the updated lockfile";
      console.log(c.red("  ✗ " + msg));
      results.push(fail("lockfile-sync", msg));
      exitCode = 1;
    }
  }

  // ── 2. Full build ───────────────────────────────────────────────────
  // Skippable via REPOOS_SKIP_BUILD (see skipBuildAction): the close-out
  // pipeline (`completeTask` in src/server/done.ts, and `validateCandidate` in
  // src/server/integration-orchestrator.ts) runs `bun run build` itself and
  // then invokes `repoos check` with this env var set, so its own "Full build"
  // step — which would rebuild the exact same source with nothing changed in
  // between — is skipped. Standalone `repoos check` from the CLI never sets
  // the var and always builds.
  heading("Full build");
  const buildAction = skipBuildAction(process.env, buildFresh);
  if (buildAction === "skip") {
    console.log(c.dim("  · Skipped — caller already built, build verified fresh (REPOOS_SKIP_BUILD=1)"));
    results.push(pass("build", "skipped — caller already built, build verified fresh"));
  } else {
    if (buildAction === "build-not-fresh") {
      console.log(c.yellow("  · REPOOS_SKIP_BUILD=1 but build is not fresh — building anyway"));
    }
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
  heading("CSS layering guard");
  const cssPath = "src/ui-app/src/style.css";
  const cssSrc = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
  if (!cssSrc.includes('@import "tailwindcss"')) {
    console.log(c.dim("  · No Tailwind v4 stylesheet — skipping"));
    results.push(pass("css-layers", "skipped — no Tailwind v4 style.css"));
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
  if (!cssSrc.includes(":root{")) {
    console.log(c.dim("  · No theme token blocks — skipping"));
    results.push(pass("theme-contrast", "skipped — no theme tokens"));
  } else {
    const offenders = themeContrastOffenders(cssSrc);
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
  heading("Bare require() guard");
  {
    const offenders = bareRequireOffenders();
    if (offenders.length > 0) {
      const msg =
        "Bare require() in ESM source (this package is \"type\": \"module\" — a bare require throws " +
        "ReferenceError at runtime in dist/, silently if caught):\n    " +
        offenders.slice(0, 10).join("\n    ") +
        "\n    Import from \"node:...\" normally, or use createRequire(import.meta.url) if you " +
        "genuinely need CJS interop (see ui-harness.ts).";
      console.log(c.red("  ✗ " + msg.split("\n")[0]));
      results.push(fail("bare-require", msg));
      exitCode = 1;
    } else {
      console.log(c.green("  ✔ No bare require() calls in ESM source"));
      results.push(pass("bare-require"));
    }
  }

  // ── 3. Tests (if any) ───────────────────────────────────────────────
  heading("Tests");
  const pkg = JSON.parse(existsSync("package.json") ? readFileSync("package.json", "utf8") : "{}");
  const hasTestScript = Boolean(pkg.scripts && pkg.scripts.test);
  const hasTestFiles = existsSync("test") || existsSync("__tests__") || existsSync("tests");
  if (hasTestScript || hasTestFiles) {
    // Only the vitest-backed `bun run test` script understands `--changed`;
    // the bare `bun test` fallback (no package.json test script) is left
    // unscoped.
    const changedRef = hasTestScript ? changedTestRef(process.env) : undefined;
    const cmd = hasTestScript
      ? changedRef
        ? `bun run test -- --changed ${changedRef}`
        : "bun run test"
      : "bun test";
    if (changedRef) {
      console.log(c.dim(`  · Scoped to files changed vs ${changedRef} (--changed)`));
    }
    // Worker pool: `undefined` keeps the config floor (2). A solo run with
    // headroom scales up — passed through env, read back in vite.config.ts.
    const workers = hasTestScript ? testPoolSize(process.env) : undefined;
    const testEnv = workers ? { ...process.env, REPOOS_TEST_WORKERS: String(workers) } : process.env;
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
  heading("UI smoke test");
  try {
    await runUISmokeTest();
    results.push(pass("ui-smoke"));
    console.log(c.green("  ✔ UI smoke test passed"));
  } catch (e: unknown) {
    const msg = (e as Error).message;
    const notInstalled =
      msg.includes("Cannot find module") ||
      msg.includes("not installed") ||
      msg.includes("Executable doesn't exist");
    if (notInstalled) {
      console.log(c.dim("  · Playwright not available — UI smoke test skipped"));
      console.log(c.dim("    Install: bun add -d @playwright/test && npx playwright install webkit"));
      results.push(pass("ui-smoke", "skipped — playwright/browser not available"));
    } else {
      console.log(c.red("  ✗ UI smoke test failed: " + msg.split("\n")[0]));
      results.push(fail("ui-smoke", msg));
      exitCode = 1;
    }
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

/**
 * Build a throwaway, empty fixture repo to serve the built SPA against.
 * The smoke test only cares that the built UI renders with zero console errors,
 * so booting it against the live checkout's real board drags in job recovery
 * and preview auto-launch reconciliation for every active/review task (0260).
 * A bare `work/` + minimal `repoos.toml` avoids all of that: no tasks, no
 * recovery, no auto-launch — constant cost regardless of board size.
 */
function makeSmokeFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-smoke-"));
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "repoos.toml"), "theme = \"dark\"\nuiTheme = \"classic\"\n\n");
  return root;
}

/**
 * Start the dev server, run Playwright WebKit smoke tests, then stop.
 * Exports failures as thrown errors. Server startup + webkit launch share the
 * harness in ui-harness.ts with the screenshot script (#0213).
 */
async function runUISmokeTest(): Promise<void> {
  const fixture = makeSmokeFixture();
  let server;
  try {
    server = await startPreviewServer(fixture);
  } catch (err) {
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }
  let browser: SmokeBrowser | undefined;
  try {
    browser = await launchWebkit();
  } catch (err) {
    server.close();
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }
  try {
    const page = await browser.newPage();
    const consoleErrs: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrs.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(server.url, { waitUntil: "load", timeout: 20_000 });

    // Check page title is correct
    const title = await page.title();
    if (title !== "RepoOS") throw new Error(`Unexpected title: "${title}"`);

    // Verify we are testing the built Vite SPA, which references hashed
    // assets in /assets/.
    const hashedAsset = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script[src]"));
      return scripts.some((s) => (s.getAttribute("src") ?? "").startsWith("/assets/"));
    });
    if (!hashedAsset) {
      throw new Error("Served page is not the built Vite app (no /assets/ bundle)");
    }

    // Check that the app MOUNTED — no unrendered mustache in the DOM
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes("{{") || bodyText.includes("}}")) {
      throw new Error("Unrendered mustache found in DOM — Vue did not mount");
    }

    // Check that a known root element rendered with real content
    const appEl = await page.$("#app");
    if (!appEl) throw new Error("#app element not found");

    const hasBrand = await page.evaluate(() =>
      document.body.innerText.includes("RepoOS"),
    );
    if (!hasBrand) throw new Error('Expected "RepoOS" in rendered content');

    // Navigate to work page and click +New Task
    await page.evaluate(() => {
      const navItems = document.querySelectorAll(".nav-item");
      for (const item of Array.from(navItems)) {
        if (item.textContent?.includes("Work")) (item as HTMLElement).click();
      }
    });
    await page.waitForTimeout(500);

    // Verify work page rendered
    const workEl = await page.$(".board");
    if (!workEl) {
      consoleErrs.push("Work page board not rendered — check page navigation");
    }

    // Check that the +New Task button exists
    const newBtn = await page.$(".new-btn");
    if (!newBtn) {
      consoleErrs.push("+New Task button not found in DOM");
    }

    // ── CSS regression guard: utility spacing must actually apply ─────
    // Tailwind v4 emits all its CSS inside cascade layers. If an
    // UNLAYERED reset such as `*{padding:0;margin:0}` is ever added to
    // style.css, it silently beats every spacing utility (unlayered rules
    // take precedence over @layer rules), collapsing padding on shadcn
    // controls while console stays clean. Flag any non-explicit-zero
    // spacing utility whose computed value is 0.
    const assertUtilitySpacing = async (where: string) => {
      const offenders = await page.evaluate(() => {
        const AXIS: Record<string, string[]> = {
          p: ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"],
          px: ["paddingLeft", "paddingRight"],
          py: ["paddingTop", "paddingBottom"],
          pt: ["paddingTop"], pr: ["paddingRight"], pb: ["paddingBottom"], pl: ["paddingLeft"],
          m: ["marginTop", "marginRight", "marginBottom", "marginLeft"],
          mx: ["marginLeft", "marginRight"],
          my: ["marginTop", "marginBottom"],
          mt: ["marginTop"], mr: ["marginRight"], mb: ["marginBottom"], ml: ["marginLeft"],
        };
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll("*"))) {
          if (!(el instanceof HTMLElement)) continue;
          const s = getComputedStyle(el) as unknown as Record<string, string>;
          for (const cls of el.classList) {
            if (cls.startsWith("-")) continue; // negative margins are intentional
            const m = /^([pm])([trblxy]?)-(?:\[)?([1-9])/.exec(cls);
            if (!m) continue;
            for (const prop of AXIS[m[1] + m[2]] ?? []) {
              if (parseFloat(s[prop] as string) <= 0) {
                bad.push(`${cls} → ${prop} = ${s[prop]} on <${el.tagName.toLowerCase()}>`);
                break;
              }
            }
          }
        }
        return [...new Set(bad)];
      });
      if (offenders.length > 0) {
        throw new Error(
          "Utility spacing collapsed on " + where + ": " + offenders.slice(0, 6).join("; "),
        );
      }
    };

    await assertUtilitySpacing("dashboard");

    // Re-run the guard on the settings page (covers shadcn Button + Select)
    await page.evaluate(() => {
      const navItems = document.querySelectorAll(".nav-item");
      for (const item of Array.from(navItems)) {
        if (item.textContent?.includes("Settings")) (item as HTMLElement).click();
      }
    });
    await page.waitForTimeout(500);
    await assertUtilitySpacing("settings");

    // Check for zero console errors
    if (consoleErrs.length > 0) {
      let msg = "Console errors (" + consoleErrs.length + "): " + consoleErrs.join("; ");
      if (pageErrors.length > 0) msg += " | Page errors: " + pageErrors.join("; ");
      throw new Error(msg);
    }
    if (pageErrors.length > 0) {
      throw new Error(
        "Page errors (" + pageErrors.length + "): " + pageErrors.join("; "),
      );
    }
  } finally {
    if (browser) await browser.close();
    server.close();
    rmSync(fixture, { recursive: true, force: true });
  }
}
