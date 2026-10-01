/**
 * The declarative shot list a task declares and the capture tooling reads
 * (#0594).
 *
 * A UI change usually is not visible from `/`: the interesting state sits
 * inside a drawer, a modal, or a filled form, and the engineer knows which
 * page/state shows it. So a task body may carry a `## Shots` section with a
 * JSON list of entries — target, route, optional selector, optional ordered
 * steps (click/fill/wait, plain CSS selectors or test ids), an optional
 * `highlight` selector (#0603), and a label. The format is deliberately
 * stack-agnostic: routes and CSS selectors only, no framework knowledge — the
 * same strings a Playwright page accepts.
 *
 * Without a declared list, printing the fallback is the CALLER's decision: the
 * CLI shoots the route it was given — `/` unless one was typed — per resolved
 * target (`repoos shot` is interactive: the human asked for it), while the
 * server's automatic capture stands down and records a visible skip when no
 * route can be justified (#0603): a docs target matched only by content files,
 * or a diff whose only glob evidence is closer to `/` than to a screen the
 * reviewer needs. Every entry carries `provenance` — "declared: <label>" or
 * "auto: matched <glob>" — so the Changes tab can caption WHY a shot exists,
 * and a fallback caption is never blank.
 *
 * Parsing is pure (a string in, entries out) so the CLI, the server and the
 * tests can share it without touching git, a server or Playwright.
 */
import { DEFAULT_PREVIEW_TARGET as DEFAULT_FALLBACK_TARGET } from "./shot-targets.js";

/** One ordered step within a declared shot. Exactly one key per object. */
export type DeclaredStep =
  | { click: string }
  | { fill: string; text: string }
  | { waitFor: string }
  | { waitMs: number };

/** One entry of the task's `## Shots` list. */
export interface DeclaredShot {
  /** Human label captioning the shot in the drawer (default: the route). */
  label?: string;
  /** Preview target to capture; omitted means the default target. */
  target?: string;
  /** Route or absolute URL; defaults to the preview root. */
  route?: string;
  /** CSS selector to capture one element instead of the page. */
  selector?: string;
  /**
   * CSS selector to outline before capture (#0603) — "this is what changed".
   * Every matched element gets a visible outline and a soft highlight box,
   * drawn before the screenshot and removed afterwards so the live app is
   * untouched. Fallback (non-declared) shots cannot highlight: with no
   * declaration there is no way to know which element the diff changed.
   */
  highlight?: string;
  /** Ordered steps to reach the state before capturing. */
  steps?: DeclaredStep[];
}

export interface ParsedShotPlan {
  shots: DeclaredShot[];
  /** Per-entry problems; bad entries are dropped, good ones survive. */
  errors: string[];
}

/**
 * One concrete thing to capture: a resolved target plus whatever the declared
 * entry (or the server's documented fallback) contributes.
 */
export interface CaptureEntry {
  target: string;
  route: string;
  selector?: string;
  label?: string;
  /** Element(s) to outline before capture (#0603). Declared shots only. */
  highlight?: string;
  /**
   * The individual highlight selectors behind a merged `highlight` (#0613).
   * Capture applies and miss-checks each one on its own, so a stale declaration
   * is reported even when another merged selector matches. Absent when the
   * entry was never merged — `highlight` alone is then the whole story.
   */
  highlights?: string[];
  steps?: DeclaredStep[];
  /**
   * Why this shot exists (#0603), recorded in `shots.json` and rendered in the
   * Changes tab: a declared shot captions itself with its label ("declared:
   * Task drawer open"), the server's fallback with the glob it matched
   * ("auto: matched src/ui-app/**") — never blank. `globs` may be absent when
   * the caller cannot attribute a match (e.g. a CLI-captured arbitrary URL).
   */
  provenance: { kind: "declared"; label?: string } | { kind: "auto"; globs?: string[] };
}

/** The rendered provenance caption for one capture, as stored and shown (#0603). */
export function provenanceCaption(provenance: CaptureEntry["provenance"]): string {
  return provenance.kind === "declared"
    ? provenance.label
      ? `declared: ${provenance.label}`
      : "declared"
    : provenance.globs?.length
      ? `auto: matched ${provenance.globs.join(", ")}`
      : "auto";
}

/** Find a `## Shots` heading's body: the lines until the next `#` heading. */
function shotsSection(body: string): string | null {
  const lines = body.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    // Tolerant on spelling/case, strict on the heading level: `## shots`,
    // `## Shots`, `## Shots (dashboard all read)` all qualify. A `###` under it
    // is section content, not the end.
    if (/^##\s*shots\b/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    // A following `##`/`#` heading ends the section (spacing tolerated, to
    // match the start rule); a `###` under it is section content, not the end.
    if (/^#{1,2}[^#]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** The first fenced code block inside `text`, as raw content (tag line dropped). */
function firstFencedBlock(text: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```/.test(lines[i])) continue;
    const inner: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*```\s*$/.test(lines[j])) return inner.join("\n");
      inner.push(lines[j]);
    }
    return inner.join("\n"); // unterminated fence — take what is there
  }
  return null;
}

const STEP_KEYS = ["click", "fill", "waitFor", "waitMs"] as const;

/** Validate one raw JSON step; returns the typed step or an error message. */
function parseStep(raw: unknown, where: string): { step?: DeclaredStep; error?: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: `${where}: each step must be an object` };
  }
  const r = raw as Record<string, unknown>;
  const keys = Object.keys(r).filter((k) => k !== "text");
  if (keys.length !== 1 || !STEP_KEYS.includes(keys[0] as (typeof STEP_KEYS)[number])) {
    return {
      error:
        `${where}: a step needs exactly one of click/fill/waitFor/waitMs (` +
        (keys.join(", ") || "none") +
        ")",
    };
  }
  const key = keys[0];
  if (key === "click" || key === "waitFor") {
    if (typeof r[key] !== "string" || !r[key]) {
      return { error: `${where}: "${key}" expects a CSS selector string` };
    }
    // fill/text may be written as fill: selector + text: value.
    return { step: { [key]: r[key] } as DeclaredStep };
  }
  if (key === "fill") {
    if (typeof r.fill !== "string" || !r.fill || typeof r.text !== "string") {
      return { error: `${where}: "fill" expects a selector plus a "text" value` };
    }
    return { step: { fill: r.fill, text: r.text } };
  }
  // waitMs
  const ms = r.waitMs;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
    return { error: `${where}: "waitMs" expects a non-negative number` };
  }
  return { step: { waitMs: ms } };
}

/** Validate one raw JSON entry; returns the typed shot or an error message. */
function parseShot(raw: unknown, index: number): { shot?: DeclaredShot; error?: string } {
  const where = `shot #${index + 1}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: `${where}: each entry must be an object` };
  }
  const r = raw as Record<string, unknown>;
  const shot: DeclaredShot = {};
  for (const key of ["label", "target", "route", "selector", "highlight"] as const) {
    if (r[key] !== undefined) {
      if (typeof r[key] !== "string" || !r[key]) {
        return { error: `${where}: "${key}" expects a non-empty string` };
      }
      shot[key] = r[key];
    }
  }
  if (r.steps !== undefined) {
    if (!Array.isArray(r.steps)) {
      return { error: `${where}: "steps" expects an array` };
    }
    const steps: DeclaredStep[] = [];
    for (let i = 0; i < r.steps.length; i++) {
      const parsed = parseStep(r.steps[i], `${where} step #${i + 1}`);
      if (parsed.error) return { error: parsed.error };
      if (parsed.step) steps.push(parsed.step);
    }
    if (steps.length) shot.steps = steps;
  }
  return { shot };
}

/**
 * Read the task body's `## Shots` declaration. Content is a fenced JSON block
 * (```json … ```) holding one object or an array of entries — exact text to
 * parse, so malformed JSON or entries are reported per entry instead of
 * dropping the whole list silently.
 */
export function parseShotPlan(body: string): ParsedShotPlan {
  const section = shotsSection(body ?? "");
  if (section === null) return { shots: [], errors: [] };
  const hasContent = /\S/.test(section);
  if (!hasContent) return { shots: [], errors: [] };
  const block = firstFencedBlock(section);
  if (block === null) {
    return { shots: [], errors: ["## Shots section has no fenced JSON list"] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(block);
  } catch (error) {
    return {
      shots: [],
      errors: [`## Shots JSON does not parse: ${(error as Error).message}`],
    };
  }
  const items = Array.isArray(raw) ? raw : [raw];
  const shots: DeclaredShot[] = [];
  const errors: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const parsed = parseShot(items[i], i);
    if (parsed.error) errors.push(parsed.error);
    else if (parsed.shot) shots.push(parsed.shot);
  }
  return { shots, errors };
}

/**
 * Decide whether a declared shot's `target` is capturable. Resolution order:
 * an omitted target → the default target when included, else the sole/first
 * resolved target; anything else must name a resolved target exactly.
 */
function resolveEntryTarget(
  declared: string | undefined,
  targets: string[],
): { target?: string; error?: string } {
  if (!declared) {
    if (targets.includes(DEFAULT_FALLBACK_TARGET)) return { target: DEFAULT_FALLBACK_TARGET };
    if (targets.length === 1) return { target: targets[0] };
    if (targets.length === 0) {
      return { error: "no preview target was resolved for the task's changed paths" };
    }
    return {
      target: targets[0],
    };
  }
  if (!targets.includes(declared)) {
    return {
      error: `the resolved targets (${targets.join(", ") || "none"}) do not include "${declared}"`,
    };
  }
  return { target: declared };
}

/**
 * Turn the declared shot list (or the absence of one) into concrete capture
 * entries. With declarations: only resolved targets are captured;
 * mis-targeted entries land in `errors`, which the caller should
 * surface (activity note / CLI output) instead of failing the whole capture.
 * A docs-content-only target (#0603) needs an explicit `route` — `/` would be
 * the docs home page, which does not show a wording edit — so a declaring-less
 * or route-less entry for one is skipped with a note in `autoSkips`.
 *
 * Without any declared shots: one fallback entry per resolved target, route `/`
 * (the pre-#0594 behavior; `repoos shot` invoked it by hand and the server's
 * automatic capture still uses it when the diff touches a target's paths —
 * #0600 taught the capture to get out of the way otherwise, in
 * `server/shot-capture.ts`). The fallback is always captioned
 * (`provenance` "auto: matched …", and a matching label) so a shot without a
 * declared reason is never anonymous.
 *
 * `matchedGlobs` (#0603) supplies the per-target matching globs for the
 * automatic capture's captions; `docsContentOnly` names targets whose matched
 * files are all docs content.
 *
 * `route`/`selector` are what an explicit caller request supplies (`repoos shot
 * /some-route`, `repoos shot --selector .x`, #0610). They apply to the FALLBACK
 * only: a declared entry always keeps its own route, selector, steps and
 * highlight, because those were authored for that route. The server's automatic
 * pass passes neither and keeps its blind `/` fallback.
 */
export interface CapturePlanResult {
  entries: CaptureEntry[];
  errors: string[];
  /** Visible skip notes for the automatic capture to record (#0603). */
  autoSkips: string[];
  /**
   * Declared entries that were collapsed into another entry because they shared
   * the same target + route + steps + selector. Their highlights were merged
   * into the surviving entry's selector (comma-joined). For transparency only.
   */
  collapsed: string[];
}

export interface CapturePlanOptions {
  /** Per-target matched globs, for the fallback's "auto: matched <glob>" caption. */
  matchedGlobs?: ReadonlyMap<string, string[]>;
  /** Target names whose matched files are docs content only (#0603). */
  docsContentOnly?: ReadonlySet<string>;
  /**
   * Route an explicit caller request supplies (`repoos shot /some-route`) — the
   * fallback inherits it instead of the preview root (#0610). A non-empty value
   * is also the justification the docs-content skip below asks for, so a
   * requested route lifts it. Declared entries ignore this: they carry their own
   * route.
   */
  route?: string;
  /**
   * CSS selector an explicit caller request supplies (`--selector`), applied to
   * the fallback entries the same way `route` is. Declared entries ignore it.
   */
  selector?: string;
}

/** A caller-supplied route normalized for capture (always root-relative). */
function normalizeRoute(route: string): string {
  return route.startsWith("/") ? route : `/${route}`;
}

export function buildCapturePlan(
  targets: string[],
  declared: DeclaredShot[],
  options: CapturePlanOptions = {},
): CapturePlanResult {
  const errors: string[] = [];
  const autoSkips: string[] = [];
  const contentOnly = options.docsContentOnly ?? new Set<string>();
  // What the caller explicitly asked for, if anything (#0610). The CLI used to
  // compute its own entries from these and then discard them, so a typed route
  // lost to the `/` fallback below; the fallback honors it instead.
  const requestedRoute = options.route ? normalizeRoute(options.route) : undefined;
  if (declared.length === 0) {
    if (targets.length === 0) {
      return {
        entries: [],
        errors: ["no preview target was resolved for the task's changed paths"],
        autoSkips,
        collapsed: [],
      };
    }
    // Docs-content targets get no blind `/` capture #0603: their root route is
    // the docs home page, not the page that changed. An explicit requested route
    // IS the justification that skip asks for — a human naming the page by hand
    // must not be answered with a skip (#0610).
    const capturable = requestedRoute ? targets : targets.filter((t) => !contentOnly.has(t));
    for (const skipped of targets.filter((t) => contentOnly.has(t) && !requestedRoute)) {
      autoSkips.push(
        `${skipped} matched only documentation content, and no declared shot names a route — ` +
          "docs captures need a declared route, so this target was skipped",
      );
    }
    if (capturable.length === 0) {
      return { entries: [], errors, autoSkips, collapsed: [] };
    }
    return {
      entries: capturable.map((target) => {
        const globs = options.matchedGlobs?.get(target);
        const provenance: CaptureEntry["provenance"] = {
          kind: "auto",
          ...(globs ? { globs } : {}),
        };
        return {
          target,
          route: requestedRoute ?? "/",
          // #0610: a caller-requested selector narrows the capture just as it
          // does for a declared entry.
          ...(options.selector ? { selector: options.selector } : {}),
          // #0603: the fallback must always set a label — the provenance
          // caption ("auto: matched src/ui-app/**"), not a bare target name.
          label: provenanceCaption(provenance),
          provenance,
        };
      }),
      errors,
      autoSkips,
      collapsed: [],
    };
  }
  const entries: CaptureEntry[] = [];
  const declaredTargeted = new Set<string>();
  for (let i = 0; i < declared.length; i++) {
    const shot = declared[i];
    const resolved = resolveEntryTarget(shot.target, targets);
    if (resolved.error) {
      errors.push(`shot #${i + 1}: ${resolved.error}`);
      continue;
    }
    if (!resolved.target) continue;
    declaredTargeted.add(resolved.target);
    if (shot.route === undefined && contentOnly.has(resolved.target)) {
      // Docs-content-only target (#0603): its globs matched *.md files, so no
      // route can name the page that changed. Skip visibly instead of
      // captioning the docs home page — this error is the one visible note for
      // the entry; no separate skip is added below.
      errors.push(
        `shot #${i + 1}: "${resolved.target}" matched only documentation content; ` +
          "declared shots for docs targets need a route naming the changed page",
      );
      continue;
    }
    entries.push({
      target: resolved.target,
      route: shot.route ?? "/",
      ...(shot.label ? { label: shot.label } : {}),
      ...(shot.highlight ? { highlight: shot.highlight } : {}),
      ...(shot.selector ? { selector: shot.selector } : {}),
      ...(shot.steps?.length ? { steps: shot.steps } : {}),
      provenance: { kind: "declared", ...(shot.label ? { label: shot.label } : {}) },
    });
  }
  // A docs-content target NO declared entry even mentioned (the declarations
  // cover other targets) gets one visible note instead of an unrelated `/`. A
  // target the declarations named but rejected above is already covered by its
  // error — near-duplicate notes would just blur the log (#0603 review).
  for (const target of targets) {
    if (
      contentOnly.has(target) &&
      !entries.some((e) => e.target === target) &&
      !declaredTargeted.has(target)
    ) {
      autoSkips.push(
        `${target} matched only documentation content, and no declared shot names a route — ` +
          "docs captures need a declared route, so this target was skipped",
      );
    }
  }

  // Collapse near-duplicate declared shots (#0613): same target + route +
  // steps + selector → one capture with merged highlights (comma-joined
  // selector list). Near-duplicates arise when two declarations describe the
  // same evidence (e.g. two shots for `/agents` both with no tab-opening step
  // and the same selector). The surviving entry keeps the first label.
  const collapsed: string[] = [];
  const deduped: CaptureEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.target}\0${entry.route}\0${entry.selector ?? ""}\0${JSON.stringify(entry.steps ?? [])}`;
    const existing = deduped.find(
      (d) =>
        `${d.target}\0${d.route}\0${d.selector ?? ""}\0${JSON.stringify(d.steps ?? [])}` === key,
    );
    if (existing) {
      if (entry.highlight) {
        const all = existing.highlights ?? (existing.highlight ? [existing.highlight] : []);
        if (!all.includes(entry.highlight)) all.push(entry.highlight);
        existing.highlights = all;
        existing.highlight = all.join(", ");
      }
      collapsed.push(entry.label ?? `${entry.target}${entry.route}`);
    } else {
      deduped.push(entry);
    }
  }

  return { entries: deduped, errors, autoSkips, collapsed };
}
