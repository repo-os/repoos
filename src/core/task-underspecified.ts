import { parseTaskAreas } from "./areas.js";
import {
  ACTIVITY_HEADING,
  ORIGINAL_PROMPT_HEADING,
  SCREENSHOTS_HEADING,
  extractSection,
  removeSection,
} from "./task.js";
import { hasHumanTaggedCriteria, humanTaggedCriteria, taggedCriteria } from "./human-step-tags.js";

/** Machine-readable `needs_input_reason` when a task body looks like an unfinished stub. */
export const UNDERSPECIFIED_NEEDS_INPUT_REASON = "underspecified";

/** Machine-readable `needs_input_reason` when acceptance criteria need a human-only step. */
export const NEEDS_HUMAN_STEP_NEEDS_INPUT_REASON = "needs-human-step";

/** Shown in `needs_input_detail` when the acceptance-criteria heuristic fires. */
export const NEEDS_HUMAN_STEP_HINT =
  "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task.";

/** Minimum non–original-prompt body length before the short-body heuristic fires. */
export const UNDERSPECIFIED_MIN_BODY_CHARS = 400;

/** Heading of the note added to a task assigned to a human (#0815). */
export const HUMAN_TASK_NOTE_HEADING = "## Human task";

/**
 * Body note added to human-assigned tasks (#0815): the agent-oriented checks
 * (`underspecified`, `needs-human-step`) and the `## Notes for AI` requirement
 * do not apply, so the body says so out loud rather than looking like a stub.
 */
export const HUMAN_TASK_NOTE = `${HUMAN_TASK_NOTE_HEADING}

_Assigned to a human, not an AI agent. No \`## Notes for AI\` is required here; the acceptance criteria are the human's checklist._`;

/**
 * Minimal scaffold for a human task created with no body (#0815). It keeps the
 * card readable without imposing the agent task-body contract on human work.
 */
export const HUMAN_TASK_SCAFFOLD = `## Problem

_What needs doing, and why does it matter?_

## Acceptance criteria

- [ ] ...`;

/** Append the human-task note to a body unless it is already present (idempotent). */
export function withHumanTaskNote(body: string): string {
  if (body.includes(HUMAN_TASK_NOTE_HEADING)) return body;
  const trimmed = body.trim();
  return trimmed ? `${trimmed}\n\n${HUMAN_TASK_NOTE}` : HUMAN_TASK_NOTE;
}

/** Options shared by the agent-oriented task-spec checks (#0815). */
export interface TaskSpecCheckOptions {
  area?: string | null;
  /**
   * The task's resolved assignee. A task assigned to a human is not worked by
   * an agent, so these agent-oriented checks do not apply to it (#0815).
   * Callers pass `task.assignee`.
   */
  assignee?: string | null;
}

/** True when the resolved assignee is the literal `human` assignee. */
function isHumanAssigned(assignee: string | null | undefined): boolean {
  return (assignee ?? "").trim().toLowerCase() === "human";
}

export const TASK_SPEC_SECTION_HEADINGS = [
  "## Problem",
  "## Desired UX",
  "## Acceptance criteria",
  "## Notes for AI",
] as const;

/** Areas that touch product UI — `## Desired UX` is required only for these (#0685). */
const UI_TASK_AREAS = new Set(["web", "ui", "ui-app"]);

/**
 * Whether a task's `area` frontmatter implies user-visible UI work. When the
 * area is empty/unknown the check stays strict; pure server/docs/cli slices
 * may omit `## Desired UX` (keep the heading with "N/A" if you prefer).
 */
export function areasRequireDesiredUx(area: string | null | undefined): boolean {
  const areas = parseTaskAreas(area).map((a) => a.toLowerCase());
  if (areas.length === 0) return true;
  return areas.some((a) => UI_TASK_AREAS.has(a));
}

export function specSectionHeadingsForTask(area: string | null | undefined): readonly string[] {
  if (areasRequireDesiredUx(area)) return TASK_SPEC_SECTION_HEADINGS;
  return TASK_SPEC_SECTION_HEADINGS.filter((h) => h !== "## Desired UX");
}

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

export interface NeedsHumanStepAssessment {
  needsHumanStep: boolean;
  /** Human-readable signals joined for `needs_input_detail`. */
  detail: string;
  signals: string[];
  /** The criterion line (or sentence) the keyword scan matched, for the flag detail. */
  sentence?: string;
  /** True when a `[human]`-tagged criterion is the reason, not a keyword/model verdict. */
  taggedHuman?: boolean;
}

const HUMAN_STEP_ACCEPTANCE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\breal\s+device/i, label: "real device" },
  { re: /\bphysical\s+(device|hardware)\b/i, label: "physical hardware" },
  { re: /\bon\s+(a|the)\s+(real\s+)?device\b/i, label: "on-device verification" },
  {
    re: /\b(iphone|android\s+device|google\s+pixel|handset|tablet|wearable)\b/i,
    label: "named mobile hardware",
  },
  {
    re: /\b(test|verify|confirm|prove).{0,80}\b(device|hardware)\b/i,
    label: "device verification",
  },
  { re: /\b(production|staging)\s+(account|credentials?)\b/i, label: "environment credentials" },
  { re: /\b(credentials?|api\s+keys?|service\s+account)\b/i, label: "credentials or keys" },
  {
    re: /\b(register|sign[- ]?up|enroll|create).{0,50}\b(apple|google|firebase|third[- ]?party|external)\b/i,
    label: "third-party registration",
  },
  { re: /\bfirebase\s+project\b/i, label: "Firebase project" },
  { re: /\b(app\s+store|play\s+console|developer\s+portal)\b/i, label: "store or portal setup" },
];

/**
 * Pull the sentence around the first regex match in `text`, so a flag can quote
 * exactly what tripped the scan rather than a whole paragraph.
 */
export function sentenceAroundMatch(text: string, re: RegExp): string | null {
  const match = re.exec(text);
  if (!match || match.index === undefined) return null;
  const start = Math.max(
    text.lastIndexOf(". ", match.index),
    text.lastIndexOf("; ", match.index),
    text.lastIndexOf("\n", match.index),
  );
  const ends = [text.indexOf(". ", match.index), text.indexOf("; ", match.index)].filter(
    (i) => i !== -1,
  );
  const end = ends.length ? Math.min(...ends) : text.length;
  return text
    .slice(start === -1 ? 0 : start + 1, end === text.length ? end : end + 1)
    .replace(/^[\s;.-]+/, "")
    .trim();
}

/** Strip the leading bullet/checkbox from a criterion line for quoting. */
function criterionText(line: string): string {
  return line.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?/, "").trim();
}

/**
 * True when `## Acceptance criteria` (or the whole body if that section is missing)
 * mentions work only a human can perform on real hardware, accounts, or external systems.
 *
 * `[ai]`-tagged criteria are never scanned (the tag says an agent can verify
 * them) and any `[human]`-tagged criterion is authoritative — it needs a human
 * without waiting for the keyword or model check (#0909).
 */
export function assessTaskNeedsHumanStep(
  body: string,
  opts?: TaskSpecCheckOptions,
): NeedsHumanStepAssessment {
  // Human-assigned tasks are the human's own checklist; never flag them (#0815).
  if (isHumanAssigned(opts?.assignee)) {
    return { needsHumanStep: false, detail: "", signals: [] };
  }
  const trimmed = body.trim();
  const acSection = extractSection(trimmed, "## Acceptance criteria");
  const humanLines = acSection ? humanTaggedCriteria(trimmed) : [];
  if (humanLines.length > 0) {
    const sentence = humanLines[0];
    return {
      needsHumanStep: true,
      detail: `${NEEDS_HUMAN_STEP_HINT} (tagged [human]: "${sentence}")`,
      signals: ["[human] tagged criterion"],
      sentence,
      taggedHuman: true,
    };
  }
  // Only untagged criteria are candidates for the keyword scan; `[ai]` lines
  // explicitly say an agent verifies them.
  const scanLines = acSection
    ? taggedCriteria(trimmed)
        .filter((c) => c.tag === undefined)
        .map((c) => criterionText(c.raw))
    : stripTemplatePlaceholderLines(bodyForLengthCheck(trimmed)).split("\n");
  const scanText = scanLines.join("\n");
  const signals: string[] = [];
  let sentence: string | undefined;
  for (const { re, label } of HUMAN_STEP_ACCEPTANCE_PATTERNS) {
    if (!re.test(scanText)) continue;
    signals.push(label);
    if (!sentence) {
      for (const line of scanLines) {
        const hit = sentenceAroundMatch(line, re);
        if (hit) {
          sentence = hit;
          break;
        }
      }
    }
  }
  const uniqueSignals = [...new Set(signals)];
  if (uniqueSignals.length === 0) {
    return { needsHumanStep: false, detail: "", signals: [] };
  }
  const detail = `${NEEDS_HUMAN_STEP_HINT} (matched: ${uniqueSignals.join(", ")}${
    sentence ? ` — "${sentence}"` : ""
  })`;
  return { needsHumanStep: true, detail, signals: uniqueSignals, sentence };
}

/**
 * Flatten a verdict field into a short, stable fingerprint. Not cryptographic —
 * it only needs to notice when the acceptance criteria the decision was made on
 * have changed so a stale "agent" verdict stops suppressing the keyword check.
 */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fingerprint of the acceptance-criteria text the human-step keyword or model
 * decision is made on (#0804). Same scan text the keyword check reads, so a
 * body edit that adds or removes criteria invalidates a stored verdict.
 *
 * Whitespace-only edits are not material (#0909): each non-empty line is
 * trimmed and blank lines are dropped, so reflowing a paragraph in `## Problem`
 * cannot undo a sticky override while a real criteria change still does.
 */
export function needsHumanStepFingerprint(body: string): string {
  const trimmed = body.trim();
  const acSection = extractSection(trimmed, "## Acceptance criteria");
  const scanText = acSection
    ? stripTemplatePlaceholderLines(sectionContent(acSection))
    : stripTemplatePlaceholderLines(bodyForLengthCheck(trimmed));
  const material = scanText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  return fingerprint(material);
}

export function assessTaskUnderspecified(
  body: string,
  opts?: TaskSpecCheckOptions,
): UnderspecifiedAssessment {
  // A human task's body is the human's to shape; the agent-body contract and
  // its `## Notes for AI` requirement do not apply (#0815).
  if (isHumanAssigned(opts?.assignee)) {
    return { underspecified: false, detail: "", signals: [] };
  }
  const signals: string[] = [];
  const trimmed = body.trim();
  const headings = specSectionHeadingsForTask(opts?.area);

  const missing: string[] = [];
  const empty: string[] = [];
  for (const heading of headings) {
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
export function fleshOutRequirementsPrompt(
  story?: { name: string; path?: string },
  area?: string | null,
): string {
  const storyLine = story
    ? [
        "",
        story.path
          ? `This task is a slice of the story "${story.name}". If you need more context, read the story at ${story.path} (and sibling tasks in that story) before asking the human anything.`
          : `This task is a slice of the story "${story.name}". If you need more context, look at sibling tasks tagged with that story (\`repoos list\`) before asking the human anything.`,
      ]
    : [];
  const headings = specSectionHeadingsForTask(area);
  const desiredUxNote = areasRequireDesiredUx(area)
    ? ""
    : "\n`## Desired UX` is optional for this task's area (no UI slice) — skip it or add one sentence if helpful.";
  return [
    "To count as fully specified, the task body must have ALL of these sections, each with real content (not placeholders):",
    ...headings.map((h) => `- ${h}`),
    desiredUxNote,
    "",
    `Rules: use these exact headings; if a section doesn't apply, keep the heading and say so in a sentence (except \`## Desired UX\` on non-UI tasks, which may be omitted); leave no bare TODO/TBD/<placeholder> lines; the body outside "## Original prompt" must be at least ${UNDERSPECIFIED_MIN_BODY_CHARS} characters. Keep the existing "## Original prompt", "## Screenshots" and "## Activity" sections untouched. Update the task through the repoos commands/API, never by editing work/*.md directly.`,
    ...storyLine,
  ].join("\n");
}
