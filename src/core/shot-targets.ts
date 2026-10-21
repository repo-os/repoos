/**
 * Resolve which preview target(s) a task's changes should be screenshotted
 * against (#0582).
 *
 * Preview routing normally keys off the task's `area:` frontmatter, which is
 * chosen up front — before anyone knows which files will change. That silently
 * previews the wrong app when the area is wrong. `repoos shot` instead matches
 * the changed file paths against an optional `paths` glob list on each
 * `[[preview.targets]]`, and falls back to area resolution only when nothing
 * matches. The same helper drives the drawer's area/target mismatch warning, so
 * both surfaces agree on what "touched" means.
 *
 * Pure and dependency-free (zero runtime deps): a tiny glob matcher instead of
 * pulling in minimatch, and no `preview.ts`/server imports so the CLI, the
 * server and the UI tests can all share it.
 *
 * #0603 added the test-artifact filter and the per-target match detail
 * (`describeTargetPathMatches`): the automatic capture needs to know WHY a
 * target matched (for its `auto: matched <glob>` caption) and whether the
 * matched files are docs content only (no route can be inferred → skip).
 */
import type { PreviewConfig, ShotConfig, ShotTargetConfig } from "./types.js";
import { parseTaskAreas } from "./areas.js";

/** Sentinel target name for the bare `[preview] command` (no `[[preview.targets]]`). */
export const DEFAULT_PREVIEW_TARGET = "default";

/**
 * Route prefixes served by the main app UI. A declared shot whose `route` is
 * one of these is an app screen, so an omitted `target` must default to the app
 * target rather than whichever target the diff happened to resolve first
 * (#0866). Mirrors `src/ui-app/src/router.ts`; `shot-target-support-0866.test.ts`
 * fails if the two drift apart.
 */
export const APP_ROUTE_PREFIXES = [
  "/login",
  "/work",
  "/stories",
  "/checks",
  "/dev",
  "/releases",
  "/deployments",
  "/inputs",
  "/repo",
  "/settings",
  "/agents",
  "/tasks",
] as const;

/**
 * The target that serves the main app (the fixture-aware UI), when it can be
 * identified: the bare `[preview] command` under its `default` sentinel, or
 * the repo's only named web target. Undefined when a repo declares several
 * named targets and no default command — there is no principled way to know
 * which one is "the app", so callers keep the old resolution order instead of
 * guessing (#0866).
 */
export function appPreviewTargetName(preview?: PreviewConfig): string | undefined {
  if (preview?.command?.trim()) return DEFAULT_PREVIEW_TARGET;
  const named = (preview?.targets ?? []).map((t) => t.name).filter(Boolean);
  return named.length === 1 ? named[0] : undefined;
}

/** True when `route` is a path in the main app's UI (see {@link APP_ROUTE_PREFIXES}). */
export function isAppRoute(route: string): boolean {
  const path = route.startsWith("/") ? route : `/${route}`;
  // `/` is ambiguous (app dashboard, docs home, landing root): leave it to the
  // normal resolution order rather than claiming it is app-only.
  if (path === "/" || path === "") return false;
  const pathname = path.split(/[?#]/, 1)[0];
  return APP_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Normalize a task's `area:` value into the individual areas it names, lowercased.
 *
 * The splitting itself is NOT re-implemented here: it delegates to the one
 * canonical parser (`parseTaskAreas` in `areas.js`, #0583/#0587), so preview
 * routing, the mismatch warning, the board, the drawer and the CLI all agree
 * on what an area value means — including the legacy `server + ui-app`
 * spelling, comma lists, and the list form. The old local `/[+,]/` splitter
 * was a second, subtly different rule (it broke `c++`); it is gone.
 *
 * Lowercasing here keeps the existing case-insensitive comparison contract.
 * An empty/absent area yields `[]`.
 */
export function splitAreas(area: string | null | undefined): string[] {
  return parseTaskAreas(area).map((a) => a.toLowerCase());
}

/** True when any of `areas` (raw, possibly multi-value) names `target`. */
export function areaMatchesTarget(areas: string | null | undefined, target: string): boolean {
  const wanted = target.trim().toLowerCase();
  return wanted.length > 0 && splitAreas(areas).includes(wanted);
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(s: string): string {
  return s.replace(REGEX_SPECIALS, "\\$&");
}

/**
 * Compile a small glob into a RegExp over `/`-separated repo-relative paths.
 *
 * Supported: `*` matches within one path segment, `**` matches across segments
 * (including none — a `user-docs` prefix plus `**` matches `user-docs/index.md`),
 * and `?` matches one non-slash character. Everything else is literal, so a
 * pattern combining a directory prefix, `**`, and a `*.md` suffix behaves the
 * way a user expects. Not a full glob implementation (no brace expansion or
 * character classes); that is deliberate, both to stay dependency-free and
 * because preview path lists are simple.
 */
export function globToRegExp(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        // A `**/` prefix matches any number of leading segments (including
        // none), so `**` followed by `/*.md` also matches a root README.
        if (pattern[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else {
      re += escapeRegExp(ch);
    }
  }
  return new RegExp(`^${re}$`);
}

/** True when `path` matches `pattern`. */
export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

/**
 * Changed paths that are NOT evidence of a UI change (#0603). #0600's review
 * captured a default `/` shot because its diff added tests under
 * `src/ui-app/tests/` — a `.test.ts` file inside a UI-path glob is evidence of
 * behavior, not appearance, yet the plain glob matched it. These artifacts are
 * filtered out before any target matching: a tests-only diff resolves no
 * target and the automatic capture records a visible skip instead of shooting
 * a frame that shows nothing about the change. Conservative list — test files
 * (by suffix or by living in a `tests/`-style directory, which also covers the
 * un-suffixed helpers `tests/setup/*.ts` and `tests/adoption/*` that a
 * review flagged, #0603 review) and their snapshot directories only; real
 * source elsewhere still counts.
 */
export function isTestArtifactPath(path: string): boolean {
  return (
    /(^|\/)(__tests__|__snapshots__|tests?)\//.test(path) ||
    /\.test\.[cm]?[jt]sx?$/.test(path) ||
    /\.spec\.[cm]?[jt]sx?$/.test(path) ||
    path.endsWith(".snap")
  );
}

/** `changedPaths` minus test artifacts (#0603). */
export function nonTestPaths(changedPaths: string[]): string[] {
  return changedPaths.filter((p) => !isTestArtifactPath(p));
}

/**
 * Documentation-content files (`.md`/`.mdx`): a diff that only touches these
 * matched a target's globs but the preview has no way to know which rendered
 * route shows the change — the docs' root route shows its home page, not the
 * edit. The automatic capture treats such a target as content-only and skips
 * it unless the task declared a shot with a route.
 */
export function isDocsContentPath(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

/** How one preview target was matched by the task's changed paths (#0603). */
export interface TargetPathMatch {
  /** Target name, in config order (the default target last, as before). */
  target: string;
  /** The matching globs, in the order they matched — drives the "auto: matched" caption. */
  globs: string[];
  /** True when every matched path is docs content — no route can be inferred. */
  contentOnly: boolean;
}

/**
 * Per-target detail behind `targetsForPaths` (#0603): for each resolved target,
 * which of its globs matched which non-test changed paths, and whether the
 * matched set is purely documentation content. Same resolution order and
 * default-target rule as the plain name list — this is the rich form the
 * automatic capture uses for its provenance captions and docs-route gate.
 */
export function describeTargetPathMatches(
  preview: PreviewConfig | undefined,
  changedPaths: string[],
): TargetPathMatch[] {
  const paths = nonTestPaths(changedPaths);
  const out: TargetPathMatch[] = [];
  const push = (target: string, globs: string[], hits: string[]): void => {
    const matchedGlobs = [...new Set(globs.filter((g) => hits.some((p) => matchGlob(g, p))))];
    if (matchedGlobs.length === 0) return;
    out.push({
      target,
      globs: matchedGlobs,
      contentOnly: hits.every((p) => isDocsContentPath(p)),
    });
  };
  for (const t of preview?.targets ?? []) {
    const globs = t.paths ?? [];
    push(
      t.name,
      globs,
      globs.length ? paths.filter((p) => globs.some((g) => matchGlob(g, p))) : [],
    );
  }
  // Only the declared default COMMAND can be booted for the default target: a
  // `paths`-only preview (no `[preview] command`) has nothing to serve, so it
  // must not surface as a capturable target.
  const defaultGlobs = preview?.paths ?? [];
  const declaresDefault = Boolean(preview?.command?.trim());
  if (declaresDefault) {
    push(
      DEFAULT_PREVIEW_TARGET,
      defaultGlobs,
      defaultGlobs.length ? paths.filter((p) => defaultGlobs.some((g) => matchGlob(g, p))) : [],
    );
  }
  return out;
}

/**
 * The target names whose `paths` globs match at least one changed file, in
 * `repoos.toml` target order, plus the default `[preview] command` target when
 * the top-level `paths` globs match (#0594).
 *
 * A target with no `paths` never matches here — it is still reachable through
 * area fallback or `--target`. Changed files that match NO target's globs do
 * NOT pull the default in implicitly (and never could: every task diff
 * contains the task's own `work/*.md`, which is no evidence about the UI), so
 * the default participates only when the repo explicitly declares its globs.
 * Test artifacts (`*.test.ts`, snapshots, `__tests__/`) are filtered out first
 * (#0603): they are behavior evidence, not appearance, and used to make a
 * tests-only or tests+work-note diff boot a preview and shoot a useless `/`
 * frame (#0600).
 */
export function targetsForPaths(
  preview: PreviewConfig | undefined,
  changedPaths: string[],
): string[] {
  return describeTargetPathMatches(preview, nonTestPaths(changedPaths)).map((m) => m.target);
}

/**
 * The target names whose `areas` include any of the task's areas, in config
 * order. This is the area fallback used when no `paths` glob matched.
 */
export function targetsForArea(
  preview: PreviewConfig | undefined,
  area: string | null | undefined,
): string[] {
  const tasks = splitAreas(area);
  if (tasks.length === 0) return [];
  const out: string[] = [];
  for (const t of preview?.targets ?? []) {
    if (t.areas.some((a) => tasks.includes(a.trim().toLowerCase()))) out.push(t.name);
  }
  return out;
}

/** How the shot target set was decided — surfaced in the CLI output and stored. */
export type ShotTargetSource = "paths" | "target" | "area" | "default" | "none";

export interface ShotTargetResolution {
  /** Resolved target names, in capture order. Empty when nothing resolved. */
  names: string[];
  /** How `names` was chosen. */
  source: ShotTargetSource;
  /** Names detected from changed paths, regardless of the chosen source. */
  detected: string[];
  /** Set when `--target` named a target that is not configured. */
  unknownTarget?: string;
  /** Why nothing resolved (for a clear CLI message). */
  reason?: string;
}

/**
 * Decide which preview target(s) `repoos shot` should capture, in order:
 *
 *  1. an explicit `--target` (even if it is outside the task's area);
 *  2. targets whose `paths` globs match a changed file;
 *  3. area-based resolution (area-matching targets, else the default command);
 *  4. nothing — with an actionable reason.
 *
 * Command capture targets (#0761) participate in steps 1–3 alongside web
 * targets: a repo can declare one or the other (or both), and a `--target`
 * names whichever it is. Web targets are tried first at each step so a repo
 * that declares both keeps its existing web behavior; a changed path that only
 * a command target claims still resolves it.
 */
export function resolveShotTargets(
  preview: PreviewConfig | undefined,
  area: string | null | undefined,
  changedPaths: string[],
  overrideTarget?: string,
  shot?: ShotConfig,
): ShotTargetResolution {
  const detected = [
    ...targetsForPaths(preview, changedPaths),
    ...shotTargetsForPaths(shot, changedPaths),
  ];
  const all = preview?.targets ?? [];

  if (overrideTarget) {
    const name = overrideTarget.trim();
    if (all.some((t) => t.name === name) || shotTargetByName(shot, name)) {
      return { names: [name], source: "target", detected };
    }
    // The bare `[preview] command` is a real target under its sentinel name:
    // the drawer's picker and `shots.ts` both call it "default", so
    // `--target default` must name it too. Without this, a diff that merely
    // touches a `paths`-claimed dir (user-docs/, landing/) could never be
    // shot against the main app at all (#0593 hit exactly that).
    if (name === DEFAULT_PREVIEW_TARGET && preview?.command?.trim()) {
      return { names: [name], source: "target", detected };
    }
    return {
      names: [],
      source: "none",
      detected,
      unknownTarget: name,
      reason: `No capture target named "${name}" is configured.`,
    };
  }

  if (detected.length > 0) {
    return { names: detected, source: "paths", detected };
  }

  const areaNames = [...targetsForArea(preview, area), ...shotTargetsForArea(shot, area)];
  if (areaNames.length > 0) {
    return { names: areaNames, source: "area", detected };
  }

  if (preview?.command?.trim()) {
    return { names: [DEFAULT_PREVIEW_TARGET], source: "default", detected };
  }

  const hasCommandTargets = (shot?.targets ?? []).length > 0;
  return {
    names: [],
    source: "none",
    detected,
    reason: hasCommandTargets
      ? "No capture target covers the changed paths or the task's area — declare a " +
        "[[shot.targets]] command target whose `paths`/`areas` match this diff (see user-docs/configuration.md)."
      : "No preview target matched the changed paths or the task's area.",
  };
}

/** Human-friendly list: `"Docs site"`, `"Docs site and Landing page"`, `"a, b, c"`. */
export function formatTargetList(names: string[]): string {
  if (names.length === 0) return "(none)";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The area/target mismatch warning shown in the drawer: the changed paths
 * resolve to preview target(s) that the task's `area` does not reach. Warns
 * when ANY detected target is unexplained — a diff that touches two apps but
 * whose area names only one is still a mismatch for the other, and staying
 * quiet there would hide exactly the #0581 failure. Warning only; nothing is
 * changed automatically. Returns undefined when every detected target is
 * explained by the area (or nothing was detected).
 */
export function shotTargetMismatchWarning(
  preview: PreviewConfig | undefined,
  area: string | null | undefined,
  changedPaths: string[],
): string | undefined {
  // Prose edits (`*.md`/`*.mdx`) are content, not code: nearly every task
  // updates `user-docs/` pages, and that must not read as "touches the Docs
  // site". Only non-markdown changes can make an area mismatch. (Shot target
  // detection above still counts markdown, so docs pages remain shootable.)
  const codePaths = changedPaths.filter((p) => !/\.mdx?$/i.test(p));
  const detected = targetsForPaths(preview, codePaths);
  if (detected.length === 0) return undefined;
  const taskAreas = splitAreas(area);
  // A target is "explained" when the task's area names it directly or one of
  // its `areas` matches the task's area.
  const unexplained = detected.filter((name) => {
    // The default `[preview] command` is the implicit main-app fallback, not a
    // target an area is expected to "resolve to" (#0594, once it can also be
    // matched by top-level `paths`); warning about it would fire on nearly
    // every diff and drown the real mismatches.
    if (name === DEFAULT_PREVIEW_TARGET) return false;
    if (taskAreas.includes(name.trim().toLowerCase())) return false;
    const target = (preview?.targets ?? []).find((t) => t.name === name);
    return !target?.areas.some((a) => taskAreas.includes(a.trim().toLowerCase()));
  });
  if (unexplained.length === 0) return undefined;
  const areaLabel = (area ?? "").trim() || "(none)";
  return `This task's changes touch ${formatTargetList(unexplained)} but its area is "${areaLabel}".`;
}

// ── Command-based capture targets (#0761) ──────────────────────────────────
//
// A repo whose product is a native macOS app, a mobile app or a desktop app has
// no dev server to preview: its "screenshot" is a command that renders image
// files offscreen (a `swift test` that writes a PNG, `xcrun simctl io …
// screenshot`, `adb exec-out screencap`, `screencapture`). These helpers resolve
// which `[[shot.targets]]` a task's changed paths / area select, using exactly
// the same glob and area rules as the web path so the two agree on what
// "touched" means. Kept pure and dependency-free.

/** A `[[shot.targets]]` row looked up by name; undefined when not declared. */
export function shotTargetByName(
  shot: ShotConfig | undefined,
  name: string,
): ShotTargetConfig | undefined {
  return (shot?.targets ?? []).find((t) => t.name === name);
}

/**
 * The command-target names whose `paths` globs match at least one non-test
 * changed file, in config order — the non-web counterpart of `targetsForPaths`.
 * A target with no `paths` never matches here (it is reachable through area
 * resolution or an explicit `--target`).
 */
export function shotTargetsForPaths(
  shot: ShotConfig | undefined,
  changedPaths: string[],
): string[] {
  const paths = nonTestPaths(changedPaths);
  const out: string[] = [];
  for (const t of shot?.targets ?? []) {
    const globs = t.paths ?? [];
    if (globs.length === 0) continue;
    if (paths.some((p) => globs.some((g) => matchGlob(g, p)))) out.push(t.name);
  }
  return out;
}

/** The command-target names whose `areas` include any of the task's areas. */
export function shotTargetsForArea(shot: ShotConfig | undefined, area: string | null | undefined) {
  const tasks = splitAreas(area);
  if (tasks.length === 0) return [] as string[];
  const out: string[] = [];
  for (const t of shot?.targets ?? []) {
    if (t.areas.some((a) => tasks.includes(a.trim().toLowerCase()))) out.push(t.name);
  }
  return out;
}

/**
 * Per-target match detail for command targets, mirroring
 * `describeTargetPathMatches` — which globs matched each target, and whether
 * every matched path is docs content (`*.md`). The docs-content rule applies
 * to a command target too: a docs-only diff gives the command no state worth
 * rendering, so the automatic capture skips it visibly unless the task declared
 * a shot for it.
 */
export function describeShotTargetPathMatches(
  shot: ShotConfig | undefined,
  changedPaths: string[],
): TargetPathMatch[] {
  const paths = nonTestPaths(changedPaths);
  const out: TargetPathMatch[] = [];
  for (const t of shot?.targets ?? []) {
    const globs = t.paths ?? [];
    if (globs.length === 0) continue;
    const hits = paths.filter((p) => globs.some((g) => matchGlob(g, p)));
    const matchedGlobs = [...new Set(globs.filter((g) => hits.some((p) => matchGlob(g, p))))];
    if (matchedGlobs.length === 0) continue;
    out.push({
      target: t.name,
      globs: matchedGlobs,
      contentOnly: hits.every((p) => isDocsContentPath(p)),
    });
  }
  return out;
}

/**
 * Names of every configured capture target — web preview targets (including the
 * bare `[preview] command` under its `default` sentinel) plus command targets.
 * Used to validate a declared `## Shots` entry's `target` against the whole
 * vocabulary, so a command target name is as valid as a web one.
 */
export function allShotTargetNames(preview?: PreviewConfig, shot?: ShotConfig): string[] {
  const web = previewTargetNamesLocal(preview);
  const command = (shot?.targets ?? []).map((t) => t.name).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...web, ...command]) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** Local copy of `previewTargetNames` to avoid a cyclic import from shot-plan. */
function previewTargetNamesLocal(preview?: PreviewConfig): string[] {
  const named = (preview?.targets ?? []).map((t) => t.name).filter(Boolean);
  if (preview?.command) {
    if (named.length === 0) return [DEFAULT_PREVIEW_TARGET];
    return [DEFAULT_PREVIEW_TARGET, ...named];
  }
  return named.length > 0 ? named : [DEFAULT_PREVIEW_TARGET];
}
