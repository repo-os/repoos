/**
 * The declarative shot list a task declares and the capture tooling reads
 * (#0594).
 *
 * A UI change usually is not visible from `/`: the interesting state sits
 * inside a drawer, a modal, or a filled form, and the engineer knows which
 * page/state shows it. So a task body may carry a `## Shots` section with a
 * JSON list of entries — target, route, optional selector, optional ordered
 * steps (click/fill/wait, plain CSS selectors or test ids), and a label. The
 * format is deliberately stack-agnostic: routes and CSS selectors only, no
 * framework knowledge — the same strings a Playwright page accepts.
 *
 * Without a declared list, capture falls back to `/` per resolved target —
 * the pre-#0594 behavior. Parsing is pure (a string in, entries out) so the
 * CLI, the server and the tests can share it without touching git, a server
 * or Playwright.
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
 * entry (or the `/`-fallback) contributes.
 */
export interface CaptureEntry {
  target: string;
  route: string;
  selector?: string;
  label?: string;
  steps?: DeclaredStep[];
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
    // A following `##`/`#` heading ends the section; a `###` under it is
    // section content, not the end.
    if (/^#{1,2}\s/.test(lines[i])) {
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
        `${where}: a step needs exactly one of click/fill/waitFor/waitMs (` + keys.join(", ") ||
        "none" + ")",
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
  for (const key of ["label", "target", "route", "selector"] as const) {
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
 * entries. Without any declared shots: one entry per resolved target, route
 * `/` — the pre-#0594 behavior. With declarations: only resolved targets are
 * captured; mis-targeted entries land in `errors`, which the caller should
 * surface (activity note / CLI output) instead of failing the whole capture.
 */
export function buildCapturePlan(
  targets: string[],
  declared: DeclaredShot[],
): { entries: CaptureEntry[]; errors: string[] } {
  const errors: string[] = [];
  if (declared.length === 0) {
    if (targets.length === 0) {
      return {
        entries: [],
        errors: ["no preview target was resolved for the task's changed paths"],
      };
    }
    return { entries: targets.map((target) => ({ target, route: "/" })), errors };
  }
  const entries: CaptureEntry[] = [];
  for (let i = 0; i < declared.length; i++) {
    const shot = declared[i];
    const resolved = resolveEntryTarget(shot.target, targets);
    if (resolved.error) {
      errors.push(`shot #${i + 1}: ${resolved.error}`);
      continue;
    }
    if (!resolved.target) continue;
    entries.push({
      target: resolved.target,
      route: shot.route ?? "/",
      ...(shot.label ? { label: shot.label } : {}),
      ...(shot.selector ? { selector: shot.selector } : {}),
      ...(shot.steps?.length ? { steps: shot.steps } : {}),
    });
  }
  return { entries, errors };
}
