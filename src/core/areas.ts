/**
 * The shared area vocabulary helpers (#0583).
 *
 * An area names the part of the product a task belongs to — `web`, `server`,
 * `core`, … — and a task can carry more than one. Areas were previously a
 * free-text frontmatter string, with `+` used as the ad-hoc multi-value
 * separator (e.g. `server + ui-app`); that drifted, and preview routing
 * compared the whole string so a multi-value area silently matched nothing.
 *
 * This module is the ONE canonical parser/formatter every consumer uses:
 *
 * - Storage (frontmatter): a plain scalar (`area: web`) when one value; an
 *   inline list (`area: [web, core]`) when several — the frontmatter parser
 *   (`frontmatter.ts`) already round-trips both. Commas, never `+`.
 * - Reading (`parseTaskAreas`): accepts the list form, a comma string, and the
 *   legacy `a + b` / "a / b" spellings so unchanged files keep parsing. Output
 *   is trimmed, de-duplicated (case-insensitively), non-empty strings.
 * - Display (`formatTaskAreas`): `, `-joined plain text — `repoos list`,
 *   `repoos show`, logs, and the plain-text parts of the UI.
 * - Matching (`areaListsIntersect`, `areasMatchVocabulary`): case-insensitive,
 *   per-area — never a whole-string compare.
 *
 * The effective vocabulary a repo offers comes from TWO sources merged
 * (`effectiveAreaVocabulary`): the `[areas]` names declared in `repoos.toml`
 * and every `areas:` value of a `[[preview.targets]]` row — so a repo that has
 * only configured previews already gets sensible picker options.
 */
import type { RepoOSConfig } from "./types.js";

/** Legacy multi-area separator(s), kept readable in old files. Only `+` was
 * ever used by convention ("server + ui-app"); `/` and `&` are deliberately
 * NOT separators — "web/mobile" stays one value, as it always parsed. */
const LEGACY_SEPARATORS: string[] = ["+"];

/**
 * Parse one `area` frontmatter value into the canonical list of area names.
 * Accepts everything legacy plus the canonical forms:
 *   `"web"` → `["web"]`
 *   `"web, core"` / `"web,core"` → `["web", "core"]`
 *   `["web", "core"]` → `["web", "core"]`
 *   `"server + ui-app"` (legacy) → `["server", "ui-app"]`
 * Empty and blank areas are dropped; duplicates collapse case-insensitively
 * (the FIRST spelling wins, so `"web, Web"` keeps `"web"`); separators never
 * survive inside area names themselves.
 */
export function parseTaskAreas(raw: unknown): string[] {
  const values: string[] = Array.isArray(raw)
    ? raw.map((v) => (typeof v === "string" ? v : String(v)))
    : raw === undefined || raw === null
      ? []
      : [String(raw)];

  // Split every entry on the canonical comma AND the legacy separators, so a
  // single "a + b" or "a/b/c" string (or one stray `["a + b"]` list item) all
  // normalize to the same shape. Legacy separators are whitespace-flexible —
  // "server+ui-app" splits exactly like "server + ui-app".
  const splitRe = new RegExp(`[,]|${LEGACY_SEPARATORS.map((s) => `\\${s}`).join("|")}`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const piece of value.split(splitRe)) {
      const name = piece.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** Comma-separated plain text for display: `["web", "core"]` → `"web, core"`. */
export function formatTaskAreas(areas: string[]): string {
  return areas.join(", ");
}

/**
 * The canonical frontmatter WRITTEN form: a scalar when exactly one area
 * (reads nicer and matches every pre-existing file), an inline list otherwise.
 * Formatting the list through `parseTaskAreas`-normalized input keeps old and
 * new shapes deterministic.
 */
export function normalizeAreaValue(areas: string[]): string[] {
  return areas.map((a) => a.trim()).filter(Boolean);
}

/** True when any area of `a` case-insensitively equals one of `b`. */
export function areaListsIntersect(a: string[], b: string[]): boolean {
  const lower = new Set(b.map((s) => s.trim().toLowerCase()));
  return a.some((name) => lower.has(name.trim().toLowerCase()));
}

/** True when the canonical list for `raw` contains `area` case-insensitively. */
export function taskAreaIncludes(raw: unknown, area: string): boolean {
  return areaListsIntersect(parseTaskAreas(raw), [area]);
}

interface AreaEntry {
  name: string;
  /** Optional human description from `[areas]` in repoos.toml. */
  description?: string;
}

/**
 * The complete area vocabulary a repo offers, in declaration order:
 * `[areas]` names first, then any `[[preview.targets]].areas` not already
 * declared, then (when `extras` is provided) anything a task sheet has used —
 * NOT included here; extras are allowed as free text but never auto-added.
 * Dedup is case-insensitive with first spelling winning.
 */
export function effectiveAreaVocabulary(
  config: Pick<RepoOSConfig, "areas" | "preview">,
): AreaEntry[] {
  const out: AreaEntry[] = [];
  const seen = new Set<string>();
  const push = (name: string, description?: string): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: trimmed, ...(description ? { description } : {}) });
  };
  for (const a of config.areas ?? []) push(a.name, a.description);
  for (const t of config.preview?.targets ?? []) {
    for (const a of t.areas ?? []) push(a);
  }
  return out;
}

/** Just the names of the effective vocabulary, for prompts/CLI. */
export function effectiveAreaNames(config: Pick<RepoOSConfig, "areas" | "preview">): string[] {
  return effectiveAreaVocabulary(config).map((e) => e.name);
}

/** One unresolved-area finding: the unknown value and the tasks carrying it. */
export interface UnresolvedArea {
  /** The area, in the spelling the first task used. */
  area: string;
  /** Task ids carrying it. */
  taskIds: string[];
}

/**
 * Areas used by `tasks` that sit OUTSIDE the declared+vocabulary set
 * (#0583). A advisory drift report, not an error — free text is always
 * allowed, this just makes vocabulary churn visible: when a preview target or
 * `[areas]` entry disappears, the tasks that relied on it show up here.
 * Case-insensitive membership, always through the shared parser.
 */
export function unresolvedAreaReport(
  tasks: readonly { id: string; area?: string; areas?: string[] }[],
  vocabulary: readonly string[],
): UnresolvedArea[] {
  const known = new Set(vocabulary.map((v) => v.trim().toLowerCase()));
  const out = new Map<string, UnresolvedArea>();
  for (const t of tasks) {
    const areas = (t.areas?.length ? t.areas : t.area) as unknown;
    for (const area of parseTaskAreas(areas)) {
      if (known.has(area.toLowerCase())) continue;
      const key = area.toLowerCase();
      const entry = out.get(key) ?? { area, taskIds: [] };
      if (!entry.taskIds.includes(t.id)) entry.taskIds.push(t.id);
      out.set(key, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.area.localeCompare(b.area));
}
