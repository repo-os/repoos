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
 *   legacy ` + ` spelling so unchanged files keep parsing. Output is trimmed,
 *   de-duplicated (case-insensitively), non-empty strings.
 * - Display (`formatTaskAreas`): `, `-joined plain text — `repoos list`,
 *   `repoos show`, logs, and the plain-text parts of the UI.
 * - Matching (`areaListsIntersect`): case-insensitive, per-area — never a
 *   whole-string compare.
 *
 * The effective vocabulary a repo offers comes from TWO sources merged
 * (`effectiveAreaVocabulary`): the `[areas]` names declared in `repoos.toml`
 * and every `areas:` value of a `[[preview.targets]]` row — so a repo that has
 * only configured previews already gets sensible picker options.
 */
import type { RepoOSConfig } from "./types.js";

/**
 * Legacy multi-area separator(s). Only `+` was ever used by convention, and
 * on this board always with spaces around it (`server + ui-app`). A `+` is a
 * separator ONLY when preceded by whitespace, so names that legitimately
 * contain one ("c++", "a+b") stay whole — parse output cannot clobber them.
 * `/` is deliberately never a separator: "web/mobile" always parsed as one
 * value.
 */

/**
 * Parse one `area` frontmatter value into the canonical list of area names.
 * Accepts everything legacy plus the canonical forms:
 *   `"web"` → `["web"]`
 *   `"web, core"` / `"web,core"` → `["web", "core"]`
 *   `["web", "core"]` → `["web", "core"]`
 *   `"server + ui-app"` (legacy) → `["server", "ui-app"]`
 * Empty and blank areas are dropped; duplicates collapse case-insensitively
 * (the FIRST spelling wins, so `"web, Web"` keeps `"web"`).
 */
export function parseTaskAreas(raw: unknown): string[] {
  const values: string[] = Array.isArray(raw)
    ? raw.map((v) => (typeof v === "string" ? v : String(v)))
    : raw === undefined || raw === null
      ? []
      : [String(raw)];

  // Split every entry on the canonical comma AND the legacy ` + ` spelling,
  // so a single "server + ui-app" string (or one stray
  // `["server + ui-app"]` list item) normalizes to the same shape. A `+`
  // without preceding whitespace — "a+b", "c++" — is just characters in
  // a value, never a separator.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    // First the comma (whitespace-canonical), then the legacy `+`.
    for (const commaPiece of value.split(",")) {
      for (const piece of commaPiece.split(/\s+\+/)) {
        const name = piece.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
      }
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

/** One raw vocabulary/`config.areas` entry: a string, or a `{name, description?}` row. */
interface AreaEntryLike {
  name?: unknown;
  description?: unknown;
}

/** Read one raw entry defensively — strings and `{name}` rows both work. */
function entryOf(raw: AreaEntryLike | null | undefined): AreaEntry | null {
  if (raw == null) return null;
  const name = typeof raw === "string" ? raw : typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name) return null;
  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description.trim()
      : undefined;
  return { name, ...(description ? { description } : {}) };
}

/**
 * The complete area vocabulary a repo offers, in declaration order:
 * `[areas]` names first, then any `[[preview.targets]].areas` not already
 * declared. Accepts every raw entry shape a caller might carry (plain
 * strings, `{name}` rows) so exported helpers working on raw config records
 * can never throw on a half-normalized payload. Dedup is case-insensitive,
 * first spelling winning.
 */
export function effectiveAreaVocabulary(
  config: Pick<RepoOSConfig, "areas" | "preview">,
): AreaEntry[] {
  const out: AreaEntry[] = [];
  const seen = new Set<string>();
  const push = (raw: AreaEntryLike): void => {
    const entry = entryOf(raw);
    if (!entry) return;
    const key = entry.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };
  for (const a of config.areas ?? []) push(a as unknown as AreaEntryLike);
  for (const t of config.preview?.targets ?? []) {
    for (const a of t.areas ?? []) push({ name: a });
  }
  return out;
}

/** Just the names of the effective vocabulary, for prompts/CLI. */
export function effectiveAreaNames(config: Pick<RepoOSConfig, "areas" | "preview">): string[] {
  return effectiveAreaVocabulary(config).map((e) => e.name);
}

/**
 * The area a brand-new task opens with (#0587): the FIRST name in the
 * effective vocabulary — `[areas]` declaration order, then preview targets —
 * or `""` when the repo declares none. Callers pass the vocabulary as it
 * reaches the browser (`areaVocabulary`: `{name}` rows) or raw strings.
 *
 * A hard-coded default (`"web"`) is wrong for any repo that does not declare
 * it: New task would pre-select an unregistered area and offer to "add web",
 * so a repo offering only `landing`/`docs` starts every task on the wrong
 * foot. Returning `""` is the honest fallback — the picker becomes free text,
 * exactly as it does with no vocabulary at all.
 */
export function defaultTaskArea(vocabulary: readonly unknown[] | undefined): string {
  for (const raw of vocabulary ?? []) {
    const entry = entryOf(raw as AreaEntryLike);
    if (entry) return entry.name;
  }
  return "";
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
 *
 * The parser's synthesized fallback (`"general"` for area-less tasks) is
 * deliberately EXCLUDED: an area-less task did not choose an area, so it must
 * never read as "no longer resolves" just because a repo's vocabulary does
 * not declare `general`. That would turn every future vocabulary edit into
 * false-positive noise against the whole untagged backlog.
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
      // "general" is the parser's own fallback for an UNSET area (see
      // beforeAreaFields); advisory drift reporting never counts it.
      if (known.has(area.toLowerCase()) || area.toLowerCase() === "general") continue;
      const key = area.toLowerCase();
      const entry = out.get(key) ?? { area, taskIds: [] };
      if (!entry.taskIds.includes(t.id)) entry.taskIds.push(t.id);
      out.set(key, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.area.localeCompare(b.area));
}
