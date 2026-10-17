/**
 * Requirements-change detection (#0817): compare two versions of a task body
 * by `## Section` so the server can tell an active task's engineer which
 * requirements moved while it worked from its own worktree copy.
 *
 * Two callers share this module and must agree on the wording, because one
 * records the activity entry and the other sends the engineer message:
 *   - `patchTaskFile` records one activity entry naming the changed sections;
 *   - the server's requirements notifier sends the engineer the same summary.
 * `summary` and `detail` are asserted by tests — treat them as stable output
 * rather than an implementation detail.
 */
import { ACTIVITY_HEADING, ORIGINAL_PROMPT_HEADING, SCREENSHOTS_HEADING } from "./task.js";

/**
 * Body sections that are bookkeeping, not requirements: the append-only
 * activity log, attached screenshots, the verbatim original prompt, and the
 * engineer-declared `## Shots` plan. A change to one of these must not read as
 * a requirements change (the engineer declaring its own shots would otherwise
 * message itself).
 */
const NON_REQUIREMENT_SECTIONS: ReadonlySet<string> = new Set([
  ACTIVITY_HEADING,
  SCREENSHOTS_HEADING,
  ORIGINAL_PROMPT_HEADING,
  "## Shots",
]);

/** One changed `## Section`, classified for the summary and message. */
export interface RequirementsSectionChange {
  /** Normalized heading including the leading `## `. */
  heading: string;
  /** Heading text without the `## ` prefix. */
  label: string;
  /** `added`/`removed` for a whole section; `edited` when both versions have it. */
  kind: "added" | "removed" | "edited";
  /** Item lines present only in the new body (empty for a removed section). */
  added: string[];
  /** Item lines present only in the old body (empty for an added section). */
  removed: string[];
}

export interface RequirementsChange {
  sections: RequirementsSectionChange[];
  /** One line naming every changed section, e.g. `Notes for AI (edited)`. */
  summary: string;
  /** Compact `+ added` / `- removed` block per section, for the message. */
  detail: string;
}

interface ParsedSection {
  heading: string;
  lines: string[];
}

/** Split a body into `## Section` blocks (content before the first is ignored). */
function splitSections(body: string): ParsedSection[] {
  const out: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  // `/^##(?!#)\s+/` accepts `## Foo` but not `### Foo`, matching the section
  // boundary rule the task parser uses.
  for (const raw of body.split("\n")) {
    const m = /^(##(?!#)\s+)(.*)$/.exec(raw.trim());
    if (m) {
      current = { heading: `## ${m[2].trim()}`, lines: [] };
      out.push(current);
      continue;
    }
    if (current) current.lines.push(raw);
  }
  return out;
}

/** Non-empty, trimmed item lines of a section. */
function itemsOf(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

/** Multiset diff of two item lists, preserving each side's original order. */
function lineDiff(oldItems: string[], newItems: string[]): { added: string[]; removed: string[] } {
  const oldCounts = new Map<string, number>();
  for (const item of oldItems) oldCounts.set(item, (oldCounts.get(item) ?? 0) + 1);
  const added: string[] = [];
  for (const item of newItems) {
    const left = oldCounts.get(item) ?? 0;
    if (left > 0) oldCounts.set(item, left - 1);
    else added.push(item);
  }
  const newCounts = new Map<string, number>();
  for (const item of newItems) newCounts.set(item, (newCounts.get(item) ?? 0) + 1);
  const removed: string[] = [];
  for (const item of oldItems) {
    const left = newCounts.get(item) ?? 0;
    if (left > 0) newCounts.set(item, left - 1);
    else removed.push(item);
  }
  return { added, removed };
}

/** `Acceptance criteria (added 1, removed 1)` for a single section. */
function sectionSummary(section: RequirementsSectionChange): string {
  const parts: string[] = [];
  if (section.kind === "added") parts.push("added");
  else if (section.kind === "removed") parts.push("removed");
  else {
    if (section.added.length) parts.push(`added ${section.added.length}`);
    if (section.removed.length) parts.push(`removed ${section.removed.length}`);
    if (!parts.length) parts.push("edited");
  }
  return `${section.label} (${parts.join(", ")})`;
}

const MAX_ITEMS = 6;
const MAX_ITEM_LEN = 160;

/** Strip a leading bullet/number marker so the `+`/`-` prefix is unambiguous. */
function cleanItem(text: string): string {
  return text
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function clipItem(text: string): string {
  return text.length > MAX_ITEM_LEN ? `${text.slice(0, MAX_ITEM_LEN - 1)}…` : text;
}

/** A bounded `+ item` / `- item` list, so the notice stays short. */
function itemLines(items: string[], marker: "+" | "-"): string[] {
  const shown = items.slice(0, MAX_ITEMS).map((t) => `${marker} ${clipItem(cleanItem(t))}`);
  if (items.length > MAX_ITEMS) shown.push(`${marker} …and ${items.length - MAX_ITEMS} more`);
  return shown;
}

function buildDetail(sections: RequirementsSectionChange[]): string {
  return sections
    .map((section) => {
      const lines = [section.heading];
      if (section.kind === "added") lines.push(...itemLines(section.added, "+"));
      else if (section.kind === "removed") lines.push(...itemLines(section.removed, "-"));
      else {
        if (section.added.length) lines.push(...itemLines(section.added, "+"));
        if (section.removed.length) lines.push(...itemLines(section.removed, "-"));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Compare old and new task bodies, returning only the requirement sections
 * that changed (or null when none did). A section whose items merely reorder
 * does not count: the comparison is by item content, and the returned
 * added/removed lists are order-preserving multisets.
 */
export function summarizeRequirementsChange(
  oldBody: string,
  newBody: string,
): RequirementsChange | null {
  const oldSections = splitSections(oldBody).filter(
    (s) => !NON_REQUIREMENT_SECTIONS.has(s.heading),
  );
  const newSections = splitSections(newBody).filter(
    (s) => !NON_REQUIREMENT_SECTIONS.has(s.heading),
  );
  const oldMap = new Map(oldSections.map((s) => [s.heading, itemsOf(s.lines)]));
  const newMap = new Map(newSections.map((s) => [s.heading, itemsOf(s.lines)]));

  // New-body order first, then sections only the old body had (removed ones).
  const order: string[] = [];
  for (const s of newSections) if (!order.includes(s.heading)) order.push(s.heading);
  for (const s of oldSections) if (!order.includes(s.heading)) order.push(s.heading);

  const sections: RequirementsSectionChange[] = [];
  for (const heading of order) {
    const inOld = oldMap.has(heading);
    const inNew = newMap.has(heading);
    const oldItems = oldMap.get(heading) ?? [];
    const newItems = newMap.get(heading) ?? [];
    if (inOld && inNew && oldItems.join("\n") === newItems.join("\n")) continue;

    let kind: RequirementsSectionChange["kind"];
    let added: string[] = [];
    let removed: string[] = [];
    if (!inOld) {
      kind = "added";
      added = newItems;
    } else if (!inNew) {
      kind = "removed";
      removed = oldItems;
    } else {
      kind = "edited";
      ({ added, removed } = lineDiff(oldItems, newItems));
    }
    sections.push({ heading, label: heading.slice(3).trim(), kind, added, removed });
  }

  if (!sections.length) return null;
  return {
    sections,
    summary: sections.map(sectionSummary).join("; "),
    detail: buildDetail(sections),
  };
}

/**
 * The engineer-facing message for a requirements change. Short and explicit
 * that the worktree copy is untouched — merging main is what brings it in line.
 */
export function requirementsChangeMessage(
  task: { id: string },
  change: RequirementsChange,
): string {
  return [
    `Requirements for #${task.id} were updated on the board.`,
    "",
    change.summary,
    "",
    change.detail,
    "",
    "The task file in your worktree is unchanged — merge main (or re-read the board copy at your next handoff) before relying on the old requirements.",
  ].join("\n");
}
