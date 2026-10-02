/**
 * Row models for the task drawer's **UI changes** section (#0611): one captured
 * preview shot per row, merged with the task's declared `## Shots` spec so a
 * reviewer can read what the shot is and how the preview was driven into that
 * state.
 *
 * The two halves live in different places. `ShotMeta` (from
 * `GET /api/tasks/:id/shots`) carries the captured file's name, target, route
 * and — because the capture writes it to the manifest — the declared label. It
 * does NOT carry `selector` or `steps`: those exist only in the `## Shots` JSON
 * in the task body. Both halves are already client-side, so the merge happens
 * here as a pure function — no API change, no capture change — and the drawer
 * just renders the result.
 */
import { parseShotPlan } from "../../../core/shot-plan.js";
import type { DeclaredShot, DeclaredStep } from "../../../core/shot-plan.js";
import type { ShotMeta } from "../types";

/** One row of the UI-changes list: the captured file plus its spec detail. */
export interface ShotRow {
  /** The captured shot exactly as the store lists it (the viewer uses these). */
  meta: ShotMeta;
  /** Primary row text — declared label, else captured label, else route/target/name. */
  title: string;
  /**
   * `target · route` context, minus whatever the title already carries. Empty
   * when it would only repeat the title (an unlabeled shot with no route).
   */
  context: string;
  /** The declared selector, when this row matched a `## Shots` entry. */
  selector?: string;
  /** The declared steps, when this row matched a `## Shots` entry. */
  steps?: DeclaredStep[];
  /** `steps` as one readable line, e.g. `click .new-task → wait 400ms`. */
  stepsText?: string;
  /**
   * Why this shot was captured (#0603) — `declared: <label>` or
   * `auto: matched <glob>`. Kept on the row so the replacement layout carries
   * the caption forward instead of dropping it. Only set when it says more than
   * the title already does.
   */
  provenance?: string;
}

/** Longest filled-in text kept verbatim inside a rendered step. */
const STEP_TEXT_LIMIT = 24;

/** Collapse whitespace and cut to `limit` characters with an ellipsis. */
function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}

/** One declared step as a short human phrase, e.g. `click button.new-task`. */
export function describeStep(step: DeclaredStep): string {
  if ("click" in step) return `click ${step.click}`;
  if ("waitFor" in step) return `wait for ${step.waitFor}`;
  if ("fill" in step) return `fill ${step.fill} = "${clip(step.text, STEP_TEXT_LIMIT)}"`;
  return `wait ${step.waitMs}ms`;
}

/** An ordered step list as one line: `click .a → wait for .b → wait 200ms`. */
export function describeSteps(steps: DeclaredStep[]): string {
  return steps.map(describeStep).join(" → ");
}

/**
 * Does a declared entry describe this captured file? Only the fields the
 * manifest also records are compared, so this stays usable after a hand-dropped
 * PNG (target "unknown") joins the list.
 */
function declaredMatches(declared: DeclaredShot, meta: ShotMeta): boolean {
  if (declared.label && declared.label !== meta.label) return false;
  if (declared.route && declared.route !== (meta.route ?? "/")) return false;
  if (declared.target && declared.target !== meta.target) return false;
  return true;
}

/**
 * Pair each captured shot with at most one declared entry, in shot order.
 *
 * When the counts line up — the normal case, since capture writes one file per
 * plan entry in plan order — index order IS the pairing. When they don't (a
 * capture failed, or a PNG was dropped into `shots/` by hand) fall back to
 * matching the fields both sides record — target, route, label — one entry per
 * shot, no reuse. An unmatched row then shows `ShotMeta` fields alone, which is
 * the point: a row with no spec detail beats a row carrying the WRONG detail.
 */
function pairDeclared(shots: ShotMeta[], declared: DeclaredShot[]): (DeclaredShot | undefined)[] {
  const paired: (DeclaredShot | undefined)[] = shots.map(() => undefined);
  if (declared.length === 0) return paired;
  if (declared.length === shots.length) {
    for (let i = 0; i < declared.length; i++) paired[i] = declared[i];
    return paired;
  }
  const taken = new Set<number>();
  for (const entry of declared) {
    const index = shots.findIndex((meta, i) => !taken.has(i) && declaredMatches(entry, meta));
    if (index === -1) continue;
    taken.add(index);
    paired[index] = entry;
  }
  return paired;
}

/**
 * #0603 captions every captured shot with why it exists. Read the field
 * structurally so a store built before #0603 (no `provenance` at all) yields
 * `undefined` rather than a compile error. A caption that only repeats the
 * label adds nothing — the title already says it.
 */
function provenanceOf(meta: ShotMeta): string | undefined {
  const caption = (meta as { provenance?: string }).provenance;
  return caption && caption !== meta.label ? caption : undefined;
}

/**
 * Build the UI-changes rows for a task: captured shots in listing order (so row
 * indices stay the viewer's indices), each enriched with the `## Shots` entry
 * that describes it. A body without a `## Shots` section, or one whose JSON
 * doesn't parse, simply yields rows with `ShotMeta` fields alone.
 */
export function shotRows(shots: ShotMeta[], body: string | undefined): ShotRow[] {
  const declared = parseShotPlan(body ?? "").shots;
  const paired = pairDeclared(shots, declared);
  return shots.map((meta, index) => {
    const entry = paired[index];
    const labelled = entry?.label || meta.label;
    const title = labelled || meta.route || meta.target || meta.name;
    // Today's thumb hint (`target · route`), minus the part the title already
    // shows, so an unlabeled shot reads the route over `default` instead of
    // repeating the route on both lines.
    const context = [meta.target, meta.route]
      .filter((part): part is string => !!part && part !== title)
      .join(" · ");
    const steps = entry?.steps;
    const provenance = provenanceOf(meta);
    return {
      meta,
      title,
      context,
      ...(entry?.selector ? { selector: entry.selector } : {}),
      ...(steps?.length ? { steps, stepsText: describeSteps(steps) } : {}),
      ...(provenance ? { provenance } : {}),
    };
  });
}

/** A capture that did not produce shots, read back from the task's activity log. */
export interface ShotProblem {
  /** `failed` (the capture errored) or `skipped` (it stood down, with a reason). */
  status: "failed" | "skipped";
  /** The reason, as the server wrote it. */
  detail: string;
  /** ISO timestamp of the activity entry. */
  at: string;
}

const SHOT_NOTE_RE = /^-\s+(\S+)\s+·\s+note:\s+shots:\s+(failed|skipped)\s+—\s+(.+)$/;

/**
 * Failed/skipped capture outcomes for the UI-changes section (#0621 follow-up).
 * The server records them only as `note: shots: failed — …` activity entries
 * (a successful capture writes no note), so they're parsed back out of the
 * body's `## Activity` section. A problem older than the newest captured shot
 * is superseded by that capture and dropped.
 */
export function shotProblems(body: string | undefined, shots: ShotMeta[]): ShotProblem[] {
  const text = body ?? "";
  const start = text.search(/^## Activity\s*$/m);
  if (start === -1) return [];
  const newest = shots.reduce((max, s) => (s.capturedAt > max ? s.capturedAt : max), "");
  const out: ShotProblem[] = [];
  for (const line of text.slice(start).split("\n")) {
    const m = SHOT_NOTE_RE.exec(line.trim());
    if (!m) continue;
    if (newest && m[1]! <= newest) continue;
    out.push({ at: m[1]!, status: m[2] as ShotProblem["status"], detail: m[3]!.trim() });
  }
  return out;
}

/**
 * Declared `## Shots` entries that have no captured file — what a reviewer
 * should have seen but didn't. Matched like `pairDeclared`.
 */
export function uncapturedDeclared(
  shots: ShotMeta[],
  body: string | undefined,
): Omit<ShotRow, "meta">[] {
  const declared = parseShotPlan(body ?? "").shots;
  const paired = new Set(pairDeclared(shots, declared).filter((e) => e));
  return declared
    .filter((entry) => !paired.has(entry))
    .map((entry) => {
      const title = entry.label || entry.route || entry.target || "shot";
      const steps = entry.steps;
      return {
        title,
        context: [entry.target, entry.route].filter((p) => p && p !== title).join(" · "),
        ...(entry.selector ? { selector: entry.selector } : {}),
        ...(steps?.length ? { steps, stepsText: describeSteps(steps) } : {}),
      };
    });
}
