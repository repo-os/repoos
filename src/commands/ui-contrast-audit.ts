/**
 * RepoOS's rendered contrast audit (#0596).
 *
 * The static `theme-contrast` guard measures a handful of named token pairs
 * per theme scope, so it structurally cannot see a component that hard-codes
 * its own colors — the task drawer's Changes-tab file header shipped `#c9d1d9`
 * text on a `rgba(255,255,255,0.04)` header and went unnoticed until someone
 * looked at a light theme. This audit measures what actually renders:
 *
 *   for every `[check] themeScopes` scope (light and dark), open a fixed set
 *   of screens/states (board, drawer tabs, Agents, Settings, Context/Docs, the
 *   new-task drawer, toasts), walk every visible text node, read its computed
 *   `color`, composite translucent ancestor backgrounds down to the first
 *   opaque one, and fail anything under the WCAG floor — 4.5:1 for body text,
 *   3:1 for large text.
 *
 * Like `scripts/ui-smoke.mjs`, this is RepoOS's OWN script (the screen list is
 * this app's), run through the shared headless-WebKit harness in
 * `ui-harness.ts`, wired in as a raw `[[check.steps]]` command. It skips (0)
 * when Playwright/WebKit is missing, exactly like the smoke test.
 *
 * Exemptions are never scattered ignores: they live in `[[check.contrastExempts]]`
 * (selector + reason) or on the element as `data-contrast-ok` (which exempts
 * that element and its descendants).
 *
 * Screens whose background is an image/gradient are reported as *unchecked*
 * rather than judged — a ratio against an unknown pixel is a lie.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { c } from "../cli/colors.js";
import { findRepoRoot, loadConfig } from "../core/config.js";
import type { CheckThemeScope } from "../core/types.js";
import { contrastRatio, luminance } from "./check.js";
import {
  startPreviewServer,
  launchWebkit,
  isPlaywrightUnavailable,
  type SmokeBrowser,
  type SmokeContext,
  type SmokePage,
} from "./ui-harness.js";

// ── Theme scope → rendered attributes ───────────────────────────────────

/** What a `[[check.themeScopes]]` selector means as live DOM attributes. */
export interface ScopeAttributes {
  /** Value for `<html data-ui-theme>`; `classic` is this app's base theme. */
  uiTheme: string;
  /** Value for `<html data-theme>` (`dark` | `light`). */
  mode: string;
}

/**
 * Derive the `<html>` attributes a scope selector describes. The selector is
 * the vocabulary the static guard already declares (`:root`,
 * `:root[data-ui-theme="clear"][data-theme="light"]`), so the audit covers
 * exactly the scopes that guard checks — no second theme list to keep in sync.
 * Falls back to the scope name's `-dark`/`-light` suffix, then `dark`.
 */
export function scopeAttributes(scope: CheckThemeScope): ScopeAttributes {
  const ui = /\[data-ui-theme="([^"]*)"\]/.exec(scope.selector)?.[1];
  const mode = /\[data-theme="([^"]*)"\]/.exec(scope.selector)?.[1];
  const byName = /-light$/.test(scope.name)
    ? "light"
    : /-dark$/.test(scope.name)
      ? "dark"
      : undefined;
  return { uiTheme: ui ?? "classic", mode: mode ?? byName ?? "dark" };
}

// ── Color math (judged Node-side so it is unit-testable) ────────────────

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse a computed CSS color. Handles hex (3/4/6/8), `rgb()`/`rgba()` in
 * legacy comma, space and slash syntaxes (with `%` channels), `transparent`,
 * and `color(srgb …)`. Returns null for color spaces this audit cannot
 * convert (oklab, display-p3, hsl-derived values) — the caller then reports
 * the sample as *unchecked* instead of guessing a ratio.
 */
export function parseCssColor(raw: string): RGBA | null {
  const s = raw.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      return parseCssColor("#" + h.split("").map((ch) => ch + ch).join(""));
    }
    if (h.length === 6 || h.length === 8) {
      const n = parseInt(h.slice(0, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      if (Number.isNaN(n)) return null;
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
    }
    return null;
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(s);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (v: string): number =>
      v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v);
    const a = parts.length > 3 ? ch(parts[3]) / 255 : 1;
    const out = { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a };
    return [out.r, out.g, out.b, out.a].every(Number.isFinite) ? out : null;
  }
  const srgb = /^color\(\s*srgb\s+([^)]*)\)$/.exec(s);
  if (srgb) {
    const parts = srgb[1].split(/[/\s]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const n = parts.map((v) => parseFloat(v));
    const a = parts.length > 3 ? n[3] : 1;
    const out = { r: n[0] * 255, g: n[1] * 255, b: n[2] * 255, a };
    return [out.r, out.g, out.b, out.a].every(Number.isFinite) ? out : null;
  }
  return null;
}

/** `src` painted over `dst` (both in the same coordinate space). */
function over(src: RGBA, dst: RGBA): RGBA {
  const a = src.a + dst.a * (1 - src.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (src.r * src.a + dst.r * dst.a * (1 - src.a)) / a,
    g: (src.g * src.a + dst.g * dst.a * (1 - src.a)) / a,
    b: (src.b * src.a + dst.b * dst.a * (1 - src.a)) / a,
    a,
  };
}

/** The page canvas behind a still-translucent chain (UA default: white). */
const CANVAS: RGBA = { r: 255, g: 255, b: 255, a: 1 };

/**
 * The WCAG floor for one text run: 3:1 for large text (≥24px, or ≥18.66px
 * bold — 18pt/14pt), 4.5:1 for body text. This is the "large/UI text or body
 * text" split the audit reports each failure against.
 */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? 3 : 4.5;
}

function toHex(c: RGBA): string {
  const h = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

// ── The in-page probe ───────────────────────────────────────────────────
// Playwright serializes this FUNCTION SOURCE into the page, so it must stay
// completely self-contained: no imports, no module-scope helpers, no closure
// over outer variables. All judgment happens Node-side (unit-tested math).

export interface ProbeSample {
  /** Short selector chain for the text's element (for the failure report). */
  selector: string;
  /** First 60 chars of the text — enough to recognise, cheap to transport. */
  text: string;
  /** The element's computed `color`, verbatim. */
  fg: string;
  /** Composited background candidates, TOPMOST first (element → root). */
  bgChain: string[];
  /** True when an image/gradient sits behind the text before an opaque bg. */
  imageBackdrop: boolean;
  fontSize: number;
  fontWeight: number;
  /** Product of ancestor `opacity` values (1 when fully opaque). */
  opacity: number;
}

export interface ProbeArg {
  /** `[[check.contrastExempts]]` selectors; matching exempts the subtree. */
  exemptSelectors: string[];
}

export interface ProbeResult {
  samples: ProbeSample[];
  /** Visible text nodes seen (before dedupe/exemptions). */
  examined: number;
  /** Text nodes skipped because they or an ancestor are exempt. */
  exempted: number;
  /** How many roots were walked: open dialogs, or the whole body. */
  roots: number;
}

export function contrastProbe(arg: ProbeArg): ProbeResult {
  const samples: ProbeSample[] = [];
  const done = new Set<Element>();
  let examined = 0;
  let exempted = 0;

  // When a dialog is open it owns the screen (the board behind a scrim would
  // otherwise be judged against colors the user cannot see). Each dialog state
  // is also audited on its own screen, so nothing loses coverage.
  const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
  const roots: Element[] = dialogs.length > 0 ? dialogs : [document.body];

  const shortSelector = (el: Element): string => {
    const seg = (e: Element): string => {
      const tag = e.tagName.toLowerCase();
      const id = e.id ? "#" + e.id : "";
      const cls =
        e.classList.length > 0
          ? "." + Array.from(e.classList)
              .slice(0, 2)
              .join(".")
          : "";
      return tag + id + cls;
    };
    const parts = [seg(el)];
    let p = el.parentElement;
    for (let i = 0; i < 2 && p && p !== document.body && p !== document.documentElement; i++) {
      parts.unshift(seg(p));
      p = p.parentElement;
    }
    return parts.join(" > ");
  };

  const isExempt = (el: Element): boolean => {
    let n: Element | null = el;
    while (n) {
      if (n.hasAttribute("data-contrast-ok")) return true;
      for (const sel of arg.exemptSelectors) {
        try {
          if (n.matches(sel)) return true;
        } catch {
          // A bad selector in config must not abort the audit; it just
          // exempts nothing (config warnings surface elsewhere).
        }
      }
      n = n.parentElement;
    }
    return false;
  };

  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el) continue;
      const tag = el.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TITLE") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      examined++;
      if (isExempt(el)) {
        exempted++;
        continue;
      }
      if (done.has(el)) continue;
      done.add(el);

      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;

      const bgChain: string[] = [];
      let imageBackdrop = false;
      let opaque = false;
      let opacity = 1;
      let hidden = false;
      let n: Element | null = el;
      while (n) {
        const s = getComputedStyle(n);
        if (s.visibility === "hidden") {
          hidden = true;
          break;
        }
        const op = parseFloat(s.opacity);
        if (Number.isFinite(op)) opacity *= op;
        if (!opaque && !imageBackdrop) {
          if (s.backgroundImage && s.backgroundImage !== "none") {
            // An image or gradient paints behind this text before any opaque
            // color reaches it: the real pixel is unknowable from the DOM.
            imageBackdrop = true;
          } else {
            const bg = s.backgroundColor;
            if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
              bgChain.push(bg);
              const m = /rgba?\(([^)]*)\)/.exec(bg);
              const parts = m ? m[1].split(/[,/\s]+/).filter(Boolean) : [];
              const a = parts.length > 3 ? parseFloat(parts[3]) : 1;
              if (!Number.isFinite(a) || a >= 1) opaque = true;
            }
          }
        }
        n = n.parentElement;
      }
      if (hidden) continue;

      samples.push({
        selector: shortSelector(el),
        text: text.slice(0, 60),
        fg: cs.color,
        bgChain,
        imageBackdrop,
        fontSize: parseFloat(cs.fontSize) || 0,
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
        opacity: Number.isFinite(opacity) ? opacity : 1,
      });
    }
  }

  return { samples, examined, exempted, roots: roots.length };
}

// ── Judging a sample ────────────────────────────────────────────────────

export type JudgeKind = "pass" | "fail" | "unchecked";

export interface ContrastFinding {
  selector: string;
  text: string;
  /** Rendered foreground, after alpha compositing. */
  fg: string;
  /** Resolved background the text actually sits on. */
  bg: string;
  ratio: number;
  /** The WCAG floor this text had to clear. */
  need: number;
  fontSize: number;
}

export interface JudgeResult {
  kind: JudgeKind;
  /** Why the sample could not be judged (kind === "unchecked"). */
  reason?: string;
  finding?: ContrastFinding;
}

/** Judge one probe sample: composite → ratio → WCAG floor. */
export function judgeSample(s: ProbeSample): JudgeResult {
  if (s.imageBackdrop) {
    return { kind: "unchecked", reason: "gradient/image behind text" };
  }
  const fgRaw = parseCssColor(s.fg);
  if (!fgRaw) return { kind: "unchecked", reason: `unparsed text color "${s.fg}"` };

  let bg: RGBA | null = null;
  for (const layer of s.bgChain) {
    const parsed = parseCssColor(layer);
    if (!parsed) return { kind: "unchecked", reason: `unparsed background "${layer}"` };
    bg = bg ? over(bg, parsed) : parsed;
  }
  if (!bg) bg = CANVAS;
  if (bg.a < 1) bg = over(bg, CANVAS);

  const fg = over({ ...fgRaw, a: fgRaw.a * (s.opacity < 1 ? s.opacity : 1) }, bg);
  const ratio = contrastRatio(luminance(fg), luminance(bg));
  const need = requiredRatio(s.fontSize, s.fontWeight);
  const finding: ContrastFinding = {
    selector: s.selector,
    text: s.text,
    fg: toHex(fg),
    bg: toHex(bg),
    ratio,
    need,
    fontSize: s.fontSize,
  };
  return ratio < need ? { kind: "fail", finding } : { kind: "pass", finding };
}

// ── Fixture ─────────────────────────────────────────────────────────────

/**
 * Two throwaway tasks so the board has cards and the drawer has content to
 * audit. `inbox`/`done` only: no active or review task means no job recovery
 * or preview auto-launch touches this fixture (same reasoning as the smoke
 * fixture in ui-smoke.ts).
 */
const FIXTURE_TASK_A = `---
id: "0001"
title: "Fixture task for the rendered contrast audit"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: human
branch: ""
created_at: "2026-09-01T00:00:00Z"
updated_at: "2026-09-01T00:00:00Z"
---
## Problem

The contrast audit needs a real card on the board and a drawer with content
on every tab.

## Acceptance

- [ ] The drawer's Task, Changes, Tokens, Review and PM tabs all render.

## Activity

- 2026-09-01T00:00:00Z · created · human
`;

const FIXTURE_TASK_B = `---
id: "0002"
title: "Fixture task already done"
type chore
status: done
priority: p3
area: general
assigned_to: ai
created_by: human
branch: ""
created_at: "2026-09-02T00:00:00Z"
updated_at: "2026-09-02T00:00:00Z"
---
## Problem

A second column's worth of content so the board is not a single card.

## Activity

- 2026-09-02T00:00:00Z · created · human
`;

function makeAuditFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-contrast-"));
  mkdirSync(join(root, "work"), { recursive: true });
  writeFileSync(join(root, "repoos.toml"), 'theme = "dark"\nuiTheme = "classic"\n');
  writeFileSync(join(root, "work", "0001-fixture-task.md"), FIXTURE_TASK_A);
  writeFileSync(join(root, "work", "0002-fixture-done.md"), FIXTURE_TASK_B);
  return root;
}

// ── Screen states ───────────────────────────────────────────────────────

interface ScreenState {
  name: string;
  prepare: (page: SmokePage) => Promise<void>;
}

/** Navigate and wait for the SPA to render with its theme applied. */
async function gotoApp(page: SmokePage, url: string, path: string): Promise<void> {
  await page.goto(url + path, { waitUntil: "load", timeout: 20_000 });
  await page.waitForFunction(
    () => Boolean(document.querySelector("#app")?.textContent?.trim()),
    { timeout: 10_000 },
  );
  // `data-ui-theme` is written ONLY by the config store's async `load()`
  // (index.html sets `data-theme` pre-paint but never the ui theme), so its
  // presence means the app's own theme application has finished. Without this
  // barrier the audit's flip can interleave with `load()` reading
  // localStorage twice — it once produced MIXED states (dark text on a light
  // card) and a dozen phantom failures that no run reproduced (#0596).
  await waitFor(page, () => document.documentElement.hasAttribute("data-ui-theme"), 5000);
  await page.waitForTimeout(100); // let anything queued behind load() settle
  await page.evaluate(() => {
    // Freeze transitions/animations: a color mid-transition is neither the
    // before nor the after state, and waiting it out on every scope flip
    // would dominate the audit's runtime.
    if (document.getElementById("contrast-audit-motion-fix")) return;
    const s = document.createElement("style");
    s.id = "contrast-audit-motion-fix";
    s.textContent =
      "*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}";
    document.head.appendChild(s);
  });
}

/** Best-effort wait; false means the expectation was not met (not fatal). */
async function waitFor(page: SmokePage, fn: () => unknown, timeout: number): Promise<boolean> {
  try {
    await page.waitForFunction(fn, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** Click the drawer tab whose label starts with `label`. */
async function clickTab(page: SmokePage, label: string): Promise<void> {
  await page.evaluate((want: string) => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>(".drawer-tabs .tab-btn"));
    const btn = btns.find((b) => (b.textContent ?? "").trim().startsWith(want));
    if (btn) btn.click();
  }, label);
  await page.waitForTimeout(350);
}

/**
 * Raise a toast by calling the app's own store — the toast panel is state
 * driven, so there is no stable DOM affordance that raises one on demand.
 * Returns false (and the caller skips the state) if the store cannot be
 * reached, e.g. after a refactor renames it.
 */
async function raiseToast(page: SmokePage): Promise<boolean> {
  return page.evaluate(() => {
    type PiniaLike = {
      _s?: Map<string, { pushToast?: (message: string, type?: string) => unknown }>;
    };
    const host = document.querySelector("#app") as unknown as {
      __vue_app__?: { config?: { globalProperties?: { $pinia?: PiniaLike } } };
    } | null;
    const repo = host?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get("repo");
    if (!repo?.pushToast) return false;
    repo.pushToast("Contrast audit toast", "info");
    return true;
  });
}

function makeScreens(url: string): ScreenState[] {
  const openDrawer = async (page: SmokePage): Promise<void> => {
    await gotoApp(page, url, "/work");
    await waitFor(page, () => document.querySelectorAll(".task-card").length > 0, 4000);
    await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(".task-card");
      if (card) card.click();
    });
    await waitFor(page, () => document.querySelectorAll('[role="dialog"] .drawer-tabs').length > 0, 5000);
  };
  return [
    { name: "dashboard", prepare: (p) => gotoApp(p, url, "/") },
    {
      name: "board",
      prepare: async (p) => {
        await gotoApp(p, url, "/work");
        await waitFor(p, () => document.querySelectorAll(".task-card").length > 0, 4000);
      },
    },
    { name: "drawer-task", prepare: openDrawer },
    {
      name: "drawer-changes",
      prepare: async (p) => {
        await openDrawer(p);
        await clickTab(p, "Changes");
      },
    },
    {
      name: "drawer-tokens",
      prepare: async (p) => {
        await openDrawer(p);
        await clickTab(p, "Tokens");
      },
    },
    {
      name: "drawer-review",
      prepare: async (p) => {
        await openDrawer(p);
        await clickTab(p, "Review");
      },
    },
    {
      name: "drawer-pm",
      prepare: async (p) => {
        await openDrawer(p);
        await clickTab(p, "PM");
      },
    },
    { name: "agents", prepare: (p) => gotoApp(p, url, "/agents") },
    { name: "settings", prepare: (p) => gotoApp(p, url, "/settings") },
    {
      name: "context-docs",
      prepare: async (p) => {
        await gotoApp(p, url, "/repo");
        // Context has Docs/Skills/Discover/History tabs; Docs is the default,
        // but click it so the audit doesn't silently sit on another tab.
        await p.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll<HTMLElement>("[role=tab], .tab-btn"));
          const docs = tabs.find((t) => (t.textContent ?? "").trim().startsWith("Docs"));
          if (docs) docs.click();
        });
        await p.waitForTimeout(250);
      },
    },
    {
      name: "new-task-drawer",
      prepare: async (p) => {
        await gotoApp(p, url, "/work");
        await waitFor(p, () => document.querySelectorAll(".new-btn").length > 0, 4000);
        await p.evaluate(() => {
          const btn = document.querySelector<HTMLElement>(".new-btn");
          if (btn) btn.click();
        });
        await waitFor(p, () => document.querySelectorAll('[role="dialog"]').length > 0, 5000);
      },
    },
    {
      name: "toast",
      prepare: async (p) => {
        await gotoApp(p, url, "/work");
        const raised = await raiseToast(p);
        if (!raised) throw new Error("toast store unreachable");
        const ok = await waitFor(p, () => document.querySelectorAll(".toast-item").length > 0, 3000);
        if (!ok) throw new Error("toast did not render");
      },
    },
  ];
}

// ── Report ──────────────────────────────────────────────────────────────

interface FailureRow extends ContrastFinding {
  scope: string;
  screen: string;
}

interface AuditStats {
  examined: number;
  exempted: number;
  unchecked: Map<string, number>;
  screens: number;
  scopes: number;
}

function addFailure(rows: Map<string, FailureRow>, scope: string, screen: string, f: ContrastFinding): void {
  const key = `${scope}|${f.selector}|${f.fg}|${f.bg}|${f.ratio.toFixed(2)}`;
  const existing = rows.get(key);
  if (existing) {
    existing.screen += `, ${screen}`;
    return;
  }
  rows.set(key, { ...f, scope, screen });
}

function printReport(rows: Map<string, FailureRow>, stats: AuditStats, warnings: string[]): void {
  console.log(
    c.dim(
      `  · ${stats.scopes} theme scope(s) × ${stats.screens} screen state(s) · ` +
        `${stats.examined} visible text run(s) examined`,
    ),
  );
  if (stats.exempted > 0) {
    console.log(c.dim(`  · ${stats.exempted} text run(s) exempt (contrastExempts / data-contrast-ok)`));
  }
  if (stats.unchecked.size > 0) {
    const parts = [...stats.unchecked.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${reason} (${n})`);
    const total = [...stats.unchecked.values()].reduce((a, b) => a + b, 0);
    console.log(c.dim(`  · ${total} text run(s) unchecked: ${parts.join(", ")}`));
  }
  for (const w of warnings) console.log(c.yellow(`  ⚠ ${w}`));
  if (rows.size === 0) {
    console.log(c.green("  ✔ no text below the WCAG floor in any theme scope"));
    return;
  }

  const byScope = new Map<string, FailureRow[]>();
  for (const row of rows.values()) {
    const list = byScope.get(row.scope) ?? [];
    list.push(row);
    byScope.set(row.scope, list);
  }
  console.log(
    c.red(
      `  ✗ ${rows.size} text/background pair(s) below the WCAG floor across ${byScope.size} scope(s):`,
    ),
  );
  for (const [scope, list] of byScope) {
    list.sort((a, b) => a.ratio - b.ratio);
    console.log(c.bold(c.red(`\n  ${scope} (${list.length}):`)));
    for (const r of list) {
      console.log(
        `    · ${r.selector} — ${r.fg} on ${r.bg} = ${r.ratio.toFixed(2)} ` +
          `(need ≥${r.need}, ${Math.round(r.fontSize)}px) [${r.screen}] "${r.text}"`,
      );
    }
  }
  console.log(
    c.dim(
      "\n    Fix: use the theme token for the color, or — if the block is intentionally " +
        "off-contrast — add it to [[check.contrastExempts]] (selector + reason) in repoos.toml " +
        "or mark the element data-contrast-ok.",
    ),
  );
}

// ── Orchestration ───────────────────────────────────────────────────────

async function runAudit(): Promise<{
  rows: Map<string, FailureRow>;
  stats: AuditStats;
  warnings: string[];
}> {
  const repoRoot = findRepoRoot();
  const cfg = loadConfig(repoRoot);
  const scopes = cfg.check?.themeScopes ?? [];
  const exemptSelectors = (cfg.check?.contrastExempts ?? []).map((e) => e.selector);

  const fixture = makeAuditFixture();
  let server: Awaited<ReturnType<typeof startPreviewServer>> | undefined;
  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  const warnings: string[] = [];
  const rows = new Map<string, FailureRow>();
  const stats: AuditStats = {
    examined: 0,
    exempted: 0,
    unchecked: new Map(),
    screens: 0,
    scopes: scopes.length,
  };

  try {
    server = await startPreviewServer(fixture);
  } catch (err) {
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }
  try {
    browser = await launchWebkit();
    context = await browser.newContext({ serviceWorkers: "block" });
  } catch (err) {
    server.close();
    rmSync(fixture, { recursive: true, force: true });
    throw err;
  }

  try {
    const page = await context.newPage();
    const screens = makeScreens(server.url);
    for (const screen of screens) {
      try {
        await screen.prepare(page);
      } catch (err) {
        warnings.push(`screen "${screen.name}" unavailable — ${(err as Error).message}`);
        continue;
      }
      stats.screens++;
      for (const scope of scopes) {
        const attrs = scopeAttributes(scope);
        // Writing localStorage too means a late async config load re-applies
        // OUR scope instead of racing it — both paths converge.
        await page.evaluate((a: { uiTheme: string; mode: string }) => {
          try {
            localStorage.setItem("repoos.theme", a.mode);
            localStorage.setItem("repoos.uiTheme", a.uiTheme);
          } catch {
            /* storage unavailable: attributes below still apply */
          }
          document.documentElement.dataset.theme = a.mode;
          document.documentElement.dataset.uiTheme = a.uiTheme;
        }, attrs);
        const probe = await page.evaluate(contrastProbe, { exemptSelectors });
        if (
          process.env.CONTRAST_DEBUG === "1" &&
          screen.name === "settings" &&
          scope.name === "classic-dark"
        ) {
          const dbg = await page.evaluate(() => {
            const el = document.querySelector("#setting-areas .setting-label");
            const root = getComputedStyle(document.documentElement);
            return {
              attrs: { ...document.documentElement.dataset },
              txt: root.getPropertyValue("--txt").trim(),
              card: root.getPropertyValue("--card").trim(),
              labelColor: el ? getComputedStyle(el).color : "missing",
              bodyImg: getComputedStyle(document.body).backgroundImage.slice(0, 40),
            };
          });
          console.log("CONTRAST-DEBUG " + JSON.stringify(dbg));
          const sample = probe.samples.find((s) => s.selector.includes("setting-label"));
          if (sample) console.log("CONTRAST-DEBUG sample " + JSON.stringify(sample));
        }
        stats.examined += probe.examined;
        stats.exempted += probe.exempted;
        for (const sample of probe.samples) {
          const verdict = judgeSample(sample);
          if (verdict.kind === "unchecked") {
            const reason = verdict.reason ?? "unknown";
            stats.unchecked.set(reason, (stats.unchecked.get(reason) ?? 0) + 1);
          } else if (verdict.kind === "fail" && verdict.finding) {
            addFailure(rows, scope.name, screen.name, verdict.finding);
          }
        }
      }
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    server.close();
    rmSync(fixture, { recursive: true, force: true });
  }

  return { rows, stats, warnings };
}

/**
 * Run the audit with the same outcome contract as `cmdUISmoke`: pass → 0,
 * Playwright/WebKit unavailable → skip (0), no `[check] themeScopes` → skip
 * (0), failures → 1. Returns the exit code for the caller (the launcher
 * script, or a future in-process caller) to use.
 */
export async function cmdContrastAudit(): Promise<number> {
  const started = Date.now();
  try {
    const cfg = loadConfig(findRepoRoot());
    if (!(cfg.check?.themeScopes?.length)) {
      console.log(c.dim("  · no [check] themeScopes configured — rendered contrast audit skipped"));
      return 0;
    }
    const { rows, stats, warnings } = await runAudit();
    printReport(rows, stats, warnings);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (rows.size > 0) {
      console.log(c.red(`  ✗ rendered contrast audit failed (${secs}s)`));
      return 1;
    }
    console.log(c.green(`  ✔ rendered contrast audit passed (${secs}s)`));
    return 0;
  } catch (e: unknown) {
    const msg = (e as Error).message ?? String(e);
    if (isPlaywrightUnavailable(msg)) {
      console.log(c.dim("  · Playwright not available — rendered contrast audit skipped"));
      console.log(
        c.dim("    Install: bun add -d @playwright/test && bunx playwright install webkit"),
      );
      return 0;
    }
    console.log(c.red("  ✗ rendered contrast audit errored: " + msg.split("\n")[0]));
    if (msg.includes("\n")) console.log(c.dim(msg));
    return 1;
  }
}
