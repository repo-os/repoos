/**
 * Deterministic field inference for `/newtask` (#0543).
 *
 * Deliberately not an LLM call. The task asks for a preview that commits
 * nothing and for a specific question when the prose is too thin to guess
 * safely; a deterministic keyword parse makes "why did it pick that?" cheap to
 * explain and impossible to spend tokens on by accident. Anything ambiguous
 * is surfaced as a question or corrected through the Edit buttons, never
 * silently coerced into an invalid field.
 *
 * The allowed sets are the repo's own: `TASK_TYPES`/`PRIORITIES` from
 * src/core/types.ts and the area vocabulary from config. A value outside them
 * is refused, matching `createTask`'s own validation (#0656).
 */
import { PRIORITIES, TASK_TYPES } from "../../core/types.js";

export interface TaskDraftFields {
  title: string;
  type: string;
  priority: string;
  area: string;
  body: string;
  originalPrompt: string;
}

export type DraftField = "title" | "type" | "priority" | "area";

export const DRAFT_FIELDS: readonly DraftField[] = ["title", "type", "priority", "area"];

export interface InferDraftOptions {
  /** Declared area vocabulary; empty means free-text areas are allowed. */
  areas: readonly string[];
  /** Area to use when the prose names none; usually the repo default. */
  defaultArea: string;
}

export type InferDraftResult =
  | { ok: true; draft: TaskDraftFields }
  | { ok: false; question: string };

const TYPE_KEYWORDS: Array<{ type: (typeof TASK_TYPES)[number]; words: RegExp }> = [
  {
    type: "bug",
    words: /\b(bug|broken|crash(?:es|ed|ing)?|regression|fails?|failing|error|wrong|incorrect)\b/i,
  },
  {
    type: "refactor",
    words: /\b(refactor|rename|restructure|clean\s?up|extract|split|dedupe|reorganize)\b/i,
  },
  {
    type: "chore",
    words: /\b(chore|dependenc(?:y|ies)|upgrade|bump|ci|build|release|lint|format)\b/i,
  },
  {
    type: "spec",
    words: /\b(spec|design|proposal|rfc|plan|document|docs?|guide|adr)\b/i,
  },
];

function titleFromProse(prose: string): string {
  const firstLine = prose
    .replace(/^\/newtask(?:@[A-Za-z0-9_]+)?\s*/i, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const source = firstLine ?? prose.trim();
  const sentence = source.split(/(?<=[.!?])\s+/)[0] ?? source;
  const oneLine = sentence.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 90) return oneLine;
  // Prefer a word boundary before the cap rather than a mid-word cut.
  const cut = oneLine.slice(0, 90);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[.,;:!?]+$/, "")}`.trim();
}

function inferType(prose: string): string {
  for (const { type, words } of TYPE_KEYWORDS) {
    if (words.test(prose)) return type;
  }
  return "feature";
}

function inferPriority(prose: string): string {
  if (/\b(p0|urgent|emergency|security|data\s?loss|production\s+down)\b/i.test(prose)) return "p0";
  if (/\b(p1|critical|crash|outage|broken|regression)\b/i.test(prose)) return "p1";
  if (/\b(p3|nice\s+to\s+have|someday|later|optional)\b/i.test(prose)) return "p3";
  return "p2";
}

function inferArea(prose: string, options: InferDraftOptions): string {
  const exact = (value: string): string | null => {
    const needle = value.trim();
    if (!needle) return null;
    const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return pattern.test(prose) ? value : null;
  };
  for (const area of options.areas) {
    const found = exact(area);
    if (found) return found;
  }
  // Common synonyms that should not open an unregistered area.
  if (options.areas.includes("docs") && /\b(documentation|docs?|guide)\b/i.test(prose))
    return "docs";
  if (options.areas.includes("web") && /\b(ui|frontend|front-end|browser)\b/i.test(prose)) {
    return "web";
  }
  return options.defaultArea.trim() || options.areas[0] || "general";
}

/** Infer fields from free-form prose; ask instead of guessing when it is too thin. */
export function inferTaskDraft(prose: string, options: InferDraftOptions): InferDraftResult {
  const trimmed = prose.trim();
  if (trimmed.length < 10) {
    return {
      ok: false,
      question:
        "What should the task be about? Send /newtask followed by a sentence or two describing the work.",
    };
  }
  const title = titleFromProse(trimmed);
  if (!title) {
    return {
      ok: false,
      question: "I could not find a title in that — send /newtask with a short description.",
    };
  }
  return {
    ok: true,
    draft: {
      title,
      type: inferType(trimmed),
      priority: inferPriority(trimmed),
      area: inferArea(trimmed, options),
      body: trimmed,
      originalPrompt: trimmed,
    },
  };
}

/**
 * Apply one Edit correction. `allowedAreas` is empty when the repo declares no
 * vocabulary; areas are then accepted as trimmed free text (the same freedom
 * the UI's area field has).
 */
export function applyDraftEdit(
  draft: TaskDraftFields,
  field: DraftField,
  rawValue: string,
  allowedAreas: readonly string[],
): { ok: true; draft: TaskDraftFields } | { ok: false; error: string } {
  const value = rawValue.trim();
  if (!value) return { ok: false, error: `The ${field} cannot be empty.` };
  switch (field) {
    case "title": {
      if (value.length > 200)
        return { ok: false, error: "Titles must be 200 characters or fewer." };
      return { ok: true, draft: { ...draft, title: value } };
    }
    case "type": {
      const normalized = value.toLowerCase();
      if (!(TASK_TYPES as readonly string[]).includes(normalized)) {
        return { ok: false, error: `Type must be one of: ${TASK_TYPES.join(", ")}.` };
      }
      return { ok: true, draft: { ...draft, type: normalized } };
    }
    case "priority": {
      const normalized = value.toLowerCase();
      if (!(PRIORITIES as readonly string[]).includes(normalized)) {
        return { ok: false, error: `Priority must be one of: ${PRIORITIES.join(", ")}.` };
      }
      return { ok: true, draft: { ...draft, priority: normalized } };
    }
    case "area": {
      if (allowedAreas.length > 0) {
        const canonical = allowedAreas.find((area) => area.toLowerCase() === value.toLowerCase());
        if (!canonical) {
          return { ok: false, error: `Area must be one of: ${allowedAreas.join(", ")}.` };
        }
        return { ok: true, draft: { ...draft, area: canonical } };
      }
      if (value.length > 60) return { ok: false, error: "Areas must be 60 characters or fewer." };
      return { ok: true, draft: { ...draft, area: value } };
    }
  }
}
