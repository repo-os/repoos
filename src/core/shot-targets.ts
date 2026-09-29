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
 */
import type { PreviewConfig, PreviewTargetConfig } from "./types.js";

/** Sentinel target name for the bare `[preview] command` (no `[[preview.targets]]`). */
export const DEFAULT_PREVIEW_TARGET = "default";

/**
 * Split a task's `area:` value into the individual areas it names. `area` is a
 * single free-text string, but real tasks already write `web + core + server`
 * or `docs, landing`; comparing the whole string against each target's `areas`
 * matches nothing for those. Splitting on `+` and `,` (trimmed, lowercased,
 * de-duplicated) is the shared rule for both preview routing and the mismatch
 * warning. An empty/whitespace area yields `[]`.
 */
export function splitAreas(area: string | null | undefined): string[] {
  if (typeof area !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of area.split(/[+,]/)) {
    const a = part.trim().toLowerCase();
    if (a && !seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
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

function targetMatchesPaths(target: PreviewTargetConfig, changedPaths: string[]): boolean {
  const globs = target.paths ?? [];
  if (globs.length === 0) return false;
  return changedPaths.some((p) => globs.some((g) => matchGlob(g, p)));
}

/**
 * The target names whose `paths` globs match at least one changed file, in
 * `repoos.toml` target order. A target with no `paths` never matches here — it
 * is still reachable through area fallback or `--target`.
 */
export function targetsForPaths(
  preview: PreviewConfig | undefined,
  changedPaths: string[],
): string[] {
  const targets = preview?.targets ?? [];
  const out: string[] = [];
  for (const t of targets) {
    if (targetMatchesPaths(t, changedPaths)) out.push(t.name);
  }
  return out;
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
 */
export function resolveShotTargets(
  preview: PreviewConfig | undefined,
  area: string | null | undefined,
  changedPaths: string[],
  overrideTarget?: string,
): ShotTargetResolution {
  const detected = targetsForPaths(preview, changedPaths);
  const all = preview?.targets ?? [];

  if (overrideTarget) {
    const name = overrideTarget.trim();
    if (all.some((t) => t.name === name)) {
      return { names: [name], source: "target", detected };
    }
    return {
      names: [],
      source: "none",
      detected,
      unknownTarget: name,
      reason: `No preview target named "${name}" is configured.`,
    };
  }

  if (detected.length > 0) {
    return { names: detected, source: "paths", detected };
  }

  const areaNames = targetsForArea(preview, area);
  if (areaNames.length > 0) {
    return { names: areaNames, source: "area", detected };
  }

  if (preview?.command?.trim()) {
    return { names: [DEFAULT_PREVIEW_TARGET], source: "default", detected };
  }

  return {
    names: [],
    source: "none",
    detected,
    reason: "No preview target matched the changed paths or the task's area.",
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
 * resolve to preview target(s), but the task's `area` neither names any of them
 * nor otherwise resolves to them. Warning only — nothing is changed
 * automatically; the human can pick the right target from the drawer's existing
 * picker. Returns undefined when there is no mismatch to report.
 */
export function shotTargetMismatchWarning(
  preview: PreviewConfig | undefined,
  area: string | null | undefined,
  changedPaths: string[],
): string | undefined {
  const detected = targetsForPaths(preview, changedPaths);
  if (detected.length === 0) return undefined;
  const areaTaskAreas = splitAreas(area);
  // A target is "explained" when the task's area names it directly or one of
  // its `areas` matches the task's area. Any explained target clears the
  // warning: the area genuinely reaches one of the things this diff touches.
  const explained = detected.some((name) => {
    if (areaTaskAreas.includes(name.trim().toLowerCase())) return true;
    const target = (preview?.targets ?? []).find((t) => t.name === name);
    return Boolean(target?.areas.some((a) => areaTaskAreas.includes(a.trim().toLowerCase())));
  });
  if (explained) return undefined;
  const areaLabel = (area ?? "").trim() || "(none)";
  return `This task's changes touch ${formatTargetList(detected)} but its area is "${areaLabel}".`;
}
