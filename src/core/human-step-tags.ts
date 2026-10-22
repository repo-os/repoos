/**
 * `[human]` / `[ai]` acceptance-criteria tags (#0909).
 *
 * A task can say which of its criteria are AI-verifiable and which genuinely
 * need a person. Only `[human]` lines can require a human step (the explicit
 * tag is authoritative); `[ai]` lines never trip the keyword scan; untagged
 * lines keep going through the model check. The shared parser here is used by
 * the flag assessor, the split action and the UI, so all three agree on what a
 * tagged line is.
 */
import { extractSection, replaceSection } from "./task.js";

export type HumanStepTag = "human" | "ai";

export interface TaggedCriterion {
  /** The criterion text with the tag removed. */
  text: string;
  /** `human`, `ai`, or undefined for an ordinary untagged criterion. */
  tag?: HumanStepTag;
  /** The original line, unchanged. */
  raw: string;
}

/** Strip a leading bullet/checkbox so `[human]` can follow either form. */
const TAG_RE = /^(\s*(?:[-*]\s+(?:\[[ xX]\]\s*)?)?)\[(human|ai)\]\s*(.*)$/i;

function untagLine(line: string): { text: string; tag?: HumanStepTag } {
  const match = TAG_RE.exec(line);
  if (!match) return { text: line.replace(/^\s*[-*]\s+(?:\[[ xX]\]\s*)?/, "").trim() };
  return {
    text: match[3].trim(),
    tag: match[2].toLowerCase() === "human" ? "human" : "ai",
  };
}

function criteriaSection(body: string): string | null {
  return extractSection(body.trim(), "## Acceptance criteria");
}

/** The acceptance-criteria lines (excluding the heading), preserving order. */
export function acceptanceCriteriaLines(body: string): string[] {
  const section = criteriaSection(body);
  if (!section) return [];
  return section
    .split("\n")
    .slice(1)
    .filter((line) => line.trim().length > 0);
}

/** Parse every acceptance-criteria line into its text and optional tag. */
export function taggedCriteria(body: string): TaggedCriterion[] {
  return acceptanceCriteriaLines(body).map((raw) => ({ raw, ...untagLine(raw) }));
}

/** The texts of every `[human]`-tagged criterion, in order. */
export function humanTaggedCriteria(body: string): string[] {
  return taggedCriteria(body)
    .filter((c) => c.tag === "human" && c.text.length > 0)
    .map((c) => c.text);
}

/** True when at least one non-empty `[human]` criterion exists. */
export function hasHumanTaggedCriteria(body: string): boolean {
  return humanTaggedCriteria(body).length > 0;
}

/** True when at least one non-empty `[ai]` criterion exists. */
export function hasAiTaggedCriteria(body: string): boolean {
  return taggedCriteria(body).some((c) => c.tag === "ai" && c.text.length > 0);
}

/**
 * Rewrite the acceptance-criteria section with every tag removed, leaving the
 * text (and bullet/checkbox prefix) intact. Used after a split so the AI task
 * carries plain criteria again.
 */
export function stripCriteriaTagsFromBody(body: string): string {
  const section = criteriaSection(body);
  if (!section) return body;
  const lines = section.split("\n");
  const heading = lines[0];
  const rewritten = lines.slice(1).map((line) => {
    const match = TAG_RE.exec(line);
    if (!match) return line;
    return `${match[1]}${match[3]}`;
  });
  // Keep the trailing blank line shape of the original section when present.
  const content = [heading, ...rewritten].join("\n");
  return replaceSection(body, "## Acceptance criteria", content.slice(heading.length + 1));
}

/**
 * Remove every `[human]` criterion from the acceptance criteria and strip the
 * remaining `[ai]` tags. Returns the rewritten body and the moved criterion
 * texts (tag and bullet removed).
 */
export function removeHumanTaggedCriteria(body: string): { body: string; moved: string[] } {
  const section = criteriaSection(body);
  if (!section) return { body, moved: [] };
  const lines = section.split("\n");
  const heading = lines[0];
  const moved: string[] = [];
  const kept: string[] = [];
  for (const line of lines.slice(1)) {
    const parsed = untagLine(line);
    if (parsed.tag === "human") {
      if (parsed.text) moved.push(parsed.text);
      continue;
    }
    if (parsed.tag === "ai") {
      const match = TAG_RE.exec(line);
      kept.push(match ? `${match[1]}${match[3]}` : line);
      continue;
    }
    kept.push(line);
  }
  const content = [heading, ...kept].join("\n");
  return {
    body: replaceSection(body, "## Acceptance criteria", content.slice(heading.length + 1)),
    moved,
  };
}

/** Body for the held human task created by a split. */
export function buildHumanTaskBody(input: {
  sourceId: string;
  sourceTitle: string;
  moved: string[];
}): string {
  const criteria =
    input.moved.length > 0
      ? input.moved.map((line) => (line.startsWith("- ") ? line : `- [ ] ${line}`)).join("\n")
      : "- [ ] ...";
  return `## Problem

The AI task #${input.sourceId} ("${input.sourceTitle}") has verification steps that only a human can perform. This task holds just those steps so the AI task can start.

## Desired UX

N/A — this is human-only verification.

## Acceptance criteria

${criteria}

## Notes for AI

_Assigned to a human, not an AI agent. The human-only steps were moved here from #${input.sourceId}; finish them and record the outcome there if it affects the AI task._`;
}
