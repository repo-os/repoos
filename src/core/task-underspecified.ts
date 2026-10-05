import {
  ACTIVITY_HEADING,
  ORIGINAL_PROMPT_HEADING,
  SCREENSHOTS_HEADING,
  extractSection,
  removeSection,
} from "./task.js";

/** Machine-readable `needs_input_reason` when a task body looks like an unfinished stub. */
export const UNDERSPECIFIED_NEEDS_INPUT_REASON = "underspecified";

/** Minimum non–original-prompt body length before the short-body heuristic fires. */
export const UNDERSPECIFIED_MIN_BODY_CHARS = 400;

export const TASK_SPEC_SECTION_HEADINGS = [
  "## Problem",
  "## Desired UX",
  "## Acceptance criteria",
  "## Notes for AI",
] as const;

/** Stub lines the PM scaffold leaves behind — not prose that mentions TODO/TBD. */
function hasUnfilledPlaceholderMarkers(text: string): boolean {
  const withoutInlineCode = text.replace(/`[^`]*`/g, "");
  if (/<placeholder>/i.test(withoutInlineCode)) return true;
  for (const line of withoutInlineCode.split("\n")) {
    const t = line.trim();
    if (/^TODO\s*[:.]?\s*$/i.test(t)) return true;
    if (/^TBD\s*[:.]?\s*$/i.test(t)) return true;
    if (/^[-*]\s+TODO\s*[:.]?\s*$/i.test(t)) return true;
    if (/^[-*]\s+TBD\s*[:.]?\s*$/i.test(t)) return true;
    if (/^- \[ \]\s+TODO\s*[:.]?\s*$/i.test(t)) return true;
    if (/^- \[ \]\s+TBD\s*[:.]?\s*$/i.test(t)) return true;
  }
  return false;
}

function sectionContent(section: string): string {
  const lines = section.split("\n");
  return lines.slice(1).join("\n").trim();
}

/** Strip template placeholder lines the PM scaffold leaves behind. */
function stripTemplatePlaceholderLines(text: string): string {
  return text
    .replace(/^_\s*[^_]*\s*_\s*$/gm, "")
    .replace(/^- \[ \] \.\.\.\s*$/gm, "")
    .trim();
}

function bodyWithoutPreservedSections(body: string): string {
  let rest = body;
  for (const heading of [ORIGINAL_PROMPT_HEADING, SCREENSHOTS_HEADING, ACTIVITY_HEADING]) {
    rest = removeSection(rest, heading);
  }
  return rest.trim();
}

function bodyForLengthCheck(body: string): string {
  let rest = removeSection(body, ORIGINAL_PROMPT_HEADING);
  for (const heading of [SCREENSHOTS_HEADING, ACTIVITY_HEADING]) {
    rest = removeSection(rest, heading);
  }
  return rest.trim();
}

export interface UnderspecifiedAssessment {
  underspecified: boolean;
  /** Human-readable signals joined for `needs_input_detail`. */
  detail: string;
  signals: string[];
}

export function assessTaskUnderspecified(body: string): UnderspecifiedAssessment {
  const signals: string[] = [];
  const trimmed = body.trim();

  const missing: string[] = [];
  const empty: string[] = [];
  for (const heading of TASK_SPEC_SECTION_HEADINGS) {
    const section = extractSection(trimmed, heading);
    const shortName = heading.replace(/^##\s+/, "");
    if (!section) {
      missing.push(shortName);
      continue;
    }
    const content = stripTemplatePlaceholderLines(sectionContent(section));
    if (!content) empty.push(shortName);
  }
  if (missing.length) {
    signals.push(`missing sections: ${missing.join(", ")}`);
  }
  if (empty.length) {
    signals.push(`empty sections: ${empty.join(", ")}`);
  }

  const outsideOriginal = bodyWithoutPreservedSections(trimmed);
  if (!outsideOriginal) {
    signals.push("body is only the original prompt");
  }

  const lengthBody = bodyForLengthCheck(trimmed);
  if (lengthBody.length > 0 && lengthBody.length < UNDERSPECIFIED_MIN_BODY_CHARS) {
    signals.push(
      `body under ${UNDERSPECIFIED_MIN_BODY_CHARS} characters (excluding original prompt)`,
    );
  }

  const placeholderScan = bodyForLengthCheck(trimmed);
  if (hasUnfilledPlaceholderMarkers(placeholderScan)) {
    signals.push("unfilled placeholder markers (TODO, TBD, or <placeholder>)");
  }

  const uniqueSignals = [...new Set(signals)];
  return {
    underspecified: uniqueSignals.length > 0,
    detail: uniqueSignals.join("; "),
    signals: uniqueSignals,
  };
}

/** The PM chat's canned "flesh this out" message (mirrors the UI's `PM_FLESH_OUT_CANNED_MESSAGE`). */
export const PM_FLESH_OUT_MESSAGE = "Can you flesh this out?";

/**
 * Appended server-side to the canned flesh-out message so the PM knows exactly
 * what the underspecified check (`assessTaskUnderspecified`) requires.
 */
export function fleshOutRequirementsPrompt(story?: { name: string; path?: string }): string {
  const storyLine = story
    ? [
        "",
        story.path
          ? `This task is a slice of the story "${story.name}". If you need more context, read the story at ${story.path} (and sibling tasks in that story) before asking the human anything.`
          : `This task is a slice of the story "${story.name}". If you need more context, look at sibling tasks tagged with that story (\`repoos list\`) before asking the human anything.`,
      ]
    : [];
  return [
    "To count as fully specified, the task body must have ALL of these sections, each with real content (not placeholders):",
    ...TASK_SPEC_SECTION_HEADINGS.map((h) => `- ${h}`),
    "",
    `Rules: use these exact headings; if a section doesn't apply (e.g. no UI change), keep the heading and say so in a sentence; leave no bare TODO/TBD/<placeholder> lines; the body outside "## Original prompt" must be at least ${UNDERSPECIFIED_MIN_BODY_CHARS} characters. Keep the existing "## Original prompt", "## Screenshots" and "## Activity" sections untouched. Update the task through the repoos commands/API, never by editing work/*.md directly.`,
    ...storyLine,
  ].join("\n");
}
